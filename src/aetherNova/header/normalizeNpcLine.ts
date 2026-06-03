import type {NormalizeStatusOptions} from "../types";
import {DEFAULT_STATE} from "../constants";
import {
    CLOTHING_CHANGE_CUES, CLOTHING_REMOVAL_CUES, CLOTHING_DAMAGE_CUES,
} from "./statusConstants";
import {cleanFragment, cleanLabeledValue, isNoNpcValue, isPlaceholder, sameText} from "../utils/text";
import {containsAnyCue} from "../utils/regex";
import {splitTopLevel} from "../utils/split";
import {defaultNpcStatusForRace} from "../state/defaultState";
import {
    parseIdentityStatus, splitIdentity, normalizeStatus,
    normalizePosition, normalizeClothing, normalizeDetail, statusParts,
    looksLikeClothingSlot, clothingChangeIsNegated, clothingIsMentioned,
} from "./normalizeYouLine";
import {findNpcCanonByNameOrAlias} from "../npcMemory/npcCanonRegistry";

function npcIdentityKey(value: string): string {
    return cleanFragment(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function inferNpcClothingFromContext(context: string): string | null {
    const lowerContext = context.toLowerCase();

    if (
        lowerContext.includes("wears simple")
        || lowerContext.includes("wearing simple")
        || lowerContext.includes("in simple clothes")
        || lowerContext.includes("in simple clothing")
        || lowerContext.includes("simple clothes")
        || lowerContext.includes("simple clothing")
        || lowerContext.includes("simple outfit")
        || lowerContext.includes("plain clothes")
        || lowerContext.includes("plain clothing")
        || lowerContext.includes("plain outfit")
    ) {
        return "Simple clothing";
    }

    if (
        lowerContext.includes("travel clothes")
        || lowerContext.includes("travel clothing")
        || lowerContext.includes("travel outfit")
        || lowerContext.includes("traveler clothes")
        || lowerContext.includes("traveler clothing")
    ) {
        return "Travel clothing";
    }

    if (
        lowerContext.includes("common clothes")
        || lowerContext.includes("common clothing")
        || lowerContext.includes("ordinary clothes")
        || lowerContext.includes("ordinary clothing")
    ) {
        return "Ordinary clothing";
    }

    return null;
}

function newNpcClothingIsSupported(candidate: string, context: string): boolean {
    const lowerContext = context.toLowerCase();

    if (sameText(candidate, "Regular clothing")) {
        return true;
    }

    if (looksLikeClothingSlot(candidate)) {
        return true;
    }

    if (clothingChangeIsNegated(lowerContext)) {
        return false;
    }

    if (
        !containsAnyCue(lowerContext, CLOTHING_CHANGE_CUES)
        && !containsAnyCue(lowerContext, CLOTHING_REMOVAL_CUES)
        && !containsAnyCue(lowerContext, CLOTHING_DAMAGE_CUES)
    ) {
        return false;
    }

    return clothingIsMentioned(candidate, context);
}

function normalizeNewNpcStatus(rawStatus: string, race: string, context: string): string {
    const defaultStatus = defaultNpcStatusForRace(race);
    const defaultParts = statusParts(defaultStatus, "npc");
    const rawParts = statusParts(rawStatus, "npc");
    const position = normalizePosition(rawParts[1] ?? defaultParts[1], defaultParts[1], "npc");
    const inferredClothing = inferNpcClothingFromContext(context);
    const rawClothing = normalizeClothing(inferredClothing ?? rawParts[0] ?? defaultParts[0], defaultParts[0]);
    const clothing = inferredClothing != null || newNpcClothingIsSupported(rawClothing, context) ? rawClothing : normalizeClothing(defaultParts[0], "Regular clothing");
    const detail = normalizeDetail(rawParts[2] ?? defaultParts[2], defaultParts[2], "npc");

    return `${clothing}; ${position}; ${detail}`;
}

function normalizeNpcEntry(
    rawEntry: string,
    fallbackEntry: string | null,
    context: string,
    options: NormalizeStatusOptions = {},
): string {
    const parsed = parseIdentityStatus(rawEntry);
    const fallback = fallbackEntry == null ? null : parseIdentityStatus(fallbackEntry);
    const fallbackIdentity = fallback == null ? null : splitIdentity(fallback.identity, "Unknown NPC", "Human");
    const identity = splitIdentity(parsed.identity, fallbackIdentity?.left ?? "Unknown NPC", fallbackIdentity?.right ?? "Human");

    const canon = findNpcCanonByNameOrAlias(identity.left);
    const correctedName = canon != null ? canon.name : identity.left;
    const correctedRace = canon != null ? canon.race : identity.right;

    const status = fallback == null
        ? normalizeNewNpcStatus(parsed.status, correctedRace, context)
        : normalizeStatus(parsed.status, fallback.status || defaultNpcStatusForRace(correctedRace), "npc", correctedRace, context, options);

    return `${correctedName} - ${correctedRace} (${status})`;
}

export function normalizeNpcLine(
    rawLine: string,
    previousNpc: string,
    context: string = "",
    options: NormalizeStatusOptions = {},
): string {
    const value = cleanLabeledValue(rawLine, "NPC");

    if (isNoNpcValue(value)) {
        return "None";
    }

    if (isPlaceholder(value)) {
        return previousNpc;
    }

    if (/^\s*—/.test(value)) {
        return "None";
    }

    const fallbackEntries = splitTopLevel(previousNpc || DEFAULT_STATE.npc, ",");
    const fallbackByName = new Map<string, string>();
    for (const fallbackEntry of fallbackEntries) {
        const fallback = parseIdentityStatus(fallbackEntry);
        const fallbackIdentity = splitIdentity(fallback.identity, "Unknown NPC", "Human");
        fallbackByName.set(npcIdentityKey(fallbackIdentity.left), fallbackEntry);
    }

    const entries = splitTopLevel(value, ",").filter((entry) => !isPlaceholder(entry));

    if (entries.length === 0) {
        return previousNpc;
    }

    const normalizedEntries = entries.map((entry) => {
        const parsed = parseIdentityStatus(entry);
        const identity = splitIdentity(parsed.identity, "Unknown NPC", "Human");
        if (isNoNpcValue(identity.left) || identity.left === "—" || identity.left === "-") {
            return "";
        }
        const fallback = fallbackByName.get(npcIdentityKey(identity.left)) ?? null;
        return normalizeNpcEntry(entry, fallback, context, options);
    }).filter(Boolean);

    if (normalizedEntries.length === 0) {
        return "None";
    }

    return normalizedEntries.join(", ");
}
