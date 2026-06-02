import type {AetherNovaMessageState} from "../types";

export const DEBUG_STORAGE_KEY = "aether-nova-stage.pendingNpcDebugQuery";
export const DEBUG_UI_VERSION = "V1.9";

export type DebugCategory =
    | "stagePrompt"
    | "npcMemory"
    | "location"
    | "time"
    | "youLine"
    | "npcLine"
    | "threadLine"
    | "walletLine"
    | "narrative"
    | "lifecycle";

export const DEBUG_LOG_GROUPS: Array<{category: DebugCategory; title: string; emptyText: string; defaultOpen?: boolean}> = [
    {category: "stagePrompt", title: "Stage Prompt To LLM Log", emptyText: "No stage prompt sent to the LLM yet.", defaultOpen: true},
    {category: "npcMemory", title: "NPC Memory Log", emptyText: "No NPC memory changes yet.", defaultOpen: true},
    {category: "location", title: "Location Log", emptyText: "No location changes yet."},
    {category: "time", title: "Time Log", emptyText: "No time changes yet."},
    {category: "youLine", title: "You Line Log", emptyText: "No You line changes yet."},
    {category: "npcLine", title: "NPC Line Log", emptyText: "No NPC line changes yet."},
    {category: "threadLine", title: "Thread Line Log", emptyText: "No thread line changes yet."},
    {category: "walletLine", title: "Wallet Line Log", emptyText: "No wallet changes yet."},
    {category: "narrative", title: "Narrative Log", emptyText: "No narrative formatting changes yet."},
    {category: "lifecycle", title: "Lifecycle Log", emptyText: "No lifecycle activity yet."},
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
