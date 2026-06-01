import type {AetherNovaMessageState, NpcMemoryEntry, NpcMemoryStore, UserStatusState} from "../types";
import type {NpcMemoryDraft} from "./types";
import {DEBUG_STORAGE_KEY} from "./types";

export function computeDirtyFields(draft: NpcMemoryDraft, original: NpcMemoryEntry | null): Set<string> {
    const dirty = new Set<string>();
    if (original == null) {
        return dirty;
    }
    if (draft.name !== original.name) dirty.add("name");
    if (draft.roleTitle !== original.roleTitle) dirty.add("roleTitle");
    if (draft.race !== original.race) dirty.add("race");
    if (draft.physicalExtra !== original.physicalExtra) dirty.add("physicalExtra");
    if (draft.currentMood !== original.currentMood) dirty.add("currentMood");
    if (draft.lastInteractionTone !== (original.lastInteractionTone ?? "")) dirty.add("lastInteractionTone");
    if (draft.behaviorTowardUserText !== original.behaviorTowardUser.join(", ")) dirty.add("behaviorTowardUserText");
    if (draft.behaviorScoresText !== Object.entries(original.behaviorScores).map(([l, s]) => `${l}: ${s}`).join("; ")) dirty.add("behaviorScoresText");
    if (draft.relationshipWithUserText !== original.relationshipWithUser.join(", ")) dirty.add("relationshipWithUserText");
    if (draft.relationshipEventsText !== original.relationshipEvents.join("; ")) dirty.add("relationshipEventsText");
    if (draft.onlyKnowsText !== original.onlyKnows.join("; ")) dirty.add("onlyKnowsText");
    return dirty;
}

export function emptyNpcMemoryDraft(): NpcMemoryDraft {
    return {
        name: "",
        roleTitle: "",
        race: "",
        physicalExtra: "",
        currentMood: "",
        lastInteractionTone: "",
        behaviorTowardUserText: "",
        behaviorScoresText: "",
        relationshipWithUserText: "",
        relationshipEventsText: "",
        onlyKnowsText: "",
    };
}

export function draftFromNpcMemory(entry: NpcMemoryEntry): NpcMemoryDraft {
    return {
        name: entry.name,
        roleTitle: entry.roleTitle,
        race: entry.race,
        physicalExtra: entry.physicalExtra,
        currentMood: entry.currentMood,
        lastInteractionTone: entry.lastInteractionTone ?? "",
        behaviorTowardUserText: entry.behaviorTowardUser.join(", "),
        behaviorScoresText: Object.entries(entry.behaviorScores).map(([label, score]) => `${label}: ${score}`).join("; "),
        relationshipWithUserText: entry.relationshipWithUser.join(", "),
        relationshipEventsText: entry.relationshipEvents.join("; "),
        onlyKnowsText: entry.onlyKnows.join("; "),
    };
}

