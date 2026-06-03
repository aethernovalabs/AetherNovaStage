import type {AetherNovaMessageState} from "../types";
import {updateNpcMemory, buildNpcMemoryDirections} from "../npcMemory/updateNpcMemory";
import {buildNpcDebugDirections} from "../npcMemory/npcMemoryHelpers";
import {debugNpcQuery} from "../response/normalizeAetherNovaResponse";
import {formatPrivateEventsForPrompt} from "../privateEvents";

export function prepareAetherNovaStateForPrompt(
    state: AetherNovaMessageState,
    userMessage: string,
): AetherNovaMessageState {
    return {
        ...state,
        lockedWaitingThreads: state.lockedWaitingThreads,
        lockedThreadItems: state.lockedThreadItems,
        manualEditOverrides: state.manualEditOverrides,
        privateEvents: state.privateEvents ?? [],
        npcMemory: updateNpcMemory(state.npcMemory, state.npc, state.location),
        pendingNpcDebugQuery: debugNpcQuery(userMessage),
        pendingNpcMemoryCommand: state.pendingNpcMemoryCommand,
    };
}

export function buildStageDirections(state: AetherNovaMessageState, userMessage: string = ""): string {
    const effectiveState: AetherNovaMessageState = {
        ...state,
        pendingNpcDebugQuery: state.pendingNpcDebugQuery ?? debugNpcQuery(userMessage),
    };
    const parts: string[] = [];
    const npcMemoryContext = buildNpcMemoryDirections(effectiveState, userMessage);

    if (npcMemoryContext.length > 0) {
        parts.push(npcMemoryContext);
    }

    const privateEventContext = formatPrivateEventsForPrompt(effectiveState.privateEvents, effectiveState, userMessage);
    if (privateEventContext.length > 0) {
        parts.push(privateEventContext);
    }

    const debugContext = buildNpcDebugDirections(effectiveState.pendingNpcDebugQuery, effectiveState.npcMemory);
    if (debugContext.length > 0) {
        parts.push(debugContext);
    }

    return parts.join("\n");
}
