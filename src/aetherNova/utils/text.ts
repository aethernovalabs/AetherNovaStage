import type {Character} from "@chub-ai/stages-ts";
import {CLOCK_PATTERN, TIME_OF_DAYS, HEADER_DIVIDER, LOCATION_STOP_WORDS, THREAD_STOP_WORDS, VAGUE_STATUS_PATTERN, USER_FORBIDDEN_DETAIL_PATTERN, RACE_KEYWORDS} from "../constants";

export function cleanFragment(value: string): string {
    return value
        .replace(/\s+/g, " ")
        .replace(/\s+([,.)])/g, "$1")
        .replace(/([(])\s+/g, "$1")
        .replace(/[.;,\s]+$/g, "")
        .trim();
}

export function cleanHeaderText(value: string): string {
    return value
        .trim()
        .replace(/^\*\*/, "")
        .replace(/\*\*$/, "")
        .replace(/\*\*/g, "")
        .trim();
}

export function cleanLabeledValue(rawLine: string, label: string): string {
    return cleanHeaderText(rawLine).replace(new RegExp(`^${label}\\s*:\\s*`, "i"), "").trim();
}

export function isPlaceholder(value: string): boolean {
    const clean = cleanFragment(value);
    const lower = clean.toLowerCase();

    return clean.length === 0
        || lower === "none"
        || lower === "n/a"
        || lower === "unknown"
        || lower === "null"
        || lower === "current scene"
        || lower === "current topic"
        || lower === "current event"
        || lower.includes("current mission / pending event")
        || lower.includes("position; clothing; relevant status")
        || lower.includes("body position; one clothing type");
}

export function isNoNpcValue(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();
    return lower === "none"
        || lower === "no npc"
        || lower === "no npcs"
        || lower === "no npcs present"
        || lower === "no npc present"
        || lower === "none present"
        || lower === "nothing"
        || lower === "nobody"
        || lower === "no one"
        || lower === "no-one"
        || lower === "alone"
        || lower === "—"
        || lower === "-"
        || lower === "n/a"
        || lower === "no npc currently"
        || lower === "no npcs currently"
        || lower.startsWith("— -");
}

export function isNoThreadValue(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();
    return lower === "none"
        || lower === "no thread"
        || lower === "no active thread"
        || lower === "no major thread";
}

export function limitWords(value: string, maxWords: number): string {
    const words = cleanFragment(value).split(" ").filter(Boolean);

    if (words.length <= maxWords) {
        return cleanFragment(value);
    }

    return words.slice(0, maxWords).join(" ");
}

export function sameText(left: string, right: string): boolean {
    return cleanFragment(left).toLowerCase() === cleanFragment(right).toLowerCase();
}

export function normalizeLineEndings(value: string): string {
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function npcIdentityKey(value: string): string {
    return cleanFragment(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function meaningfulDetailWords(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3 && !["visible", "still", "steady", "hand", "left", "right"].includes(word));
}

export function meaningfulLocationTokens(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !LOCATION_STOP_WORDS.has(word));
}

export function meaningfulPositionWords(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3 && !["near", "beside", "before", "behind", "through", "toward", "from"].includes(word));
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

export function isHeaderDivider(value: string): boolean {
    const clean = value.trim();
    return clean === HEADER_DIVIDER || /^_{3,}$/.test(clean);
}

export function looksLikeLocationTimeLine(value: string): boolean {
    const lower = value.toLowerCase();
    return value.includes("|")
        && (CLOCK_PATTERN.test(value) || TIME_OF_DAYS.some((timeOfDay) => lower.includes(timeOfDay.toLowerCase())));
}

export function positionMeansWalking(value: string): boolean {
    return /\b(walk|walking|moving|stepping|approaching|running)\b/i.test(value);
}

export function positionMeansStanding(value: string): boolean {
    return /\b(stand|standing|stood|stopped|halted)\b/i.test(value);
}

export function positionMeansSeated(value: string): boolean {
    return /\b(sit|sitting|seated|sat)\b/i.test(value);
}

export function positionMeansProne(value: string): boolean {
    return /\b(lying|prone|collapsed|kneeling|crouched)\b/i.test(value);
}

export function titleCase(value: string): string {
    return value.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

export function isGenericStatusPart(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();
    return lower === "standing"
        || lower === "standing in scene"
        || lower === "standing nearby"
        || lower === "regular clothing"
        || lower === "hands visible"
        || lower === "posture attentive";
}

export function safeStatusFallback(value: string, defaultValue: string, kind: "you" | "npc"): string {
    const clean = cleanFragment(value);
    return clean.length > 0 && !isInvalidStatusPart(clean, kind) ? clean : defaultValue;
}

export function isInvalidStatusPart(value: string, kind: "you" | "npc"): boolean {
    const clean = cleanFragment(value);

    if (clean.length === 0 || VAGUE_STATUS_PATTERN.test(clean)) {
        return true;
    }

    return kind === "you" && USER_FORBIDDEN_DETAIL_PATTERN.test(clean);
}

export function inferRace(character: Character): string {
    const searchable = [
        character.description,
        character.personality,
        character.scenario,
        character.first_message,
    ].join(" ").toLowerCase();

    return RACE_KEYWORDS.find((race) => searchable.includes(race.toLowerCase())) ?? "Human";
}

export function stripLeadingTo(value: string): string {
    return cleanFragment(value).replace(/^to\s+/i, "");
}

export function stripLeadingPreposition(value: string): string {
    return cleanFragment(value).replace(/^(?:for|of|to)\s+/i, "");
}

export function capitalizeThreadItem(value: string): string {
    const clean = cleanFragment(value);
    return clean.length === 0 ? "" : `${clean[0].toUpperCase()}${clean.slice(1)}`;
}
