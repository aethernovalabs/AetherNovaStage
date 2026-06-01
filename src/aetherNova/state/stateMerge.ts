import type {AetherNovaMessageState} from "../types";
import {cleanFragment} from "../utils/text";
import {NPC_MEMORY_COMMAND_PATTERN} from "../constants";

export function normalizePendingNpcDebugQuery(value: unknown): string | null {
    return typeof value === "string" && cleanFragment(value).length > 0 ? cleanFragment(value) : null;
}

export function normalizePendingNpcMemoryCommand(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const commands = Array.from(value.matchAll(NPC_MEMORY_COMMAND_PATTERN));
    return commands.length > 0 ? value : null;
}

export function normalizeLockedWaitingThreads(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && cleanFragment(item).length > 0);
}

export function normalizeManualEditOverrides(value: unknown): AetherNovaMessageState["manualEditOverrides"] {
  if (value == null || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const result: AetherNovaMessageState["manualEditOverrides"] = {};
  if (typeof raw.location === "string") result.location = raw.location;
  if (typeof raw.you === "string") result.you = raw.you;
  if (typeof raw.npc === "string") result.npc = raw.npc;
  if (typeof raw.thread === "string") result.thread = raw.thread;
  if (typeof raw.wallet === "string") result.wallet = raw.wallet;
  return Object.keys(result).length > 0 ? result : undefined;
}
