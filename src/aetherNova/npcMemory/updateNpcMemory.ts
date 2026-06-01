import type {NpcMemoryStore, NpcMemoryEntry, AetherNovaMessageState} from "../types";
import {cleanFragment} from "../utils/text";
import {findNpcCanonByNameOrAlias} from "./npcCanonRegistry";
import {npcMemoryKey, resolveNpcMemoryKey, npcHeaderMemoryEntries, npcMemoryKeysFromHeader, npcMemoryKeysMentionedInText} from "./npcMemoryState";
import {
    cleanNpcMemoryName,
    cleanMemoryField,
    cleanFactText,
    cleanMemoryLabel,
    normalizeMemoryLabelList,
    normalizeBehaviorScores,
    normalizeRelationshipList,
    normalizeMemoryTextList,
    completeNpcMemoryName,
} from "./npcMemoryHelpers";
import {
    inferNpcRoleTitle,
    inferNpcPhysicalExtra,
    inferNpcMood,
    updateBehaviorScores,
    inferNpcBehaviorEvidence,
    stableBehaviorLabels,
    inferNpcRelationshipUpdate,
    mergeRelationshipEvents,
    mergeKnownFacts,
    inferNpcOnlyKnows,
} from "./npcMemoryInference";

function formatMemoryLabels(values: string[], fallback: string): string {
    const labels = values.map((value) => cleanMemoryLabel(value, "")).filter(Boolean);
    return labels.length > 0 ? labels.join(", ") : fallback;
}

function normalizeNpcMemoryEntry(value: unknown): NpcMemoryEntry | null {
    if (value == null || typeof value !== "object") {
        return null;
    }

    const raw = value as Partial<NpcMemoryEntry> & {
        racial?: string;
        knownFacts?: string[];
        relationship?: string | string[];
        behavior?: string | string[];
    };
    const name = typeof raw.name === "string" ? cleanNpcMemoryName(raw.name) : "";

    if (name.length === 0) {
        return null;
    }

    const onlyKnows = Array.isArray(raw.onlyKnows)
        ? raw.onlyKnows.filter((fact): fact is string => typeof fact === "string").map(cleanFactText).filter(Boolean).slice(0, 8)
        : Array.isArray(raw.knownFacts)
            ? raw.knownFacts.filter((fact): fact is string => typeof fact === "string").map(cleanFactText).filter(Boolean).slice(0, 8)
            : [];
    const behaviorTowardUser = normalizeMemoryLabelList(raw.behaviorTowardUser ?? raw.behavior, []);
    const behaviorScores = normalizeBehaviorScores(raw.behaviorScores, behaviorTowardUser);
    const relationshipWithUser = normalizeRelationshipList(raw.relationshipWithUser ?? raw.relationship);

    return {
        name,
        roleTitle: cleanMemoryField(raw.roleTitle, "Unknown role/title"),
        race: cleanMemoryField(raw.race || raw.racial, "Unknown"),
        physicalExtra: cleanMemoryField(raw.physicalExtra, "none"),
        currentMood: cleanMemoryLabel(raw.currentMood, "unknown"),
        lastInteractionTone: typeof raw.lastInteractionTone === "string" && cleanFragment(raw.lastInteractionTone).length > 0
            ? cleanMemoryLabel(raw.lastInteractionTone, "neutral")
            : undefined,
        behaviorTowardUser,
        behaviorScores,
        relationshipWithUser,
        relationshipEvents: normalizeMemoryTextList(raw.relationshipEvents, 10),
        onlyKnows,
    };
}

export function coerceNpcMemory(rawMemory: unknown, fallbackMemory: NpcMemoryStore = {}): NpcMemoryStore {
    const next: NpcMemoryStore = {};

    for (const entry of Object.values(fallbackMemory)) {
        const normalized = normalizeNpcMemoryEntry(entry);
        if (normalized != null) {
            next[npcMemoryKey(normalized.name)] = normalized;
        }
    }

    if (rawMemory == null || typeof rawMemory !== "object") {
        return next;
    }

    for (const value of Object.values(rawMemory as Record<string, unknown>)) {
        const normalized = normalizeNpcMemoryEntry(value);
        if (normalized != null) {
            next[npcMemoryKey(normalized.name)] = normalized;
        }
    }

    return next;
}

