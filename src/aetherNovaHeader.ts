import type {Character} from "@chub-ai/stages-ts";

export type TimeOfDay = "Morning" | "Afternoon" | "Evening" | "Night";

export interface AetherNovaMessageState {
    location: string;
    timeOfDay: TimeOfDay;
    clock: string;
    you: string;
    npc: string;
    thread: string;
}

interface ExtractedHeader {
    locationLine: string | null;
    youLine: string | null;
    npcLine: string | null;
    threadLine: string | null;
    narrative: string;
}

interface HeaderBlock extends Omit<ExtractedHeader, "narrative"> {
    start: number;
    end: number;
}

interface NormalizedResponse {
    content: string;
    state: AetherNovaMessageState;
}

interface IdentityStatus {
    identity: string;
    status: string;
}

const CLOCK_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const TIME_OF_DAYS: TimeOfDay[] = ["Morning", "Afternoon", "Evening", "Night"];
const HEADER_DIVIDER = "***";

const DEFAULT_STATE: AetherNovaMessageState = {
    location: "Unknown Region - Current Place - Active Area",
    timeOfDay: "Morning",
    clock: "09:00",
    you: "Unknown - Human (Standing in scene; Regular clothing; hands visible)",
    npc: "None",
    thread: "None",
};

const RACE_KEYWORDS = [
    "Kitsune",
    "Catkin",
    "Dragonkin",
    "Angel",
    "Demon",
    "Vampire",
    "Pixie",
    "Fey",
    "Elf",
    "Dwarf",
    "Orc",
    "Human",
];

const THREAD_TRANSITION_CUES = [
    "arrived",
    "arrive",
    "entered",
    "enter",
    "left",
    "leave",
    "later",
    "meanwhile",
    "afterward",
    "afterwards",
    "resolved",
    "concluded",
    "finished",
    "began",
    "started",
    "agreed",
    "decided",
    "mission",
    "quest",
    "objective",
    "travel",
    "journey",
    "teleport",
    "time skip",
    "correct",
    "correction",
    "mistake",
    "non-canon",
];

const LOCATION_TRANSITION_CUES = [
    "move",
    "moves",
    "moved",
    "leads",
    "led",
    "follow",
    "follows",
    "followed",
    "travel",
    "travels",
    "traveled",
    "journey",
    "arrive",
    "arrives",
    "arrived",
    "enter",
    "enters",
    "entered",
    "leave",
    "leaves",
    "left",
    "combat",
    "battle",
    "teleport",
    "time skip",
    "scene transition",
    "meanwhile",
    "later",
    "afterward",
    "afterwards",
];

const POSITION_CHANGE_CUES = [
    "move",
    "moves",
    "moved",
    "walk",
    "walks",
    "walked",
    "stand",
    "stands",
    "stood",
    "sit",
    "sits",
    "sat",
    "kneel",
    "kneels",
    "lean",
    "leans",
    "turn",
    "turns",
    "step",
    "steps",
    "approach",
    "approaches",
    "behind",
    "beside",
    "before",
    "door",
    "table",
    "throne",
    "combat",
    "battle",
    "scene transition",
    "time skip",
    "stop",
    "stops",
    "stopped",
    "halt",
    "halts",
    "arrive",
    "arrives",
    "arrived",
    "reach",
    "reaches",
    "reached",
    "destination",
    "jalan",
    "berjalan",
    "melangkah",
    "lari",
    "berlari",
    "berhenti",
    "berdiri",
    "duduk",
    "berlutut",
    "berbaring",
    "sampai",
    "tiba",
    "masuk",
    "keluar",
    "mendekat",
];

const CLOTHING_CHANGE_CUES = [
    "change clothes",
    "changed clothes",
    "changes clothes",
    "wear",
    "wears",
    "wearing",
    "wore",
    "put on",
    "puts on",
    "remove armor",
    "removes armor",
    "removed armor",
    "disguise",
    "hood",
    "cloak",
    "shirt",
    "armor",
    "dress",
    "kimono",
    "robe",
    "uniform",
    "ganti pakaian",
    "mengganti pakaian",
    "berganti pakaian",
    "pakai",
    "memakai",
    "mengenakan",
];

const CLOTHING_DAMAGE_CUES = [
    "burn",
    "burns",
    "burned",
    "burnt",
    "scorch",
    "scorched",
    "tear",
    "tears",
    "torn",
    "rip",
    "rips",
    "ripped",
    "shred",
    "shredded",
    "cut",
    "cuts",
    "slashed",
    "bloody",
    "bloodied",
    "stained",
    "soaked",
    "wet",
    "muddy",
    "damaged",
    "destroyed",
    "armor cracked",
    "cloak catches fire",
    "sleeve catches fire",
    "terbakar",
    "hangus",
    "robek",
    "sobek",
    "terkoyak",
    "berdarah",
    "basah",
    "kotor",
    "berlumpur",
    "rusak",
    "hancur",
];

