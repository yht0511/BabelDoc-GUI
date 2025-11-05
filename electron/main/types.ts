import type { ChildProcessWithoutNullStreams } from "node:child_process";

export type ThemePreference = "light" | "dark" | "system";

export interface BabeldocOptions {
  bilingual: boolean;
  debug: boolean;
  extraFlags: string;
}

export interface AppSettings {
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  documentRoot: string;
  theme: ThemePreference;
  babeldoc: BabeldocOptions;
  uvBinDir: string;
}

export type EnvironmentCheckStage = "python" | "uv" | "babeldoc" | "uv-bin-dir";

export interface EnvironmentCheckStatus {
  stage: EnvironmentCheckStage;
  status: "pending" | "running" | "success" | "error";
  message?: string;
}

export interface TranslationJobInput {
  filePath: string;
  originalName: string;
  sourceType: "local" | "download";
  downloadId?: string;
}

export type TranslationJobStatus =
  | "queued"
  | "running"
  | "llm-path"
  | "awaiting-user"
  | "success"
  | "failed";

export interface TranslationRecord {
  id: string;
  title: string;
  authors?: string;
  abstractSnippet?: string;
  sourcePath: string;
  translatedPath?: string;
  savePath?: string;
  status: TranslationJobStatus;
  errorMessage?: string;
  progress?: number;
  createdAt: string;
  updatedAt: string;
  logs: string[];
}

export interface TranslationQueueItem {
  id: string;
  filePath: string;
  originalName: string;
  sourceType: TranslationJobInput["sourceType"];
  status: TranslationJobStatus;
  progress: number;
  logs: string[];
  outputDir?: string;
  savePath?: string; // 用户选择的保存路径
  error?: string;
  downloadId?: string;
  createdAt: string;
  updatedAt: string;
  spawnedProcess?: ChildProcessWithoutNullStreams | null;
}

export interface EnqueueDownloadResult {
  job: TranslationQueueItem;
  downloadId: string;
}

export interface PathSuggestionResult {
  suggestedPath: string;
  rationale?: string;
}

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes?: number;
}

export interface DownloadProgressEvent {
  downloadId: string;
  progress: DownloadProgress;
}

export interface TranslationStatusPayload {
  id: string;
  status: TranslationJobStatus;
  progress?: number;
}

export interface TranslationProgressPayload {
  id: string;
  message: string;
}

export interface TranslationCompletedPayload {
  id: string;
  success: boolean;
  outputDir?: string;
  error?: string;
}

export interface DocumentInsight {
  title: string;
  authors?: string;
  abstractSnippet: string;
}

export type HistoryUpdatedPayload = TranslationRecord[];

export interface EnvironmentSummary {
  pythonPath: string;
  uvPath: string;
  babeldocPath: string;
  uvBinDir: string;
}