export function buildNpcMemoryDirections(state: AetherNovaMessageState, userMessage: string): string {
    const store = coerceNpcMemory(state.npcMemory);
    const presentKeys = npcMemoryKeysFromHeader(state.npc, store);
    const mentionedKeys = npcMemoryKeysMentionedInText(userMessage, store).filter((key) => !presentKeys.includes(key));
    const presentEntries = presentKeys.map((key) => store[key]).filter((entry): entry is NpcMemoryEntry => entry != null);
    const mentionedEntries = mentionedKeys.map((key) => store[key]).filter((entry): entry is NpcMemoryEntry => entry != null);

    if (presentEntries.length === 0 && mentionedEntries.length === 0) {
        return "";
    }

    const lines: string[] = [];

    if (presentEntries.length > 0) {
        lines.push("NPC Memory Context: Include full memory for present NPCs as in-story knowledge:");
        lines.push("Present NPCs (full memory):");
        for (const entry of presentEntries.slice(0, 4)) {
            lines.push(`- ${formatNpcMemoryForPrompt(entry, true)}`);
        }
    }

    if (mentionedEntries.length > 0) {
        lines.push("Mentioned-only NPCs (identity only — do not inject Mood, Relationship, Behavior, OnlyKnows, or Relationship Events unless they enter the scene/header):");
        for (const entry of mentionedEntries.slice(0, 4)) {
            lines.push(`- ${formatNpcMemoryForPrompt(entry, false)}`);
        }
    }

    return lines.join("\n");
}

export function formatNpcMemoryForPrompt(entry: NpcMemoryEntry, includeFull: boolean): string {
    const parts = [
        `Name: ${entry.name}`,
        `Role/Title: ${entry.roleTitle}`,
        `Race: ${entry.race}`,
        `Physical Extra: ${entry.physicalExtra}`,
    ];

    if (includeFull) {
        parts.push(`Current Mood: ${entry.currentMood}`);
        if (entry.lastInteractionTone != null) {
            parts.push(`Last Interaction Tone: ${entry.lastInteractionTone}`);
        }
        parts.push(`Behavior toward {{user}}: ${formatMemoryLabels(entry.behaviorTowardUser, "None stable yet")}`);
        parts.push(`Relationship with {{user}}: ${formatMemoryLabels(entry.relationshipWithUser, "stranger")}`);
        parts.push(`OnlyKnows: ${entry.onlyKnows.length > 0 ? entry.onlyKnows.join(" ; ") : "None recorded"}`);
        parts.push(`Important Relationship Events: ${entry.relationshipEvents.length > 0 ? entry.relationshipEvents.slice(-3).join(" ; ") : "None recorded"}`);
    }

    return parts.join(" | ");
}

export function updateNpcMemory(previousMemory: NpcMemoryStore, npcLine: string, context: string): NpcMemoryStore {
    const next = coerceNpcMemory(previousMemory);
    const entries = npcHeaderMemoryEntries(npcLine);

    for (const headerEntry of entries) {
        const existingKey = resolveNpcMemoryKey(headerEntry.name, next);
        const previous = existingKey == null ? null : next[existingKey];

        const canon = findNpcCanonByNameOrAlias(headerEntry.name);

        const name = canon != null ? canon.name : completeNpcMemoryName(headerEntry.name, previous, next);
        const key = npcMemoryKey(name);
        const roleTitle = canon != null ? canon.roleTitle : inferNpcRoleTitle(headerEntry, previous, context);
        const race = canon != null ? canon.race : cleanMemoryField(headerEntry.race || previous?.race, "Unknown");
        const physicalExtra = canon != null ? canon.physicalExtra : inferNpcPhysicalExtra(headerEntry, previous, context);
        const mood = inferNpcMood(headerEntry, previous, context);
        const behaviorScores = updateBehaviorScores(previous?.behaviorScores ?? {}, inferNpcBehaviorEvidence(headerEntry, context, next));
        const behaviorTowardUser = stableBehaviorLabels(previous?.behaviorTowardUser ?? [], behaviorScores);
        const relationshipUpdate = inferNpcRelationshipUpdate(headerEntry, previous, context, behaviorTowardUser);
        const relationshipWithUser = relationshipUpdate.relationshipWithUser;
        const relationshipEvents = mergeRelationshipEvents(previous?.relationshipEvents ?? [], relationshipUpdate.events);
        const onlyKnows = mergeKnownFacts(previous?.onlyKnows ?? [], inferNpcOnlyKnows(headerEntry, context));

        if (existingKey != null && existingKey !== key) {
            delete next[existingKey];
        }

        next[key] = {
            name,
            roleTitle,
            race,
            physicalExtra,
            currentMood: mood.currentMood,
            lastInteractionTone: mood.lastInteractionTone,
            behaviorTowardUser,
            behaviorScores,
            relationshipWithUser,
            relationshipEvents,
            onlyKnows,
        };
    }

    return next;
}
