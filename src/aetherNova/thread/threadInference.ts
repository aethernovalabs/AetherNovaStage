import {cleanFragment, cleanHeaderText, limitWords, sameText, isNoThreadValue, normalizeLineEndings} from "../utils/text";
import {containsAnyCue, escapeRegExp} from "../utils/regex";
import {THREAD_INFERENCE_CUES, THREAD_SUBGOAL_TARGET_STOP_WORDS} from "./threadConstants";
import {normalizeThreadValue, threadItemsOverlap, isTerminalThreadItem, isGenericThreadCandidate, meaningfulTokens} from "./normalizeThreadLine";

export function activeThreadOrNone(value: string): string {
    const active = normalizeThreadValue(value);
    return active.length > 0 ? active : "None";
}

export function inferThreadFromNarrative(narrative: string, previousThread: string): string | null {
    const sentences = threadSentences(narrative, previousThread);
    const items: string[] = [];

    for (const sentence of sentences) {
        const item = inferThreadItemFromSentence(sentence, previousThread);

        if (item == null || items.some((existing) => threadItemsOverlap(existing, item))) {
            continue;
        }

        items.push(item);

        if (items.length >= 2) {
            break;
        }
    }

    const thread = normalizeThreadValue(items.join(" ; "));
    return thread.length > 0 ? thread : null;
}

