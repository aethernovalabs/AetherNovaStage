import type {NpcMemoryStore, NpcMemoryEntry} from "../types";
import {cleanFragment, cleanHeaderText, sameText} from "../utils/text";
import {resolveNpcMemoryKey} from "./npcMemoryState";

export function clampBehaviorScore(value: number): number {
    const clamped = Math.max(0, Math.min(9, value));
    return Math.round((clamped + Number.EPSILON) * 100) / 100;
}

export function formatBehaviorScoreValue(value: number): string {
    return clampBehaviorScore(value).toFixed(2).replace(/\.?0+$/, "");
}

function splitMemoryFields(value: string): string[] {
    return cleanFragment(value)
        .split(/\s*[,;]\s*/g)
        .map(cleanFragment)
        .filter(Boolean);
}

function splitRelationshipEvents(value: string): string[] {
    return value
        .split(/\s*;\s*/g)
        .map(cleanFactText)
        .filter(Boolean);
}

export function ensureBehaviorScoresForStableLabels(scores: Record<string, number>, stableLabels: string[]): Record<string, number> {
    const next: Record<string, number> = {};
    for (const [label, score] of Object.entries(scores)) {
        const clean = cleanMemoryLabel(label, "");
        if (clean.length > 0 && Number.isFinite(score)) {
            next[clean] = clampBehaviorScore(score);
        }
    }

    for (const label of stableLabels) {
        const clean = cleanMemoryLabel(label, "");
        if (clean.length > 0) {
            next[clean] = Math.max(next[clean] ?? 0, 3);
        }
    }

    return next;
}

export function mergeBehaviorScores(previous: Record<string, number>, patch: Record<string, number>): Record<string, number> {
    const next: Record<string, number> = {};
    for (const [label, score] of Object.entries(previous)) {
        const clean = cleanMemoryLabel(label, "");
        if (clean.length > 0 && Number.isFinite(score)) {
            next[clean] = clampBehaviorScore(score);
        }
    }
    for (const [label, score] of Object.entries(patch)) {
        const clean = cleanMemoryLabel(label, "");
        if (clean.length > 0 && Number.isFinite(score)) {
            next[clean] = clampBehaviorScore(score);
        }
    }
    return next;
}

export function applyBehaviorScoreDeltas(scores: Record<string, number>, deltas: Record<string, number>): Record<string, number> {
    const next = normalizeBehaviorScores(scores, []);
    for (const [label, delta] of Object.entries(deltas)) {
        const clean = cleanMemoryLabel(label, "");
        if (clean.length > 0 && Number.isFinite(delta)) {
            next[clean] = clampBehaviorScore((next[clean] ?? 0) + delta);
        }
    }
    return next;
}

export function cleanNpcMemoryName(value: string): string {
    return cleanHeaderText(value).replace(/\s+/g, " ").trim();
}

export function cleanMemoryField(value: unknown, fallback: string): string {
    return typeof value === "string" && cleanFragment(value).length > 0 ? cleanFragment(value) : fallback;
}

export function cleanFactText(value: string): string {
    return cleanFragment(value).replace(/^that\s+/i, "");
}

export function firstNameOf(name: string): string {
    return cleanNpcMemoryName(name).split(/\s+/)[0] ?? "";
}

