import {cleanFragment, cleanHeaderText, cleanLabeledValue, isPlaceholder, isNoThreadValue, sameText, limitWords, normalizeLineEndings} from "../utils/text";
import {containsAnyCue, escapeRegExp} from "../utils/regex";
import {DEFAULT_STATE, MINOR_THREAD_PATTERN, TERMINAL_THREAD_STATUS_TAG_PATTERN, TERMINAL_THREAD_END_PATTERN} from "../constants";
import {THREAD_TRANSITION_CUES, THREAD_STOP_WORDS, THREAD_INFERENCE_CUES, THREAD_SUBGOAL_TARGET_STOP_WORDS} from "./threadConstants";

function isCommonNarrativeSubject(value: string): boolean {
    return /^(he|she|they|it|you|i|we|the|a|an|his|her|their)$/i.test(cleanFragment(value).replace(/:$/, ""));
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

function isThreatOrConditionalStatement(sentence: string): boolean {
    const threatPatterns = [
        /\bif\s+(?:he|she|they|you|we|i|not)\b/i,
        /\bif\s+not\b/i,
        /\botherwise\b/i,
        /\bor\s+else\b/i,
        /\b(?:might|may)\s+(?:have\s+to|need\s+to)\b/i,
        /\b(?:would|will)\s+(?:have\s+to|need\s+to)\b/i,
        /\bthreat(?:ened|ening)?\b/i,
    ];
    return threatPatterns.some((p) => p.test(sentence));
}

function isPastWarningStatement(sentence: string): boolean {
    const pastWarningPatterns = [
        /\b(?:already|had)\s+(?:warn(?:ed|ing)?|told|said|asked|informed)\b/i,
        /\bwarned\s+(?:him|her|them|you)\s+(?:before|earlier|already|previously)\b/i,
        /\balready\s+warned\b/i,
    ];
    return pastWarningPatterns.some((p) => p.test(sentence));
}

const THREAD_MEETING_KEYWORDS = ["meeting", "meet", "audience", "appointment", "rendezvous", "speak with", "talk to"];
const THREAD_MEETING_SKIP_NAMES = new Set([
    "meeting", "meet", "audience", "appointment", "rendezvous", "speak", "talk",
    "king", "queen", "prince", "princess", "lord", "lady", "sir", "dame",
    "duke", "duchess", "count", "countess", "baron", "baroness",
    "pending", "ongoing", "active", "waiting", "imminent",
    "complete", "completed", "done", "finished", "failed",
    "resolved", "secret", "only", "knows",
]);

function extractMeetingNpcNames(item: string): string[] {
    const clean = item.replace(/\([^)]*\)/g, "").trim();
    const names = clean.match(/\b[A-Z][a-z]{2,}\b/g) || [];
    return names.filter((n) => !THREAD_MEETING_SKIP_NAMES.has(n.toLowerCase()));
}

function extractNpcNamesFromLine(npcLine: string): string[] {
    return npcLine
        .split(",")
        .map((entry) => {
            const nameMatch = entry.match(/^([A-Z][A-Za-z'._\-\s]+?)(?:\s*-\s*|$)/);
            return nameMatch ? cleanFragment(nameMatch[1]) : "";
        })
        .filter(Boolean);
}

function isMeetingThreadItemComplete(item: string, npcLine: string, currentThread: string): boolean {
    const itemLower = item.toLowerCase();
    const isMeetingType = THREAD_MEETING_KEYWORDS.some((k) => itemLower.includes(k));
    if (!isMeetingType) {
        return false;
    }
    if (isTerminalThreadItem(item)) {
        return false;
    }
    const itemNpcs = extractMeetingNpcNames(item);
    if (itemNpcs.length === 0) {
        return false;
    }
    const headerNames = extractNpcNamesFromLine(npcLine);
    const targetFound = itemNpcs.some((npc) =>
        headerNames.some((h) => h.toLowerCase().includes(npc.toLowerCase())),
    );
    if (targetFound) {
        return true;
    }
    const threadLower = currentThread.toLowerCase();
    const itemHasAudience = itemLower.includes("audience");
    const itemHasMeeting = itemLower.includes("meeting");
    if ((itemHasAudience || itemHasMeeting) && threadLower.includes("audience") && threadLower.includes("(active)")) {
        return true;
    }
    return false;
}

function replaceStatusTag(item: string, newStatus: string): string {
    const clean = item.replace(/\s*\([^)]*\)\s*$/g, "").trim();
    const secretMarker = item.match(/\([^)]*(?:Secret|Only\s+\w+\s+knows)[^)]*\)/i);
    if (secretMarker) {
        return `${clean} (${newStatus}, ${secretMarker[1].replace(/^\(\s*/, "").replace(/\s*\)$/, "")})`;
    }
    return `${clean} (${newStatus})`;
}

function completeMeetingThreadItems(thread: string, npcLine: string, currentThread: string): string {
    const items = thread
        .split(/\s*;\s*/g)
        .map(cleanFragment)
        .filter(Boolean);
    const result = items.map((item) =>
        isMeetingThreadItemComplete(item, npcLine, currentThread)
            ? replaceStatusTag(item, "Complete")
            : item,
    );
    return result.join(" ; ");
}

function isCandidateGroundedInEvidence(candidate: string, evidence: string): boolean {
    const cleanCandidate = candidate.replace(/\([^)]*\)/g, "").trim();
    const actionTokens = cleanCandidate
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter((t) => t.length > 2 && !THREAD_STOP_WORDS.has(t))
        .filter((t) => !["meeting", "meet", "audience", "appointment", "rendezvous", "bounty"].includes(t));
    if (actionTokens.length === 0) {
        return true;
    }
    const evidenceLower = evidence.toLowerCase();
    let matchedCount = 0;
    for (const token of actionTokens) {
        if (evidenceLower.includes(token)) {
            matchedCount++;
        }
    }
    const threshold = Math.max(1, Math.ceil(actionTokens.length * 0.25));
    return matchedCount >= threshold;
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

