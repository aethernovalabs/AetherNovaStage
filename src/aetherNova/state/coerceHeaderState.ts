import type {Character} from "@chub-ai/stages-ts";
import type {AetherNovaMessageState} from "../types";
import {DEFAULT_STATE} from "../constants";
import {cleanFragment} from "../utils/text";
import {createDefaultState} from "./defaultState";
import {normalizeLocation} from "../header/normalizeLocation";
import {normalizeClock, timeOfDayForClock} from "../header/normalizeClock";
import {normalizeYouLine} from "../header/normalizeYouLine";
import {normalizeNpcLine} from "../header/normalizeNpcLine";
import {normalizeThreadLine} from "../thread/normalizeThreadLine";
import {applyThreadItemLocks, applyThreadWaitingLock, synchronizeLockedThreadItems, waitingThreadItemsFromThread} from "../thread/threadWaitingLock";
import {coerceWalletState} from "../wallet/normalizeWalletLine";
import {updateNpcMemory, coerceNpcMemory} from "../npcMemory/updateNpcMemory";
import {coerceUserStatus} from "../userStatus/userStatusState";
import {normalizePendingNpcDebugQuery, normalizePendingNpcMemoryCommand, normalizeLockedWaitingThreads, normalizeLockedThreadItems, normalizeManualEditOverrides, normalizeTerminalGraceItems} from "./stateMerge";

export function createInitialHeaderState(
    characters: Record<string, Character>,
    incomingState: unknown,
): AetherNovaMessageState {
    return coerceHeaderState(incomingState, createDefaultState(characters));
}

export function coerceHeaderState(
    incomingState: unknown,
    fallback: AetherNovaMessageState = DEFAULT_STATE,
): AetherNovaMessageState {
    if (incomingState == null || typeof incomingState !== "object") {
        return { ...fallback, userStatus: { ...fallback.userStatus } };
    }

    const raw = incomingState as Partial<AetherNovaMessageState> & {time?: string};
    const rawTime = typeof raw.time === "string" ? raw.time : "";
    const clock = normalizeClock(raw.clock ?? rawTime, fallback.clock);
    const walletState = coerceWalletState(raw, fallback);
    const npc = normalizeNpcLine(raw.npc ?? "", fallback.npc);
    const npcMemory = updateNpcMemory(coerceNpcMemory(raw.npcMemory, fallback.npcMemory), npc, fallback.location);
    const youLine = normalizeYouLine(raw.you ?? "", fallback.you, "", {trustRawStatus: true});
    const userStatus = coerceUserStatus(raw.userStatus, youLine);

    const lockedWaiting = normalizeLockedWaitingThreads(raw.lockedWaitingThreads);
    const lockedThreadItems = normalizeLockedThreadItems(raw.lockedThreadItems);
    const terminalGrace = normalizeTerminalGraceItems(raw.terminalThreadGraceItems);
    const manualEditOverrides = normalizeManualEditOverrides(raw.manualEditOverrides);
    const threadWasManuallyEdited = manualEditOverrides?.thread != null
        && typeof raw.thread === "string"
        && cleanFragment(raw.thread) === cleanFragment(manualEditOverrides.thread);
    const normalizedThread = normalizeThreadLine(raw.thread ?? "", fallback.thread, "", undefined, {
        allowExplicitClear: threadWasManuallyEdited,
    });
    const {updatedThread, updatedLockedThreads} = threadWasManuallyEdited
      ? {
          updatedThread: normalizedThread,
          updatedLockedThreads: waitingThreadItemsFromThread(normalizedThread),
        }
      : applyThreadWaitingLock(
          normalizedThread,
          { ...fallback, lockedWaitingThreads: lockedWaiting },
          "",
        );
    const {updatedThread: lockedThread, updatedLockedThreadItems} = threadWasManuallyEdited
      ? {
          updatedThread,
          updatedLockedThreadItems: synchronizeLockedThreadItems(updatedThread, lockedThreadItems),
        }
      : applyThreadItemLocks(
          updatedThread,
          { ...fallback, lockedThreadItems },
          raw.thread ?? "",
        );

    return {
        location: normalizeLocation(raw.location ?? "", fallback.location),
        timeOfDay: timeOfDayForClock(clock),
        clock,
        you: youLine,
        npc,
        thread: lockedThread,
        wallet: walletState.value,
        walletInitialized: walletState.initialized,
        npcMemory,
        pendingNpcDebugQuery: normalizePendingNpcDebugQuery(raw.pendingNpcDebugQuery),
        pendingNpcMemoryCommand: normalizePendingNpcMemoryCommand(raw.pendingNpcMemoryCommand),
        userStatus,
        lockedWaitingThreads: updatedLockedThreads,
        lockedThreadItems: updatedLockedThreadItems,
        terminalThreadGraceItems: terminalGrace,
        manualEditOverrides,
    };
}
