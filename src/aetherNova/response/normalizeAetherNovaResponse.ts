import type {AetherNovaMessageState, NormalizedResponse, NpcMemoryStore} from "../types";
import {sameText, cleanFragment} from "../utils/text";
import {extractHeader} from "./extractHeader";
import {formatResponse} from "./formatResponse";
import {normalizeLocationTimeLine} from "../header/normalizeLocation";
import {normalizeWalletLine} from "../wallet/normalizeWalletLine";
import {normalizeYouLine} from "../header/normalizeYouLine";
import {normalizeNpcLine} from "../header/normalizeNpcLine";
import {normalizeThreadLine} from "../thread/normalizeThreadLine";
import {applyThreadWaitingLock} from "../thread/threadWaitingLock";
import {updateUserStatus} from "../userStatus/userStatusState";
import {updateNpcMemory} from "../npcMemory/updateNpcMemory";
import {resolveNpcMemoryKey} from "../npcMemory/npcMemoryState";
import {cleanMemoryLabel} from "../npcMemory/npcMemoryHelpers";

function formatMemoryLabels(values: string[], fallback: string): string {
    const labels = values.map((value) => cleanMemoryLabel(value, "")).filter(Boolean);
    return labels.length > 0 ? labels.join(", ") : fallback;
}

function formatBehaviorScores(scores: Record<string, number>): string {
    const entries = Object.entries(scores)
        .filter(([_label, score]) => score > 0)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8);

    return entries.length > 0 ? entries.map(([label, score]) => `${label}:${score}`).join(", ") : "none";
}

function buildNpcDebugFooter(query: string | null, memory: NpcMemoryStore): string {
    if (query == null) {
        return "";
    }

    const key = resolveNpcMemoryKey(query, memory);
    const entry = key == null ? null : memory[key];

    if (entry == null) {
        return `[debug: npc ${query}]\nNo stored NPC memory found.`;
    }

    return [
        `[debug: npc ${query}]`,
        `Name: ${entry.name}`,
        `Role/Title: ${entry.roleTitle}`,
        `Race: ${entry.race}`,
        `Physical Extra: ${entry.physicalExtra}`,
        `Current Mood: ${entry.currentMood}`,
        `Last Interaction Tone: ${entry.lastInteractionTone ?? "unknown"}`,
        `Behavior toward {{user}}: ${formatMemoryLabels(entry.behaviorTowardUser, "None stable yet")}`,
        `Behavior Scores: ${formatBehaviorScores(entry.behaviorScores)}`,
        `Relationship with {{user}}: ${formatMemoryLabels(entry.relationshipWithUser, "stranger")}`,
        `Relationship Events: ${entry.relationshipEvents.length > 0 ? entry.relationshipEvents.join(" ; ") : "None recorded"}`,
        `OnlyKnows: ${entry.onlyKnows.length > 0 ? entry.onlyKnows.join(" ; ") : "None recorded"}`,
    ].join("\n");
}

export function debugNpcQuery(userMessage: string): string | null {
    const match = userMessage.match(/[\[【]\s*debug\s*:\s*npc\s+([^\]】]+)[\]】]/i);
    return match == null ? null : cleanFragment(match[1]);
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
    const thread = normalizeThreadLine(extracted.threadLine ?? "", previousState.thread, correctionContext);
    const {updatedThread, updatedLockedThreads} = applyThreadWaitingLock(thread, previousState, correctionContext);
    const state: AetherNovaMessageState = {
        location: timeLocation.location,
        timeOfDay: timeLocation.timeOfDay,
        clock: timeLocation.clock,
        you: youLine,
        npc,
        thread: updatedThread,
        wallet: wallet.value,
        walletInitialized: wallet.initialized,
        npcMemory: previousState.npcMemory,
        pendingNpcDebugQuery: null,
        pendingNpcMemoryCommand: previousState.pendingNpcMemoryCommand,
        userStatus: updateUserStatus(previousState.userStatus, youLine, correctionContext),
        lockedWaitingThreads: updatedLockedThreads,
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
