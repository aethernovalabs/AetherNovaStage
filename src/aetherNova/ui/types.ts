import type {AetherNovaMessageState} from "../types";

export const DEBUG_STORAGE_KEY = "aether-nova-stage.pendingNpcDebugQuery";
export const DEBUG_UI_VERSION = "V1.7";

export type DebugCategory = "lifecycle" | "npcMemory" | "headerFormat" | "narrativeFormat" | "walletThread" | "system" | "injection";

export const DEBUG_LOG_GROUPS: Array<{category: DebugCategory; title: string; emptyText: string; defaultOpen?: boolean}> = [
    {category: "npcMemory", title: "NPC Memory Log", emptyText: "No NPC memory activity yet.", defaultOpen: true},
    {category: "headerFormat", title: "Format Header Log", emptyText: "No header formatting activity yet.", defaultOpen: true},
    {category: "narrativeFormat", title: "Format Narrative Log", emptyText: "No narrative formatting activity yet."},
    {category: "walletThread", title: "Wallet / Thread Log", emptyText: "No wallet or thread activity yet."},
    {category: "lifecycle", title: "Lifecycle Log", emptyText: "No lifecycle activity yet."},
    {category: "system", title: "System Message Log", emptyText: "No system messages captured yet."},
    {category: "injection", title: "Stage Injection (prompt to LLM) Log", emptyText: "No stage injection captured yet.", defaultOpen: true},
];

export interface DebugEvent {
    id: number;
    at: string;
    category: DebugCategory;
    label: string;
    detail: string;
    details?: string[];
}

export interface DebugSnapshot {
    state: AetherNovaMessageState;
    latestUserMessage: string;
    lastStageDirections: string;
    lastSystemMessage: string;
    lastModifiedMessageChanged: boolean;
    debugEvents: DebugEvent[];
}

export interface NpcMemoryDraft {
    name: string;
    roleTitle: string;
    race: string;
    physicalExtra: string;
    currentMood: string;
    lastInteractionTone: string;
    behaviorTowardUserText: string;
    behaviorScoresText: string;
    relationshipWithUserText: string;
    relationshipEventsText: string;
    onlyKnowsText: string;
}
