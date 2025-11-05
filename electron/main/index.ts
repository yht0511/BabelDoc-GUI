import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type BrowserWindowConstructorOptions,
} from "electron";
import { join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, cp, readdir, rename } from "node:fs/promises";
import { existsSync, statSync, readdirSync } from "node:fs";
import log from "electron-log";
import { ensureEnvironment, resetEnvironmentCache } from "./environment.js";
import {
  getHistory,
  getSettings,
  removeHistoryRecord,
  updateHistoryRecord,
  updateSettings,
} from "./store.js";
import { TranslationManager } from "./translation.js";
import { requestPathSuggestion, deriveDocumentInsight } from "./llm.js";
import { downloadPdfFromUrl } from "./downloader.js";
import type {
  AppSettings,
  EnvironmentSummary,
  TranslationJobInput,
} from "./types.js";

const isDev = !app.isPackaged;
const currentDir = fileURLToPath(new URL(".", import.meta.url));

let mainWindow: BrowserWindow | null = null;
const translationManager = new TranslationManager();

const sendToRenderer = (channel: string, payload: unknown) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
};

const registerTranslationBroadcast = () => {
  translationManager.on("status", (payload) => {
    sendToRenderer("translation:status", payload);
  });

  translationManager.on("progress", (payload) => {
    sendToRenderer("translation:progress", payload);
  });

  translationManager.on("completed", (payload) => {
    sendToRenderer("translation:completed", payload);
  });
};

const handleEnvironmentEnsure = async (): Promise<EnvironmentSummary> => {
  return ensureEnvironment((status) => {
    sendToRenderer("environment:status", status);
  });
};