export function npcMemorySetCommand(draft: NpcMemoryDraft, targetName: string = draft.name, dirtyFields?: Set<string>): string | null {
    const name = cleanDebugValue(draft.name);
    const target = cleanDebugValue(targetName || draft.name);
    if (name.length === 0 || target.length === 0) {
        return null;
    }

    const parts: string[] = [`npc memory set: ${target}`];

    if (dirtyFields == null || dirtyFields.has("name")) {
        parts.push(`name=${name}`);
    }
    if (dirtyFields == null || dirtyFields.has("roleTitle")) {
        parts.push(`role=${cleanDebugValue(draft.roleTitle) || "Unknown role/title"}`);
    }
    if (dirtyFields == null || dirtyFields.has("race")) {
        parts.push(`race=${cleanDebugValue(draft.race) || "Unknown"}`);
    }
    if (dirtyFields == null || dirtyFields.has("physicalExtra")) {
        parts.push(`physical=${cleanDebugValue(draft.physicalExtra) || "none"}`);
    }
    if (dirtyFields == null || dirtyFields.has("currentMood")) {
        parts.push(`mood=${cleanDebugValue(draft.currentMood) || "unknown"}`);
    }
    if (dirtyFields == null || dirtyFields.has("lastInteractionTone")) {
        parts.push(`tone=${cleanDebugValue(draft.lastInteractionTone)}`);
    }
    if (dirtyFields == null || dirtyFields.has("behaviorTowardUser") || dirtyFields.has("behaviorTowardUserText")) {
        parts.push(`behavior=${cleanDebugList(draft.behaviorTowardUserText)}`);
    }
    if (dirtyFields == null || dirtyFields.has("behaviorScores") || dirtyFields.has("behaviorScoresText")) {
        parts.push(`behaviorScores=${cleanDebugScoreMap(draft.behaviorScoresText)}`);
    }
    if (dirtyFields == null || dirtyFields.has("relationshipWithUser") || dirtyFields.has("relationshipWithUserText")) {
        parts.push(`relationship=${cleanDebugList(draft.relationshipWithUserText) || "stranger"}`);
    }
    if (dirtyFields == null || dirtyFields.has("relationshipEvents") || dirtyFields.has("relationshipEventsText")) {
        parts.push(`event=${cleanDebugFacts(draft.relationshipEventsText)}`);
    }
    if (dirtyFields == null || dirtyFields.has("onlyKnows") || dirtyFields.has("onlyKnowsText")) {
        parts.push(`onlyKnows=${cleanDebugFacts(draft.onlyKnowsText)}`);
    }

    return parts.join(" | ");
}

