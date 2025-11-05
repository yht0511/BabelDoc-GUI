import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { app } from "electron";
import log from "electron-log";
import { appendHistory, getSettings, updateHistoryRecord } from "./store.js";
import { ensureEnvironment } from "./environment.js";
import type {
  EnvironmentSummary,
  TranslationQueueItem,
  TranslationJobInput,
  TranslationRecord,
} from "./types.js";
import { deriveDocumentInsight } from "./llm.js";

interface ProgressPayload {
  id: string;
  message: string;
}

interface StatusPayload {
  id: string;
  status: TranslationQueueItem["status"];
  progress?: number;
}

interface CompletedPayload {
  id: string;
  success: boolean;
  outputDir?: string;
  error?: string;
}

const parseExtraFlags = (flags: string): string[] => {
  return flags
    .split(/\s+/)
    .map((flag) => flag.trim())
    .filter(Boolean);
};

const createHistorySkeleton = async (
  job: TranslationQueueItem,
  status: TranslationRecord["status"],
  translatedDir?: string
): Promise<TranslationRecord> => {
  const insight = await deriveDocumentInsight(job.filePath);
  const now = new Date().toISOString();
  return {
    id: job.id,
    title: insight.title,
    authors: insight.authors,
    abstractSnippet: insight.abstractSnippet,
    sourcePath: job.filePath,
    translatedPath: translatedDir,
    status,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: now,
    logs: [...job.logs],
  };
};

export class TranslationManager extends EventEmitter {
  private queue: TranslationQueueItem[] = [];
  private processing = false;

  constructor() {
    super();
  }

  enqueue(jobInput: TranslationJobInput) {
    const now = new Date().toISOString();
    const item: TranslationQueueItem = {
      id: randomUUID(),
      filePath: jobInput.filePath,
      originalName: jobInput.originalName,
      sourceType: jobInput.sourceType,
      status: "queued",
      progress: 0,
      logs: [],
      downloadId: jobInput.downloadId,
      createdAt: now,
      updatedAt: now,
    };
    this.queue.push(item);
    this.emitStatus(item.id, "queued", 0);
    this.processNext();
    return item;
  }

  getQueue() {
    return this.queue;
  }

  private async processNext() {
    if (this.processing) return;
    const nextItem = this.queue.find((job) => job.status === "queued");
    if (!nextItem) {
      this.processing = false;
      return;
    }

    this.processing = true;
    await this.runJob(nextItem).catch((error) => {
      log.error("[translation] job failed", error);
    });
    this.processing = false;
    queueMicrotask(() => this.processNext());
  }

  private async runJob(job: TranslationQueueItem) {
    job.status = "running";
    job.logs = [];
    job.updatedAt = new Date().toISOString();
    this.emitStatus(job.id, "running", 0);

    const existingRecord = updateHistoryRecord(job.id, {
      status: "running",
      logs: [],
      progress: 0,
    });

    if (!existingRecord) {
      const historyRecord = await createHistorySkeleton(job, "running");
      appendHistory(historyRecord);
    }

    const settings = getSettings();
    const environment = (await ensureEnvironment(
      () => {}
    )) as EnvironmentSummary;
    const outputDir = join(app.getPath("userData"), "translations", job.id);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const args: string[] = [
      "--openai",
      "--openai-model",
      settings.openaiModel,
      "--openai-base-url",
      settings.openaiBaseUrl,
      "--openai-api-key",
      settings.openaiApiKey,
      "--files",
      job.filePath,
      "--output",
      outputDir,
      "--watermark-output-mode",
      "no_watermark",
    ];

    if (settings.babeldoc.debug) {
      args.push("--debug"); // 启用 debug 输出以获取结构化进度数据
      log.info(`[babeldoc] Debug mode enabled`);
    }else{
      log.info(`[babeldoc] Debug mode disabled`);
    }

    if (settings.babeldoc.bilingual) {
      args.push("--bilingual");
    }

    if (settings.babeldoc.extraFlags) {
      args.push(...parseExtraFlags(settings.babeldoc.extraFlags));
    }

    const command = environment?.babeldocPath ?? "babeldoc";

    this.appendLog(job, `执行命令: ${command} ${args.join(" ")}`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        env: {
          ...process.env,
          BABELDOC_OUTPUT_DIR: outputDir,
        },
      });

      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");

      child.stdout.on("data", (chunk: string) => {
        this.appendLog(job, chunk.trim());
      });

      child.stderr.on("data", (chunk: string) => {
        this.appendLog(job, chunk.trim());
      });

      child.on("close", async (code) => {
        if (code === 0) {
          log.info(
            `[translation] Job ${job.id} completed successfully, checking output...`
          );

          // 检查输出目录是否存在以及包含什么文件
          if (existsSync(outputDir)) {
            try {
              const files = require("fs").readdirSync(outputDir);
              log.info(
                `[translation] Output directory contains ${
                  files.length
                } items: ${files.join(", ")}`
              );
            } catch (error) {
              log.error(`[translation] Failed to read output directory`, error);
            }
          } else {
            log.warn(
              `[translation] Output directory does not exist: ${outputDir}`
            );
          }

          job.status = "awaiting-user";
          job.progress = 100;
          job.outputDir = outputDir;
          delete job.error;
          job.updatedAt = new Date().toISOString();
          this.emitStatus(job.id, "awaiting-user", 100);
          updateHistoryRecord(job.id, {
            status: "awaiting-user",
            translatedPath: outputDir,
            logs: [...job.logs],
            progress: 100,
          });
          this.emitCompleted({ id: job.id, success: true, outputDir });
          resolve();
        } else {
          const errorMessage = `BabelDOC 退出码 ${code}`;
          job.status = "failed";
          job.progress = 100;
          job.error = errorMessage;
          job.updatedAt = new Date().toISOString();
          this.emitStatus(job.id, "failed", 100);
          this.appendLog(job, errorMessage);
          updateHistoryRecord(job.id, {
            status: "failed",
            errorMessage,
            logs: [...job.logs],
            progress: 100,
          });
          this.emitCompleted({
            id: job.id,
            success: false,
            error: errorMessage,
          });
          reject(new Error(errorMessage));
        }
      });