const registerIpcHandlers = () => {
  ipcMain.handle("environment:ensure", async () => {
    return handleEnvironmentEnsure();
  });

  ipcMain.handle("environment:reset", () => {
    resetEnvironmentCache();
    return true;
  });

  ipcMain.handle("settings:get", () => {
    return getSettings();
  });

  ipcMain.handle("settings:update", (_event, partial: Partial<AppSettings>) => {
    const next = updateSettings(partial);
    sendToRenderer("settings:updated", next);
    return next;
  });

  ipcMain.handle("history:list", () => {
    return getHistory();
  });

  ipcMain.handle("history:remove", (_event, id: string) => {
    const updated = removeHistoryRecord(id);
    sendToRenderer("history:updated", updated);
    return updated;
  });

  ipcMain.handle("history:open", async (_event, targetPath: string) => {
    if (!targetPath) return false;
    await shell.showItemInFolder(targetPath);
    return true;
  });

  ipcMain.handle("translation:get-queue", () => {
    return translationManager.getQueue();
  });

  ipcMain.handle(
    "translation:enqueue-files",
    async (_event, files: TranslationJobInput[]) => {
      const jobs = files.map((file) => translationManager.enqueue(file));
      return jobs;
    }
  );

  ipcMain.handle(
    "translation:enqueue-download",
    async (
      _event,
      {
        url,
        downloadId,
      }: {
        url: string;
        downloadId: string;
      }
    ) => {
      const result = await downloadPdfFromUrl(url, (progress) => {
        sendToRenderer("download:progress", { downloadId, progress });
      });
      const job = translationManager.enqueue({
        filePath: result.filePath,
        originalName: result.originalName,
        sourceType: "download",
        downloadId,
      });
      return { job, downloadId };
    }
  );

  ipcMain.handle("translation:suggest-path", async (_event, jobId: string) => {
    const historyRecord = getHistory().find((record) => record.id === jobId);
    if (!historyRecord) {
      throw new Error("未找到对应的翻译记录");
    }
    const settings = getSettings();
    // 始终使用 sourcePath（原始PDF），因为 translatedPath 是输出目录
    const suggestion = await requestPathSuggestion(
      settings,
      historyRecord.sourcePath
    );
    return suggestion;
  });

  ipcMain.handle(
    "translation:save-output",
    async (
      _event,
      {
        jobId,
        destination,
      }: {
        jobId: string;
        destination: string;
      }
    ) => {
      // 清理目标路径：移除引号和多余空格
      const cleanedDestination = destination.replace(/^["']|["']$/g, "").trim();

      log.info(`[save] Saving translation for job ${jobId}`);
      log.info(`[save] Original destination: ${destination}`);
      log.info(`[save] Cleaned destination: ${cleanedDestination}`);

      const record = getHistory().find((item) => item.id === jobId);
      if (!record || !record.translatedPath) {
        log.error(
          `[save] Record not found or no translatedPath for job ${jobId}`
        );
        throw new Error("未找到可保存的翻译结果");
      }
      log.info(`[save] Source directory: ${record.translatedPath}`);

      // 检查源目录内容
      if (!existsSync(record.translatedPath)) {
        throw new Error(`源目录不存在: ${record.translatedPath}`);
      }

      const sourceFiles = readdirSync(record.translatedPath);
      log.info(`[save] Source directory contains: ${sourceFiles.join(", ")}`);

      if (sourceFiles.length === 0) {
        throw new Error("翻译输出目录为空，没有文件可以保存");
      }

      // 创建目标目录
      await mkdir(cleanedDestination, { recursive: true });
      log.info(`[save] Destination directory created: ${cleanedDestination}`);

      // 获取文档标题用于重命名
      const insight = await deriveDocumentInsight(record.sourcePath);
      const sanitizedTitle = insight.title
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // 移除特殊字符
        .replace(/\s+/g, "_") // 空格替换为下划线
        .slice(0, 200); // 限制长度

      log.info(`[save] Using sanitized title for files: "${sanitizedTitle}"`);

      // 复制文件并重命名
      let copiedCount = 0;
      for (const file of sourceFiles) {
        const sourcePath = join(record.translatedPath, file);

        // 确保源文件存在
        if (!existsSync(sourcePath)) {
          log.error(`[save] Source file does not exist: ${sourcePath}`);
          continue;
        }

        // 智能提取文件特征后缀
        let suffix = "";
        let finalExt = extname(file); // 最终的扩展名 (通常是 .pdf)

        // 检查各种特征标记
        if (file.includes(".zh.dual")) {
          suffix += "_zh_dual";
        } else if (file.includes(".zh.mono")) {
          suffix += "_zh_mono";
        }

        if (file.includes(".decompressed")) {
          suffix += "_decompressed";
        }

        const newFileName = `${sanitizedTitle}${suffix}${finalExt}`;
        const destPath = join(cleanedDestination, newFileName);

        log.info(`[save] Copying: ${file} -> ${newFileName}`);
        try {
          await cp(sourcePath, destPath, { force: true });

          // 验证文件是否真的被复制
          if (existsSync(destPath)) {
            const destStats = statSync(destPath);
            log.info(
              `[save] Successfully copied to: ${destPath} (${destStats.size} bytes)`
            );
            copiedCount++;
          } else {
            log.error(`[save] File was not created at: ${destPath}`);
          }
        } catch (error) {
          log.error(`[save] Failed to copy file: ${file}`, error);
          throw error;
        }
      }

      if (copiedCount === 0) {
        throw new Error("没有文件被成功复制");
      }

      log.info(
        `[save] Total files copied: ${copiedCount}/${sourceFiles.length}`
      );

      const updated = updateHistoryRecord(jobId, {
        status: "success",
        savePath: cleanedDestination,
        progress: 100,
      });
      translationManager.markJobSaved(jobId, cleanedDestination);
      sendToRenderer("history:updated", getHistory());
      log.info(`[save] Job ${jobId} marked as saved to ${cleanedDestination}`);
      return updated;
    }
  );

  ipcMain.handle(
    "translation:refresh-insight",
    async (_event, jobId: string) => {
      const record = getHistory().find((item) => item.id === jobId);
      if (!record) {
        throw new Error("未找到翻译记录");
      }
      const insight = await deriveDocumentInsight(record.sourcePath);
      return insight;
    }
  );

  ipcMain.handle("dialog:select-pdf", async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择 PDF 文件",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled) return [];
    return result.filePaths.map<TranslationJobInput>((filePath) => ({
      filePath,
      originalName: basename(filePath),
      sourceType: "local",
    }));
  });

  ipcMain.handle("dialog:select-directory", async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择文件夹",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return null;
    const [directory] = result.filePaths;
    if (directory && !existsSync(directory)) {
      await mkdir(directory, { recursive: true });
    }
    return directory ?? null;
  });

  ipcMain.handle("app:open-path", async (_event, targetPath: string) => {
    if (!targetPath) return false;
    await shell.openPath(targetPath);
    return true;
  });
};

const createWindow = async () => {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(currentDir, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false,
    },
  };

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    // 打包后使用 __dirname 定位文件
    // 开发环境: dist-electron/main/index.js
    // 打包环境: app.asar/dist-electron/main/index.js
    const distPath = join(__dirname, "../../dist");
    const indexPath = join(distPath, "index.html");
    
    log.info(`[main] __dirname: ${__dirname}`);
    log.info(`[main] distPath: ${distPath}`);
    log.info(`[main] Loading index.html from: ${indexPath}`);
    log.info(`[main] File exists: ${existsSync(indexPath)}`);
    
    await mainWindow.loadFile(indexPath);
  }
};

app.whenReady().then(() => {
  registerTranslationBroadcast();
  registerIpcHandlers();

  createWindow().catch((error) => {
    log.error("Failed to create window", error);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => {
        log.error("Failed to re-create window", error);
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
