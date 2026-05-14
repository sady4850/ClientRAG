export type Settings = {
  model: string;
  targetSize: number;
  overlap: number;
  topK: number;
  reindex: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  model: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
  targetSize: 900,
  overlap: 150,
  topK: 6,
  reindex: false,
};

const STORAGE_KEY = "clientrag.settings.v1";

export function loadSettings(): Settings {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota errors */
  }
}

export const MODEL_PRESETS = [
  {
    id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    label: "MiniLM L12 multilingual (default, 384-dim)",
  },
  {
    id: "Xenova/all-MiniLM-L6-v2",
    label: "all-MiniLM-L6-v2 (English, 384-dim, smaller)",
  },
  {
    id: "Xenova/multilingual-e5-small",
    label: "multilingual-e5-small (384-dim)",
  },
];
