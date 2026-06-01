import type {AetherNovaMessageState} from "../types";
import {THREAD_WAITING_PATTERNS, THREAD_WAITING_RESOLUTION_PATTERNS} from "./threadConstants";
import {splitThreadItems, threadItemsOverlap, isTerminalThreadItem} from "./normalizeThreadLine";

const MEETING_SKIP_NAMES = new Set([
    "meeting", "meet", "audience", "appointment", "rendezvous", "speak", "talk",
    "king", "queen", "prince", "princess", "lord", "lady", "sir", "dame",
    "duke", "duchess", "count", "countess", "baron", "baroness",
    "pending", "ongoing", "active", "waiting", "imminent",
    "complete", "completed", "done", "finished", "failed",
    "resolved", "secret", "only", "knows",
]);

function extractLockMeetingNpcName(item: string): string | null {
    const clean = item.replace(/\([^)]*\)/g, "").trim();
    const names = clean.match(/\b[A-Z][a-z]{2,}\b/g) || [];
    const filtered = names.filter((n) => !MEETING_SKIP_NAMES.has(n.toLowerCase()));
    return filtered.length > 0 ? filtered[0] : null;
}

function lockedItemIsCompleted(lockedItem: string, previousState: AetherNovaMessageState, narrative: string): boolean {
    if (isTerminalThreadItem(lockedItem)) {
        return true;
    }
    const npcLine = previousState.npc || "";
    if (npcLine && npcLine !== "None") {
        const npcName = extractLockMeetingNpcName(lockedItem);
        if (npcName) {
            const headerNames = npcLine
                .split(",")
                .map((entry) => {
                    const m = entry.match(/^([A-Z][A-Za-z'._\-\s]+?)(?:\s*-\s*|$)/);
                    return m ? m[1].trim() : "";
                })
                .filter(Boolean);
            if (headerNames.some((h) => h.toLowerCase().includes(npcName.toLowerCase()))) {
                return true;
            }
        }
    }
    return false;
}

export function applyThreadWaitingLock(
  currentThread: string,
  previousState: AetherNovaMessageState,
  narrative: string,
): {updatedThread: string; updatedLockedThreads: string[]} {
  const previousLocked = previousState.lockedWaitingThreads ?? [];
  const currentItems = splitThreadItems(currentThread);
  const lowerNarrative = narrative.toLowerCase();

  const resolvedLocks: string[] = [];
  const activeLocks: string[] = [];

  for (const lockedItem of previousLocked) {
    const isResolved = THREAD_WAITING_RESOLUTION_PATTERNS.some((p) => p.test(lowerNarrative));
    const itemStillPresent = currentItems.some((item) => threadItemsOverlap(item, lockedItem));
    const isCompleted = lockedItemIsCompleted(lockedItem, previousState, lowerNarrative);

    if (isResolved || isCompleted) {
      resolvedLocks.push(lockedItem);
    } else if (itemStillPresent) {
      activeLocks.push(lockedItem);
    } else {
      activeLocks.push(lockedItem);
    }
  }

  for (const item of currentItems) {
    if (isWaitingThreadItem(item)) {
      if (!activeLocks.some((l) => threadItemsOverlap(l, item))) {
        const isCompleted = lockedItemIsCompleted(item, previousState, lowerNarrative);
        if (!isCompleted) {
          activeLocks.push(item);
        }
      }
    }
  }

  let resultThread = currentThread;
  for (const lockedItem of activeLocks) {
    if (!currentItems.some((item) => threadItemsOverlap(item, lockedItem))) {
      const separator = resultThread === "None" || resultThread.length === 0 ? "" : " ; ";
      resultThread = resultThread === "None" || resultThread.length === 0
        ? lockedItem
        : `${resultThread}${separator}${lockedItem}`;
    }
  }

  return {updatedThread: resultThread, updatedLockedThreads: activeLocks};
}

export function isWaitingThreadItem(value: string): boolean {
  return THREAD_WAITING_PATTERNS.some((p) => p.test(value));
}