const CLOTHING_REMOVAL_CUES = [
    "remove",
    "removes",
    "removed",
    "take off",
    "takes off",
    "took off",
    "strip",
    "strips",
    "stripped",
    "undress",
    "undresses",
    "undressed",
    "bare",
    "naked",
    "shirtless",
    "topless",
    "without clothes",
    "without shirt",
    "without armor",
    "lepas baju",
    "melepas baju",
    "buka baju",
    "membuka baju",
    "lepas pakaian",
    "melepas pakaian",
    "tanpa pakaian",
    "tanpa baju",
    "tanpa kemeja",
    "tanpa armor",
    "tanpa zirah",
    "telanjang",
    "hanya celana",
    "hanya menggunakan celana",
];

const CLOTHING_DAMAGE_WORDS = /\b(burned|burnt|scorched|torn|ripped|shredded|slashed|bloody|bloodied|stained|soaked|wet|muddy|damaged|destroyed|cracked|terbakar|hangus|robek|sobek|terkoyak|berdarah|basah|kotor|berlumpur|rusak|hancur)\b/i;
const VAGUE_STATUS_PATTERN = /\b(mood|emotion|feeling|feelings|thought|thoughts|status|role|happy|sad|angry|calm|nervous|worried|confused|curious|suspicious|jealous|afraid|scared|determined|focused)\b/i;
const USER_FORBIDDEN_DETAIL_PATTERN = /\b(thinking|thinks|feeling|feels|expression|expressions|smiling|smiles|frowning|grinning|says|said|speaks|asks|answers|chooses|choosing|choice|decides|attacks|attack|transforms|transforming|consents|consent|refuses|dialogue)\b/i;
const MINOR_THREAD_PATTERN = /\b(normal topic|normal topics|casual question|casual questions|temporary mood|small suspicion|minor jealousy|minor tension|small talk)\b/i;

const THREAD_STOP_WORDS = new Set([
    "the",
    "and",
    "with",
    "for",
    "from",
    "that",
    "this",
    "current",
    "scene",
    "event",
    "pending",
    "unresolved",
    "mission",
    "thread",
    "pause",
    "on",
    "at",
    "to",
    "of",
    "in",
]);

export function createInitialHeaderState(
    characters: Record<string, Character>,
    incomingState: unknown,
): AetherNovaMessageState {
    return coerceHeaderState(incomingState, createDefaultState(characters));
}

export function coerceHeaderState(
    incomingState: unknown,
    fallback: AetherNovaMessageState = DEFAULT_STATE,
): AetherNovaMessageState {
    if (incomingState == null || typeof incomingState !== "object") {
        return {...fallback};
    }

    const raw = incomingState as Partial<AetherNovaMessageState> & {time?: string};
    const rawTime = typeof raw.time === "string" ? raw.time : "";
    const clock = normalizeClock(raw.clock ?? rawTime, fallback.clock);

    return {
        location: normalizeLocation(raw.location ?? "", fallback.location),
        timeOfDay: timeOfDayForClock(clock),
        clock,
        you: normalizeYouLine(raw.you ?? "", fallback.you),
        npc: normalizeNpcLine(raw.npc ?? "", fallback.npc),
        thread: normalizeThreadLine(raw.thread ?? "", fallback.thread, ""),
    };
}

export function buildStageDirections(state: AetherNovaMessageState): string {
    return [
        "Maintain Aether Nova header format. Start with exactly four bold header lines followed by *** before narration.",
        `Location: ${state.location}`,
        `Time: ${state.timeOfDay} | ${state.clock}`,
        `You: ${state.you}`,
        `NPC: ${state.npc}`,
        `Thread: ${state.thread}`,
        "Status format: Position; Clothes/disguise; optional body/racial detail. Keep position/clothes from last state unless the scene clearly changes. Use Thread items separated by \" ; \".",
    ].join("\n");
}

export function normalizeAetherNovaResponse(
    content: string,
    previousState: AetherNovaMessageState,
    context: string = "",
): NormalizedResponse {
    const extracted = extractHeader(content);
    const correctionContext = `${context}\n${extracted.narrative}`;
    const timeLocation = normalizeLocationTimeLine(extracted.locationLine, previousState, correctionContext);
    const state: AetherNovaMessageState = {
        location: timeLocation.location,
        timeOfDay: timeLocation.timeOfDay,
        clock: timeLocation.clock,
        you: normalizeYouLine(extracted.youLine ?? "", previousState.you, correctionContext),
        npc: normalizeNpcLine(extracted.npcLine ?? "", previousState.npc, correctionContext),
        thread: normalizeThreadLine(extracted.threadLine ?? "", previousState.thread, correctionContext),
    };

    return {
        content: formatResponse(state, extracted.narrative),
        state,
    };
}

