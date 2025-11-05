import Store from "electron-store";
import { app } from "electron";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import {
  type AppSettings,
  type ThemePreference,
  type TranslationRecord,
} from "./types.js";

const defaultSettings: AppSettings = {
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  documentRoot: join(app.getPath("documents"), "BabelDOC"),
  theme: "system",
  babeldoc: {
    bilingual: false,
    debug: false,
    extraFlags: "",
  },
  uvBinDir: "",
};

interface StoreSchema {
  settings: AppSettings;
  history: TranslationRecord[];
}

const schema: Record<keyof StoreSchema, unknown> = {
  settings: {
    type: "object",
  },
  history: {
    type: "array",
  },
};

const store = new Store<StoreSchema>({
  name: "babeldoc-gui",
  schema,
  defaults: {
    settings: defaultSettings,
    history: [],
  },
});

export const getSettings = (): AppSettings => {
  const settings = store.get("settings");
  if (!settings.documentRoot) {
    settings.documentRoot = defaultSettings.documentRoot;
  }
  return settings;
};

export const updateSettings = (partial: Partial<AppSettings>) => {
  const nextSettings = { ...getSettings(), ...partial };
  store.set("settings", nextSettings);
  if (nextSettings.documentRoot && !existsSync(nextSettings.documentRoot)) {
    mkdirSync(nextSettings.documentRoot, { recursive: true });
  }
  return nextSettings;
};

export const updateTheme = (theme: ThemePreference) => {
  return updateSettings({ theme });
};

export const setUvBinDir = (dir: string) => {
  return updateSettings({ uvBinDir: dir });
};

export const getHistory = (): TranslationRecord[] => {
  return store.get("history");
};

export const appendHistory = (record: TranslationRecord) => {
  const next = [record, ...getHistory()].slice(0, 500);
  store.set("history", next);
  return next;
};

export const updateHistoryRecord = (
  id: string,
  data: Partial<TranslationRecord>
) => {
  const next = getHistory().map((record) =>
    record.id === id
      ? { ...record, ...data, updatedAt: new Date().toISOString() }
      : record
  );
  store.set("history", next);
  return next.find((record) => record.id === id) ?? null;
};

export const removeHistoryRecord = (id: string) => {
  const next = getHistory().filter((record) => record.id !== id);
  store.set("history", next);
  return next;
};
