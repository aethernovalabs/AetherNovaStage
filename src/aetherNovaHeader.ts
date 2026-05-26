import type {Character} from "@chub-ai/stages-ts";

export type TimeOfDay = "Morning" | "Afternoon" | "Evening" | "Night";

export interface AetherNovaMessageState {
    location: string;
    timeOfDay: TimeOfDay;
    clock: string;
    you: string;
    npc: string;
    thread: string;
    wallet: string;
    walletInitialized: boolean;
}

interface ExtractedHeader {
    locationLine: string | null;
    youLine: string | null;
    npcLine: string | null;
    threadLine: string | null;
    walletLine: string | null;
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

interface WalletAmounts {
    gold: number;
    silver: number;
    copper: number;
}

interface NormalizedWallet {
    value: string;
    initialized: boolean;
}

interface NormalizeStatusOptions {
    sceneChanged?: boolean;
}

const CLOCK_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const TIME_OF_DAYS: TimeOfDay[] = ["Morning", "Afternoon", "Evening", "Night"];
const HEADER_DIVIDER = "***";

const DEFAULT_STATE: AetherNovaMessageState = {
    location: "Unknown Region - Current Place - Active Area",
    timeOfDay: "Morning",
    clock: "09:00",
    you: "Unknown - Human (Standing; Regular clothing; hands visible)",
    npc: "None",
    thread: "None",
    wallet: "0G ; 0S ; 0C",
    walletInitialized: false,
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

const LOCATION_SCENE_ANCHOR_CUES = [
    "inside",
    "within",
    "interior",
    "indoors",
    "room",
    "hall",
    "chamber",
    "floor",
    "walls",
    "ceiling",
    "doorway",
    "threshold",
    "counter",
    "table",
    "booth",
    "stool",
    "bartender",
    "patron",
];

const POSITION_CHANGE_CUES = [
    "move",
    "moves",
    "moved",
    "walk",
    "walks",
    "walked",
    "walking",
    "stand",
    "stands",
    "stood",
    "standing",
    "sit",
    "sits",
    "sat",
    "sitting",
    "seated",
    "kneel",
    "kneels",
    "kneeling",
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
    "left of",
    "right of",
    "left side",
    "right side",
    "next to",
    "in front of",
    "across from",
    "facing",
    "steps away",
    "steps before",
    "paces away",
    "paces before",
    "berdiri",
    "duduk",
    "berlutut",
    "sebelah kiri",
    "sebelah kanan",
    "di kiri",
    "di kanan",
    "di samping",
    "di hadapan",
    "di depan",
    "di belakang",
    "langkah",
];

const POSITION_SPATIAL_CUES = [
    "left of",
    "right of",
    "left side",
    "right side",
    "beside",
    "next to",
    "near",
    "before",
    "behind",
    "in front of",
    "across from",
    "facing",
    "toward",
    "towards",
    "ahead",
    "opposite",
    "between",
    "steps",
    "paces",
    "arm's length",
    "sebelah kiri",
    "sebelah kanan",
    "di kiri",
    "di kanan",
    "di samping",
    "di hadapan",
    "di depan",
    "di belakang",
    "menghadap",
    "langkah",
];

const CLOTHING_CHANGE_CUES = [
    "change clothes",
    "changed clothes",
    "changes clothes",
    "change into",
    "changed into",
    "changes into",
    "change outfit",
    "changed outfit",
    "changes outfit",
    "wear",
    "wears",
    "wearing",
    "wore",
    "put on",
    "puts on",
    "putting on",
    "dress in",
    "dresses in",
    "dressed in",
    "clad in",
    "dons",
    "donned",
    "donning",
    "slip into",
    "slips into",
    "slipped into",
    "wrap in",
    "wraps in",
    "wrapped in",
    "swap into",
    "swaps into",
    "swapped into",
    "new outfit",
    "new clothes",
    "remove armor",
    "removes armor",
    "removed armor",
    "new disguise",
    "changes disguise",
    "changed disguise",
    "only wearing",
    "wears only",
    "wearing only",
    "naked",
    "fully naked",
    "mostly naked",
    "nude",
    "unclothed",
    "without clothes",
    "left sleeve",
    "right sleeve",
    "loose shirt",
    "loose pants",
    "baggy shirt",
    "baggy pants",
    "shirt caught",
    "pants caught",
    "sleeve caught",
    "clothes caught",
    "clothing caught",
    "baju longgar",
    "celana longgar",
    "hanya memakai",
    "tersangkut",
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
    "frayed",
    "singed",
    "loose",
    "loosened",
    "baggy",
    "caught",
    "catches",
    "snag",
    "snags",
    "snagged",
    "stuck",
    "hooked",
    "tangled",
    "slipping",
    "untucked",
    "unbuttoned",
    "unfastened",
    "missing sleeve",
    "armor cracked",
    "cloak catches fire",
    "sleeve catches fire",
    "robek",
    "terbakar",
    "longgar",
    "tersangkut",
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
    "without cloak",
    "remove cloak",
    "removes cloak",
    "removed cloak",
    "only pants",
    "pants only",
    "wearing only pants",
    "wears only pants",
    "only wearing pants",
    "hanya memakai celana",
];

const CLOTHING_ADJUSTMENT_CUES = [
    "fix",
    "fixes",
    "fixed",
    "fixing",
    "adjust",
    "adjusts",
    "adjusted",
    "adjusting",
    "straighten",
    "straightens",
    "straightened",
    "straightening",
    "smooth",
    "smooths",
    "smoothed",
    "smoothing",
    "settle",
    "settles",
    "settled",
    "settling",
    "fasten",
    "fastens",
    "fastened",
    "fastening",
    "refasten",
    "refastens",
    "refastened",
    "refastening",
    "tie",
    "ties",
    "tied",
    "tying",
    "retie",
    "reties",
    "retied",
    "retying",
    "cover",
    "covers",
    "covered",
    "covering",
    "back into place",
    "into place",
];

const CLOTHING_DAMAGE_WORDS = /\b(burned|burnt|scorched|torn|ripped|shredded|slashed|bloody|bloodied|stained|soaked|wet|muddy|damaged|destroyed|cracked|frayed|singed|loose|loosened|baggy|caught|snagged|stuck|hooked|tangled|slipping|untucked|unbuttoned|unfastened|missing|robek|terbakar|longgar|tersangkut)\b/i;
const CLOTHING_SLOT_PATTERN = /\b(cloth|clothes|clothing|garment|garments|layer|layers|outfit|attire|garb|uniform|armor|armour|robe|robes|over-robe|under-robe|overrobe|underrobe|kimono|yukata|haori|hakama|dress|gown|suit|shirt|blouse|tunic|jacket|coat|cloak|mantle|cape|hood|pants|pant|trousers|jeans|shorts|skirt|leggings|boots|shoes|sandals|gloves|mask|veil|hat|cap|helmet|apron|vest|corset|sash|belt|scarf|shawl|wrap|rags|disguise|leather|silk|linen|cotton|wool|chainmail|mail|sleeve|sleeves|collar|hem|cuff|cuffs|waistband|pantleg|pantlegs|naked|nude|unclothed|bare|baju|celana|pakaian|kemeja|lengan baju|kain)\b/i;
const WALLET_AMOUNT_PATTERN = /\b\d+\s*(?:g|gold|s|silver|c|copper)\b/i;
const VAGUE_STATUS_PATTERN = /\b(mood|emotion|feeling|feelings|thought|thoughts|status|role|happy|sad|angry|calm|nervous|worried|confused|curious|suspicious|jealous|afraid|scared|determined|focused)\b/i;
const USER_FORBIDDEN_DETAIL_PATTERN = /\b(thinking|thinks|feeling|feels|expression|expressions|smiling|smiles|frowning|grinning|says|said|speaks|asks|answers|chooses|choosing|choice|decides|attacks|attack|transforms|transforming|consents|consent|refuses|dialogue)\b/i;
const MINOR_THREAD_PATTERN = /\b(normal topic|normal topics|casual question|casual questions|temporary mood|small suspicion|minor jealousy|minor tension|small talk)\b/i;
const TRANSIENT_YOU_DETAIL_PATTERN = /\b(holding|gripping|grasping|clutching|touching|stroking|caressing|petting|rubbing|tilted|tilting|cocked|angled|resting|leaning|pressing|bracing|supporting|pushing|pulling|tugging|drawing|lifting|lowering|cleaning|wiping|washing|brushing|drying|patting|hand on|hands on|arm around|arms around|head on|against|upon|on top of)\b/i;

const DETAIL_BODY_PART_CUES = [
    "hand",
    "hands",
    "palm",
    "palms",
    "finger",
    "fingers",
    "arm",
    "arms",
    "elbow",
    "elbows",
    "head",
    "face",
    "cheek",
    "cheeks",
    "forehead",
    "chin",
    "mouth",
    "nose",
    "hair",
    "shoulder",
    "shoulders",
    "back",
    "body",
    "torso",
    "waist",
];

const DETAIL_CONTACT_ACTION_CUES = [
    "holding",
    "gripping",
    "grasping",
    "clutching",
    "touching",
    "stroke",
    "strokes",
    "stroking",
    "caress",
    "caresses",
    "caressing",
    "pet",
    "pets",
    "petting",
    "rub",
    "rubs",
    "rubbing",
    "clean",
    "cleans",
    "cleaning",
    "wipe",
    "wipes",
    "wiping",
    "wash",
    "washes",
    "washing",
    "brush",
    "brushes",
    "brushing",
    "dry",
    "dries",
    "drying",
    "pat",
    "pats",
    "patting",
    "resting",
    "leaning",
    "pressing",
    "bracing",
    "supporting",
    "pull",
    "pulls",
    "pulling",
    "tug",
    "tugs",
    "tugging",
    "draw",
    "draws",
    "drawing",
    "lift",
    "lifts",
    "lifting",
    "lower",
    "lowers",
    "lowering",
    "against",
    "upon",
    "hand remains",
    "hands remain",
    "palm remains",
    "palms remain",
    "keeps his hand",
    "keeps her hand",
    "keeps their hand",
    "keeps your hand",
    "keeps one hand",
    "keeps a hand",
];

const DETAIL_VISIBLE_INTERACTION_CUES = [
    "clean",
    "cleans",
    "cleaning",
    "wipe",
    "wipes",
    "wiping",
    "wash",
    "washes",
    "washing",
    "brush",
    "brushes",
    "brushing",
    "dry",
    "dries",
    "drying",
    "pat",
    "pats",
    "patting",
    "touch",
    "touches",
    "touching",
    "stroke",
    "strokes",
    "stroking",
    "caress",
    "caresses",
    "caressing",
    "pet",
    "pets",
    "petting",
    "rub",
    "rubs",
    "rubbing",
    "pull",
    "pulls",
    "pulling",
    "tug",
    "tugs",
    "tugging",
    "draw",
    "draws",
    "drawing",
    "lift",
    "lifts",
    "lifting",
    "lower",
    "lowers",
    "lowering",
];

const DETAIL_OBJECT_INTERACTION_CUES = [
    "cup",
    "mug",
    "glass",
    "bottle",
    "blanket",
    "sheet",
    "cloth",
    "towel",
    "curtain",
    "door",
    "handle",
    "rope",
    "weapon",
    "sword",
    "knife",
    "staff",
    "book",
    "bag",
    "pouch",
    "chair",
    "table",
];

const DETAIL_SETTLED_BODY_CUES = [
    "lowered",
    "lower",
    "down",
    "low",
    "relaxed",
    "loose",
    "free",
    "at side",
    "at sides",
    "by side",
    "by sides",
    "to side",
    "to sides",
    "hanging",
    "lowered hands",
    "lowered arms",
    "hands lowered",
    "arms lowered",
    "hands down",
    "arms down",
    "hands at sides",
    "arms at sides",
    "hands by sides",
    "arms by sides",
];

const DETAIL_POSTURE_CHANGE_CUES = [
    "turn",
    "turns",
    "turned",
    "turning",
    "face",
    "faces",
    "facing",
    "toward",
    "towards",
    "pull back",
    "pulls back",
    "pulled back",
    "drawing back",
    "draws back",
    "withdraw",
    "withdraws",
    "withdrew",
    "withdrawn",
    "straighten",
    "straightens",
    "straightened",
    "level",
    "leveled",
    "steady",
    "forward",
    "head level",
    "body turned",
];

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

const LOCATION_STOP_WORDS = new Set([
    "main",
    "sub",
    "location",
    "region",
    "kingdom",
    "empire",
    "city",
    "town",
    "village",
    "district",
    "street",
    "road",
    "path",
    "route",
    "current",
    "place",
    "active",
    "area",
    "detailed",
    "exact",
    "near",
    "nearby",
    "outside",
    "inside",
    "room",
]);

const WALLET_TRANSACTION_CUES = [
    "pay",
    "pays",
    "paid",
    "payment",
    "spend",
    "spends",
    "spent",
    "buy",
    "buys",
    "bought",
    "purchase",
    "purchases",
    "purchased",
    "cost",
    "costs",
    "price",
    "fee",
    "fare",
    "toll",
    "tax",
    "tip",
    "tips",
    "tipped",
    "bribe",
    "bribes",
    "bribed",
    "rent",
    "rents",
    "rented",
    "sell",
    "sells",
    "sold",
    "receive",
    "receives",
    "received",
    "reward",
    "rewards",
    "rewarded",
    "earn",
    "earns",
    "earned",
    "gain",
    "gains",
    "gained",
    "loot",
    "loots",
    "looted",
    "found",
    "finds",
    "gift",
    "gifts",
    "gifted",
    "prize",
    "bounty",
    "wage",
    "wages",
    "salary",
    "compensation",
    "refund",
    "loses",
    "lost",
    "stolen",
    "robbed",
    "confiscated",
    "hands over",
    "handed over",
];

const WALLET_MONEY_CUES = [
    "gold",
    "silver",
    "copper",
    "coin",
    "coins",
    "money",
    "wallet",
    "purse",
    "pouch",
    "payment",
    "price",
    "fee",
    "fare",
    "reward",
    "bounty",
    "tip",
    "wage",
    "wages",
];

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
    const walletState = coerceWalletState(raw, fallback);

    return {
        location: normalizeLocation(raw.location ?? "", fallback.location),
        timeOfDay: timeOfDayForClock(clock),
        clock,
        you: normalizeYouLine(raw.you ?? "", fallback.you),
        npc: normalizeNpcLine(raw.npc ?? "", fallback.npc),
        thread: normalizeThreadLine(raw.thread ?? "", fallback.thread, ""),
        wallet: walletState.value,
        walletInitialized: walletState.initialized,
    };
}

export function buildStageDirections(state: AetherNovaMessageState): string {
    return [
        "Maintain Aether Nova header format. Start with exactly five bold header lines followed by *** before narration.",
        `Location: ${state.location}`,
        `Time: ${state.timeOfDay} | ${state.clock}`,
        `You: ${state.you}`,
        `NPC: ${state.npc}`,
        `Thread: ${state.thread}`,
        `Wallet: ${state.wallet}`,
        "Status format: Position; Clothes/disguise; optional body/racial detail. Keep position/clothes from last state unless the scene clearly changes. Use Thread items separated by \" ; \". Wallet changes only with clear in-story transaction/reward/loss evidence.",
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
    const sceneChanged = !sameText(timeLocation.location, previousState.location);
    const wallet = normalizeWalletLine(
        extracted.walletLine ?? "",
        previousState.wallet,
        correctionContext,
        previousState.walletInitialized === true,
    );
    const state: AetherNovaMessageState = {
        location: timeLocation.location,
        timeOfDay: timeLocation.timeOfDay,
        clock: timeLocation.clock,
        you: normalizeYouLine(extracted.youLine ?? "", previousState.you, correctionContext, {sceneChanged}),
        npc: normalizeNpcLine(extracted.npcLine ?? "", previousState.npc, correctionContext, {sceneChanged}),
        thread: normalizeThreadLine(extracted.threadLine ?? "", previousState.thread, correctionContext),
        wallet: wallet.value,
        walletInitialized: wallet.initialized,
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
        `**Wallet: ${state.wallet}**`,
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
            walletLine: null,
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
            walletLine: block.walletLine,
            narrative,
        };
    }

    return {
        locationLine: null,
        youLine: null,
        npcLine: null,
        threadLine: null,
        walletLine: null,
        narrative: normalized.trimStart(),
    };
}

function readHeaderBlock(lines: string[], start: number): HeaderBlock | null {
    let locationLine: string | null = null;
    let youLine: string | null = null;
    let npcLine: string | null = null;
    let threadLine: string | null = null;
    let walletLine: string | null = null;
    let score = 0;
    let end = start;
    let sawDivider = false;
    let blankLinesInsideHeader = 0;

    const scanEnd = Math.min(lines.length, start + 16);
    for (let index = start; index < scanEnd; index += 1) {
        const line = lines[index].trim();

        if (line.length === 0) {
            if (score === 0) {
                return null;
            }

            blankLinesInsideHeader += 1;
            if (blankLinesInsideHeader > 4) {
                break;
            }

            end = index + 1;
            continue;
        }

        blankLinesInsideHeader = 0;

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
            if (youLine != null) {
                break;
            }
            youLine = clean;
            score += 1;
            end = index + 1;
            continue;
        }

        if (lower.startsWith("npc:")) {
            if (npcLine != null) {
                break;
            }
            npcLine = clean;
            score += 1;
            end = index + 1;
            continue;
        }

        if (lower.startsWith("thread:")) {
            if (threadLine != null) {
                break;
            }
            threadLine = clean;
            score += 1;
            end = index + 1;
            continue;
        }

        if (lower.startsWith("wallet:")) {
            if (walletLine != null) {
                break;
            }
            walletLine = clean;
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
        walletLine,
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

function normalizeYouLine(
    rawLine: string,
    previousYou: string,
    context: string = "",
    options: NormalizeStatusOptions = {},
): string {
    const value = cleanLabeledValue(rawLine, "You");

    if (isPlaceholder(value)) {
        return previousYou;
    }

    const parsed = parseIdentityStatus(value);
    const fallback = parseIdentityStatus(previousYou || DEFAULT_STATE.you);
    const fallbackIdentity = splitIdentity(fallback.identity, "Unknown", "Human");
    const identity = splitIdentity(parsed.identity, fallbackIdentity.left, fallbackIdentity.right);
    const apparentRace = normalizeYouRace(identity.right, fallbackIdentity.right, context);
    const status = normalizeStatus(parsed.status, fallback.status, "you", apparentRace, context, options);

    return `${identity.left} - ${apparentRace} (${status})`;
}

function normalizeNpcLine(
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

    return entries.map((entry) => {
        const parsed = parseIdentityStatus(entry);
        const identity = splitIdentity(parsed.identity, "Unknown NPC", "Human");
        const fallback = fallbackByName.get(npcIdentityKey(identity.left)) ?? null;
        return normalizeNpcEntry(entry, fallback, context, options);
    }).join(", ");
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
    const status = fallback == null
        ? normalizeNewNpcStatus(parsed.status, identity.right, context)
        : normalizeStatus(parsed.status, fallback.status || defaultNpcStatusForRace(identity.right), "npc", identity.right, context, options);

    return `${identity.left} - ${identity.right} (${status})`;
}

function normalizeNewNpcStatus(rawStatus: string, race: string, context: string): string {
    const defaultStatus = defaultNpcStatusForRace(race);
    const defaultParts = statusParts(defaultStatus, "npc");
    const rawParts = statusParts(rawStatus, "npc");
    const position = normalizePosition(rawParts[0] ?? defaultParts[0], defaultParts[0], "npc");
    const inferredClothing = inferNpcClothingFromContext(context);
    const rawClothing = normalizeClothing(inferredClothing ?? rawParts[1] ?? defaultParts[1], defaultParts[1]);
    const clothing = inferredClothing != null || newNpcClothingIsSupported(rawClothing, context) ? rawClothing : normalizeClothing(defaultParts[1], "Regular clothing");
    const detail = normalizeDetail(rawParts[2] ?? defaultParts[2], defaultParts[2], "npc");

    return `${position}; ${clothing}; ${detail}`;
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

function coerceWalletState(
    raw: Partial<AetherNovaMessageState>,
    fallback: AetherNovaMessageState,
): NormalizedWallet {
    const rawWallet = typeof raw.wallet === "string" ? normalizeWalletValue(raw.wallet) : null;
    const fallbackWallet = normalizeWalletValue(fallback.wallet) ?? DEFAULT_STATE.wallet;
    const explicitInitialized = typeof raw.walletInitialized === "boolean" ? raw.walletInitialized : null;

    if (rawWallet != null) {
        return {
            value: rawWallet,
            initialized: explicitInitialized ?? true,
        };
    }

    return {
        value: fallbackWallet,
        initialized: explicitInitialized ?? fallback.walletInitialized,
    };
}

function normalizeWalletLine(
    rawLine: string,
    previousWallet: string,
    context: string,
    previousInitialized: boolean,
): NormalizedWallet {
    const previous = normalizeWalletValue(previousWallet) ?? DEFAULT_STATE.wallet;
    const rawCandidate = cleanLabeledValue(rawLine, "Wallet");
    const candidate = normalizeWalletValue(rawCandidate);

    if (candidate == null) {
        return {
            value: previous,
            initialized: previousInitialized,
        };
    }

    if (!previousInitialized) {
        return {
            value: candidate,
            initialized: true,
        };
    }

    if (sameText(candidate, previous)) {
        return {
            value: previous,
            initialized: true,
        };
    }

    return {
        value: walletChangeIsSupported(candidate, previous, context) ? candidate : previous,
        initialized: true,
    };
}

function normalizeWalletValue(value: string): string | null {
    const amounts = parseWalletAmounts(value);
    return amounts == null ? null : formatWallet(amounts);
}

function parseWalletAmounts(value: string): WalletAmounts | null {
    const clean = cleanHeaderText(value).replace(/^wallet\s*:\s*/i, "");

    if (isPlaceholder(clean)) {
        return null;
    }

    let matched = false;
    const amounts: WalletAmounts = {gold: 0, silver: 0, copper: 0};
    const pattern = /(\d+)\s*(g|gold|s|silver|c|copper)\b/gi;
    let match = pattern.exec(clean);

    while (match != null) {
        matched = true;
        const amount = Math.max(0, Number(match[1]));
        const unit = match[2].toLowerCase();

        if (unit === "g" || unit === "gold") {
            amounts.gold = amount;
        } else if (unit === "s" || unit === "silver") {
            amounts.silver = amount;
        } else {
            amounts.copper = amount;
        }

        match = pattern.exec(clean);
    }

    return matched ? amounts : null;
}

function formatWallet(wallet: WalletAmounts): string {
    return `${wallet.gold}G ; ${wallet.silver}S ; ${wallet.copper}C`;
}

function normalizeStatus(
    rawStatus: string,
    fallbackStatus: string,
    kind: "you" | "npc",
    race: string,
    context: string = "",
    options: NormalizeStatusOptions = {},
): string {
    const defaultStatus = kind === "you" ? DEFAULT_STATE.you.match(/\((.*)\)$/)?.[1] ?? "Standing; Regular clothing; hands visible" : defaultNpcStatusForRace(race);
    const fallbackParts = statusParts(fallbackStatus || defaultStatus, kind);
    const defaultParts = statusParts(defaultStatus, kind);
    const rawParts = statusParts(rawStatus, kind);

    const fallbackPosition = normalizePosition(fallbackParts[0] ?? defaultParts[0], defaultParts[0], kind);
    const fallbackClothing = normalizeClothing(fallbackParts[1] ?? defaultParts[1], defaultParts[1]);
    const rawPosition = normalizePosition(rawParts[0] ?? fallbackPosition, fallbackPosition, kind);
    const inferredClothing = kind === "you" ? inferYouClothingFromContext(context) : null;
    const rawClothing = normalizeClothing(inferredClothing ?? rawParts[1] ?? fallbackClothing, fallbackClothing);
    const position = statusChangeIsSupported(rawPosition, fallbackPosition, context, "position", kind)
        || (options.sceneChanged === true && rawParts[0] != null && !isGenericStatusPart(rawPosition))
        ? rawPosition
        : fallbackPosition;
    const clothing = statusChangeIsSupported(rawClothing, fallbackClothing, context, "clothing", kind) ? rawClothing : fallbackClothing;
    const fallbackDetail = normalizeDetail(fallbackParts[2] ?? defaultParts[2], defaultParts[2], kind);
    const rawDetail = normalizeDetail(rawParts[2] ?? fallbackDetail, fallbackDetail, kind);
    let detail = rawDetail;

    if (kind === "you" && !youDetailChangeIsSupported(rawDetail, fallbackDetail, context)) {
        detail = staleYouDetailCanYieldToCandidate(rawDetail, fallbackDetail, context) ? rawDetail : fallbackDetail;
    }

    if (
        kind === "you"
        && staleYouDetailShouldReset(detail, fallbackDetail, position, fallbackPosition, context, options.sceneChanged === true)
    ) {
        detail = defaultParts[2] ?? "hands visible";
    }

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
    const defaultFallback = kind === "you" ? "Standing" : "Standing nearby";
    const safeFallback = safeStatusFallback(fallback, defaultFallback, kind);
    let clean = cleanFragment(value) || safeFallback;
    clean = stripGenericScenePosition(clean);

    if (kind === "you") {
        clean = stripDramaticLanguage(clean);
        clean = clean.replace(/\b(bearing|radiating|showing)\b.*$/i, "").trim();
        clean = clean.split(/[.]/)[0].trim();
        clean = limitWords(clean, 14);
    } else {
        clean = clean.split(/[.]/)[0].trim();
        clean = limitWords(clean, 16);
    }

    if (isInvalidStatusPart(clean, kind)) {
        return safeFallback;
    }

    return cleanFragment(clean) || safeFallback;
}

function stripGenericScenePosition(value: string): string {
    const clean = cleanFragment(value)
        .replace(/\b(?:in|within|inside)\s+(?:the\s+)?(?:current\s+)?scene\b/gi, "")
        .replace(/\bscene\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    return cleanFragment(clean);
}

function normalizeClothing(value: string, fallback: string): string {
    const safeFallback = safeStatusFallback(fallback, "Regular clothing", "npc");
    let clean = cleanFragment(value) || safeFallback;
    clean = clean.replace(/\s+/g, " ").trim();
    clean = limitWords(clean, 18);

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
        clean = limitWords(clean, 12);
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
    if (
        candidateParts.length >= 2
        && previousParts.length >= 1
        && sameText(candidateParts[0], previousParts[0])
        && locationCandidateIsSceneAnchored(candidateParts, lowerContext)
    ) {
        return true;
    }

    if (
        locationCandidateWasNearbyTarget(candidateParts, previous)
        && locationCandidateIsSceneAnchored(candidateParts, lowerContext)
    ) {
        return true;
    }

    return LOCATION_TRANSITION_CUES.some((cue) => lowerContext.includes(cue));
}

function locationCandidateIsSceneAnchored(candidateParts: string[], lowerContext: string): boolean {
    const tokens = meaningfulLocationTokens(candidateParts.slice(1).join(" "));

    if (tokens.length === 0) {
        return false;
    }

    const mentionsCandidatePlace = containsAnyCue(lowerContext, tokens);
    const hasSceneAnchor = containsAnyCue(lowerContext, LOCATION_SCENE_ANCHOR_CUES);

    return mentionsCandidatePlace && hasSceneAnchor;
}

function locationCandidateWasNearbyTarget(candidateParts: string[], previous: string): boolean {
    const previousLower = previous.toLowerCase();
    return meaningfulLocationTokens(candidateParts.slice(1).join(" "))
        .some((token) => containsAnyCue(previousLower, [token]));
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

    if (kind === "npc" && isGenericStatusPart(previous) && (field !== "clothing" || looksLikeClothingSlot(candidate))) {
        return true;
    }

    if (field === "clothing" && isGenericStatusPart(previous) && looksLikeClothingSlot(candidate)) {
        return true;
    }

    if (field === "clothing" && looksLikeClothingSlot(candidate) && clothingIsMentioned(candidate, context)) {
        return true;
    }

    if (kind === "npc" && field === "clothing" && npcClothingAdjustmentIsSupported(candidate, previous, context)) {
        return true;
    }

    if (kind === "you" && isGenericStatusPart(previous) && contextHasEvidence(context, field)) {
        return true;
    }

    if (
        field === "clothing"
        && !isGenericStatusPart(previous)
        && clothingChangeIsNegated(context.toLowerCase())
        && !containsAnyCue(context, CLOTHING_REMOVAL_CUES)
        && !containsAnyCue(context, CLOTHING_DAMAGE_CUES)
    ) {
        return false;
    }

    if (field === "position" && spatialPositionChangeIsSupported(candidate, context)) {
        return true;
    }

    if (kind === "you" && field === "position") {
        return youPositionChangeIsSupported(candidate, previous, context);
    }

    if (kind === "you" && field === "clothing") {
        return youClothingChangeIsSupported(candidate, previous, context);
    }

    const lowerContext = context.toLowerCase();
    const cues = field === "position" ? POSITION_CHANGE_CUES : CLOTHING_CHANGE_CUES;
    return containsAnyCue(lowerContext, cues);
}

function youPositionChangeIsSupported(candidate: string, previous: string, context: string): boolean {
    const lowerCandidate = candidate.toLowerCase();
    const lowerContext = context.toLowerCase();

    if (spatialPositionChangeIsSupported(candidate, context)) {
        return true;
    }

    if (positionMeansWalking(lowerCandidate)) {
        return containsAnyCue(lowerContext, ["walk", "walks", "walking", "move", "moves", "moving", "step", "steps", "stepping", "approach", "approaches", "continue", "continues"]);
    }

    if (positionMeansStanding(lowerCandidate)) {
        return containsAnyCue(lowerContext, ["stand", "stands", "standing", "stood", "stop", "stops", "stopped", "halt", "halts", "arrive", "arrives", "arrived", "reach", "reaches", "reached"]);
    }

    if (positionMeansSeated(lowerCandidate)) {
        return containsAnyCue(lowerContext, ["sit", "sits", "sat", "seated", "seat"]);
    }

    if (positionMeansProne(lowerCandidate)) {
        return containsAnyCue(lowerContext, ["lie", "lies", "lying", "lay", "laid", "prone", "collapse", "collapses", "collapsed"]);
    }

    return containsAnyCue(lowerContext, POSITION_CHANGE_CUES)
        && meaningfulPositionWords(candidate).some((word) => lowerContext.includes(word));
}

function spatialPositionChangeIsSupported(candidate: string, context: string): boolean {
    const lowerCandidate = candidate.toLowerCase();
    const lowerContext = context.toLowerCase();

    if (!containsAnyCue(lowerCandidate, POSITION_SPATIAL_CUES)) {
        return false;
    }

    const words = meaningfulPositionWords(candidate);
    const mentionsAnchor = words.some((word) => containsAnyCue(lowerContext, [word]));
    const mentionsSpatialRelation = containsAnyCue(lowerContext, POSITION_SPATIAL_CUES)
        || containsAnyCue(lowerContext, POSITION_CHANGE_CUES);

    return mentionsAnchor && mentionsSpatialRelation;
}

function youClothingChangeIsSupported(candidate: string, previous: string, context: string): boolean {
    const lowerContext = context.toLowerCase();
    const lowerCandidate = candidate.toLowerCase();
    const hasRemovalCue = containsAnyCue(lowerContext, CLOTHING_REMOVAL_CUES);
    const hasDamageCue = containsAnyCue(lowerContext, CLOTHING_DAMAGE_CUES);
    const hasChangeCue = containsAnyCue(lowerContext, CLOTHING_CHANGE_CUES);

    if (clothingChangeIsNegated(lowerContext) && !hasRemovalCue && !hasDamageCue) {
        return false;
    }

    if (hasRemovalCue) {
        return true;
    }

    if (looksLikeClothingSlot(candidate) && clothingIsMentioned(candidate, context)) {
        return true;
    }

    if (
        hasDamageCue
        && (CLOTHING_DAMAGE_WORDS.test(candidate) || sharesMeaningfulClothingWord(candidate, previous))
    ) {
        return true;
    }

    if (hasChangeCue) {
        return true;
    }

    return CLOTHING_DAMAGE_WORDS.test(lowerCandidate)
        && containsAnyCue(lowerContext, CLOTHING_DAMAGE_CUES);
}

function npcClothingAdjustmentIsSupported(candidate: string, previous: string, context: string): boolean {
    if (!looksLikeClothingSlot(candidate) || sameText(candidate, previous)) {
        return false;
    }

    const lowerContext = context.toLowerCase();

    if (clothingChangeIsNegated(lowerContext) && !containsAnyCue(lowerContext, CLOTHING_DAMAGE_CUES)) {
        return false;
    }

    return containsAnyCue(lowerContext, CLOTHING_ADJUSTMENT_CUES)
        && contextHasClothingReference(context)
        && candidateHasConcreteGarment(candidate);
}

function contextHasClothingReference(context: string): boolean {
    return CLOTHING_SLOT_PATTERN.test(context)
        || containsAnyCue(context, ["double layer", "under-layer", "outer layer", "inner layer"]);
}

function candidateHasConcreteGarment(candidate: string): boolean {
    return /\b(robe|robes|over[-\s]?robe|under[-\s]?robe|overrobe|underrobe|kimono|yukata|haori|hakama|dress|gown|uniform|armor|armour|cloak|mantle|cape|shirt|blouse|tunic|jacket|coat|pants|trousers|skirt|silk|linen|cotton|wool|leather|garment|garments|layer|layers)\b/i.test(candidate);
}

function clothingChangeIsNegated(context: string): boolean {
    return context.includes("does not change clothes")
        || context.includes("doesn't change clothes")
        || context.includes("do not change clothes")
        || context.includes("don't change clothes")
        || context.includes("no one changes clothes")
        || context.includes("nobody changes clothes")
        || context.includes("without changing clothes")
        || context.includes("no clothing change")
        || context.includes("no outfit change");
}

function inferYouClothingFromContext(context: string): string | null {
    const lowerContext = context.toLowerCase();

    if (
        lowerContext.includes("only pants")
        || lowerContext.includes("pants only")
        || lowerContext.includes("only wearing pants")
        || lowerContext.includes("wearing only pants")
        || lowerContext.includes("wears only pants")
        || lowerContext.includes("only in pants")
        || lowerContext.includes("hanya memakai celana")
    ) {
        return "Pants only";
    }

    if (
        lowerContext.includes("without clothes")
        || lowerContext.includes("naked")
        || lowerContext.includes("nude")
        || lowerContext.includes("unclothed")
    ) {
        return inferNakedClothingState(context) ?? "Naked";
    }

    if (
        lowerContext.includes("without shirt")
        || lowerContext.includes("shirtless")
    ) {
        return "Shirtless";
    }

    if (
        lowerContext.includes("without armor")
        || lowerContext.includes("remove armor")
        || lowerContext.includes("removes armor")
        || lowerContext.includes("removed armor")
    ) {
        return "Without armor";
    }

    if (
        lowerContext.includes("without cloak")
        || lowerContext.includes("remove cloak")
        || lowerContext.includes("removes cloak")
        || lowerContext.includes("removed cloak")
    ) {
        return "Without cloak";
    }

    return null;
}

function inferNakedClothingState(context: string): string | null {
    const match = context.match(/\b(?:naked|nude|unclothed)\s+(?:except for|save for|aside from)\s+([^.;,\n]+)/i);

    if (match == null) {
        return null;
    }

    const exception = cleanFragment(match[1].replace(/\b(after|while|as|because|when|before|then)\b.*$/i, ""));
    if (exception.length === 0 || exception.length > 60) {
        return null;
    }

    return `Naked except for ${exception}`;
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

function youDetailChangeIsSupported(candidate: string, previous: string, context: string): boolean {
    if (sameText(candidate, previous) || isGenericStatusPart(previous)) {
        return true;
    }

    const lowerContext = context.toLowerCase();
    const lowerCandidate = candidate.toLowerCase();

    if (CLOTHING_DAMAGE_WORDS.test(lowerCandidate) && CLOTHING_DAMAGE_CUES.some((cue) => lowerContext.includes(cue))) {
        return true;
    }

    if (visibleYouInteractionDetailIsSupported(candidate, context)) {
        return true;
    }

    if (postureYouDetailIsSupported(candidate, context)) {
        return true;
    }

    return meaningfulDetailWords(candidate).some((word) => lowerContext.includes(word));
}

function visibleYouInteractionDetailIsSupported(candidate: string, context: string): boolean {
    const lowerCandidate = candidate.toLowerCase();
    const lowerContext = context.toLowerCase();
    const candidateHasAction = containsAnyCue(lowerCandidate, DETAIL_VISIBLE_INTERACTION_CUES);
    const contextHasAction = containsAnyCue(lowerContext, DETAIL_VISIBLE_INTERACTION_CUES);

    if (!candidateHasAction || !contextHasAction) {
        return false;
    }

    const candidateHasBodyTarget = containsAnyCue(lowerCandidate, DETAIL_BODY_PART_CUES);
    const contextHasBodyTarget = containsAnyCue(lowerContext, DETAIL_BODY_PART_CUES);
    const candidateHasObjectTarget = containsAnyCue(lowerCandidate, DETAIL_OBJECT_INTERACTION_CUES);
    const contextHasObjectTarget = containsAnyCue(lowerContext, DETAIL_OBJECT_INTERACTION_CUES);
    const candidateWords = meaningfulDetailWords(candidate);
    const mentionsSameTarget = candidateWords.some((word) => containsAnyCue(lowerContext, [word]));

    return (candidateHasBodyTarget && contextHasBodyTarget)
        || (candidateHasObjectTarget && contextHasObjectTarget)
        || mentionsSameTarget;
}

function staleYouDetailCanYieldToCandidate(candidate: string, previous: string, context: string): boolean {
    if (!isTransientYouDetail(previous) || youDetailHasCurrentEvidence(previous, context)) {
        return false;
    }

    return isGenericStatusPart(candidate)
        || visibleYouInteractionDetailIsSupported(candidate, context)
        || settledYouDetailIsSupported(candidate, context)
        || postureYouDetailIsSupported(candidate, context)
        || meaningfulDetailWords(candidate).some((word) => containsAnyCue(context, [word]));
}

function postureYouDetailIsSupported(candidate: string, context: string): boolean {
    const lowerCandidate = candidate.toLowerCase();
    const lowerContext = context.toLowerCase();

    if (!containsAnyCue(lowerContext, DETAIL_POSTURE_CHANGE_CUES)) {
        return false;
    }

    const candidateHasPostureCue = containsAnyCue(lowerCandidate, DETAIL_POSTURE_CHANGE_CUES);
    const candidateHasBodyCue = containsAnyCue(lowerCandidate, DETAIL_BODY_PART_CUES);
    const candidateWords = meaningfulDetailWords(candidate);
    const mentionsSameTarget = candidateWords.some((word) => containsAnyCue(lowerContext, [word]));

    return candidateHasPostureCue || (candidateHasBodyCue && mentionsSameTarget);
}

function settledYouDetailIsSupported(candidate: string, context: string): boolean {
    const lowerCandidate = candidate.toLowerCase();
    const lowerContext = context.toLowerCase();

    if (!containsAnyCue(lowerCandidate, DETAIL_BODY_PART_CUES) || !containsAnyCue(lowerCandidate, DETAIL_SETTLED_BODY_CUES)) {
        return false;
    }

    return containsAnyCue(lowerContext, POSITION_CHANGE_CUES)
        || containsAnyCue(lowerContext, LOCATION_TRANSITION_CUES)
        || containsAnyCue(lowerContext, DETAIL_SETTLED_BODY_CUES);
}

function staleYouDetailShouldReset(
    detail: string,
    previousDetail: string,
    position: string,
    previousPosition: string,
    context: string,
    sceneChanged: boolean,
): boolean {
    if (!sameText(detail, previousDetail) || !isTransientYouDetail(previousDetail)) {
        return false;
    }

    const positionChanged = !sameText(position, previousPosition);
    if (!sceneChanged && !positionChanged && !contextSuggestsSceneShift(context)) {
        return false;
    }

    return !youDetailHasCurrentEvidence(previousDetail, context);
}

function isTransientYouDetail(value: string): boolean {
    const clean = cleanFragment(value);
    return TRANSIENT_YOU_DETAIL_PATTERN.test(clean)
        || /\b(hand|hands|arm|arms|elbow|elbows|head|shoulder|shoulders|back)\b.*\b(on|upon|against|over|around|resting|braced|pressed)\b/i.test(clean);
}

function youDetailHasCurrentEvidence(detail: string, context: string): boolean {
    const lowerContext = context.toLowerCase();
    const hasBodyPartCue = containsAnyCue(lowerContext, DETAIL_BODY_PART_CUES);
    const hasContactActionCue = containsAnyCue(lowerContext, DETAIL_CONTACT_ACTION_CUES);

    if (!hasBodyPartCue && !hasContactActionCue) {
        return false;
    }

    return meaningfulDetailWords(detail).some((word) => lowerContext.includes(word));
}

function contextSuggestsSceneShift(context: string): boolean {
    const lowerContext = context.toLowerCase();
    return containsAnyCue(lowerContext, LOCATION_TRANSITION_CUES);
}

function contextHasEvidence(context: string, field: "position" | "clothing"): boolean {
    const lowerContext = context.toLowerCase();

    if (field === "position") {
        return containsAnyCue(lowerContext, POSITION_CHANGE_CUES);
    }

    return containsAnyCue(lowerContext, CLOTHING_CHANGE_CUES)
        || containsAnyCue(lowerContext, CLOTHING_DAMAGE_CUES)
        || containsAnyCue(lowerContext, CLOTHING_REMOVAL_CUES)
        || CLOTHING_SLOT_PATTERN.test(lowerContext);
}

function sharesMeaningfulClothingWord(candidate: string, previous: string): boolean {
    const previousWords = new Set(clothingWords(previous));
    return clothingWords(candidate).some((word) => previousWords.has(word));
}

function looksLikeClothingSlot(value: string): boolean {
    const clean = cleanFragment(value);

    if (isPlaceholder(clean) || isInvalidStatusPart(clean, "npc")) {
        return false;
    }

    return sameText(clean, "Regular clothing")
        || CLOTHING_SLOT_PATTERN.test(clean)
        || CLOTHING_DAMAGE_WORDS.test(clean);
}

function clothingIsMentioned(candidate: string, context: string): boolean {
    const lowerContext = context.toLowerCase();
    return clothingWords(candidate).some((word) => containsAnyCue(lowerContext, [word]));
}

function clothingWords(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !["the", "and", "with", "regular", "clothing", "clothes", "outfit", "only", "fully", "mostly"].includes(word));
}

function npcIdentityKey(value: string): string {
    return cleanFragment(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function meaningfulDetailWords(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3 && !["visible", "still", "steady", "hand", "left", "right"].includes(word));
}

function meaningfulLocationTokens(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !LOCATION_STOP_WORDS.has(word));
}

function meaningfulPositionWords(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3 && !["near", "beside", "before", "behind", "through", "toward", "from"].includes(word));
}

function positionMeansWalking(value: string): boolean {
    return /\b(walk|walking|moving|stepping|approaching|running)\b/i.test(value);
}

function positionMeansStanding(value: string): boolean {
    return /\b(stand|standing|stood|stopped|halted)\b/i.test(value);
}

function positionMeansSeated(value: string): boolean {
    return /\b(sit|sitting|seated|sat)\b/i.test(value);
}

function positionMeansProne(value: string): boolean {
    return /\b(lying|prone|collapsed|kneeling|crouched)\b/i.test(value);
}

function containsAnyCue(value: string, cues: string[]): boolean {
    const lowerValue = value.toLowerCase();
    return cues.some((cue) => {
        const lowerCue = cue.toLowerCase();

        if (lowerCue.includes(" ")) {
            return lowerValue.includes(lowerCue);
        }

        return new RegExp(`\\b${escapeRegExp(lowerCue)}\\b`).test(lowerValue);
    });
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isGenericStatusPart(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();
    return lower === "standing"
        || lower === "standing in scene"
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
    const cleanNarrative = normalizeNarrativeFormat(narrative);
    const header = formatHeader(state);

    if (cleanNarrative.length === 0) {
        return header;
    }

    return `${header}\n\n${cleanNarrative}`;
}

function normalizeNarrativeFormat(narrative: string): string {
    const clean = normalizeLineEndings(narrative).trim();

    if (clean.length === 0) {
        return "";
    }

    return clean
        .split(/\n{2,}/)
        .map((block) => normalizeNarrativeBlock(block))
        .filter((block) => block.length > 0)
        .join("\n\n");
}

function normalizeNarrativeBlock(block: string): string {
    return block
        .split("\n")
        .map((line) => normalizeNarrativeLine(line))
        .filter((line) => line.length > 0)
        .join("\n");
}

function normalizeNarrativeLine(line: string): string {
    const clean = line.trim();

    if (clean.length === 0) {
        return "";
    }

    const dialogue = normalizeDialogueLine(clean);
    if (dialogue != null) {
        return dialogue;
    }

    const content = replaceInlineEmphasis(stripOuterSingleItalic(clean));
    return content.length === 0 ? "" : `*${content}*`;
}

function normalizeDialogueLine(line: string): string | null {
    const clean = stripOuterSingleItalic(line.trim());
    const parsed = parseDialogueLine(clean);

    if (parsed == null) {
        return null;
    }

    const speaker = parsed.bold ? `**${parsed.speaker}:**` : `${parsed.speaker}:`;
    const text = normalizeDialogueText(parsed.text);

    return text.length === 0 ? speaker : `${speaker} ${text}`;
}

function parseDialogueLine(line: string): {speaker: string; text: string; bold: boolean} | null {
    const boldColon = line.match(/^\*\*([^*\n:]{1,80}):\*\*\s*(.*)$/);
    if (boldColon != null && isValidSpeakerName(boldColon[1])) {
        return {speaker: cleanSpeakerName(boldColon[1]), text: boldColon[2].trim(), bold: true};
    }

    const boldNameColon = line.match(/^\*\*([^*\n:]{1,80})\*\*:\s*(.*)$/);
    if (boldNameColon != null && isValidSpeakerName(boldNameColon[1])) {
        return {speaker: cleanSpeakerName(boldNameColon[1]), text: boldNameColon[2].trim(), bold: true};
    }

    const plainColon = line.match(/^([^:"\n]{1,80}):\s*(.*)$/);
    if (plainColon != null && isValidSpeakerName(plainColon[1])) {
        const speaker = cleanSpeakerName(plainColon[1]);
        const text = plainColon[2].trim();

        if (isQuotedDialogueText(text) || isSimpleSpeakerName(speaker)) {
            return {speaker, text, bold: false};
        }
    }

    const missingColon = line.match(/^([A-Z][A-Za-z0-9'._ -]{0,60})\s+(".*)$/);
    if (missingColon != null && isValidSpeakerName(missingColon[1]) && !isCommonNarrativeSubject(missingColon[1])) {
        return {speaker: cleanSpeakerName(missingColon[1]), text: missingColon[2].trim(), bold: false};
    }

    return null;
}

function normalizeDialogueText(value: string): string {
    const clean = formatInlineNarrationInDialogue(replaceInlineEmphasis(stripOuterSingleItalic(value.trim())));

    if (clean.length === 0) {
        return "";
    }

    if (clean.startsWith("\"")) {
        return clean;
    }

    return `"${clean}"`;
}

function formatInlineNarrationInDialogue(value: string): string {
    return value.replace(/(^|[\s([{])'([^'\n]{2,180})'(?=$|[\s).,!?:;\]}])/g, (match, prefix: string, inner: string) => {
        const clean = inner.trim();
        return looksLikeInlineNarrationBeat(clean) ? `${prefix}*${clean}*` : match;
    });
}

function looksLikeInlineNarrationBeat(value: string): boolean {
    const clean = cleanFragment(value);
    const words = clean.split(/\s+/).filter(Boolean);

    if (words.length < 2) {
        return false;
    }

    return inlineNarrationStartsLikeBeat(clean) || inlineNarrationHasBeatAction(clean);
}

function inlineNarrationStartsLikeBeat(value: string): boolean {
    return /^(?:he|she|they|it|his|her|their|the|yume)\b/i.test(value)
        || /^[A-Z][A-Za-z'._-]*\b/.test(value);
}

function inlineNarrationHasBeatAction(value: string): boolean {
    return /\b(?:lip|lips|mouth|smile|smiles|smiled|grin|grins|grinned|eye|eyes|gaze|tail|tails|ear|ears|hand|hands|finger|fingers|arm|arms|shoulder|shoulders|head|face|cheek|cheeks|nod|nods|nodded|tilt|tilts|tilted|curve|curves|curved|glance|glances|glanced|look|looks|looked|turn|turns|turned|step|steps|stepped|breath|breathes|breathed|sigh|sighs|sighed|voice|posture)\b/i.test(value);
}

function isQuotedDialogueText(value: string): boolean {
    return value.trim().startsWith("\"");
}

function isSimpleSpeakerName(value: string): boolean {
    const clean = cleanSpeakerName(value);

    return clean === "{{char}}" || clean === "{{user}}" || !/\s/.test(clean);
}

function stripOuterSingleItalic(value: string): string {
    const clean = value.trim();

    if (clean.startsWith("*") && clean.endsWith("*") && !clean.startsWith("**") && !clean.endsWith("**")) {
        return clean.slice(1, -1).trim();
    }

    return clean;
}

function replaceInlineEmphasis(value: string): string {
    return value.replace(/(^|[^*])\*([^*\n]{1,80})\*(?!\*)/g, (_match, prefix: string, inner: string) => {
        return `${prefix}'${inner.trim()}'`;
    });
}

function cleanSpeakerName(value: string): string {
    return cleanFragment(value).replace(/:$/, "");
}

function isValidSpeakerName(value: string): boolean {
    const clean = cleanSpeakerName(value);

    if (clean.length === 0 || clean.length > 80 || /[.!?]/.test(clean)) {
        return false;
    }

    return clean === "{{char}}"
        || clean === "{{user}}"
        || /^[A-Z][A-Za-z0-9'._ -]*(?:\s+\{\{user\}\})?$/.test(clean);
}

function isCommonNarrativeSubject(value: string): boolean {
    return /^(he|she|they|it|you|i|we|the|a|an|his|her|their)$/i.test(cleanSpeakerName(value));
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

function walletChangeIsSupported(candidate: string, previousWallet: string, context: string): boolean {
    if (sameText(candidate, previousWallet)) {
        return true;
    }

    const lowerContext = context.toLowerCase();
    const hasTransactionCue = containsAnyCue(lowerContext, WALLET_TRANSACTION_CUES);
    const hasMoneyCue = containsAnyCue(lowerContext, WALLET_MONEY_CUES) || WALLET_AMOUNT_PATTERN.test(context);

    return hasTransactionCue && hasMoneyCue;
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
