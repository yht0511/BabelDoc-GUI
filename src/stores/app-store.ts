import { create } from "zustand";
import type {
  AppSettings,
  DownloadProgress,
  EnvironmentCheckStage,
  EnvironmentCheckStatus,
  EnvironmentSummary,
  ThemePreference,
  TranslationJobStatus,
  TranslationQueueItem,
  TranslationRecord,
} from "@/types/ipc";

export type ViewKey = "start" | "history" | "settings";

interface AppState {
  activeView: ViewKey;
  setActiveView: (view: ViewKey) => void;

  settings: AppSettings | null;
  setSettings: (settings: AppSettings) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;

  queue: TranslationQueueItem[];
  setQueue: (queue: TranslationQueueItem[]) => void;
  upsertQueueItem: (item: TranslationQueueItem) => void;
  updateQueueStatus: (
    id: string,
    status: TranslationJobStatus,
    progress?: number
  ) => void;
  appendQueueLog: (id: string, message: string) => void;
  patchQueueItem: (id: string, patch: Partial<TranslationQueueItem>) => void;

  history: TranslationRecord[];
  setHistory: (history: TranslationRecord[]) => void;
  updateHistory: (record: TranslationRecord) => void;
  removeHistory: (id: string) => void;

  environmentStatuses: Record<EnvironmentCheckStage, EnvironmentCheckStatus>;
  setEnvironmentStatus: (status: EnvironmentCheckStatus) => void;
  resetEnvironmentStatuses: () => void;
  environmentSummary: EnvironmentSummary | null;
  setEnvironmentSummary: (summary: EnvironmentSummary | null) => void;

  downloads: Record<string, DownloadProgress>;
  setDownloadProgress: (id: string, progress: DownloadProgress) => void;
  clearDownloadProgress: (id: string) => void;

  themePreference: ThemePreference;
  setThemePreference: (theme: ThemePreference) => void;

  isEnvironmentChecking: boolean;
  setEnvironmentChecking: (value: boolean) => void;
}

const createInitialEnvironmentStatuses = (): Record<
  EnvironmentCheckStage,
  EnvironmentCheckStatus
> => ({
  python: { stage: "python", status: "pending" },
  uv: { stage: "uv", status: "pending" },
  babeldoc: { stage: "babeldoc", status: "pending" },
  "uv-bin-dir": { stage: "uv-bin-dir", status: "pending" },
});

export const useAppStore = create<AppState>((set) => ({
  activeView: "start",
  setActiveView: (view) => set({ activeView: view }),

  settings: null,
  setSettings: (settings) =>
    set({ settings, themePreference: settings.theme ?? "system" }),
  updateSettings: (partial) =>
    set((state) =>
      state.settings
        ? {
            settings: { ...state.settings, ...partial },
            themePreference: partial.theme ?? state.themePreference,
          }
        : state
    ),

  queue: [],
  setQueue: (queue) => set({ queue }),
  upsertQueueItem: (item) =>
    set((state) => {
      const existingIndex = state.queue.findIndex((q) => q.id === item.id);
      if (existingIndex >= 0) {
        const next = state.queue.slice();
        next[existingIndex] = {
          ...next[existingIndex],
          ...item,
          logs: item.logs.length ? item.logs : next[existingIndex].logs,
        };
        return { queue: next };
      }
      return { queue: [item, ...state.queue] };
    }),
  updateQueueStatus: (id, status, progress) =>
    set((state) => {
      const next = state.queue.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              progress: typeof progress === "number" ? progress : item.progress,
              updatedAt: new Date().toISOString(),
            }
          : item
      );
      return { queue: next };
    }),
  appendQueueLog: (id, message) =>
    set((state) => {
      const next = state.queue.map((item) => {
        if (item.id !== id) return item;
        const logs = [...item.logs, message].slice(-500);
        return { ...item, logs, updatedAt: new Date().toISOString() };
      });
      return { queue: next };
    }),
  patchQueueItem: (id, patch) =>
    set((state) => {
      const next = state.queue.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              logs: patch.logs ? patch.logs : item.logs,
              updatedAt: patch.updatedAt ?? new Date().toISOString(),
            }
          : item
      );
      return { queue: next };
    }),

  history: [],
  setHistory: (history) => set({ history }),
  updateHistory: (record) =>
    set((state) => {
      const existingIndex = state.history.findIndex((h) => h.id === record.id);
      if (existingIndex >= 0) {
        const next = state.history.slice();
        next[existingIndex] = record;
        return { history: next };
      }
      return { history: [record, ...state.history] };
    }),
  removeHistory: (id) =>
    set((state) => ({
      history: state.history.filter((record) => record.id !== id),
    })),

  environmentStatuses: createInitialEnvironmentStatuses(),
  setEnvironmentStatus: (status) =>
    set((state) => ({
      environmentStatuses: {
        ...state.environmentStatuses,
        [status.stage]: status,
      },
    })),
  resetEnvironmentStatuses: () =>
    set({ environmentStatuses: createInitialEnvironmentStatuses() }),
  environmentSummary: null,
  setEnvironmentSummary: (summary) => set({ environmentSummary: summary }),

  downloads: {},
  setDownloadProgress: (id, progress) =>
    set((state) => ({
      downloads: {
        ...state.downloads,
        [id]: progress,
      },
    })),
  clearDownloadProgress: (id) =>
    set((state) => {
      const next = { ...state.downloads };
      delete next[id];
      return { downloads: next };
    }),

  themePreference: "system",
  setThemePreference: (theme) => set({ themePreference: theme }),

  isEnvironmentChecking: false,
  setEnvironmentChecking: (value) => set({ isEnvironmentChecking: value }),
}));
