import { screenerState, type ScreenerMode } from "./screener/mode";
import { screenerModel } from "./screener/sdk-provider";

export interface ModeInfo {
  mode: ScreenerMode;
  reason: string;
  model: string | null;
}

export function modeInfo(): ModeInfo {
  const s = screenerState();
  return { mode: s.mode, reason: s.reason, model: s.mode === "live" ? screenerModel() : null };
}
