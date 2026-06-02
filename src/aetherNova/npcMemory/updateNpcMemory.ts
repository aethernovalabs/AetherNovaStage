import type {NpcMemoryStore, NpcMemoryEntry, AetherNovaMessageState} from "../types";
import {cleanFragment} from "../utils/text";
import {findNpcCanonByNameOrAlias} from "./npcCanonRegistry";
import {
    npcMemoryKey,
    resolveNpcMemoryKey,
    npcHeaderMemoryEntries,
    npcMemoryKeysFromHeader,
    npcMemoryKeysMentionedInText,
} from "./npcMemoryState";
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
    isEmptyNpcMemoryValue,
    formatNpcMemoryForPrompt,
    isPersistableNpcMemoryName,
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
        ? raw.onlyKnows.filter((fact): fact is string => typeof fact === "string").map(cleanFactText).filter(Boolean)
        : Array.isArray(raw.knownFacts)
            ? raw.knownFacts.filter((fact): fact is string => typeof fact === "string").map(cleanFactText).filter(Boolean)
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
        if (normalized != null && isPersistableNpcMemoryName(normalized.name)) {
            next[npcMemoryKey(normalized.name)] = normalized;
        }
    }

    if (rawMemory == null || typeof rawMemory !== "object") {
        return next;
    }

    for (const value of Object.values(rawMemory as Record<string, unknown>)) {
        const normalized = normalizeNpcMemoryEntry(value);
        if (normalized != null && isPersistableNpcMemoryName(normalized.name)) {
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
        lines.push("[NPC Memory Context]");
        lines.push("Present NPCs (full memory):");
        for (const entry of presentEntries.slice(0, 4)) {
            lines.push(`- ${formatNpcMemoryForPrompt(entry, true)}`);
        }
    }

    if (mentionedEntries.length > 0) {
        lines.push("Mentioned-only NPCs (identity only):");
        for (const entry of mentionedEntries.slice(0, 4)) {
            lines.push(`- ${formatNpcMemoryForPrompt(entry, false)}`);
        }
    }

    return lines.join("\n");
}

export function updateNpcMemory(previousMemory: NpcMemoryStore, npcLine: string, context: string): NpcMemoryStore {
    const next = coerceNpcMemory(previousMemory);
    const entries = npcHeaderMemoryEntries(npcLine);

    for (const headerEntry of entries) {
        const existingKey = resolveNpcMemoryKey(headerEntry.name, next);
        const previous = existingKey == null ? null : next[existingKey];

        const canon = findNpcCanonByNameOrAlias(headerEntry.name);

        if (canon == null && !isPersistableNpcMemoryName(headerEntry.name)) {
            if (existingKey != null) {
                delete next[existingKey];
            }
            continue;
        }

        const name = canon != null ? canon.name : completeNpcMemoryName(headerEntry.name, previous, next);
        const key = npcMemoryKey(name);
        const roleTitle = canon != null ? canon.roleTitle : inferNpcRoleTitle(headerEntry, previous, context);
        const race = canon != null ? canon.race : cleanMemoryField(headerEntry.race || previous?.race, "Unknown");
        const physicalExtra = canon != null ? canon.physicalExtra : inferNpcPhysicalExtra(headerEntry, previous, context);
        const mood = inferNpcMood(headerEntry, previous, context);
        const behaviorScores = updateBehaviorScores(previous?.behaviorScores ?? {}, inferNpcBehaviorEvidence(headerEntry, context, next), context);
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