export function formatHeader(state: AetherNovaMessageState): string {
    return [
        `**${state.location} | ${state.timeOfDay} | ${state.clock}**`,
        `**You: ${state.you}**`,
        `**NPC: ${state.npc}**`,
        `**Thread: ${state.thread}**`,
        HEADER_DIVIDER,
    ].join("\n");
}

function createDefaultState(characters: Record<string, Character>): AetherNovaMessageState {
    const character = Object.values(characters).find((entry) => !entry.isRemoved && entry.name.trim().length > 0);

    if (character == null) {
        return {...DEFAULT_STATE};
    }

    const race = inferRace(character);
    const name = cleanFragment(character.name) || "Unknown NPC";

    return {
        ...DEFAULT_STATE,
        npc: `${name} - ${race} (${defaultNpcStatusForRace(race)})`,
    };
}

function extractHeader(content: string): ExtractedHeader {
    const normalized = normalizeLineEndings(content);
    const lines = normalized.split("\n");
    const firstContentLine = lines.findIndex((line) => line.trim().length > 0);

    if (firstContentLine < 0) {
        return {
            locationLine: null,
            youLine: null,
            npcLine: null,
            threadLine: null,
            narrative: "",
        };
    }

    const scanEnd = Math.min(lines.length, firstContentLine + 40);
    for (let index = firstContentLine; index < scanEnd; index += 1) {
        const block = readHeaderBlock(lines, index);

        if (block == null) {
            continue;
        }

        const beforeHeader = lines.slice(firstContentLine, block.start).join("\n").trim();
        const afterHeader = lines.slice(block.end).join("\n").trimStart();
        const narrative = [beforeHeader, afterHeader].filter((part) => part.length > 0).join("\n\n");

        return {
            locationLine: block.locationLine,
            youLine: block.youLine,
            npcLine: block.npcLine,
            threadLine: block.threadLine,
            narrative,
        };
    }

    return {
        locationLine: null,
        youLine: null,
        npcLine: null,
        threadLine: null,
        narrative: normalized.trimStart(),
    };
}

function readHeaderBlock(lines: string[], start: number): HeaderBlock | null {
    let locationLine: string | null = null;
    let youLine: string | null = null;
    let npcLine: string | null = null;
    let threadLine: string | null = null;
    let score = 0;
    let end = start;
    let sawDivider = false;

    const scanEnd = Math.min(lines.length, start + 10);
    for (let index = start; index < scanEnd; index += 1) {
        const line = lines[index].trim();

        if (line.length === 0) {
            if (score > 0) {
                end = index + 1;
                break;
            }
            return null;
        }

        if (isHeaderDivider(line)) {
            if (score === 0) {
                return null;
            }
            sawDivider = true;
            score += 1;
            end = index + 1;
            break;
        }

        const clean = cleanHeaderText(line);
        const lower = clean.toLowerCase();

        if (!locationLine && looksLikeLocationTimeLine(clean)) {
            locationLine = clean;
            score += 2;
            end = index + 1;
            continue;
        }

        if (lower.startsWith("you:")) {
            youLine = clean;
            score += 1;
            end = index + 1;
            continue;
        }

        if (lower.startsWith("npc:")) {
            npcLine = clean;
            score += 1;
            end = index + 1;
            continue;
        }

        if (lower.startsWith("thread:")) {
            threadLine = clean;
            score += 1;
            end = index + 1;
            continue;
        }

        break;
    }

    const hasHeaderShape = locationLine != null && (youLine != null || npcLine != null || threadLine != null || sawDivider);
    const hasEnoughHeaderLines = score >= 4 || (score >= 3 && locationLine != null);

    if (!hasHeaderShape && !hasEnoughHeaderLines) {
        return null;
    }

    return {
        start,
        end,
        locationLine,
        youLine,
        npcLine,
        threadLine,
    };
}

function normalizeLocationTimeLine(
    rawLine: string | null,
    previousState: AetherNovaMessageState,
    context: string,
): Pick<AetherNovaMessageState, "location" | "timeOfDay" | "clock"> {
    if (rawLine == null || isPlaceholder(rawLine)) {
        return {
            location: previousState.location,
            timeOfDay: previousState.timeOfDay,
            clock: previousState.clock,
        };
    }

    const clean = cleanHeaderText(rawLine).replace(/^location\s*:\s*/i, "");
    const segments = clean.split("|").map(cleanFragment).filter((segment) => segment.length > 0);
    const clockSource = segments.find((segment) => CLOCK_PATTERN.test(segment)) ?? clean;
    const clock = normalizeClock(clockSource, previousState.clock);
    const locationSource = segments.find((segment) => !CLOCK_PATTERN.test(segment) && asTimeOfDay(segment) == null) ?? "";

    return {
        location: normalizeLocation(locationSource, previousState.location, context),
        timeOfDay: timeOfDayForClock(clock),
        clock,
    };
}