export function cleanMemoryLabel(value: unknown, fallback: string): string {
    if (typeof value !== "string") {
        return fallback;
    }

    const clean = cleanFragment(value)
        .toLowerCase()
        .replace(/[_/]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return clean.length > 0 ? clean : fallback;
}

export function formatMemoryLabels(values: string[], fallback: string): string {
    const labels = values.map((value) => cleanMemoryLabel(value, "")).filter(Boolean);
    return labels.length > 0 ? labels.join(", ") : fallback;
}

export function formatBehaviorScores(scores: Record<string, number>): string {
    const entries = Object.entries(scores)
        .filter(([_label, score]) => score > 0)
        .sort((left, right) => right[1] - left[1]);

    return entries.length > 0 ? entries.map(([label, score]) => `${label}:${formatBehaviorScoreValue(score)}`).join(", ") : "none";
}

export function normalizeMemoryLabelList(value: unknown, fallback: string[] = []): string[] {
    if (Array.isArray(value)) {
        return mergeUniqueList(value.filter((item): item is string => typeof item === "string").map((item) => cleanMemoryLabel(item, "")).filter(Boolean), 8);
    }

    if (typeof value === "string") {
        const clean = cleanFragment(value);
        if (clean.length === 0 || /^(unknown|none|none stable yet)$/i.test(clean)) {
            return fallback;
        }

        return mergeUniqueList(splitMemoryFields(clean).flatMap((part) => part.split(/\s*\/\s*/g)).map((item) => cleanMemoryLabel(item, "")).filter(Boolean), 8);
    }

    return fallback;
}

export function normalizeMemoryTextList(value: unknown, maxItems: number = Number.POSITIVE_INFINITY): string[] {
    if (Array.isArray(value)) {
        return mergeUniqueList(value.filter((item): item is string => typeof item === "string").map(cleanFactText).filter(Boolean), maxItems);
    }

    if (typeof value === "string") {
        return mergeUniqueList(splitRelationshipEvents(value), maxItems);
    }

    return [];
}

export function normalizeRelationshipList(value: unknown): string[] {
    const labels = normalizeMemoryLabelList(value, []);
    const meaningful = labels.filter((label) => !/^(unknown|none)$/i.test(label));
    return meaningful.length > 0 ? mergeUniqueList(meaningful, 6) : ["stranger"];
}

export function normalizeBehaviorScores(value: unknown, stableLabels: string[]): Record<string, number> {
    const scores: Record<string, number> = ensureBehaviorScoresForStableLabels({}, stableLabels);

    if (value != null && typeof value === "object" && !Array.isArray(value)) {
        for (const [key, rawScore] of Object.entries(value as Record<string, unknown>)) {
            const label = cleanMemoryLabel(key, "");
            const score = typeof rawScore === "number" ? rawScore : Number(rawScore);
            if (label.length > 0 && Number.isFinite(score)) {
                scores[label] = clampBehaviorScore(score);
            }
        }
    }

    return scores;
}

export function mergeUniqueList(values: string[], maxItems: number = Number.POSITIVE_INFINITY): string[] {
    const result: string[] = [];

    for (const value of values) {
        const clean = cleanFragment(value);
        if (clean.length === 0 || result.some((entry) => sameText(entry, clean))) {
            continue;
        }

        result.push(clean);
        if (Number.isFinite(maxItems) && result.length >= maxItems) {
            break;
        }
    }

    return result;
}

export function completeNpcMemoryName(name: string, previous: NpcMemoryEntry | null, memory: NpcMemoryStore): string {
    const clean = cleanNpcMemoryName(name);
    if (clean.split(/\s+/).length >= 2) {
        return clean;
    }

    if (previous != null && previous.name.split(/\s+/).length >= 2) {
        return previous.name;
    }

    const first = firstNameOf(clean).toLowerCase();
    const full = Object.values(memory).find((entry) => firstNameOf(entry.name).toLowerCase() === first && entry.name.split(/\s+/).length >= 2);
    return full?.name ?? clean;
}

export function isEmptyNpcMemoryValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  const text = String(value).trim().toLowerCase();
  return (
    text === "" ||
    text === "none" ||
    text === "none recorded" ||
    text === "unknown none" ||
    text === "[]" ||
    text === "n/a"
  );
}

const GENERIC_NPC_BLOCKLIST = new Set([
    "page boy",
    "palace guards",
    "palace guard",
    "crown guards",
    "crown guard",
    "royal guards",
    "royal guard",
    "city guards",
    "city guard",
    "handmaidens",
    "handmaiden",
    "nobles",
    "noble",
    "servants",
    "servant",
    "crowd",
    "villagers",
    "villager",
    "merchants",
    "merchant",
    "messenger",
    "herald",
    "attendant",
    "patrol",
    "escorts",
    "escort",
    "old merchant",
    "royal herald",
    "a palace guard",
    "the herald",
    "a messenger",
    "the guard",
    "the guards",
    "aldric's guard",
    "a guard",
    "a palace guard",
]);

const GENERIC_NPC_COUNT_WORDS = new Set([
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "dozen",
    "couple",
    "pair",
    "few",
    "several",
    "many",
    "multiple",
]);