function cleanDebugValue(value: string): string {
    return value.replace(/[|\n\r\]】]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanDebugFacts(value: string): string {
    return value
        .split(/\n+|;/g)
        .map(cleanDebugValue)
        .filter(Boolean)
        .join("; ");
}

function cleanDebugList(value: string): string {
    return value
        .split(/\n+|;|,/g)
        .map(cleanDebugValue)
        .filter(Boolean)
        .join(", ");
}

function cleanDebugScoreMap(value: string): string {
    return value
        .split(/\n+|;|,/g)
        .map(cleanDebugValue)
        .map((entry) => {
            const match = /^([A-Za-z][A-Za-z -]{1,40})\s*(?:=|:|\s)\s*([+-]?\d+(?:\.\d+)?)$/i.exec(entry);
            return match == null ? "" : `${match[1].trim()}:${match[2]}`;
        })
        .filter(Boolean)
        .join("; ");
}

export function formatDebugList(values: string[], fallback: string): string {
    return values.length > 0 ? values.join(", ") : fallback;
}

export function formatDebugScores(scores: Record<string, number>): string {
    const entries = Object.entries(scores)
        .filter(([_label, score]) => score > 0)
        .sort((left, right) => right[1] - left[1]);

    return entries.length > 0 ? entries.map(([label, score]) => `${label}:${score}`).join(", ") : "none";
}

export function headerStateChangeDetails(previous: AetherNovaMessageState, next: AetherNovaMessageState): string[] {
    const details = [
        formatDebugFieldChange("Location", previous.location, next.location),
        formatDebugFieldChange("Time", `${previous.timeOfDay} | ${previous.clock}`, `${next.timeOfDay} | ${next.clock}`),
        formatDebugFieldChange("You", previous.you, next.you),
        formatDebugFieldChange("NPC", previous.npc, next.npc),
        formatDebugFieldChange("Thread", previous.thread, next.thread),
        formatDebugFieldChange("Wallet", previous.wallet, next.wallet),
    ].filter(Boolean);

    const userStatusChanged = JSON.stringify(previous.userStatus ?? {}) !== JSON.stringify(next.userStatus ?? {});
    if (userStatusChanged) {
        details.push("Status User: changed");
    }

    return details.length > 0 ? details : ["No tracked header field changed."];
}

export function narrativeFormatDetails(originalContent: string, normalizedContent: string, changedFields: string[]): string[] {
    return [
        `Original chars: ${originalContent.length}`,
        `Normalized chars: ${normalizedContent.length}`,
        normalizedContent !== originalContent
            ? "Modified message returned to chat. This can include header repair, narrative italics, speaker labels, or quote/action cleanup."
            : "No modified message returned.",
        changedFields.length > 0
            ? `Stage state changed too: ${changedFields.join(", ")}`
            : "Stage state did not change.",
    ];
}

export function npcMemoryChangeDetails(previous: NpcMemoryStore, next: NpcMemoryStore): string[] {
    const previousKeys = Object.keys(previous ?? {});
    const nextKeys = Object.keys(next ?? {});
    const added = nextKeys.filter((key) => previous?.[key] == null).map((key) => next[key].name);
    const removed = previousKeys.filter((key) => next?.[key] == null).map((key) => previous[key].name);
    const changed = nextKeys
        .filter((key) => previous?.[key] != null && JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
        .map((key) => next[key].name);
    const details = [
        added.length > 0 ? `Added: ${added.join(", ")}` : "",
        removed.length > 0 ? `Removed: ${removed.join(", ")}` : "",
        changed.length > 0 ? `Changed: ${changed.join(", ")}` : "",
    ].filter(Boolean);

    return details.length > 0 ? details : ["NPC memory unchanged."];
}

export function walletThreadSummary(previous: AetherNovaMessageState, next: AetherNovaMessageState): string {
    const walletChanged = previous.wallet !== next.wallet;
    const threadChanged = previous.thread !== next.thread;

    if (walletChanged && threadChanged) {
        return "wallet and thread changed";
    }
    if (walletChanged) {
        return "wallet changed";
    }
    if (threadChanged) {
        return "thread changed";
    }
    return "wallet and thread unchanged";
}

export function walletThreadDetails(previous: AetherNovaMessageState, next: AetherNovaMessageState): string[] {
    const details = [
        formatDebugFieldChange("Wallet", previous.wallet, next.wallet),
        formatDebugFieldChange("Thread", previous.thread, next.thread),
    ].filter(Boolean);

    return details.length > 0 ? details : ["No wallet/thread change accepted."];
}

export function formatDebugFieldChange(label: string, previous: string, next: string): string {
    return previous === next ? "" : `${label}: ${previous} -> ${next}`;
}

export function countNpcMemory(state: AetherNovaMessageState): number {
    return Object.keys(state.npcMemory ?? {}).length;
}

export function changedStateFields(previous: AetherNovaMessageState, next: AetherNovaMessageState): string[] {
    const fields: Array<keyof AetherNovaMessageState> = [
        "location",
        "timeOfDay",
        "clock",
        "you",
        "npc",
        "thread",
        "wallet",
        "walletInitialized",
        "pendingNpcDebugQuery",
        "pendingNpcMemoryCommand",
    ];
    const changed = fields.filter((field) => previous[field] !== next[field]).map(String);

    if (JSON.stringify(previous.npcMemory ?? {}) !== JSON.stringify(next.npcMemory ?? {})) {
        changed.push("npcMemory");
    }

    if (JSON.stringify(previous.userStatus ?? {}) !== JSON.stringify(next.userStatus ?? {})) {
        changed.push("userStatus");
    }

    return changed;
}

export function joinSystemMessages(...messages: Array<string | null | undefined>): string {
    return messages.map((message) => message ?? "").filter((message) => message.length > 0).join("\n");
}

export function writePendingDebugQuery(query: string): void {
    try {
        window.localStorage.setItem(DEBUG_STORAGE_KEY, query);
    } catch {
        // Debug fallback only; ignore storage failures.
    }
}

export function readPendingDebugQuery(): string | null {
    try {
        const value = window.localStorage.getItem(DEBUG_STORAGE_KEY);
        return value == null || value.trim().length === 0 ? null : value.trim();
    } catch {
        return null;
    }
}

export function clearPendingDebugQuery(): void {
    try {
        window.localStorage.removeItem(DEBUG_STORAGE_KEY);
    } catch {
        // Debug fallback only; ignore storage failures.
    }
}

export function deepMergeUserStatus(previous: UserStatusState, patch: Partial<UserStatusState>): UserStatusState {
    return {
        gender: patch.gender ?? previous.gender,
        apparentRace: patch.apparentRace ?? previous.apparentRace,
        clothing: {
            ...previous.clothing,
            ...patch.clothing,
        },
        weapons: patch.weapons ?? previous.weapons,
        importantItems: patch.importantItems ?? previous.importantItems,
    };
}