function normalizeLocation(rawLocation: string, previousLocation: string, context: string = ""): string {
    const clean = cleanHeaderText(rawLocation).replace(/^location\s*:\s*/i, "");
    const previous = previousLocation || DEFAULT_STATE.location;

    if (isPlaceholder(clean) || clean.toLowerCase().includes("main location")) {
        return previous;
    }

    const previousParts = splitLocation(previous);
    const parts = splitLocation(clean);
    let candidate: string;

    if (parts.length >= 3) {
        candidate = [parts[0], parts[1], parts.slice(2).join(" - ")].join(" - ");
    } else if (parts.length === 2) {
        const detailedArea = sameText(parts[0], previousParts[0]) && sameText(parts[1], previousParts[1])
            ? previousParts[2]
            : "Active Area";
        candidate = [parts[0], parts[1], detailedArea].join(" - ");
    } else if (parts.length === 1) {
        if (previous.toLowerCase().includes(parts[0].toLowerCase())) {
            candidate = previous;
        } else {
            candidate = [parts[0], "Current Place", "Active Area"].join(" - ");
        }
    } else {
        candidate = previous;
    }

    return locationChangeIsSupported(candidate, previous, context) ? candidate : previous;
}

function normalizeYouLine(rawLine: string, previousYou: string, context: string = ""): string {
    const value = cleanLabeledValue(rawLine, "You");

    if (isPlaceholder(value)) {
        return previousYou;
    }

    const parsed = parseIdentityStatus(value);
    const fallback = parseIdentityStatus(previousYou || DEFAULT_STATE.you);
    const fallbackIdentity = splitIdentity(fallback.identity, "Unknown", "Human");
    const identity = splitIdentity(parsed.identity, fallbackIdentity.left, fallbackIdentity.right);
    const apparentRace = normalizeYouRace(identity.right, fallbackIdentity.right, context);
    const status = normalizeStatus(parsed.status, fallback.status, "you", apparentRace, context);

    return `${identity.left} - ${apparentRace} (${status})`;
}

function normalizeNpcLine(rawLine: string, previousNpc: string, context: string = ""): string {
    const value = cleanLabeledValue(rawLine, "NPC");

    if (isNoNpcValue(value)) {
        return "None";
    }

    if (isPlaceholder(value)) {
        return previousNpc;
    }

    const fallbackEntries = splitTopLevel(previousNpc || DEFAULT_STATE.npc, ",");
    const entries = splitTopLevel(value, ",").filter((entry) => !isPlaceholder(entry));

    if (entries.length === 0) {
        return previousNpc;
    }

    return entries.map((entry, index) => {
        const fallback = fallbackEntries[index] ?? fallbackEntries[0] ?? DEFAULT_STATE.npc;
        return normalizeNpcEntry(entry, fallback, context);
    }).join(", ");
}

function normalizeNpcEntry(rawEntry: string, fallbackEntry: string, context: string): string {
    const parsed = parseIdentityStatus(rawEntry);
    const fallback = parseIdentityStatus(fallbackEntry);
    const fallbackIdentity = splitIdentity(fallback.identity, "Unknown NPC", "Human");
    const identity = splitIdentity(parsed.identity, fallbackIdentity.left, fallbackIdentity.right);
    const status = normalizeStatus(parsed.status, fallback.status || defaultNpcStatusForRace(identity.right), "npc", identity.right, context);

    return `${identity.left} - ${identity.right} (${status})`;
}

function normalizeThreadLine(rawLine: string, previousThread: string, narrative: string): string {
    const rawCandidate = cleanLabeledValue(rawLine, "Thread");

    if (isNoThreadValue(rawCandidate)) {
        return "None";
    }

    if (isPlaceholder(rawCandidate)) {
        return previousThread;
    }

    const candidate = normalizeThreadValue(rawCandidate);

    if (candidate.length === 0) {
        return previousThread;
    }

    if (
        previousThread !== DEFAULT_STATE.thread
        && previousThread !== "None"
        && !sameText(candidate, previousThread)
        && !threadChangeIsSupported(candidate, previousThread, narrative)
    ) {
        return previousThread;
    }

    return candidate;
}

