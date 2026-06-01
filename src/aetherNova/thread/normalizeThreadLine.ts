import {cleanFragment, cleanLabeledValue, isPlaceholder, isNoThreadValue, sameText} from "../utils/text";
import {DEFAULT_STATE, MINOR_THREAD_PATTERN, TERMINAL_THREAD_STATUS_TAG_PATTERN, TERMINAL_THREAD_END_PATTERN} from "../constants";
import {THREAD_TRANSITION_CUES, THREAD_STOP_WORDS} from "./threadConstants";
import {activeThreadOrNone, inferThreadFromNarrative} from "./threadInference";

export function normalizeThreadLine(rawLine: string, previousThread: string, narrative: string): string {
    const rawCandidate = cleanLabeledValue(rawLine, "Thread");
    const inferredThread = inferThreadFromNarrative(narrative, previousThread);
    const previousActiveThread = activeThreadOrNone(previousThread);

    if (isNoThreadValue(rawCandidate)) {
        return inferredThread ?? "None";
    }

    if (isPlaceholder(rawCandidate)) {
        return inferredThread ?? previousActiveThread;
    }

    const candidate = normalizeThreadValue(rawCandidate);

    if (candidate.length === 0) {
        return inferredThread ?? previousActiveThread;
    }

    if (
        previousActiveThread !== DEFAULT_STATE.thread
        && previousActiveThread !== "None"
        && !sameText(candidate, previousActiveThread)
        && !threadChangeIsSupported(candidate, previousActiveThread, narrative)
    ) {
        return inferredThread != null && threadChangeIsSupported(inferredThread, previousActiveThread, narrative)
            ? mergeThreadInference(previousActiveThread, inferredThread)
            : previousActiveThread;
    }

    if (inferredThread != null && threadShouldUseNarrativeInference(candidate, previousActiveThread, inferredThread)) {
        return mergeThreadInference(candidate, inferredThread);
    }

    return candidate;
}

export function normalizeThreadValue(rawValue: string): string {
    const items = rawValue
        .split(/\s*;\s*/g)
        .map(cleanFragment)
        .filter((item) => item.length > 0 && !isTerminalThreadItem(item));

    return items.join(" ; ");
}

export function threadChangeIsSupported(candidate: string, previousThread: string, narrative: string): boolean {
    const candidateTokens = meaningfulTokens(candidate);
    const previousTokens = meaningfulTokens(previousThread);

    if (candidateTokens.size === 0 || previousTokens.size === 0) {
        return true;
    }

    const sharedTokens = [...candidateTokens].filter((token) => previousTokens.has(token));
    const similarity = sharedTokens.length / Math.max(candidateTokens.size, previousTokens.size);

    if (similarity >= 0.22) {
        return true;
    }

    const lowerNarrative = narrative.toLowerCase();
    return THREAD_TRANSITION_CUES.some((cue) => lowerNarrative.includes(cue));
}

export function threadShouldUseNarrativeInference(candidate: string, previousThread: string, inferredThread: string): boolean {
    if (sameText(candidate, inferredThread) || threadItemsOverlap(candidate, inferredThread)) {
        return false;
    }

    return sameText(candidate, previousThread) || isGenericThreadCandidate(candidate);
}

export function mergeThreadInference(baseThread: string, inferredThread: string): string {
    const baseItems = isGenericThreadCandidate(baseThread) || isNoThreadValue(baseThread) ? [] : splitThreadItems(baseThread);
    const inferredItems = splitThreadItems(inferredThread);
    const merged = inferredItems.length > 0
        ? baseItems.map(markThreadParentPendingForSubgoal)
        : [...baseItems];

    for (const item of inferredItems) {
        if (merged.some((existing) => threadItemsOverlap(existing, item))) {
            continue;
        }

        merged.push(item);

        if (merged.length >= 2) {
            break;
        }
    }

    const thread = normalizeThreadValue(merged.slice(0, 2).join(" ; "));
    return thread.length > 0 ? thread : inferredThread;
}

export function markThreadParentPendingForSubgoal(item: string): string {
    const clean = cleanFragment(item);

    if (/\(\s*today\s*\)$/i.test(clean)) {
        return clean.replace(/\(\s*today\s*\)$/i, "(Pending)");
    }

    if (/\([^)]+\)$/.test(clean)) {
        return clean;
    }

    return `${clean} (Pending)`;
}

export function splitThreadItems(value: string): string[] {
    return value
        .split(/\s*;\s*/g)
        .map(cleanFragment)
        .filter((item) => item.length > 0 && !isTerminalThreadItem(item));
}

export function isGenericThreadCandidate(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();

    return lower.length === 0
        || lower === DEFAULT_STATE.thread.toLowerCase()
        || lower === "main mission/status"
        || lower.includes("main mission/status")
        || lower.includes("current mission / pending event");
}

export function isTerminalThreadItem(value: string): boolean {
    const clean = cleanFragment(value);

    return TERMINAL_THREAD_STATUS_TAG_PATTERN.test(clean)
        || TERMINAL_THREAD_END_PATTERN.test(clean)
        || MINOR_THREAD_PATTERN.test(value);
}

export function threadItemsOverlap(left: string, right: string): boolean {
    if (sameText(left, right)) {
        return true;
    }

    const leftTokens = meaningfulTokens(left);
    const rightTokens = meaningfulTokens(right);

    if (leftTokens.size === 0 || rightTokens.size === 0) {
        return false;
    }

    const sharedTokens = [...leftTokens].filter((token) => rightTokens.has(token));
    return sharedTokens.length >= 2;
}

export function meaningfulTokens(value: string): Set<string> {
    return new Set(
        value
            .toLowerCase()
            .replace(/\{\{user\}\}/g, "user")
            .split(/[^a-z0-9]+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 2 && !THREAD_STOP_WORDS.has(token)),
    );
}
