import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  DownloadProgressEvent,
  DocumentInsight,
  EnvironmentCheckStatus,
  EnvironmentSummary,
  EnqueueDownloadResult,
  PathSuggestionResult,
  TranslationJobInput,
  TranslationCompletedPayload,
  TranslationProgressPayload,
  TranslationQueueItem,
  TranslationRecord,
  TranslationStatusPayload,
} from "../main/types.js";

type Unsubscribe = () => void;

const invoke = <T>(channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const subscribe = <T>(
  channel: string,
  listener: (payload: T) => void
): Unsubscribe => {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => {
    listener(payload);
  };
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

const api = {
  environment: {
    ensure: () => invoke<EnvironmentSummary>("environment:ensure"),
    reset: () => invoke<boolean>("environment:reset"),
    onStatus: (listener: (status: EnvironmentCheckStatus) => void) =>
      subscribe<EnvironmentCheckStatus>("environment:status", listener),
  },
  settings: {
    get: () => invoke<AppSettings>("settings:get"),
    update: (partial: Partial<AppSettings>) =>
      invoke<AppSettings>("settings:update", partial),
    onUpdated: (listener: (settings: AppSettings) => void) =>
      subscribe<AppSettings>("settings:updated", listener),
  },
  history: {
    list: () => invoke<TranslationRecord[]>("history:list"),
    remove: (id: string) => invoke<TranslationRecord[]>("history:remove", id),
    open: (targetPath: string) => invoke<boolean>("history:open", targetPath),
    onUpdated: (listener: (records: TranslationRecord[]) => void) =>
      subscribe<TranslationRecord[]>("history:updated", listener),
  },
  translation: {
    getQueue: () => invoke<TranslationQueueItem[]>("translation:get-queue"),
    enqueueFiles: (files: TranslationJobInput[]) =>
      invoke<TranslationQueueItem[]>("translation:enqueue-files", files),
    enqueueFromDownload: (url: string, downloadId: string) =>
      invoke<EnqueueDownloadResult>("translation:enqueue-download", {
        url,
        downloadId,
      }),
    suggestPath: (jobId: string) =>
      invoke<PathSuggestionResult>("translation:suggest-path", jobId),
    saveOutput: (jobId: string, destination: string) =>
      invoke<TranslationRecord | null>("translation:save-output", {
        jobId,
        destination,
      }),
    refreshInsight: (jobId: string) =>
      invoke<DocumentInsight>("translation:refresh-insight", jobId),
    onStatus: (listener: (payload: TranslationStatusPayload) => void) =>
      subscribe<TranslationStatusPayload>("translation:status", listener),
    onProgress: (listener: (payload: TranslationProgressPayload) => void) =>
      subscribe<TranslationProgressPayload>("translation:progress", listener),
    onCompleted: (listener: (payload: TranslationCompletedPayload) => void) =>
      subscribe<TranslationCompletedPayload>("translation:completed", listener),
  },
  downloads: {
    onProgress: (listener: (payload: DownloadProgressEvent) => void) =>
      subscribe<DownloadProgressEvent>("download:progress", listener),
  },
  dialog: {
    selectPdf: () => invoke<TranslationJobInput[]>("dialog:select-pdf"),
    selectDirectory: () => invoke<string | null>("dialog:select-directory"),
  },
  app: {
    openPath: (targetPath: string) =>
      invoke<boolean>("app:open-path", targetPath),
    openFile: (filePath: string) => invoke<boolean>("app:open-file", filePath),
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

declare global {
  interface Window {
    electronAPI: typeof api;
  }
}