function normalizeStatus(
    rawStatus: string,
    fallbackStatus: string,
    kind: "you" | "npc",
    race: string,
    context: string = "",
): string {
    const defaultStatus = kind === "you" ? DEFAULT_STATE.you.match(/\((.*)\)$/)?.[1] ?? "Standing in scene; Regular clothing; hands visible" : defaultNpcStatusForRace(race);
    const fallbackParts = statusParts(fallbackStatus || defaultStatus, kind);
    const defaultParts = statusParts(defaultStatus, kind);
    const rawParts = statusParts(rawStatus, kind);

    const fallbackPosition = normalizePosition(fallbackParts[0] ?? defaultParts[0], defaultParts[0], kind);
    const fallbackClothing = normalizeClothing(fallbackParts[1] ?? defaultParts[1], defaultParts[1]);
    const rawPosition = normalizePosition(rawParts[0] ?? fallbackPosition, fallbackPosition, kind);
    const inferredClothing = kind === "you" ? inferYouClothingFromContext(context) : null;
    const rawClothing = normalizeClothing(inferredClothing ?? rawParts[1] ?? fallbackClothing, fallbackClothing);
    const position = statusChangeIsSupported(rawPosition, fallbackPosition, context, "position", kind) ? rawPosition : fallbackPosition;
    const clothing = statusChangeIsSupported(rawClothing, fallbackClothing, context, "clothing", kind) ? rawClothing : fallbackClothing;
    const fallbackDetail = normalizeDetail(fallbackParts[2] ?? defaultParts[2], defaultParts[2], kind);
    const rawDetail = normalizeDetail(rawParts[2] ?? fallbackDetail, fallbackDetail, kind);
    const detail = kind === "you" && !youDetailChangeIsSupported(rawDetail, fallbackDetail, context) ? fallbackDetail : rawDetail;

    return `${position}; ${clothing}; ${detail}`;
}

function statusParts(status: string, kind: "you" | "npc"): string[] {
    const clean = cleanFragment(status).replace(/^\(/, "").replace(/\)$/, "");

    if (isPlaceholder(clean)) {
        return [];
    }

    const parts = clean.includes(";") || kind === "npc" ? splitStatusByFormat(clean) : [clean];
    const normalized = parts.map(cleanFragment).filter((part) => !isPlaceholder(part));

    if (kind === "npc" && normalized.length > 3) {
        return [normalized[0], normalized[1], normalized.slice(2).join(", ")].filter(Boolean);
    }

    return normalized.slice(0, 3);
}

function splitStatusByFormat(status: string): string[] {
    return status.includes(";") ? status.split(";") : splitTopLevel(status, ",");
}

function parseIdentityStatus(rawValue: string): IdentityStatus {
    const clean = cleanHeaderText(rawValue);
    const openIndex = clean.indexOf("(");
    const closeIndex = clean.lastIndexOf(")");

    if (openIndex >= 0 && closeIndex > openIndex) {
        return {
            identity: clean.slice(0, openIndex).trim(),
            status: clean.slice(openIndex + 1, closeIndex).trim(),
        };
    }

    return {
        identity: clean,
        status: "",
    };
}

function splitIdentity(rawIdentity: string, fallbackLeft: string, fallbackRight: string): {left: string; right: string} {
    const parts = cleanFragment(rawIdentity).split(/\s+-\s+/).map(cleanFragment).filter(Boolean);
    const left = normalizeIdentityPart(parts[0] ?? "", fallbackLeft);
    const right = normalizeIdentityPart(parts.slice(1).join(" - "), fallbackRight);

    return {left, right};
}

function normalizeIdentityPart(value: string, fallback: string): string {
    const clean = cleanFragment(value);
    const lower = clean.toLowerCase();

    if (
        isPlaceholder(clean)
        || lower === "gender"
        || lower === "race"
        || lower === "apparent race"
        || lower === "full name"
    ) {
        return fallback;
    }

    return clean;
}

function normalizePosition(value: string, fallback: string, kind: "you" | "npc"): string {
    const defaultFallback = kind === "you" ? "Standing in scene" : "Standing nearby";
    const safeFallback = safeStatusFallback(fallback, defaultFallback, kind);
    let clean = cleanFragment(value) || safeFallback;

    if (kind === "you") {
        clean = stripDramaticLanguage(clean);
        clean = clean.replace(/\b(with|bearing|radiating|showing)\b.*$/i, "").trim();
        clean = clean.split(/[,.]/)[0].trim();
        clean = limitWords(clean, 8);
    } else {
        clean = clean.split(/[,.]/)[0].trim();
        clean = limitWords(clean, 12);
    }

    if (isInvalidStatusPart(clean, kind)) {
        return safeFallback;
    }

    return cleanFragment(clean) || safeFallback;
}

function normalizeClothing(value: string, fallback: string): string {
    const safeFallback = safeStatusFallback(fallback, "Regular clothing", "npc");
    let clean = cleanFragment(value) || safeFallback;
    clean = clean.split(/[,.]/)[0].trim();
    clean = clean.replace(/\s+(and|with)\s+.*$/i, "").trim();
    clean = limitWords(clean, 6);

    if (isInvalidStatusPart(clean, "npc")) {
        return safeFallback;
    }

    return cleanFragment(clean) || safeFallback;
}

