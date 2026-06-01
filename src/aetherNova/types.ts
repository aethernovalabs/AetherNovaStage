import type {Character} from "@chub-ai/stages-ts";

export type TimeOfDay = "Morning" | "Afternoon" | "Evening" | "Night";

export interface UserStatusState {
  gender: string;
  apparentRace: string;
  clothing: {
    upper?: string;
    lower?: string;
    footwear?: string;
    outerwear?: string;
    accessories?: string[];
  };
  weapons: Array<{
    name: string;
    location: string;
    status?: string;
  }>;
  importantItems: Array<{
    name: string;
    location: string;
    status?: string;
  }>;
}

export interface AetherNovaMessageState {
    location: string;
    timeOfDay: TimeOfDay;
    clock: string;
    you: string;
    npc: string;
    thread: string;
    wallet: string;
    walletInitialized: boolean;
    npcMemory: NpcMemoryStore;
    pendingNpcDebugQuery: string | null;
    pendingNpcMemoryCommand: string | null;
    userStatus: UserStatusState;
    lockedWaitingThreads?: string[];
    manualEditOverrides?: {
      location?: string;
      you?: string;
      npc?: string;
      thread?: string;
      wallet?: string;
    };
}

export interface NpcMemoryEntry {
    name: string;
    roleTitle: string;
    race: string;
    physicalExtra: string;
    currentMood: string;
    lastInteractionTone?: string;
    behaviorTowardUser: string[];
    behaviorScores: Record<string, number>;
    relationshipWithUser: string[];
    relationshipEvents: string[];
    onlyKnows: string[];
}

export type NpcMemoryStore = Record<string, NpcMemoryEntry>;

export interface ExtractedHeader {
    locationLine: string | null;
    youLine: string | null;
    npcLine: string | null;
    threadLine: string | null;
    walletLine: string | null;
    narrative: string;
}

export interface HeaderBlock extends Omit<ExtractedHeader, "narrative"> {
    start: number;
    end: number;
}

export interface NormalizedResponse {
    content: string;
    state: AetherNovaMessageState;
    systemMessage: string | null;
}

export interface NpcMemoryCommandResult {
    state: AetherNovaMessageState;
    cleanedMessage: string;
    systemMessage: string | null;
    applied: boolean;
}

export interface NpcCanonEntry {
    name: string;
    aliases: string[];
    roleTitle: string;
    race: string;
    physicalExtra: string;
}

export interface IdentityStatus {
    identity: string;
    status: string;
}

export interface WalletAmounts {
    gold: number;
    silver: number;
    copper: number;
}

export interface NormalizedWallet {
    value: string;
    initialized: boolean;
}

export interface NarrativeFormatState {
    npcNames: string[];
    recentSpeaker: string | null;
}

export interface NormalizeStatusOptions {
    sceneChanged?: boolean;
    trustRawStatus?: boolean;
}

export interface NpcHeaderMemoryEntry {
    name: string;
    firstName: string;
    titleFromName: string;
    race: string;
    status: string;
}

export interface NpcMemoryCommandUpdates {
    name: string;
    roleTitle: string;
    race: string;
    physicalExtra: string;
    currentMood: string;
    lastInteractionTone: string;
    behaviorTowardUser: string[];
    behaviorScores: Record<string, number>;
    behaviorScoreDeltas: Record<string, number>;
    relationshipWithUser: string[];
    relationshipEvents: string[];
    onlyKnows: string[];
    addFacts: string[];
}

export interface NpcMemoryCommand {
    raw: string;
    action: "delete" | "set" | "clearfacts" | "addfact" | "relationship" | "relationevent" | "mood" | "behavior" | "behaviorscore" | "show";
    target: string;
    updates: Partial<NpcMemoryCommandUpdates>;
}

export interface MoodInference {
    currentMood: string;
    lastInteractionTone?: string;
}

export interface BehaviorEvidence {
    label: string;
    weight: number;
}

export interface RelationshipUpdate {
    relationshipWithUser: string[];
    events: string[];
}

export type DebugCategory = "lifecycle" | "npcMemory" | "headerFormat" | "narrativeFormat" | "walletThread" | "system" | "injection";

export type GeneralStatusKind = "you" | "npc";