export function threadSentences(narrative: string, previousThread: string): string[] {
    return normalizeLineEndings(narrative)
        .split(/(?:[.!?]+["']?\s+|\n+)/g)
        .map(cleanThreadSentence)
        .filter((sentence) => {
            return sentence.length > 0
                && sentence.length <= 220
                && (
                    containsAnyCue(sentence, THREAD_INFERENCE_CUES)
                    || sentenceCouldInferLinkedSubgoal(sentence, previousThread)
                );
        });
}

export function inferThreadItemFromSentence(sentence: string, previousThread: string): string | null {
    if (isTerminalThreadItem(sentence)) {
        return null;
    }

    return extractLinkedSubgoalThreadItem(sentence, previousThread)
        ?? extractMissionThreadItem(sentence)
        ?? extractAppointmentThreadItem(sentence)
        ?? extractPromiseThreadItem(sentence)
        ?? extractTravelThreadItem(sentence)
        ?? extractObstacleThreadItem(sentence);
}

function cleanThreadSentence(value: string): string {
    return cleanHeaderText(value)
        .replace(/^(?:\{\{char\}\}|\{\{user\}\}|[A-Z][A-Za-z'._-]*(?:\s+[A-Z][A-Za-z'._-]*){0,2}):\s*/, "")
        .replace(/^["'*]+|["'*]+$/g, "")
        .trim();
}

function sentenceCouldInferLinkedSubgoal(sentence: string, previousThread: string): boolean {
    return !isGenericThreadCandidate(previousThread)
        && !isNoThreadValue(previousThread)
        && extractThreadContactName(sentence) != null
        && referencedThreadTarget(previousThread, sentence) != null;
}

function extractLinkedSubgoalThreadItem(sentence: string, previousThread: string): string | null {
    const contactName = extractThreadContactName(sentence);
    const target = referencedThreadTarget(previousThread, sentence);

    if (contactName == null || target == null) {
        return null;
    }

    const status = linkedSubgoalIsOngoing(sentence) ? "Ongoing" : "Pending";

    if (sameText(contactName, target)) {
        return `Meet ${contactName} (${status})`;
    }

    return `Meet ${contactName} to ${linkedSubgoalPurpose(sentence, target)} (${status})`;
}

function extractThreadContactName(sentence: string): string | null {
    const patterns = [
        /\b(?:meet|visit|see|find)\s+(?:with\s+)?([A-Z][A-Za-z'._-]{1,40})\b/,
        /\b(?:speak|talk)\s+(?:with|to)\s+([A-Z][A-Za-z'._-]{1,40})\b/,
        /\bask\s+([A-Z][A-Za-z'._-]{1,40})\b/,
    ];

    for (const pattern of patterns) {
        const match = sentence.match(pattern);
        if (match != null && !isCommonNarrativeSubject(match[1])) {
            return cleanFragment(match[1]);
        }
    }

    return null;
}

function referencedThreadTarget(previousThread: string, sentence: string): string | null {
    const previousTokens = meaningfulTokens(previousThread);
    const words = sentence.match(/[A-Za-z][A-Za-z'_-]{2,}/g) ?? [];

    for (const word of words) {
        const token = word.toLowerCase().replace(/[^a-z0-9]+/g, "");

        if (previousTokens.has(token) && !THREAD_SUBGOAL_TARGET_STOP_WORDS.has(token)) {
            return cleanFragment(word);
        }
    }

    return null;
}

function linkedSubgoalPurpose(sentence: string, target: string): string {
    const targetPattern = escapeRegExp(target);

    if (new RegExp(`\\bask\\b[^.!?;]{0,80}\\babout\\s+${targetPattern}\\b`, "i").test(sentence)) {
        return `ask about ${target}`;
    }

    if (
        new RegExp(`\\b(?:where|whereabouts|location)\\b[^.!?;]{0,80}\\b${targetPattern}\\b`, "i").test(sentence)
        || new RegExp(`\\b${targetPattern}\\b[^.!?;]{0,80}\\b(?:where|whereabouts|location)\\b`, "i").test(sentence)
    ) {
        return `learn ${target}'s whereabouts`;
    }

    if (
        new RegExp(`\\b(?:information|info|intel|lead|clue|clues)\\b[^.!?;]{0,80}\\b${targetPattern}\\b`, "i").test(sentence)
        || new RegExp(`\\b${targetPattern}\\b[^.!?;]{0,80}\\b(?:information|info|intel|lead|clue|clues)\\b`, "i").test(sentence)
    ) {
        return `get ${target} information`;
    }

    return `ask about ${target}`;
}

function linkedSubgoalIsOngoing(sentence: string): boolean {
    return containsAnyCue(sentence, [
        "started",
        "start to",
        "starts to",
        "stand up",
        "stood up",
        "go meet",
        "go visit",
        "go ask",
        "we'll go",
        "we will go",
        "lead the way",
        "head to",
        "heading to",
        "set out",
        "sets out",
        "move to",
        "moving to",
    ]);
}

function extractMissionThreadItem(sentence: string): string | null {
    const explicitTo = sentence.match(/\b(mission|quest|objective|task|contract|order|orders|ordered)\b[^.!?\n:;]{0,60}?\bto\s+([^.!?;]{4,140})/i);
    if (explicitTo != null) {
        return formatThreadActionItem(threadKindLabel(explicitTo[1]), explicitTo[2], "Ongoing");
    }

    const explicitColon = sentence.match(/\b(mission|quest|objective|task|contract|order|orders|ordered)\b[^:]{0,60}:\s*([^.!?;]{4,140})/i);
    if (explicitColon != null) {
        return formatThreadActionItem(threadKindLabel(explicitColon[1]), explicitColon[2], "Ongoing");
    }

    const hunt = sentence.match(/\bhunt(?:ing)?\s+(?:for|of)?\s*([^.!?;]{4,120})/i);
    if (
        hunt != null
        && (
            containsAnyCue(sentence, ["mission", "quest", "contract", "bounty", "order", "objective", "task", "deadline"])
            || /\bthe hunt\b/i.test(sentence)
        )
    ) {
        return formatThreadActionItem("Hunt", hunt[1], "Ongoing");
    }

    const instructed = sentence.match(/\b(?:orders?|ordered|instructs?|instructed|tasks?|tasked)\s+(?:\{\{user\}\}|you|him|her|them)?\s*(?:to|with)\s+([^.!?;]{4,140})/i);
    if (instructed != null) {
        return formatThreadActionItem("Order", instructed[1], "Ongoing");
    }

    return null;
}

function extractAppointmentThreadItem(sentence: string): string | null {
    const match = sentence.match(/\b(appointment|meeting|audience)\b\s+(with|at|before|for)\s+([^.!?;]{4,120})/i);
    if (match == null) {
        return null;
    }

    return formatThreadSentenceItem(`${match[1]} ${match[2]} ${match[3]}`, "Pending");
}

function extractPromiseThreadItem(sentence: string): string | null {
    const match = sentence.match(/\b(?:promise|promises|promised|vow|vows|vowed|swear|swears|swore)\b[^.!?;]{0,50}?\b(?:to|that)\s+([^.!?;]{4,140})/i);
    if (match == null) {
        return null;
    }

    return formatThreadActionItem("Promise", match[1], "Pending");
}

function extractTravelThreadItem(sentence: string): string | null {
    if (!containsAnyCue(sentence, ["travel goal", "mission", "quest", "objective", "task", "contract", "order", "deadline"])) {
        return null;
    }

    const match = sentence.match(/\b(?:travel|journey|head|go|return|reach|escort|deliver)\s+(?:to|toward|towards|for|back to)\s+([^.!?;]{4,140})/i);
    if (match == null) {
        return null;
    }

    return formatThreadActionItem("Travel", match[1], "Ongoing");
}

function extractObstacleThreadItem(sentence: string): string | null {
    const blocked = sentence.match(/\b(?:paused|blocked|delayed|stopped|held back|prevented)\b[^.!?;]{0,90}?\b(?:by|until|because of)\s+([^.!?;]{4,140})/i);
    if (blocked != null) {
        return formatThreadSentenceItem(`major obstacle: ${blocked[1]}`, null);
    }

    if (containsAnyCue(sentence, ["major obstacle", "unresolved conflict"])) {
        return formatThreadSentenceItem(sentence, null);
    }

    return null;
}

function threadKindLabel(kind: string): string {
    const lower = kind.toLowerCase();

    if (lower.includes("quest")) {
        return "Quest";
    }

    if (lower.includes("contract")) {
        return "Contract";
    }

    if (lower.includes("order")) {
        return "Order";
    }

    return "Mission";
}

function formatThreadActionItem(label: string, rawBody: string, status: "Ongoing" | "Pending"): string | null {
    const body = cleanThreadObject(rawBody);

    if (body.length === 0) {
        return null;
    }

    if (label === "Hunt") {
        return `Hunt for ${stripLeadingPreposition(body)} (${status})`;
    }

    return `${label} to ${stripLeadingTo(body)} (${status})`;
}

function formatThreadSentenceItem(rawValue: string, status: "Ongoing" | "Pending" | null): string | null {
    const value = capitalizeThreadItem(cleanThreadObject(rawValue));

    if (value.length === 0) {
        return null;
    }

    return status == null ? value : `${value} (${status})`;
}

function cleanThreadObject(value: string): string {
    return limitWords(
        cleanFragment(value)
            .replace(/^["'*]+|["'*]+$/g, "")
            .replace(/\b(?:while|as|because|however)\b.*$/i, "")
            .replace(/\bbut\b.*$/i, "")
            .replace(/^(?:that|the|a|an)\s+/i, "")
            .replace(/^(?:\{\{user\}\}|you|he|she|they)\s+/i, "")
            .replace(/^(?:must|need(?:s)? to|has to|have to|should|will|would|can)\s+/i, "")
            .trim(),
        14,
    );
}

function stripLeadingTo(value: string): string {
    return cleanFragment(value).replace(/^to\s+/i, "");
}

function stripLeadingPreposition(value: string): string {
    return cleanFragment(value).replace(/^(?:for|of|to)\s+/i, "");
}

function capitalizeThreadItem(value: string): string {
    const clean = cleanFragment(value);
    return clean.length === 0 ? "" : `${clean[0].toUpperCase()}${clean.slice(1)}`;
}

function isCommonNarrativeSubject(value: string): boolean {
    return /^(he|she|they|it|you|i|we|the|a|an|his|her|their)$/i.test(cleanFragment(value).replace(/:$/, ""));
}
