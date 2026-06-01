import type {NpcMemoryStore, NpcMemoryEntry} from "../types";
import {cleanFragment, cleanHeaderText, sameText, limitWords} from "../utils/text";

export function clampBehaviorScore(value: number): number {
    return Math.max(0, Math.min(9, value));
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

function ensureBehaviorScoresForStableLabels(scores: Record<string, number>, stableLabels: string[]): Record<string, number> {
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

export function cleanNpcMemoryName(value: string): string {
    return cleanHeaderText(value).replace(/\s+/g, " ").trim();
}

export function cleanMemoryField(value: unknown, fallback: string): string {
    return typeof value === "string" && cleanFragment(value).length > 0 ? cleanFragment(value) : fallback;
}

export function cleanFactText(value: string): string {
    return limitWords(cleanFragment(value).replace(/^that\s+/i, ""), 24);
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

export function normalizeMemoryTextList(value: unknown, maxItems: number): string[] {
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

export function mergeUniqueList(values: string[], maxItems: number): string[] {
    const result: string[] = [];

    for (const value of values) {
        const clean = cleanFragment(value);
        if (clean.length === 0 || result.some((entry) => sameText(entry, clean))) {
            continue;
        }

        result.push(clean);
        if (result.length >= maxItems) {
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