function normalizeDetail(value: string, fallback: string, kind: "you" | "npc"): string {
    const defaultFallback = kind === "you" ? "hands visible" : "posture attentive";
    const safeFallback = safeStatusFallback(fallback, defaultFallback, kind);
    let clean = cleanFragment(value) || safeFallback;

    if (kind === "you") {
        clean = stripDramaticLanguage(clean);
        clean = clean.split(/[,.]/)[0].trim();
        clean = limitWords(clean, 8);
    } else {
        clean = limitWords(clean, 24);
    }

    if (isInvalidStatusPart(clean, kind)) {
        return safeFallback;
    }

    return cleanFragment(clean) || safeFallback;
}

function stripDramaticLanguage(value: string): string {
    return cleanFragment(value)
        .replace(/\b(ancient|overwhelming|legendary|unreadable|mysterious|divine|cosmic|all-consuming|supreme|omnipotent|godlike)\b/gi, "")
        .replace(/\b(aura|auras|emotional tension|dramatic tension)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeClock(rawValue: string, fallbackClock: string): string {
    const match = rawValue.match(CLOCK_PATTERN) ?? fallbackClock.match(CLOCK_PATTERN);

    if (match == null) {
        return DEFAULT_STATE.clock;
    }

    const hour = String(Number(match[1])).padStart(2, "0");
    return `${hour}:${match[2]}`;
}

function timeOfDayForClock(clock: string): TimeOfDay {
    const hour = Number(clock.slice(0, 2));

    if (hour >= 5 && hour <= 11) {
        return "Morning";
    }

    if (hour >= 12 && hour <= 16) {
        return "Afternoon";
    }

    if (hour >= 17 && hour <= 20) {
        return "Evening";
    }

    return "Night";
}

function asTimeOfDay(value: string): TimeOfDay | null {
    const lower = cleanFragment(value).toLowerCase();
    return TIME_OF_DAYS.find((timeOfDay) => timeOfDay.toLowerCase() === lower) ?? null;
}

function defaultNpcStatusForRace(race: string): string {
    const lower = race.toLowerCase();

    if (lower.includes("kitsune")) {
        return "Standing nearby; Regular clothing; tails still, ears attentive";
    }

    if (lower.includes("catkin")) {
        return "Standing nearby; Regular clothing; ears attentive, tail still";
    }

    if (lower.includes("dragonkin")) {
        return "Standing nearby; Regular clothing; wings settled, tail still, horns visible";
    }

    if (lower.includes("angel")) {
        return "Standing nearby; Regular clothing; wings settled, halo visible";
    }

    if (lower.includes("demon")) {
        return "Standing nearby; Regular clothing; horns visible, tail still, eyes alert";
    }

    if (lower.includes("vampire")) {
        return "Standing nearby; Regular clothing; fangs hidden, eyes alert";
    }

    if (lower.includes("pixie") || lower.includes("fey")) {
        return "Standing nearby; Regular clothing; wings still, faint glow visible";
    }

    return "Standing nearby; Regular clothing; posture attentive";
}

function locationChangeIsSupported(candidate: string, previous: string, context: string): boolean {
    if (sameText(candidate, previous)) {
        return true;
    }

    if (previous === DEFAULT_STATE.location || previous.toLowerCase().includes("unknown")) {
        return true;
    }

    const candidateParts = splitLocation(candidate);
    const previousParts = splitLocation(previous);

    if (
        candidateParts.length >= 3
        && previousParts.length >= 3
        && sameText(candidateParts[0], previousParts[0])
        && sameText(candidateParts[1], previousParts[1])
    ) {
        return true;
    }

    const lowerContext = context.toLowerCase();
    return LOCATION_TRANSITION_CUES.some((cue) => lowerContext.includes(cue));
}

function normalizeYouRace(candidateRace: string, fallbackRace: string, context: string): string {
    if (!candidateRace.toLowerCase().includes("anomaly")) {
        return candidateRace;
    }

    if (fallbackRace.toLowerCase().includes("anomaly") || anomalyIsRevealed(context)) {
        return candidateRace;
    }

    return fallbackRace;
}

function anomalyIsRevealed(context: string): boolean {
    const lowerContext = context.toLowerCase();
    if (
        lowerContext.includes("not revealed")
        || lowerContext.includes("not yet revealed")
        || lowerContext.includes("not confirmed")
        || lowerContext.includes("unrevealed")
    ) {
        return false;
    }

    return lowerContext.includes("anomaly")
        && (lowerContext.includes("revealed")
            || lowerContext.includes("confirmed")
            || lowerContext.includes("known")
            || lowerContext.includes("learned")
            || lowerContext.includes("discovered"));
}

function normalizeThreadValue(rawValue: string): string {
    const items = rawValue
        .split(/\s*;\s*/g)
        .map(cleanFragment)
        .filter((item) => item.length > 0 && !isTerminalThreadItem(item));

    return items.join(" ; ");
}

function isTerminalThreadItem(value: string): boolean {
    return /\b(completed|complete|failed|abandoned|expired|irrelevant)\b/i.test(value)
        || MINOR_THREAD_PATTERN.test(value);
}

function statusChangeIsSupported(
    candidate: string,
    previous: string,
    context: string,
    field: "position" | "clothing",
    kind: "you" | "npc",
): boolean {
    if (sameText(candidate, previous)) {
        return true;
    }

    if (kind === "npc" && isGenericStatusPart(previous)) {
        return true;
    }

    if (kind === "you" && isGenericStatusPart(previous) && contextHasEvidence(context, field)) {
        return true;
    }

    if (kind === "you" && field === "clothing") {
        return youClothingChangeIsSupported(candidate, previous, context);
    }

    const lowerContext = context.toLowerCase();
    const cues = field === "position" ? POSITION_CHANGE_CUES : CLOTHING_CHANGE_CUES;
    return cues.some((cue) => lowerContext.includes(cue));
}

function youClothingChangeIsSupported(candidate: string, previous: string, context: string): boolean {
    const lowerContext = context.toLowerCase();
    const lowerCandidate = candidate.toLowerCase();

    if (CLOTHING_REMOVAL_CUES.some((cue) => lowerContext.includes(cue))) {
        return true;
    }

    if (
        CLOTHING_DAMAGE_CUES.some((cue) => lowerContext.includes(cue))
        && (CLOTHING_DAMAGE_WORDS.test(candidate) || sharesMeaningfulClothingWord(candidate, previous))
    ) {
        return true;
    }

    if (CLOTHING_CHANGE_CUES.some((cue) => lowerContext.includes(cue))) {
        return true;
    }

    return CLOTHING_DAMAGE_WORDS.test(lowerCandidate)
        && CLOTHING_DAMAGE_CUES.some((cue) => lowerContext.includes(cue));
}

function inferYouClothingFromContext(context: string): string | null {
    const lowerContext = context.toLowerCase();

    if (
        lowerContext.includes("hanya menggunakan celana")
        || lowerContext.includes("hanya celana")
        || lowerContext.includes("only pants")
        || lowerContext.includes("pants only")
    ) {
        return "Pants only";
    }

    if (
        lowerContext.includes("tanpa pakaian")
        || lowerContext.includes("tanpa baju")
        || lowerContext.includes("without clothes")
        || lowerContext.includes("naked")
        || lowerContext.includes("telanjang")
    ) {
        return "Naked";
    }

    if (
        lowerContext.includes("tanpa kemeja")
        || lowerContext.includes("without shirt")
        || lowerContext.includes("shirtless")
    ) {
        return "Shirtless";
    }

    if (
        lowerContext.includes("tanpa armor")
        || lowerContext.includes("tanpa zirah")
        || lowerContext.includes("without armor")
        || lowerContext.includes("remove armor")
        || lowerContext.includes("removes armor")
        || lowerContext.includes("removed armor")
    ) {
        return "Without armor";
    }

    if (
        lowerContext.includes("tanpa jubah")
        || lowerContext.includes("without cloak")
        || lowerContext.includes("remove cloak")
        || lowerContext.includes("removes cloak")
        || lowerContext.includes("removed cloak")
    ) {
        return "Without cloak";
    }

    return null;
}

function youDetailChangeIsSupported(candidate: string, previous: string, context: string): boolean {
    if (sameText(candidate, previous) || isGenericStatusPart(previous)) {
        return true;
    }

    const lowerContext = context.toLowerCase();
    const lowerCandidate = candidate.toLowerCase();

    if (CLOTHING_DAMAGE_WORDS.test(lowerCandidate) && CLOTHING_DAMAGE_CUES.some((cue) => lowerContext.includes(cue))) {
        return true;
    }

    return meaningfulDetailWords(candidate).some((word) => lowerContext.includes(word));
}

function contextHasEvidence(context: string, field: "position" | "clothing"): boolean {
    const lowerContext = context.toLowerCase();

    if (field === "position") {
        return POSITION_CHANGE_CUES.some((cue) => lowerContext.includes(cue));
    }

    return CLOTHING_CHANGE_CUES.some((cue) => lowerContext.includes(cue))
        || CLOTHING_DAMAGE_CUES.some((cue) => lowerContext.includes(cue))
        || CLOTHING_REMOVAL_CUES.some((cue) => lowerContext.includes(cue));
}

function sharesMeaningfulClothingWord(candidate: string, previous: string): boolean {
    const previousWords = new Set(clothingWords(previous));
    return clothingWords(candidate).some((word) => previousWords.has(word));
}

function clothingWords(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !["the", "and", "with", "regular", "clothing"].includes(word));
}

function meaningfulDetailWords(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3 && !["visible", "still", "steady", "hand", "left", "right"].includes(word));
}

