import type {
  AppSettings,
  DownloadProgressEvent,
  DocumentInsight,
  EnvironmentCheckStatus,
  EnvironmentSummary,
  EnqueueDownloadResult,
  PathSuggestionResult,
  TranslationCompletedPayload,
  TranslationJobInput,
  TranslationProgressPayload,
  TranslationQueueItem,
  TranslationRecord,
  TranslationStatusPayload,
} from "./ipc";

export {}; // Allow this file to be treated as a module.

type Unsubscribe = () => void;

interface ElectronAPI {
  environment: {
    ensure: () => Promise<EnvironmentSummary>;
    reset: () => Promise<boolean>;
    onStatus: (
      listener: (status: EnvironmentCheckStatus) => void
    ) => Unsubscribe;
  };
  settings: {
    get: () => Promise<AppSettings>;
    update: (partial: Partial<AppSettings>) => Promise<AppSettings>;
    onUpdated: (listener: (settings: AppSettings) => void) => Unsubscribe;
  };
  history: {
    list: () => Promise<TranslationRecord[]>;
    remove: (id: string) => Promise<TranslationRecord[]>;
    open: (targetPath: string) => Promise<boolean>;
    onUpdated: (
      listener: (records: TranslationRecord[]) => void
    ) => Unsubscribe;
  };
  translation: {
    getQueue: () => Promise<TranslationQueueItem[]>;
    enqueueFiles: (
      files: TranslationJobInput[]
    ) => Promise<TranslationQueueItem[]>;
    enqueueFromDownload: (
      url: string,
      downloadId: string
    ) => Promise<EnqueueDownloadResult>;
    suggestPath: (jobId: string) => Promise<PathSuggestionResult>;
    saveOutput: (
      jobId: string,
      destination: string
    ) => Promise<TranslationRecord | null>;
    refreshInsight: (jobId: string) => Promise<DocumentInsight>;
    onStatus: (
      listener: (payload: TranslationStatusPayload) => void
    ) => Unsubscribe;
    onProgress: (
      listener: (payload: TranslationProgressPayload) => void
    ) => Unsubscribe;
    onCompleted: (
      listener: (payload: TranslationCompletedPayload) => void
    ) => Unsubscribe;
  };
  downloads: {
    onProgress: (
      listener: (payload: DownloadProgressEvent) => void
    ) => Unsubscribe;
  };
  dialog: {
    selectPdf: () => Promise<TranslationJobInput[]>;
    selectDirectory: () => Promise<string | null>;
  };
  app: {
    openPath: (targetPath: string) => Promise<boolean>;
    openFile: (filePath: string) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI | null;
  }
}
