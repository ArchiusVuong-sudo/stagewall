import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { VerdictProvider } from "./provider";
import { ReplayProvider } from "./replay-provider";
import { SdkProvider, screenerModel } from "./sdk-provider";

/**
 * live: real Agent SDK calls on the local Claude Code login (or ANTHROPIC_API_KEY).
 * replay: responses recorded from real live runs, no network.
 * offline: the keyword rules only (SCREENER=offline, used in CI).
 */
export type ScreenerMode = "live" | "replay" | "offline";

interface ModeState {
  mode: ScreenerMode;
  reason: string;
  provider: VerdictProvider | null;
}

const g = globalThis as typeof globalThis & { __stagewallMode?: ModeState };

/** True when a key or a Claude Code login can be found without reading any secret. */
export function hasClaudeCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ANTHROPIC_API_KEY) return true;
  if (existsSync(path.join(homedir(), ".claude", ".credentials.json"))) return true;
  if (process.platform === "darwin") {
    // Checks the item exists; without -w the secret is not printed.
    const r = spawnSync("security", ["find-generic-password", "-s", "Claude Code-credentials"], { stdio: "ignore" });
    return r.status === 0;
  }
  return false;
}

function resolve(): ModeState {
  if (process.env.SCREENER === "offline") {
    return { mode: "offline", reason: "SCREENER=offline", provider: null };
  }
  if (process.env.DEMO_REPLAY === "1") {
    return { mode: "replay", reason: "DEMO_REPLAY=1", provider: new ReplayProvider() };
  }
  if (!hasClaudeCredentials()) {
    return { mode: "replay", reason: "No Claude login or API key found", provider: new ReplayProvider() };
  }
  return { mode: "live", reason: `Agent SDK, ${screenerModel()}`, provider: new SdkProvider() };
}

export function screenerState(): ModeState {
  if (!g.__stagewallMode) g.__stagewallMode = resolve();
  return g.__stagewallMode;
}

/** Called when the boot probe shows live calls cannot work here. */
export function fallBackToReplay(reason: string): void {
  g.__stagewallMode = { mode: "replay", reason, provider: new ReplayProvider() };
}

/** For tests. */
export function setScreenerState(state: ModeState | undefined): void {
  g.__stagewallMode = state;
}