      child.on("error", (error) => {
        job.status = "failed";
        job.progress = 100;
        job.error = error.message;
        job.updatedAt = new Date().toISOString();
        this.emitStatus(job.id, "failed", 100);
        this.appendLog(job, error.message);
        updateHistoryRecord(job.id, {
          status: "failed",
          errorMessage: error.message,
          logs: [...job.logs],
          progress: 100,
        });
        this.emitCompleted({
          id: job.id,
          success: false,
          error: error.message,
        });
        reject(error);
      });
    });
  }

  private appendLog(job: TranslationQueueItem, message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    job.logs.push(trimmed);
    if (job.logs.length > 500) {
      job.logs.splice(0, job.logs.length - 500);
    }
    job.updatedAt = new Date().toISOString();
    this.emitProgress({ id: job.id, message: trimmed });
    updateHistoryRecord(job.id, { logs: [...job.logs] });

    // 尝试解析 debug 模式的结构化进度数据
    this.tryParseDebugProgress(job, trimmed);

    // 后备方案：根据日志内容估算进度
    this.tryUpdateProgressFromLog(job, trimmed);
  }

  private tryParseDebugProgress(job: TranslationQueueItem, logLine: string) {
    // 直接用字符串匹配提取 overall_progress 的值，避免 JSON 解析因换行格式错乱而失败
    // 匹配格式: 'overall_progress': 74.86959453046502
    const overallProgressMatch = logLine.match(
      /'overall_progress':\s*([\d.]+)/
    );
    if (!overallProgressMatch) return;

    try {
      const overallProgress = Math.round(parseFloat(overallProgressMatch[1]));

      // 只在进度增加时更新
      if (overallProgress > job.progress && overallProgress <= 100) {
        job.progress = overallProgress;
        this.emitStatus(job.id, job.status, overallProgress);

        // 尝试提取 stage 信息用于日志
        const stageMatch = logLine.match(/'stage':\s*'([^']+)'/);
        const stageName = stageMatch ? stageMatch[1] : "unknown";

        log.info(
          `[translation] Job ${job.id} progress: ${overallProgress}% (${stageName})`
        );
      }
    } catch (error) {
      // 解析失败时静默忽略，依赖后备方案
      log.debug(`[translation] Failed to parse debug progress: ${error}`);
    }
  }

  private tryUpdateProgressFromLog(job: TranslationQueueItem, logLine: string) {
    // 定义关键阶段及其进度范围
    const progressStages = [
      { pattern: /start to translate/i, progress: 5 },
      { pattern: /Loading ONNX model/i, progress: 8 },
      { pattern: /Parse PDF and Create Intermediate/i, progress: 15 },
      { pattern: /Parse Page Layout/i, progress: 25 },
      { pattern: /Automatic Term Extraction/i, progress: 35 },
      { pattern: /Starting term extraction/i, progress: 40 },
      { pattern: /Found title paragraph/i, progress: 50 },
      { pattern: /Translate Paragraphs/i, progress: 60 },
      { pattern: /Translation completed\. Total:/i, progress: 85 },
      { pattern: /Typesetting/i, progress: 90 },
      { pattern: /Save PDF/i, progress: 95 },
      { pattern: /finish translate:/i, progress: 98 },
    ];

    for (const stage of progressStages) {
      if (stage.pattern.test(logLine)) {
        // 只在进度增加时更新，避免倒退
        if (stage.progress > job.progress) {
          job.progress = stage.progress;
          this.emitStatus(job.id, job.status, stage.progress);
          log.info(
            `[translation] Job ${job.id} progress updated to ${stage.progress}% based on log pattern`
          );
        }
        break;
      }
    }
  }

  private emitStatus(
    id: string,
    status: TranslationQueueItem["status"],
    progress?: number
  ) {
    const payload: StatusPayload =
      typeof progress === "number" ? { id, status, progress } : { id, status };
    this.emit("status", payload);
    const job = this.queue.find((item) => item.id === id);
    if (job) {
      job.status = status;
      if (typeof progress === "number") {
        job.progress = progress;
      }
      job.updatedAt = new Date().toISOString();
    }
    updateHistoryRecord(id, {
      status,
      ...(typeof progress === "number" ? { progress } : {}),
    });
  }

  private emitProgress(payload: ProgressPayload) {
    this.emit("progress", payload);
  }

  private emitCompleted(payload: CompletedPayload) {
    this.emit("completed", payload);
  }

  markJobSaved(jobId: string, savePath: string) {
    const job = this.queue.find((item) => item.id === jobId);
    if (!job) return null;
    job.status = "success";
    job.progress = 100;
    job.savePath = savePath;
    delete job.error;
    job.updatedAt = new Date().toISOString();
    this.emitStatus(job.id, "success", 100);
    return job;
  }
}
