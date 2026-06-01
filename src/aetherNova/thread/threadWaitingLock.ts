import type {AetherNovaMessageState} from "../types";
import {THREAD_WAITING_PATTERNS, THREAD_WAITING_RESOLUTION_PATTERNS} from "./threadConstants";
import {splitThreadItems, threadItemsOverlap} from "./normalizeThreadLine";

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

    if (isResolved) {
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
        activeLocks.push(item);
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