function formatThreadSentenceItem(rawValue: string, status: "Ongoing" | "Pending" | null): string | null {
    const value = capitalizeThreadItem(cleanThreadObject(rawValue));

    if (value.length === 0) {
        return null;
    }

    return status == null ? value : `${value} (${status})`;
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

function extractPromiseThreadItem(sentence: string): string | null {
    const match = sentence.match(/\b(?:promise|promises|promised|vow|vows|vowed|swear|swears|swore)\b[^.!?;]{0,50}?\b(?:to|that)\s+([^.!?;]{4,140})/i);
    if (match == null) {
        return null;
    }

    return formatThreadActionItem("Promise", match[1], "Pending");
}

function extractAppointmentThreadItem(sentence: string): string | null {
    const match = sentence.match(/\b(appointment|meeting|audience)\b\s+(with|at|before|for)\s+([^.!?;]{4,120})/i);
    if (match == null) {
        return null;
    }

    return formatThreadSentenceItem(`${match[1]} ${match[2]} ${match[3]}`, "Pending");
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

function sentenceCouldInferLinkedSubgoal(sentence: string, previousThread: string): boolean {
    return !isGenericThreadCandidate(previousThread)
        && !isNoThreadValue(previousThread)
        && extractThreadContactName(sentence) != null
        && referencedThreadTarget(previousThread, sentence) != null;
}

function cleanThreadSentence(value: string): string {
    return cleanHeaderText(value)
        .replace(/^(?:\{\{char\}\}|\{\{user\}\}|[A-Z][A-Za-z'._-]*(?:\s+[A-Z][A-Za-z'._-]*){0,2}):\s*/, "")
        .replace(/^["'*]+|["'*]+$/g, "")
        .trim();
}

function inferThreadItemFromSentence(sentence: string, previousThread: string): string | null {
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

function threadSentences(narrative: string, previousThread: string): string[] {
    return normalizeLineEndings(narrative)
        .split(/(?:[.!?]+["']?\s+|\n+)/g)
        .map(cleanThreadSentence)
        .filter((sentence) => {
            return sentence.length > 0
                && sentence.length <= 220
                && !isThreatOrConditionalStatement(sentence)
                && !isPastWarningStatement(sentence)
                && (
                    containsAnyCue(sentence, THREAD_INFERENCE_CUES)
                    || sentenceCouldInferLinkedSubgoal(sentence, previousThread)
                );
        });
}

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

function validateCandidateItems(candidate: string, narrative: string): string {
    const items = candidate
        .split(/\s*;\s*/g)
        .map(cleanFragment)
        .filter(Boolean);
    const validItems = items.filter((item) => {
        if (isTerminalThreadItem(item)) {
            return true;
        }
        return isCandidateGroundedInEvidence(item, narrative);
    });
    return validItems.join(" ; ");
}

interface NormalizeThreadOptions {
    allowExplicitClear?: boolean;
}

export function normalizeThreadLine(
    rawLine: string,
    previousThread: string,
    narrative: string,
    npcLine?: string,
    options: NormalizeThreadOptions = {},
): string {
    const rawCandidate = cleanLabeledValue(rawLine, "Thread");
    const inferredThread = inferThreadFromNarrative(narrative, previousThread);
    const previousActiveThread = activeThreadOrNone(previousThread);

    if (isNoThreadValue(rawCandidate)) {
        const result = inferredThread
            ?? (options.allowExplicitClear === true || isNoThreadValue(previousActiveThread)
                ? "None"
                : previousActiveThread);
        return npcLine ? completeMeetingThreadItems(result, npcLine, previousThread) : result;
    }

    if (isPlaceholder(rawCandidate)) {
        const result = inferredThread ?? previousActiveThread;
        return npcLine ? completeMeetingThreadItems(result, npcLine, previousThread) : result;
    }

    let candidate = normalizeThreadValue(rawCandidate);

    if (candidate.length === 0) {
        const result = inferredThread ?? previousActiveThread;
        return npcLine ? completeMeetingThreadItems(result, npcLine, previousThread) : result;
    }

    candidate = validateCandidateItems(candidate, narrative);

    if (candidate.length === 0) {
        const result = inferredThread ?? previousActiveThread;
        return npcLine ? completeMeetingThreadItems(result, npcLine, previousThread) : result;
    }

    if (
        previousActiveThread !== DEFAULT_STATE.thread
        && previousActiveThread !== "None"
        && !sameText(candidate, previousActiveThread)
        && !threadChangeIsSupported(candidate, previousActiveThread, narrative)
    ) {
        const result = inferredThread != null && threadChangeIsSupported(inferredThread, previousActiveThread, narrative)
            ? mergeThreadInference(previousActiveThread, inferredThread)
            : previousActiveThread;
        return npcLine ? completeMeetingThreadItems(result, npcLine, previousThread) : result;
    }

    if (inferredThread != null && threadShouldUseNarrativeInference(candidate, previousActiveThread, inferredThread)) {
        const merged = mergeThreadInference(candidate, inferredThread);
        return npcLine ? completeMeetingThreadItems(merged, npcLine, previousThread) : merged;
    }

    return npcLine ? completeMeetingThreadItems(candidate, npcLine, previousThread) : candidate;
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
