import type {AetherNovaMessageState, NormalizedResponse} from "../types";
import {sameText, cleanFragment, cleanLabeledValue} from "../utils/text";
import {extractHeader} from "./extractHeader";
import {formatResponse} from "./formatResponse";
import {normalizeLocationTimeLine} from "../header/normalizeLocation";
import {normalizeWalletLine} from "../wallet/normalizeWalletLine";
import {normalizeYouLine} from "../header/normalizeYouLine";
import {normalizeNpcLine} from "../header/normalizeNpcLine";
import {normalizeThreadLine, splitThreadItems, isTerminalThreadItem, threadItemsOverlap} from "../thread/normalizeThreadLine";
import {applyThreadItemLocks, applyThreadWaitingLock} from "../thread/threadWaitingLock";
import {updateUserStatus} from "../userStatus/userStatusState";
import {updateNpcMemory} from "../npcMemory/updateNpcMemory";
import {buildNpcDebugFooter} from "../npcMemory/npcMemoryHelpers";

export function debugNpcQuery(userMessage: string): string | null {
    const match = userMessage.match(/[\[【]\s*debug\s*:\s*npc\s+([^\]】]+)[\]】]/i);
    return match == null ? null : cleanFragment(match[1]);
}

function applyTerminalGrace(
    rawThreadLine: string,
    normalizedThread: string,
    previousGrace: string[],
): {thread: string; newGrace: string[]} {
    const rawThreadValue = cleanLabeledValue(rawThreadLine, "Thread");
    const rawItems = rawThreadValue
        .split(/\s*;\s*/g)
        .map(cleanFragment)
        .filter(Boolean);
    const terminalItems = rawItems.filter((item) => isTerminalThreadItem(item));
    const normalizedItems = normalizedThread === "None" || normalizedThread.length === 0
        ? []
        : normalizedThread.split(/\s*;\s*/g).map(cleanFragment).filter(Boolean);
    const newGrace: string[] = [];
    const terminalBlockers = [
        ...previousGrace.map((item) => cleanLabeledValue(item, "Thread")).map(cleanFragment).filter(Boolean),
        ...terminalItems,
    ];

    for (const terminalItem of terminalBlockers) {
        for (let index = normalizedItems.length - 1; index >= 0; index--) {
            if (threadItemsOverlap(normalizedItems[index], terminalItem) || isTerminalThreadItem(normalizedItems[index])) {
                normalizedItems.splice(index, 1);
            }
        }
    }

    for (const terminalItem of terminalItems) {
        const alreadyInGrace = previousGrace.some((g) => threadItemsOverlap(g, terminalItem));
        if (!alreadyInGrace) {
            if (!normalizedItems.some((n) => threadItemsOverlap(n, terminalItem))) {
                normalizedItems.push(terminalItem);
            }
            newGrace.push(terminalItem);
        }
    }
    const thread = normalizedItems.join(" ; ");
    return {thread: thread.length > 0 ? thread : "None", newGrace};
}

export function normalizeAetherNovaResponse(
    content: string,
    previousState: AetherNovaMessageState,
    context: string = "",
): NormalizedResponse {
    const extracted = extractHeader(content);
    const correctionContext = `${context}\n${extracted.narrative}`;
    const timeLocation = normalizeLocationTimeLine(extracted.locationLine, previousState, correctionContext);
    const sceneChanged = !sameText(timeLocation.location, previousState.location);
    const wallet = normalizeWalletLine(
        extracted.walletLine ?? "",
        previousState.wallet,
        correctionContext,
        previousState.walletInitialized === true,
    );
    const youLine = normalizeYouLine(extracted.youLine ?? "", previousState.you, correctionContext, {sceneChanged});
    const npc = normalizeNpcLine(extracted.npcLine ?? "", previousState.npc, correctionContext, {sceneChanged});
    const thread = normalizeThreadLine(extracted.threadLine ?? "", previousState.thread, correctionContext, npc);
    const {updatedThread, updatedLockedThreads} = applyThreadWaitingLock(thread, previousState, correctionContext);
    const {updatedThread: lockedThread, updatedLockedThreadItems} = applyThreadItemLocks(
        updatedThread,
        previousState,
        extracted.threadLine ?? "",
    );
    const previousGrace = previousState.terminalThreadGraceItems ?? [];
    const {thread: finalThread, newGrace: terminalGraceItems} = applyTerminalGrace(
        extracted.threadLine ?? "",
        lockedThread,
        previousGrace,
    );
    const state: AetherNovaMessageState = {
        location: timeLocation.location,
        timeOfDay: timeLocation.timeOfDay,
        clock: timeLocation.clock,
        you: youLine,
        npc,
        thread: finalThread,
        wallet: wallet.value,
        walletInitialized: wallet.initialized,
        npcMemory: previousState.npcMemory,
        pendingNpcDebugQuery: null,
        pendingNpcMemoryCommand: previousState.pendingNpcMemoryCommand,
        userStatus: updateUserStatus(previousState.userStatus, youLine, correctionContext),
        lockedWaitingThreads: updatedLockedThreads,
        lockedThreadItems: updatedLockedThreadItems,
        terminalThreadGraceItems: terminalGraceItems,
        manualEditOverrides: previousState.manualEditOverrides,
    };
    state.npcMemory = updateNpcMemory(previousState.npcMemory, state.npc, `${state.location}\n${correctionContext}`);
    const debugQuery = previousState.pendingNpcDebugQuery ?? debugNpcQuery(context);
    const debugMessage = buildNpcDebugFooter(debugQuery, state.npcMemory);

    return {
        content: formatResponse(state, extracted.narrative),
        state,
        systemMessage: debugMessage.length > 0 ? debugMessage : null,
    };
}