function isGenericStatusPart(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();
    return lower === "standing in scene"
        || lower === "standing nearby"
        || lower === "regular clothing"
        || lower === "hands visible"
        || lower === "posture attentive";
}

function safeStatusFallback(value: string, defaultValue: string, kind: "you" | "npc"): string {
    const clean = cleanFragment(value);
    return clean.length > 0 && !isInvalidStatusPart(clean, kind) ? clean : defaultValue;
}

function isInvalidStatusPart(value: string, kind: "you" | "npc"): boolean {
    const clean = cleanFragment(value);

    if (clean.length === 0 || VAGUE_STATUS_PATTERN.test(clean)) {
        return true;
    }

    return kind === "you" && USER_FORBIDDEN_DETAIL_PATTERN.test(clean);
}

function inferRace(character: Character): string {
    const searchable = [
        character.description,
        character.personality,
        character.scenario,
        character.first_message,
    ].join(" ").toLowerCase();

    return RACE_KEYWORDS.find((race) => searchable.includes(race.toLowerCase())) ?? "Human";
}

function formatResponse(state: AetherNovaMessageState, narrative: string): string {
    const cleanNarrative = narrative.trimStart();
    const header = formatHeader(state);

    if (cleanNarrative.length === 0) {
        return header;
    }

    return `${header}\n\n${cleanNarrative}`;
}