const GENERIC_NPC_WORDS = new Set([
    ...GENERIC_NPC_COUNT_WORDS,
    "king",
    "queen",
    "prince",
    "princess",
    "emperor",
    "empress",
    "lord",
    "lady",
    "duke",
    "duchess",
    "sir",
    "captain",
    "commander",
    "general",
    "colonel",
    "sergeant",
    "minister",
    "priest",
    "priestess",
    "knight",
    "knights",
    "guard",
    "guards",
    "soldier",
    "soldiers",
    "merchant",
    "merchants",
    "broker",
    "informant",
    "innkeeper",
    "herald",
    "page",
    "messenger",
    "attendant",
    "patrol",
    "escort",
    "escorts",
    "servant",
    "servants",
    "maid",
    "maids",
    "handmaiden",
    "handmaidens",
    "noble",
    "nobles",
    "crowd",
    "villager",
    "villagers",
    "old",
    "young",
    "crown",
    "royal",
    "imperial",
    "palace",
    "castle",
    "court",
    "city",
    "town",
    "village",
    "gate",
    "temple",
    "throne",
    "house",
    "household",
    "inner",
    "outer",
    "upper",
    "lower",
    "master",
    "mistress",
    "apprentice",
    "acolyte",
    "man",
    "woman",
    "boy",
    "girl",
    "men",
    "women",
    "child",
    "children",
    "a",
    "an",
    "the",
]);

function isGenericNpcCountWord(word: string): boolean {
    return GENERIC_NPC_COUNT_WORDS.has(word.toLowerCase()) || /^\d+$/.test(word);
}

export function isPersistableNpcMemoryName(name: string): boolean {
    const clean = cleanNpcMemoryName(name);
    if (clean.length === 0) {
        return false;
    }
    if (/x\d+/i.test(clean)) {
        return false;
    }

    const lower = clean.toLowerCase();
    if (GENERIC_NPC_BLOCKLIST.has(lower)) {
        return false;
    }

    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
        return false;
    }

    const meaningfulWords = words.filter((word, index) => index > 0 || !isGenericNpcCountWord(word));
    if (meaningfulWords.length < 2) {
        return false;
    }

    for (const word of meaningfulWords) {
        const w = word.toLowerCase();
        if (!GENERIC_NPC_WORDS.has(w)) {
            return true;
        }
    }

    return false;
}

export function formatNpcMemoryForPrompt(entry: NpcMemoryEntry, includeFull: boolean): string {
    const fields: string[] = [
        `Name: ${entry.name}`,
        `Role/Title: ${entry.roleTitle}`,
        `Race: ${entry.race}`,
    ];

    if (!isEmptyNpcMemoryValue(entry.physicalExtra)) {
        fields.push(`Physical Extra: ${entry.physicalExtra}`);
    }

    if (includeFull) {
        fields.push(`Current Mood: ${entry.currentMood}`);
        if (entry.lastInteractionTone != null) {
            fields.push(`Last Interaction Tone: ${entry.lastInteractionTone}`);
        }
        fields.push(`Behavior toward {{user}}: ${formatMemoryLabels(entry.behaviorTowardUser, "None stable yet")}`);
        fields.push(`Relationship with {{user}}: ${formatMemoryLabels(entry.relationshipWithUser, "stranger")}`);
        if (!isEmptyNpcMemoryValue(entry.onlyKnows)) {
            fields.push(`OnlyKnows: ${entry.onlyKnows.join(" ; ")}`);
        }
        if (!isEmptyNpcMemoryValue(entry.relationshipEvents)) {
            fields.push(`Important Relationship Events: ${entry.relationshipEvents.slice(-3).join(" ; ")}`);
        }
    }

    return fields.join(" | ");
}

export function buildNpcDebugDirections(query: string | null, memory: NpcMemoryStore): string {
    if (query == null) {
        return "";
    }

    const key = resolveNpcMemoryKey(query, memory);
    const entry = key == null ? null : memory[key];

    if (entry == null) {
        return `NPC Debug Request (temporary): ${query} has no stored NPC memory yet. After the response, stage will append a debug footer.`;
    }

    return [
        "NPC Debug Request (temporary; do not narrate this debug block in-character):",
        formatNpcMemoryForPrompt(entry, true),
        "Stage will show this debug data separately as a system message after the response.",
    ].join("\n");
}

export function buildNpcDebugFooter(query: string | null, memory: NpcMemoryStore): string {
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
