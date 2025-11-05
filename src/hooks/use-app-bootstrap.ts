import { useEffect } from "react";
import electron from "../lib/electron";
import { useAppStore } from "@/stores/app-store";
import type {
  AppSettings,
  EnvironmentCheckStatus,
  EnvironmentSummary,
  TranslationCompletedPayload,
  TranslationProgressPayload,
  TranslationQueueItem,
  TranslationStatusPayload,
  DocumentInsight,
  DownloadProgressEvent,
  TranslationRecord,
} from "@/types/ipc";

const useAppBootstrap = () => {
  const setSettings = useAppStore((state) => state.setSettings);
  const setQueue = useAppStore((state) => state.setQueue);
  const updateQueueStatus = useAppStore((state) => state.updateQueueStatus);
  const appendQueueLog = useAppStore((state) => state.appendQueueLog);
  const patchQueueItem = useAppStore((state) => state.patchQueueItem);
  const setHistory = useAppStore((state) => state.setHistory);
  const setEnvironmentStatus = useAppStore(
    (state) => state.setEnvironmentStatus
  );
  const resetEnvironmentStatuses = useAppStore(
    (state) => state.resetEnvironmentStatuses
  );
  const setEnvironmentSummary = useAppStore(
    (state) => state.setEnvironmentSummary
  );
  const setDownloadProgress = useAppStore((state) => state.setDownloadProgress);
  const clearDownloadProgress = useAppStore(
    (state) => state.clearDownloadProgress
  );
  const setEnvironmentChecking = useAppStore(
    (state) => state.setEnvironmentChecking
  );
  const setThemePreference = useAppStore((state) => state.setThemePreference);

  useEffect(() => {
    if (!electron) {
      console.warn("electronAPI is unavailable in this environment.");
      return;
    }

    const api = electron;
    let cancelled = false;
    const unsubscribes: Array<() => void> = [];

    const bootstrap = async () => {
      try {
        const [settings, queue, history] = await Promise.all([
          api.settings.get(),
          api.translation.getQueue(),
          api.history.list(),
        ]);
        if (cancelled) return;
        setSettings(settings);
        setThemePreference(settings.theme);
        setQueue(queue);
        setHistory(history);
      } catch (error) {
        console.error("Failed to bootstrap renderer state", error);
      }
    };

    bootstrap();

    unsubscribes.push(
      api.settings.onUpdated((settings: AppSettings) => {
        if (cancelled) return;
        setSettings(settings);
        setThemePreference(settings.theme);
      })
    );

    unsubscribes.push(
      api.history.onUpdated((records: TranslationRecord[]) => {
        if (cancelled) return;
        setHistory(records);
      })
    );

    unsubscribes.push(
      api.environment.onStatus((status: EnvironmentCheckStatus) => {
        if (cancelled) return;
        setEnvironmentStatus(status);
      })
    );

    unsubscribes.push(
      api.translation.onStatus((payload: TranslationStatusPayload) => {
        if (cancelled) return;
        updateQueueStatus(payload.id, payload.status, payload.progress);
      })
    );

    unsubscribes.push(
      api.translation.onProgress((payload: TranslationProgressPayload) => {
        if (cancelled) return;
        appendQueueLog(payload.id, payload.message);
      })
    );

    unsubscribes.push(
      api.translation.onCompleted((payload: TranslationCompletedPayload) => {
        if (cancelled) return;
        const patch: Partial<TranslationQueueItem> = {
          status: payload.success ? "awaiting-user" : "failed",
          progress: 100,
          outputDir: payload.outputDir,
          error: payload.error,
        };
        patchQueueItem(payload.id, patch);

        api.history
          .list()
          .then((records: TranslationRecord[]) => {
            if (!cancelled) {
              setHistory(records);
            }
          })
          .catch((error: unknown) =>
            console.error("Failed to refresh history", error)
          );
      })
    );

    unsubscribes.push(
      api.downloads.onProgress((event: DownloadProgressEvent) => {
        if (cancelled) return;
        setDownloadProgress(event.downloadId, event.progress);
        if (
          event.progress.totalBytes &&
          event.progress.receivedBytes >= (event.progress.totalBytes ?? 0)
        ) {
          clearDownloadProgress(event.downloadId);
        }
      })
    );

    const ensureEnvironment = async () => {
      try {
        setEnvironmentChecking(true);
        resetEnvironmentStatuses();
        const summary: EnvironmentSummary = await api.environment.ensure();
        if (cancelled) return;
        setEnvironmentSummary(summary);
        const refreshedSettings = await api.settings.get();
        if (!cancelled) {
          setSettings(refreshedSettings);
          setThemePreference(refreshedSettings.theme);
        }
      } catch (error: unknown) {
        console.error("Environment ensure failed", error);
      } finally {
        if (!cancelled) {
          setEnvironmentChecking(false);
        }
      }
    };

    ensureEnvironment();

    return () => {
      cancelled = true;
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [
    appendQueueLog,
    clearDownloadProgress,
    patchQueueItem,
    resetEnvironmentStatuses,
    setDownloadProgress,
    setEnvironmentChecking,
    setEnvironmentStatus,
    setEnvironmentSummary,
    setHistory,
    setQueue,
    setSettings,
    setThemePreference,
    updateQueueStatus,
  ]);
};

export default useAppBootstrap;
