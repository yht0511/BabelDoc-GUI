import { execFile, spawn } from "child_process";
import { join } from "path";
import { promisify } from "util";
import log from "electron-log";
import type {
  EnvironmentCheckStatus,
  EnvironmentCheckStage,
  EnvironmentSummary,
} from "./types.js";
import { setUvBinDir } from "./store.js";

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

let cachedEnvironment: EnvironmentSummary | null = null;

const emitStatus = (
  notify: (status: EnvironmentCheckStatus) => void,
  stage: EnvironmentCheckStage,
  status: EnvironmentCheckStatus["status"],
  message?: string
) => {
  notify({ stage, status, message });
};

const execFileAsync = promisify(execFile);

const runCommand = async (
  command: string,
  args: string[],
  options: CommandOptions = {}
): Promise<{ stdout: string; stderr: string }> => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    ...options,
    encoding: "utf-8",
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
};

const runCommandStreaming = async (
  command: string,
  args: string[],
  notify: (chunk: string) => void,
  options: CommandOptions = {}
): Promise<number> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      ...options,
      stdio: "pipe",
    });

    proc.stdout.setEncoding("utf-8");
    proc.stderr.setEncoding("utf-8");

    proc.stdout.on("data", (chunk: string) => {
      notify(chunk);
    });

    proc.stderr.on("data", (chunk: string) => {
      notify(chunk);
    });

    proc.on("error", (error) => {
      log.error(`[env] ${command} failed`, error);
      reject(error);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(code ?? 0);
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
};

const detectPython = async (): Promise<string> => {
  const candidates =
    process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  for (const candidate of candidates) {
    try {
      const { stdout } = await runCommand(candidate, ["--version"]);
      const match = stdout.match(/Python\s+(\d+)\.(\d+)\.(\d+)/i);
      if (!match) continue;
      const major = Number(match[1]);
      const minor = Number(match[2]);
      if (major > 3 || (major === 3 && minor >= 10)) {
        log.info(`[env] Using python: ${candidate} (${stdout})`);
        return candidate;
      }
    } catch (error) {
      log.warn(`[env] Python candidate ${candidate} not suitable`, error);
    }
  }
  throw new Error("未检测到兼容的 Python 3.10+ 运行时。");
};

const ensureUvInstalled = async (
  pythonPath: string,
  notify: (chunk: string) => void
): Promise<string> => {
  try {
    const { stdout } = await runCommand("uv", ["--version"]);
    log.info(`[env] uv already installed: ${stdout}`);
    return "uv";
  } catch {
    notify("正在安装 uv，首次执行可能需要几分钟…\n");
    await runCommandStreaming(
      pythonPath,
      ["-m", "pip", "install", "--upgrade", "uv"],
      notify
    );
    return "uv";
  }
};

const ensureBabeldocInstalled = async (
  uvPath: string,
  notify: (chunk: string) => void
): Promise<void> => {
  try {
    const { stdout } = await runCommand("babeldoc", ["--version"]);
    log.info(`[env] BabelDOC already installed: ${stdout}`);
  } catch {
    notify("正在安装 BabelDOC，请稍候…\n");
    await runCommandStreaming(
      uvPath,
      ["pip", "install", "--upgrade", "BabelDOC"],
      notify
    );
  }
};

const resolveUvBinDir = async (uvPath: string): Promise<string> => {
  const { stdout } = await runCommand(uvPath, ["tool", "dir", "--bin"]);
  return stdout.trim();
};

export const ensureEnvironment = async (
  notify: (status: EnvironmentCheckStatus) => void
): Promise<EnvironmentSummary> => {
  if (cachedEnvironment) {
    return cachedEnvironment;
  }

  emitStatus(notify, "python", "running", "正在检测 Python 环境…");
  const pythonPath = await detectPython().catch((error) => {
    emitStatus(
      notify,
      "python",
      "error",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  });
  emitStatus(notify, "python", "success", `已检测到 Python：${pythonPath}`);

  emitStatus(notify, "uv", "running", "正在确认 uv 工具存在…");
  let uvPath = "uv";
  try {
    uvPath = await ensureUvInstalled(pythonPath, (chunk) => {
      emitStatus(notify, "uv", "running", chunk.trim());
    });
    emitStatus(notify, "uv", "success", "uv 已就绪");
  } catch (error) {
    emitStatus(
      notify,
      "uv",
      "error",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }

  emitStatus(notify, "babeldoc", "running", "正在确认 BabelDOC 可用…");
  try {
    await ensureBabeldocInstalled(uvPath, (chunk) => {
      emitStatus(notify, "babeldoc", "running", chunk.trim());
    });
    emitStatus(notify, "babeldoc", "success", "BabelDOC 已就绪");
  } catch (error) {
    emitStatus(
      notify,
      "babeldoc",
      "error",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }

  emitStatus(notify, "uv-bin-dir", "running", "正在定位 BabelDOC 可执行路径…");
  let uvBinDir = "";
  try {
    uvBinDir = await resolveUvBinDir(uvPath);
    setUvBinDir(uvBinDir);
    emitStatus(notify, "uv-bin-dir", "success", uvBinDir);
  } catch (error) {
    emitStatus(
      notify,
      "uv-bin-dir",
      "error",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }

  const babeldocPath = uvBinDir
    ? join(uvBinDir, process.platform === "win32" ? "babeldoc.exe" : "babeldoc")
    : "babeldoc";
  cachedEnvironment = {
    pythonPath,
    uvPath,
    babeldocPath,
    uvBinDir,
  };

  return cachedEnvironment;
};

export const resetEnvironmentCache = () => {
  cachedEnvironment = null;
};

export const getCachedEnvironment = () => cachedEnvironment;
