export interface ComboOutputBehavior {
  type: "behavior";
  binding: string;
}

export interface ComboConfig {
  id: string;
  label?: string;
  triggerPositions: number[];
  output: ComboOutputBehavior;
  timeoutMs?: number | null;
  requiredModifiers?: string[];
  tapHoldIntervalMs?: number | null;
}

export interface PointingScale {
  scale: [number, number];
  cpi?: number | null;
}

export interface PointingScrollConfig {
  mode: "mapper";
  scale: [number, number];
}

export interface PointingMetadata {
  generatedAt?: string;
  baseLayer?: number;
}

export interface PointingConfig {
  device: string;
  cursor: PointingScale;
  scroll?: PointingScrollConfig;
  metadata?: PointingMetadata;
}

export interface StudioSaveFile {
  keymap: any;
  combos?: ComboConfig[];
  pointing?: PointingConfig;
}

export const createDefaultPointingConfig = (): PointingConfig => ({
  device: "pmw3610",
  cursor: {
    scale: [1, 1],
    cpi: 1000,
  },
  scroll: {
    mode: "mapper",
    scale: [1, 20],
  },
  metadata: {
    baseLayer: 4,
  },
});

export const isStudioSaveFile = (value: unknown): value is StudioSaveFile => {
  if (!value || typeof value !== "object") {
    return false;
  }
  return "keymap" in value;
};