function threadChangeIsSupported(candidate: string, previousThread: string, narrative: string): boolean {
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

function meaningfulTokens(value: string): Set<string> {
    return new Set(
        value
            .toLowerCase()
            .replace(/\{\{user\}\}/g, "user")
            .split(/[^a-z0-9]+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 2 && !THREAD_STOP_WORDS.has(token)),
    );
}

function splitLocation(value: string): string[] {
    return cleanFragment(value).split(/\s+-\s+/).map(cleanFragment).filter(Boolean);
}

function splitTopLevel(value: string, separator: string): string[] {
    const parts: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of value) {
        if (char === "(") {
            depth += 1;
        } else if (char === ")") {
            depth = Math.max(0, depth - 1);
        }

        if (char === separator && depth === 0) {
            parts.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    if (current.trim().length > 0) {
        parts.push(current.trim());
    }

    return parts;
}

function looksLikeLocationTimeLine(value: string): boolean {
    const lower = value.toLowerCase();
    return value.includes("|")
        && (CLOCK_PATTERN.test(value) || TIME_OF_DAYS.some((timeOfDay) => lower.includes(timeOfDay.toLowerCase())));
}

function isHeaderDivider(value: string): boolean {
    const clean = value.trim();
    return clean === HEADER_DIVIDER || /^_{3,}$/.test(clean);
}

function cleanLabeledValue(rawLine: string, label: string): string {
    return cleanHeaderText(rawLine).replace(new RegExp(`^${label}\\s*:\\s*`, "i"), "").trim();
}

function cleanHeaderText(value: string): string {
    return value
        .trim()
        .replace(/^\*\*/, "")
        .replace(/\*\*$/, "")
        .replace(/\*\*/g, "")
        .trim();
}

function cleanFragment(value: string): string {
    return value
        .replace(/\s+/g, " ")
        .replace(/\s+([,.)])/g, "$1")
        .replace(/([(])\s+/g, "$1")
        .replace(/[.;,\s]+$/g, "")
        .trim();
}

function isPlaceholder(value: string): boolean {
    const clean = cleanFragment(value);
    const lower = clean.toLowerCase();

    return clean.length === 0
        || lower === "none"
        || lower === "n/a"
        || lower === "unknown"
        || lower === "null"
        || lower.includes("current mission / pending event")
        || lower.includes("position; clothing; relevant status")
        || lower.includes("body position; one clothing type");
}

function isNoNpcValue(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();
    return lower === "none"
        || lower === "no npc"
        || lower === "no npcs"
        || lower === "no npcs present"
        || lower === "no npc present"
        || lower === "none present";
}

function isNoThreadValue(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();
    return lower === "none"
        || lower === "no thread"
        || lower === "no active thread"
        || lower === "no major thread";
}

function limitWords(value: string, maxWords: number): string {
    const words = cleanFragment(value).split(" ").filter(Boolean);

    if (words.length <= maxWords) {
        return cleanFragment(value);
    }

    return words.slice(0, maxWords).join(" ");
}

function sameText(left: string, right: string): boolean {
    return cleanFragment(left).toLowerCase() === cleanFragment(right).toLowerCase();
}

function normalizeLineEndings(value: string): string {
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
