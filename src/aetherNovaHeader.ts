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
    npcMemory: NpcMemoryStore;
    pendingNpcDebugQuery: string | null;
    pendingNpcMemoryCommand: string | null;
}

export interface NpcMemoryEntry {
    name: string;
    roleTitle: string;
    race: string;
    relationship: string;
    behavior: string;
    physicalExtra: string;
    onlyKnows: string[];
}

export type NpcMemoryStore = Record<string, NpcMemoryEntry>;

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
    systemMessage: string | null;
}

export interface NpcMemoryCommandResult {
    state: AetherNovaMessageState;
    cleanedMessage: string;
    systemMessage: string | null;
    applied: boolean;
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

interface NarrativeFormatState {
    npcNames: string[];
    recentSpeaker: string | null;
}

interface NormalizeStatusOptions {
    sceneChanged?: boolean;
    trustRawStatus?: boolean;
}

const CLOCK_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const TIME_OF_DAYS: TimeOfDay[] = ["Morning", "Afternoon", "Evening", "Night"];
const HEADER_DIVIDER = "***";
const NPC_MEMORY_COMMAND_PATTERN = /npc[\s_-]*memory\s+((?:delete|remove|clearfacts|clear|set|update|add\s+fact|addfact|relation|show)\s*:?\s*(?:[^|.\n]+(?:\s*\|\s*[^|.\n]+)*))/gi;

const DEFAULT_STATE: AetherNovaMessageState = {
    location: "Unknown Region - Current Place - Active Area",
    timeOfDay: "Morning",
    clock: "09:00",
    you: "Unknown - Human (Regular clothing; Standing; hands visible)",
    npc: "None",
    thread: "None",
    wallet: "0G ; 0S ; 0C",
    walletInitialized: false,
    npcMemory: {},
    pendingNpcDebugQuery: null,
    pendingNpcMemoryCommand: null,
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

const THREAD_INFERENCE_CUES = [
    "mission",
    "quest",
    "objective",
    "task",
    "contract",
    "order",
    "orders",
    "ordered",
    "appointment",
    "meeting",
    "audience",
    "promise",
    "promises",
    "promised",
    "vow",
    "vows",
    "vowed",
    "deadline",
    "meet",
    "visit",
    "speak",
    "talk",
    "ask",
    "information",
    "info",
    "intel",
    "lead",
    "clue",
    "whereabouts",
    "location",
    "hunt",
    "hunting",
    "travel goal",
    "major obstacle",
    "unresolved conflict",
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
    "above",
    "below",
    "beneath",
    "under",
    "over",
    "atop",
    "upon",
    "against",
    "beyond",
    "past",
    "around",
    "inside",
    "outside",
    "alongside",
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
const BODY_RACIAL_DETAIL_PATTERN = /\b(eye|eyes|gaze|tail|tails|ear|ears|wing|wings|horn|horns|halo|fang|fangs|claw|claws|scale|scales|hand|hands|palm|palms|finger|fingers|arm|arms|elbow|elbows|head|face|cheek|cheeks|forehead|chin|mouth|nose|hair|shoulder|shoulders|back|body|torso|waist|hip|hips|knee|knees|posture|voice|weapon|sword|blade|staff)\b/i;
const WALLET_AMOUNT_PATTERN = /\b\d+\s*(?:g|gold|s|silver|c|copper)\b/i;
const VAGUE_STATUS_PATTERN = /\b(mood|emotion|feeling|feelings|thought|thoughts|status|role|happy|sad|angry|calm|nervous|worried|confused|curious|suspicious|jealous|afraid|scared|determined|focused)\b/i;
const USER_FORBIDDEN_DETAIL_PATTERN = /\b(thinking|thinks|feeling|feels|expression|expressions|smiling|smiles|frowning|grinning|says|said|speaks|asks|answers|chooses|choosing|choice|decides|attacks|attack|transforms|transforming|consents|consent|refuses|dialogue)\b/i;
const MINOR_THREAD_PATTERN = /\b(normal topic|normal topics|casual question|casual questions|temporary mood|small suspicion|minor jealousy|minor tension|small talk)\b/i;
const TERMINAL_THREAD_STATUS = "(?:resolved|complete|completed|done|finished|concluded|closed|settled|refused|declined|rejected|failed|abandoned|expired|irrelevant|cancelled|canceled)";
const TERMINAL_THREAD_STATUS_TAG_PATTERN = new RegExp(`\\([^)]*\\b${TERMINAL_THREAD_STATUS}\\b[^)]*\\)`, "i");
const TERMINAL_THREAD_END_PATTERN = new RegExp(`\\b(?:resolved|complete|completed|done|finished|concluded|settled|refused|declined|rejected|failed|abandoned|expired|irrelevant|cancelled|canceled)\\b\\s*$`, "i");
const TRANSIENT_YOU_DETAIL_PATTERN = /\b(holding|gripping|grasping|clutching|touching|stroking|caressing|petting|rubbing|tilted|tilting|cocked|angled|resting|leaning|pressing|bracing|supporting|pushing|pulling|tugging|drawing|lifting|lowering|cleaning|wiping|washing|brushing|drying|patting|releasing|released|release|placing|placed|setting|set down|sliding|slid|hand on|hands on|arm around|arms around|head on|against|upon|on top of)\b/i;

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
    "eye",
    "eyes",
    "gaze",
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
    "hip",
    "hips",
    "knee",
    "knees",
    "tail",
    "tails",
    "ear",
    "ears",
    "wing",
    "wings",
    "horn",
    "horns",
    "halo",
    "fang",
    "fangs",
    "claw",
    "claws",
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
    "release",
    "releases",
    "released",
    "releasing",
    "place",
    "places",
    "placed",
    "placing",
    "set down",
    "sets down",
    "setting down",
    "slide",
    "slides",
    "slid",
    "sliding",
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
    "lap",
    "thigh",
    "thighs",
    "knee",
    "knees",
    "waist",
    "hip",
    "hips",
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

const THREAD_SUBGOAL_TARGET_STOP_WORDS = new Set([
    ...THREAD_STOP_WORDS,
    "seeking",
    "seek",
    "find",
    "finding",
    "market",
    "intel",
    "information",
    "info",
    "lead",
    "leads",
    "clue",
    "clues",
    "today",
    "ongoing",
    "pending",
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
    "give",
    "gives",
    "gave",
    "put",
    "puts",
    "placed",
    "place",
    "set down",
    "sets down",
    "laid down",
    "slide",
    "slides",
    "slid",
    "push",
    "pushes",
    "pushed",
    "offer",
    "offers",
    "offered",
    "bayar",
    "membayar",
    "dibayar",
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

const WALLET_PAYMENT_ACTION_CUES = [
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
    "hands over",
    "handed over",
    "give",
    "gives",
    "gave",
    "put",
    "puts",
    "placed",
    "place",
    "set down",
    "sets down",
    "laid down",
    "slide",
    "slides",
    "slid",
    "push",
    "pushes",
    "pushed",
    "bribe",
    "bribes",
    "bribed",
    "tip",
    "tips",
    "tipped",
    "bayar",
    "membayar",
];

const WALLET_INCOME_ACTION_CUES = [
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
    "give",
    "gives",
    "gave",
    "hand",
    "hands",
    "handed",
    "pay",
    "pays",
    "paid",
];

const NUMBER_WORDS: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
};

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
    const npc = normalizeNpcLine(raw.npc ?? "", fallback.npc);
    const npcMemory = updateNpcMemory(coerceNpcMemory(raw.npcMemory, fallback.npcMemory), npc, fallback.location);

    return {
        location: normalizeLocation(raw.location ?? "", fallback.location),
        timeOfDay: timeOfDayForClock(clock),
        clock,
        you: normalizeYouLine(raw.you ?? "", fallback.you, "", {trustRawStatus: true}),
        npc,
        thread: normalizeThreadLine(raw.thread ?? "", fallback.thread, ""),
        wallet: walletState.value,
        walletInitialized: walletState.initialized,
        npcMemory,
        pendingNpcDebugQuery: normalizePendingNpcDebugQuery(raw.pendingNpcDebugQuery),
        pendingNpcMemoryCommand: normalizePendingNpcMemoryCommand(raw.pendingNpcMemoryCommand),
    };
}

export function prepareAetherNovaStateForPrompt(
    state: AetherNovaMessageState,
    userMessage: string,
): AetherNovaMessageState {
    return {
        ...state,
        npcMemory: updateNpcMemory(state.npcMemory, state.npc, state.location),
        pendingNpcDebugQuery: debugNpcQuery(userMessage),
        pendingNpcMemoryCommand: state.pendingNpcMemoryCommand,
    };
}

export function buildStageDirections(state: AetherNovaMessageState, userMessage: string = ""): string {
    const effectiveState: AetherNovaMessageState = {
        ...state,
        pendingNpcDebugQuery: state.pendingNpcDebugQuery ?? debugNpcQuery(userMessage),
    };
    const directions = [
        "Maintain Aether Nova header format. Start with exactly five bold header lines followed by *** before narration.",
        `Location: ${effectiveState.location}`,
        `Time: ${effectiveState.timeOfDay} | ${effectiveState.clock}`,
        `You: ${effectiveState.you}`,
        `NPC: ${effectiveState.npc}`,
        `Thread: ${effectiveState.thread}`,
        `Wallet: ${effectiveState.wallet}`,
        "Status format: Clothes/disguise; Position; optional body/racial detail. Keep clothes/position from last state unless the scene clearly changes. Use Thread items separated by \" ; \". Wallet changes only with clear in-story transaction/reward/loss evidence.",
    ];
    const npcMemoryContext = buildNpcMemoryDirections(effectiveState, userMessage);

    if (npcMemoryContext.length > 0) {
        directions.push(npcMemoryContext);
    }

    const debugContext = buildNpcDebugDirections(effectiveState.pendingNpcDebugQuery, effectiveState.npcMemory);
    if (debugContext.length > 0) {
        directions.push(debugContext);
    }

    return directions.join("\n");
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
        npcMemory: previousState.npcMemory,
        pendingNpcDebugQuery: null,
        pendingNpcMemoryCommand: previousState.pendingNpcMemoryCommand,
    };
    state.npcMemory = updateNpcMemory(previousState.npcMemory, state.npc, `${state.location}\n${correctionContext}`);
    const debugQuery = previousState.pendingNpcDebugQuery ?? debugNpcQuery(context);
    const debugMessage = buildNpcDebugFooter(debugQuery, state.npcMemory);

    return {
        content: formatResponse(state, extracted.narrative),
        state,
        systemMessage: debugMessage.length > 0 ? debugMessage : null,
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

function coerceNpcMemory(rawMemory: unknown, fallbackMemory: NpcMemoryStore = {}): NpcMemoryStore {
    const next: NpcMemoryStore = {};

    for (const entry of Object.values(fallbackMemory)) {
        const normalized = normalizeNpcMemoryEntry(entry);
        if (normalized != null) {
            next[npcMemoryKey(normalized.name)] = normalized;
        }
    }

    if (rawMemory == null || typeof rawMemory !== "object") {
        return next;
    }

    for (const value of Object.values(rawMemory as Record<string, unknown>)) {
        const normalized = normalizeNpcMemoryEntry(value);
        if (normalized != null) {
            next[npcMemoryKey(normalized.name)] = normalized;
        }
    }

    return next;
}

function normalizeNpcMemoryEntry(value: unknown): NpcMemoryEntry | null {
    if (value == null || typeof value !== "object") {
        return null;
    }

    const raw = value as Partial<NpcMemoryEntry> & {racial?: string; knownFacts?: string[]};
    const name = typeof raw.name === "string" ? cleanNpcMemoryName(raw.name) : "";

    if (name.length === 0) {
        return null;
    }

    const onlyKnows = Array.isArray(raw.onlyKnows)
        ? raw.onlyKnows.filter((fact): fact is string => typeof fact === "string").map(cleanFactText).filter(Boolean).slice(0, 8)
        : Array.isArray(raw.knownFacts)
            ? raw.knownFacts.filter((fact): fact is string => typeof fact === "string").map(cleanFactText).filter(Boolean).slice(0, 8)
            : [];

    return {
        name,
        roleTitle: cleanMemoryField(raw.roleTitle, "Unknown role/title"),
        race: cleanMemoryField(raw.race || raw.racial, "Unknown"),
        relationship: cleanMemoryField(raw.relationship, "Unknown"),
        behavior: cleanMemoryField(raw.behavior, "Unknown"),
        physicalExtra: cleanMemoryField(raw.physicalExtra, "none"),
        onlyKnows,
    };
}

function buildNpcMemoryDirections(state: AetherNovaMessageState, userMessage: string): string {
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
        lines.push("NPC Memory Context: Include full memory for present NPCs as in-story knowledge:");
        lines.push("Present NPCs (full memory):");
        for (const entry of presentEntries.slice(0, 4)) {
            lines.push(`- ${formatNpcMemoryForPrompt(entry, true)}`);
        }
    }

    if (mentionedEntries.length > 0) {
        lines.push("Mentioned-only NPCs (identity only — do not inject Relationship, Behavior, or OnlyKnows unless they enter the scene/header):");
        for (const entry of mentionedEntries.slice(0, 4)) {
            lines.push(`- ${formatNpcMemoryForPrompt(entry, false)}`);
        }
    }

    return lines.join("\n");
}

function updateNpcMemory(previousMemory: NpcMemoryStore, npcLine: string, context: string): NpcMemoryStore {
    const next = coerceNpcMemory(previousMemory);
    const entries = npcHeaderMemoryEntries(npcLine);

    for (const headerEntry of entries) {
        const existingKey = resolveNpcMemoryKey(headerEntry.name, next);
        const previous = existingKey == null ? null : next[existingKey];
        const name = completeNpcMemoryName(headerEntry.name, previous, next);
        const key = npcMemoryKey(name);
        const roleTitle = inferNpcRoleTitle(headerEntry, previous, context);
        const race = cleanMemoryField(headerEntry.race || previous?.race, "Unknown");
        const physicalExtra = inferNpcPhysicalExtra(headerEntry, previous, context);
        const relationship = inferNpcRelationship(headerEntry, previous, context);
        const behavior = inferNpcBehavior(context) || previous?.behavior || "Unknown";
        const onlyKnows = mergeKnownFacts(previous?.onlyKnows ?? [], inferNpcOnlyKnows(headerEntry, context));

        if (existingKey != null && existingKey !== key) {
            delete next[existingKey];
        }

        next[key] = {
            name,
            roleTitle,
            race,
            relationship,
            behavior,
            physicalExtra,
            onlyKnows,
        };
    }

    return next;
}

interface NpcHeaderMemoryEntry {
    name: string;
    firstName: string;
    titleFromName: string;
    race: string;
    status: string;
}

function npcHeaderMemoryEntries(npcLine: string): NpcHeaderMemoryEntry[] {
    if (isNoNpcValue(npcLine)) {
        return [];
    }

    return splitTopLevel(npcLine, ",")
        .map((entry) => {
            const parsed = parseIdentityStatus(entry);
            const identity = splitIdentity(parsed.identity, "Unknown NPC", "Human");
            const titleName = splitNpcTitleFromName(identity.left);
            const name = cleanNpcMemoryName(titleName.name);

            if (name.length === 0 || /^unknown npc$/i.test(name)) {
                return null;
            }

            return {
                name,
                firstName: firstNameOf(name),
                titleFromName: titleName.title,
                race: cleanMemoryField(identity.right, "Unknown racial"),
                status: cleanFragment(parsed.status),
            };
        })
        .filter((entry): entry is NpcHeaderMemoryEntry => entry != null);
}

function npcMemoryKeysFromHeader(npcLine: string, memory: NpcMemoryStore): string[] {
    return npcHeaderMemoryEntries(npcLine)
        .map((entry) => resolveNpcMemoryKey(entry.name, memory))
        .filter((key): key is string => key != null);
}

function npcMemoryKeysMentionedInText(text: string, memory: NpcMemoryStore): string[] {
    const keys: string[] = [];

    for (const [key, entry] of Object.entries(memory)) {
        if (npcMemoryEntryMentioned(entry, text)) {
            keys.push(key);
        }
    }

    return keys;
}

function npcMemoryEntryMentioned(entry: NpcMemoryEntry, text: string): boolean {
    const clean = normalizeLineEndings(text);
    const names = [entry.name, firstNameOf(entry.name)].filter((name) => name.length > 0);
    return names.some((name) => new RegExp(`\\b${npcNameRegexSource(name)}\\b`, "i").test(clean));
}

function formatNpcMemoryForPrompt(entry: NpcMemoryEntry, includeFull: boolean): string {
    const parts = [
        `Name: ${entry.name}`,
        `Role/Title: ${entry.roleTitle}`,
        `Race: ${entry.race}`,
        `Physical Extra: ${entry.physicalExtra}`,
    ];

    if (includeFull) {
        parts.push(`Relationship with {{user}}: ${entry.relationship}`);
        parts.push(`Behavior toward {{user}}: ${entry.behavior}`);
        parts.push(`OnlyKnows: ${entry.onlyKnows.length > 0 ? entry.onlyKnows.join(" ; ") : "None recorded"}`);
    }

    return parts.join(" | ");
}

function buildNpcDebugDirections(query: string | null, memory: NpcMemoryStore): string {
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

function buildNpcDebugFooter(query: string | null, memory: NpcMemoryStore): string {
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
        `Relationship with {{user}}: ${entry.relationship}`,
        `Behavior toward {{user}}: ${entry.behavior}`,
        `OnlyKnows: ${entry.onlyKnows.length > 0 ? entry.onlyKnows.join(" ; ") : "None recorded"}`,
    ].join("\n");
}

export function debugNpcQuery(userMessage: string): string | null {
    const match = userMessage.match(/[\[【]\s*debug\s*:\s*npc\s+([^\]】]+)[\]】]/i);
    return match == null ? null : cleanFragment(match[1]);
}

export function applyNpcMemoryCommands(
    state: AetherNovaMessageState,
    userMessage: string,
): NpcMemoryCommandResult {
    const commands = parseNpcMemoryCommands(userMessage);

    if (commands.length === 0) {
        return {
            state,
            cleanedMessage: userMessage,
            systemMessage: null,
            applied: false,
        };
    }

    let npcMemory = coerceNpcMemory(state.npcMemory);
    const messages: string[] = [];

    for (const command of commands) {
        const result = applyNpcMemoryCommand(npcMemory, command);
        npcMemory = result.memory;
        messages.push(result.message);
    }

    return {
        state: {
            ...state,
            npcMemory,
        },
        cleanedMessage: stripNpcMemoryCommands(userMessage),
        systemMessage: messages.length > 0 ? messages.join("\n") : null,
        applied: true,
    };
}

interface NpcMemoryCommand {
    raw: string;
    action: "delete" | "set" | "clearfacts" | "addfact" | "relation" | "show";
    target: string;
    updates: Partial<NpcMemoryCommandUpdates>;
}

interface NpcMemoryCommandUpdates {
    name: string;
    roleTitle: string;
    race: string;
    relationship: string;
    behavior: string;
    physicalExtra: string;
    onlyKnows: string[];
    addFacts: string[];
}

function parseNpcMemoryCommands(userMessage: string): NpcMemoryCommand[] {
    return Array.from(userMessage.matchAll(NPC_MEMORY_COMMAND_PATTERN))
        .map((match) => parseNpcMemoryCommandBody(match[1]))
        .filter((command): command is NpcMemoryCommand => command != null);
}

function parseNpcMemoryCommandBody(rawBody: string): NpcMemoryCommand | null {
    const segments = splitTopLevel(rawBody, "|").map(cleanFragment).filter(Boolean);
    const head = segments.shift() ?? "";
    const actionMatch = /^(delete|remove|clearfacts|clear\s+facts|clear|set|update|add\s+fact|addfact|relation|show)\s*:?\s*(.*)$/i.exec(head);

    if (actionMatch == null) {
        return null;
    }

    const actionWord = actionMatch[1].toLowerCase().replace(/\s+/g, "");
    let action: NpcMemoryCommand["action"];

    if (actionWord === "delete" || actionWord === "remove" || actionWord === "clear") {
        action = "delete";
    } else if (actionWord === "clearfacts") {
        action = "clearfacts";
    } else if (actionWord === "addfact") {
        action = "addfact";
    } else if (actionWord === "relation") {
        action = "relation";
    } else if (actionWord === "show") {
        action = "show";
    } else {
        action = "set";
    }

    const target = cleanNpcMemoryName(actionMatch[2]);

    if (target.length === 0 && action !== "show") {
        return null;
    }

    return {
        raw: cleanFragment(rawBody),
        action,
        target,
        updates: parseNpcMemoryCommandUpdates(segments),
    };
}

function parseNpcMemoryCommandUpdates(segments: string[]): Partial<NpcMemoryCommandUpdates> {
    const updates: Partial<NpcMemoryCommandUpdates> = {};
    const addFacts: string[] = [];

    for (const segment of segments) {
        const match = /^([A-Za-z ]+)\s*(?:=|:)\s*(.+)$/i.exec(segment);
        if (match == null) {
            continue;
        }

        const key = match[1].toLowerCase().replace(/\s+/g, "");
        const value = cleanFragment(match[2]);
        if (value.length === 0) {
            continue;
        }

        if (key === "name" || key === "fullname" || key === "fullnpcname") {
            updates.name = cleanNpcMemoryName(value);
        } else if (key === "role" || key === "title" || key === "roletitle") {
            updates.roleTitle = cleanMemoryField(value, "Unknown role/title");
        } else if (key === "race" || key === "racial") {
            updates.race = cleanMemoryField(value, "Unknown");
        } else if (key === "relationship" || key === "relation") {
            updates.relationship = cleanMemoryField(value, "Unknown");
        } else if (key === "behavior" || key === "behaviour") {
            updates.behavior = cleanMemoryField(value, "Unknown");
        } else if (key === "physical" || key === "physicalextra") {
            updates.physicalExtra = cleanMemoryField(value, "none");
        } else if (key === "onlyknows" || key === "knownfacts" || key === "facts") {
            updates.onlyKnows = splitNpcMemoryFacts(value);
        } else if (key === "fact" || key === "knownfact" || key === "addfact") {
            addFacts.push(...splitNpcMemoryFacts(value));
        }
    }

    if (addFacts.length > 0) {
        updates.addFacts = addFacts;
    }

    return updates;
}

function applyNpcMemoryCommand(memory: NpcMemoryStore, command: NpcMemoryCommand): {memory: NpcMemoryStore; message: string} {
    const next = coerceNpcMemory(memory);
    const key = resolveNpcMemoryKey(command.target, next);

    if (command.action === "delete") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        const deletedName = next[key]?.name ?? command.target;
        delete next[key];
        return {memory: next, message: `NPC memory command: deleted ${deletedName}.`};
    }

    if (command.action === "clearfacts") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        next[key] = {
            ...next[key],
            onlyKnows: [],
        };
        return {memory: next, message: `NPC memory command: cleared OnlyKnows for ${next[key].name}.`};
    }

    if (command.action === "addfact") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        next[key] = {
            ...next[key],
            onlyKnows: mergeKnownFacts(next[key].onlyKnows, command.updates.addFacts ?? []),
        };
        return {memory: next, message: `NPC memory command: added fact(s) to ${next[key].name}.`};
    }

    if (command.action === "relation") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        next[key] = {
            ...next[key],
            relationship: cleanMemoryField(command.updates.relationship, "Unknown"),
        };
        return {memory: next, message: `NPC memory command: updated relationship for ${next[key].name}.`};
    }

    if (command.action === "show") {
        const exists = key == null ? null : next[key];
        if (exists == null) {
            return {memory: next, message: `[system: npcMemory]\nNo stored NPC memory found for ${command.target}.`};
        }
        return {
            memory: next,
            message: [
                `[system: npcMemory]`,
                `Name: ${exists.name}`,
                `Role/Title: ${exists.roleTitle}`,
                `Race: ${exists.race}`,
                `Physical Extra: ${exists.physicalExtra}`,
                `Relationship with {{user}}: ${exists.relationship}`,
                `Behavior toward {{user}}: ${exists.behavior}`,
                `OnlyKnows: ${exists.onlyKnows.length > 0 ? exists.onlyKnows.join(" ; ") : "None recorded"}`,
            ].join("\n"),
        };
    }

    const previous = key == null ? null : next[key];
    const name = completeNpcMemoryName(command.updates.name ?? command.target, previous, next);
    const nextKey = npcMemoryKey(name);
    const entry: NpcMemoryEntry = {
        name,
        roleTitle: cleanMemoryField(command.updates.roleTitle ?? previous?.roleTitle, "Unknown role/title"),
        race: cleanMemoryField(command.updates.race ?? previous?.race, "Unknown"),
        relationship: cleanMemoryField(command.updates.relationship ?? previous?.relationship, "Unknown"),
        behavior: cleanMemoryField(command.updates.behavior ?? previous?.behavior, "Unknown"),
        physicalExtra: cleanMemoryField(command.updates.physicalExtra ?? previous?.physicalExtra, "none"),
        onlyKnows: command.updates.onlyKnows != null
            ? mergeKnownFacts([], command.updates.onlyKnows)
            : mergeKnownFacts(previous?.onlyKnows ?? [], command.updates.addFacts ?? []),
    };

    if (key != null && key !== nextKey) {
        delete next[key];
    }

    next[nextKey] = entry;

    return {
        memory: next,
        message: `NPC memory command: saved ${entry.name}.`,
    };
}

function splitNpcMemoryFacts(value: string): string[] {
    return value
        .split(/\s*;\s*/g)
        .map(cleanFactText)
        .filter(Boolean);
}

function stripNpcMemoryCommands(userMessage: string): string {
    return normalizeLineEndings(userMessage)
        .replace(NPC_MEMORY_COMMAND_PATTERN, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function normalizePendingNpcDebugQuery(value: unknown): string | null {
    return typeof value === "string" && cleanFragment(value).length > 0 ? cleanFragment(value) : null;
}

function normalizePendingNpcMemoryCommand(value: unknown): string | null {
    return typeof value === "string" && parseNpcMemoryCommands(value).length > 0 ? value : null;
}

function splitNpcTitleFromName(value: string): {name: string; title: string} {
    const clean = cleanNpcMemoryName(value);
    const match = clean.match(/^(King|Queen|Prince|Princess|Emperor|Empress|Lord|Lady|Duke|Duchess|Sir|Captain|Commander|General|Minister|Priest|Priestess|Knight|Guard|Merchant|Broker|Informant|Innkeeper)\s+(.+)$/i);

    if (match == null) {
        return {name: clean, title: ""};
    }

    return {
        name: cleanNpcMemoryName(match[2]),
        title: titleCase(match[1]),
    };
}

function inferNpcRoleTitle(headerEntry: NpcHeaderMemoryEntry, previous: NpcMemoryEntry | null, context: string): string {
    const nearby = nearNpcContext(headerEntry.name, context);
    const direct = inferRoleTitleFromContext(headerEntry.name, `${headerEntry.status}\n${nearby}`) || headerEntry.titleFromName;

    return cleanMemoryField(direct || previous?.roleTitle, "Unknown role/title");
}

function inferRoleTitleFromContext(name: string, context: string): string {
    const nameSource = npcNameRegexSource(name);
    const firstNameSource = npcNameRegexSource(firstNameOf(name));
    const titleSource = "(King|Queen|Prince|Princess|Emperor|Empress|Lord|Lady|Duke|Duchess|Captain|Commander|General|Minister|Priest|Priestess|Knight|Guard|Merchant|Broker|Informant|Innkeeper|Market\\s+broker|Information\\s+broker|Relic\\s+broker|Artifact\\s+broker)";
    const before = new RegExp(`\\b${titleSource}(?:\\s+of\\s+([A-Z][A-Za-z'._ -]{1,40}))?\\s+(?:${nameSource}|${firstNameSource})\\b`, "i").exec(context);

    if (before != null) {
        return before[2] == null ? normalizeRoleTitle(before[1]) : `${normalizeRoleTitle(before[1])} of ${cleanFragment(before[2])}`;
    }

    const after = new RegExp(`\\b(?:${nameSource}|${firstNameSource})\\b\\s*(?:,|[-—–]|\\bis\\b|\\bwas\\b|\\bas\\b|\\bthe\\b|\\ban?\\b|\\bknown\\s+as\\b|\\bcalled\\b|\\bworks\\s+as\\b|\\bserves\\s+as\\b)\\s*(?:the\\s+|an?\\s+)?${titleSource}(?:\\s+of\\s+([A-Z][A-Za-z'._ -]{1,40}))?\\b`, "i").exec(context);
    if (after != null) {
        return after[2] == null ? normalizeRoleTitle(after[1]) : `${normalizeRoleTitle(after[1])} of ${cleanFragment(after[2])}`;
    }

    const marketBroker = new RegExp(`\\b(?:${nameSource}|${firstNameSource})\\b[^.!?\\n]{0,60}\\b(?:market|information|relic|artifact|scroll)\\s+broker\\b`, "i").exec(context);
    if (marketBroker != null) {
        return "Market broker";
    }

    return "";
}

function normalizeRoleTitle(value: string): string {
    return cleanFragment(value)
        .toLowerCase()
        .replace(/\b[a-z]/g, (char) => char.toUpperCase())
        .replace(/\bBroker\b/g, "broker");
}

function inferNpcPhysicalExtra(headerEntry: NpcHeaderMemoryEntry, previous: NpcMemoryEntry | null, context: string): string {
    const searchable = `${headerEntry.status}\n${nearNpcContext(headerEntry.name, context)}`;
    const details: string[] = [];

    if (/\b(?:nine[-\s]?tails?|nine[-\s]?tailed|ekor sembilan)\b/i.test(searchable)) {
        details.push("nine tails");
    } else if (/\btails?\b/i.test(searchable) && /\bkitsune\b/i.test(headerEntry.race)) {
        details.push("tails visible");
    }

    if (/\bears?\b/i.test(searchable) && /\bkitsune|catkin\b/i.test(headerEntry.race)) {
        details.push("animal ears");
    }

    const merged = mergeUniqueList(details, 4);
    return merged.length > 0 ? merged.join("; ") : previous?.physicalExtra || "none";
}

function inferNpcRelationship(headerEntry: NpcHeaderMemoryEntry, previous: NpcMemoryEntry | null, context: string): string {
    const searchable = nearNpcContext(headerEntry.name, context).toLowerCase();
    const labels: string[] = [];

    // Romantic/Spousal
    if (/\b(husband|wife|spouse)\b/.test(searchable) && /\b(married|marry|marriage)\b/i.test(searchable)) {
        if (/\bhusband\b/.test(searchable)) labels.push("Husband");
        else if (/\bwife\b/.test(searchable)) labels.push("Wife");
        else labels.push("Spouse");
    }
    if (/\b(fiancé|fiancée|betrothed|engaged)\b/.test(searchable) && labels.length === 0) {
        labels.push("Fiancé");
    }
    if (/\b(lover|beloved|paramour)\b/.test(searchable) && labels.length === 0) {
        labels.push("Lover");
    }
    if (/\b(boyfriend|girlfriend)\b/.test(searchable) && labels.length === 0) {
        labels.push("Lover");
    }

    // Family — only if explicitly linked to {{user}} (possessive/relational)
    // Exclude "want to become" patterns (e.g. "make me a mother" ≠ Parent)
    const becomingFamily = /\b(?:jadikan|menjadi|ingin\s+(?:menjadi|jadi)|make\s+(?:me|us|her|him)\s+(?:a\s+)?|wants?\s+to\s+be)\b/i;
    if (!becomingFamily.test(searchable) && (
        /\{\{user\}\}\s*(?:'s|s|)\s*(?:mother|father|parent|mom|dad|mama|papa)\b/i.test(searchable) ||
        /\b(?:mother|father|parent|mom|dad|mama|papa)\s+(?:of|to)\s+\{\{user\}\}\b/i.test(searchable) ||
        /\b(?:ibumu|ayahmu|mamahmu|papahmu)\b/i.test(searchable)
    )) {
        labels.push("Parent");
    }
    if (!becomingFamily.test(searchable) && (
        /\{\{user\}\}\s*(?:'s|s|)\s*(?:daughter|son|child|kid)\b/i.test(searchable) ||
        /\b(?:daughter|son|child|kid)\s+(?:of|to)\s+\{\{user\}\}\b/i.test(searchable) ||
        /\b(?:putrimu|putramu|anakmu)\b/i.test(searchable)
    )) {
        labels.push("Child");
    }
    if (
        /\{\{user\}\}\s*(?:'s|s|)\s*(?:brother|sister|sibling)\b/i.test(searchable) ||
        /\b(?:brother|sister|sibling)\s+(?:of|to)\s+\{\{user\}\}\b/i.test(searchable) ||
        /\b(?:kakakmu|adikmu|saudaramu)\b/i.test(searchable)
    ) {
        labels.push("Sibling");
    }

    // Close bonds
    if (/\b(best friend|bestfriend)\b/.test(searchable)) {
        labels.push("Best Friend");
    }
    if (/\b(friend|companion|comrade|buddy)\b/.test(searchable) && labels.length === 0) {
        labels.push("Friend");
    }
    if (/\b(ally|allied)\b/.test(searchable) && labels.length === 0) {
        labels.push("Ally");
    }

    // Adversarial
    if (/\b(sworn enemy|nemesis|archrival|arch-enemy)\b/.test(searchable)) {
        labels.push("Sworn Enemy");
    }
    if (/\b(enemy|foe)\b/.test(searchable) && labels.length === 0) {
        labels.push("Enemy");
    }
    if (/\b(rival)\b/.test(searchable) && labels.length === 0) {
        labels.push("Rival");
    }

    // Hierarchical
    if (/\b(master|mistress|owner)\b/.test(searchable)) {
        labels.push("Master");
    }
    if (/\b(servant|slave|maid|butler|retainer)\b/.test(searchable)) {
        labels.push("Servant");
    }
    if (/\b(mentor|teacher|instructor|sensei|tutor)\b/.test(searchable)) {
        labels.push("Mentor");
    }
    if (/\b(student|apprentice|pupil|protégé|protege)\b/.test(searchable)) {
        labels.push("Student");
    }
    if (/\b(guardian|protector)\b/.test(searchable)) {
        labels.push("Guardian");
    }

    // Distant
    if (/\b(acquaintance)\b/.test(searchable)) {
        labels.push("Acquaintance");
    }
    if (/\b(stranger)\b/.test(searchable)) {
        labels.push("Stranger");
    }

    // Professional
    if (/\b(business partner|colleague|associate)\b/.test(searchable)) {
        labels.push("Associate");
    }

    return labels.length > 0 ? mergeUniqueList(labels, 2).join(" / ") : cleanMemoryField(previous?.relationship, "Unknown");
}

function inferNpcBehavior(context: string): string {
    const searchable = context.toLowerCase();
    const labels: string[] = [];

    if (/\b(arrogant|aloof|condescending|cold|proud)\b/.test(searchable)) {
        labels.push("arrogant");
    }
    if (/\b(suspicious|wary|guarded|distrust|cautious)\b/.test(searchable)) {
        labels.push("suspicious");
    }
    if (/\b(protective|guarding|defending|defensive)\b/.test(searchable)) {
        labels.push("protective");
    }
    if (/\b(possessive|jealous|clinging)\b/.test(searchable)) {
        labels.push("possessive");
    }
    if (/\b(playful|teasing|mischievous|cheerful)\b/.test(searchable)) {
        labels.push("playful");
    }
    if (/\b(formal|polite|court|protocol|respectful)\b/.test(searchable)) {
        labels.push("formal");
    }
    if (/\b(cold|distant|aloof|unfriendly)\b/.test(searchable)) {
        labels.push("cold");
    }
    if (/\b(loyal|devoted|faithful|steadfast)\b/.test(searchable)) {
        labels.push("loyal");
    }
    if (/\b(fearful|afraid|scared|nervous|anxious)\b/.test(searchable)) {
        labels.push("fearful");
    }
    if (/\b(friendly|trust|trusted|kind|cordial)\b/.test(searchable)) {
        labels.push("friendly");
    }
    if (/\b(hostile|angry|threatened|threat|fight|attacked)\b/.test(searchable)) {
        labels.push("hostile");
    }
    if (/\b(intimate|flirt|flirtatious|kiss|kissing|cuddling|seductive)\b/.test(searchable)) {
        labels.push("intimate");
    }
    if (/\b(loving|affectionate|caring|gentle|warm)\b/.test(searchable)) {
        labels.push("loving");
    }

    return labels.length > 0 ? mergeUniqueList(labels, 3).join(" / ") : "";
}

function inferNpcOnlyKnows(headerEntry: NpcHeaderMemoryEntry, context: string): string[] {
    const firstName = headerEntry.firstName || headerEntry.name;
    const facts: string[] = [];
    const npcNear = nearNpcContext(headerEntry.name, context);

    // Only extract contextual facts if the NPC is actually mentioned
    if (npcNear.length > 0) {
        // {{user}} and NPC did something together
        const together = npcNear.match(new RegExp(`\\{\\{user\\}\\}\\s+and\\s+${npcNameRegexSource(firstName)}\\s+(.+?)(?:\\.|!|\\?|$)`, "i"));
        if (together != null) {
            facts.push(`{{user}} and ${firstName} ${cleanFactText(together[1])}`);
        }

        // NPC and {{user}} did something together (reversed order)
        const togetherRev = npcNear.match(new RegExp(`${npcNameRegexSource(firstName)}\\s+and\\s+\\{\\{user\\}\\}\\s+(.+?)(?:\\.|!|\\?|$)`, "i"));
        if (togetherRev != null) {
            facts.push(`{{user}} and ${firstName} ${cleanFactText(togetherRev[1])}`);
        }

        // {{user}} gave/showed/offered/handed NPC something
        const gave = npcNear.match(new RegExp(`\\{\\{user\\}\\}\\s+(?:gave|showed|offered|handed|passed|returns?|returned)\\s+${npcNameRegexSource(firstName)}\\s+(.+?)(?:\\.|!|\\?|$)`, "i"));
        if (gave != null) {
            facts.push(`{{user}} gave ${firstName}: ${cleanFactText(gave[1])}`);
        }

        // {{user}} told/asked/informed/warned NPC about something
        const toldAbout = npcNear.match(new RegExp(`\\{\\{user\\}\\}\\s+(?:told|asked|informed|warned)\\s+${npcNameRegexSource(firstName)}\\s+(?:about|of|that)\\s+(.+?)(?:\\.|!|\\?|$)`, "i"));
        if (toldAbout != null) {
            facts.push(`{{user}} told ${firstName}: ${cleanFactText(toldAbout[1])}`);
        }
    }

    // {{user}} told NPC their name
    if (/\b(?:my name is|call me|i am called|i'm called|my name's)\b/i.test(context)) {
        facts.push(`{{user}} told ${firstName} their name`);
    }

    // {{user}} mentioned memory loss/amnesia near NPC
    if (npcMentionedInText(headerEntry.name, context) && (/\b(?:lost|lose|lost my|lost his|lost her|lost their)\s+(?:memory|memories)\b/i.test(context) || /\b(?:amnesia|cannot remember|can't remember|kehilangan ingatan)\b/i.test(context))) {
        facts.push(`{{user}} told ${firstName} about memory loss`);
    }

    // {{user}} threatened or warned NPC
    if (userActionTargetsNpc(headerEntry.name, context, "(?:threaten|threatened|threatening|warn|warned|warning|mengancam)")) {
        facts.push(`{{user}} threatened or warned ${firstName}`);
    }

    // {{user}} helped/saved/protected NPC
    if (npcNear.length > 0 && userActionTargetsNpc(headerEntry.name, npcNear, "(?:helped|saved|protected|rescued|aided|assisted|healed)")) {
        facts.push(`{{user}} helped ${firstName}`);
    }

    // {{user}} traveled/went with NPC
    const traveled = npcNear.match(new RegExp(`\\{\\{user\\}\\}\\s+(?:went|traveled|travelled|walked|headed|moved|followed)\\s+(?:with|to|into|toward|after)\\s+${npcNameRegexSource(firstName)}`, "i"));
    if (traveled != null) {
        facts.push(cleanFactText(traveled[0]));
    }

    // General "I/you/{{user}} told NPC that ..." pattern across full context
    for (const sentence of npcMemorySentences(context)) {
        const toldPattern = new RegExp(`\\b(?:i|you|\\{\\{user\\}\\})\\s+(?:told|tell|revealed|reveal|informed|inform)\\s+(?:${npcNameRegexSource(headerEntry.name)}|${npcNameRegexSource(firstName)}|him|her|them|you)\\b\\s*(?:that\\s+)?(.{4,120})`, "i");
        const told = toldPattern.exec(sentence);
        if (told != null) {
            facts.push(`{{user}} told ${firstName}: ${cleanFactText(told[1])}`);
        }
    }

    return mergeUniqueList(facts.map(cleanFactText).filter(Boolean), 4);
}

function userActionTargetsNpc(name: string, context: string, actionSource: string): boolean {
    const nameSource = npcNameRegexSource(name);
    const firstNameSource = npcNameRegexSource(firstNameOf(name));
    const targetSource = `(?:${nameSource}|${firstNameSource})`;

    return new RegExp(`\\b(?:i|you|\\{\\{user\\}\\})(?:\\s+\\w+){0,3}\\s+${actionSource}\\s+${targetSource}\\b`, "i").test(context)
        || new RegExp(`\\b${targetSource}\\b[^.!?\\n]{0,40}\\b(?:was|is|had been|has been)\\s+${actionSource}\\b`, "i").test(context);
}

function npcMemorySentences(context: string): string[] {
    return normalizeLineEndings(context)
        .split(/(?:[.!?]\s+|\n+)/g)
        .map(cleanFragment)
        .filter((sentence) => sentence.length > 0);
}

function mergeKnownFacts(previous: string[], incoming: string[]): string[] {
    return mergeUniqueList(previous.concat(incoming).map(cleanFactText).filter(Boolean), 8);
}

function completeNpcMemoryName(name: string, previous: NpcMemoryEntry | null, memory: NpcMemoryStore): string {
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

function resolveNpcMemoryKey(name: string, memory: NpcMemoryStore): string | null {
    const clean = cleanNpcMemoryName(name);
    const exactKey = npcMemoryKey(clean);

    if (memory[exactKey] != null) {
        return exactKey;
    }

    const first = firstNameOf(clean).toLowerCase();
    const match = Object.entries(memory).find(([_key, entry]) => {
        return first.length > 0 && firstNameOf(entry.name).toLowerCase() === first;
    });

    return match?.[0] ?? null;
}

function nearNpcContext(name: string, context: string): string {
    const sentences = npcMemorySentences(context);
    const related = sentences.filter((sentence) => npcMentionedInText(name, sentence));
    return related.join(" ");
}

function npcMentionedInText(name: string, text: string): boolean {
    return new RegExp(`\\b${npcNameRegexSource(name)}\\b`, "i").test(text)
        || new RegExp(`\\b${npcNameRegexSource(firstNameOf(name))}\\b`, "i").test(text);
}

function npcNameRegexSource(name: string): string {
    return cleanNpcMemoryName(name).split(/\s+/g).filter(Boolean).map(escapeRegExp).join("\\s+");
}

function npcMemoryKey(name: string): string {
    return cleanNpcMemoryName(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanNpcMemoryName(value: string): string {
    return cleanHeaderText(value).replace(/\s+/g, " ").trim();
}

function cleanMemoryField(value: unknown, fallback: string): string {
    return typeof value === "string" && cleanFragment(value).length > 0 ? cleanFragment(value) : fallback;
}

function cleanFactText(value: string): string {
    return limitWords(cleanFragment(value).replace(/^that\s+/i, ""), 24);
}

function firstNameOf(name: string): string {
    return cleanNpcMemoryName(name).split(/\s+/)[0] ?? "";
}

function mergeUniqueList(values: string[], maxItems: number): string[] {
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

function titleCase(value: string): string {
    return value.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
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
    const position = normalizePosition(rawParts[1] ?? defaultParts[1], defaultParts[1], "npc");
    const inferredClothing = inferNpcClothingFromContext(context);
    const rawClothing = normalizeClothing(inferredClothing ?? rawParts[0] ?? defaultParts[0], defaultParts[0]);
    const clothing = inferredClothing != null || newNpcClothingIsSupported(rawClothing, context) ? rawClothing : normalizeClothing(defaultParts[0], "Regular clothing");
    const detail = normalizeDetail(rawParts[2] ?? defaultParts[2], defaultParts[2], "npc");

    return `${clothing}; ${position}; ${detail}`;
}

function normalizeThreadLine(rawLine: string, previousThread: string, narrative: string): string {
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

function activeThreadOrNone(value: string): string {
    const active = normalizeThreadValue(value);
    return active.length > 0 ? active : "None";
}

function inferThreadFromNarrative(narrative: string, previousThread: string): string | null {
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

function threadSentences(narrative: string, previousThread: string): string[] {
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

function threadItemsOverlap(left: string, right: string): boolean {
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

function threadShouldUseNarrativeInference(candidate: string, previousThread: string, inferredThread: string): boolean {
    if (sameText(candidate, inferredThread) || threadItemsOverlap(candidate, inferredThread)) {
        return false;
    }

    return sameText(candidate, previousThread) || isGenericThreadCandidate(candidate);
}

function mergeThreadInference(baseThread: string, inferredThread: string): string {
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

function markThreadParentPendingForSubgoal(item: string): string {
    const clean = cleanFragment(item);

    if (/\(\s*today\s*\)$/i.test(clean)) {
        return clean.replace(/\(\s*today\s*\)$/i, "(Pending)");
    }

    if (/\([^)]+\)$/.test(clean)) {
        return clean;
    }

    return `${clean} (Pending)`;
}

function splitThreadItems(value: string): string[] {
    return value
        .split(/\s*;\s*/g)
        .map(cleanFragment)
        .filter((item) => item.length > 0 && !isTerminalThreadItem(item));
}

function isGenericThreadCandidate(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();

    return lower.length === 0
        || lower === DEFAULT_STATE.thread.toLowerCase()
        || lower === "main mission/status"
        || lower.includes("main mission/status")
        || lower.includes("current mission / pending event");
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
    const walletContext = walletTransactionEvidenceContext(context);
    const inferred = previousInitialized ? inferWalletFromContext(previous, walletContext) : null;

    if (candidate == null) {
        return {
            value: inferred ?? previous,
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
            value: inferred ?? previous,
            initialized: true,
        };
    }

    if (walletChangeIsSupported(candidate, previous, walletContext)) {
        return {
            value: inferred != null && !sameText(candidate, inferred) ? inferred : candidate,
            initialized: true,
        };
    }

    return {
        value: inferred ?? previous,
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

function inferWalletFromContext(previousWallet: string, context: string): string | null {
    const previous = parseWalletAmounts(previousWallet);
    const delta = inferWalletDeltaFromContext(context);

    if (previous == null || delta == null) {
        return null;
    }

    const previousCopper = walletToCopper(previous);
    const deltaCopper = walletToCopper(delta.amounts);

    if (deltaCopper <= 0) {
        return null;
    }

    const nextCopper = delta.direction === "expense"
        ? Math.max(0, previousCopper - deltaCopper)
        : previousCopper + deltaCopper;
    const next = formatWallet(copperToWallet(nextCopper));

    return sameText(next, previousWallet) ? null : next;
}

function walletTransactionEvidenceContext(context: string): string {
    return nonDialogueEvidenceContext(context);
}

function inferWalletDeltaFromContext(context: string): {direction: "expense" | "income"; amounts: WalletAmounts} | null {
    if (walletContextIsPriceDiscussionOnly(context)) {
        return null;
    }

    const amounts = extractMoneyMentionAmounts(context);

    if (amounts == null) {
        return null;
    }

    if (walletExpenseTransactionIsSupported(context)) {
        return {direction: "expense", amounts};
    }

    if (walletIncomeTransactionIsSupported(context)) {
        return {direction: "income", amounts};
    }

    return null;
}

function extractMoneyMentionAmounts(context: string): WalletAmounts | null {
    const amounts: WalletAmounts = {gold: 0, silver: 0, copper: 0};
    const seenAmounts = new Set<string>();
    let matched = false;
    const numericPattern = /(\d+)\s*(g|gold|s|silver|c|copper)\b/gi;
    let numericMatch = numericPattern.exec(context);

    while (numericMatch != null) {
        matched = addUniqueWalletAmount(amounts, Number(numericMatch[1]), numericMatch[2], seenAmounts) || matched;
        numericMatch = numericPattern.exec(context);
    }

    const numberWords = Object.keys(NUMBER_WORDS).concat("hundred", "and").join("|");
    const wordPattern = new RegExp(`\\b((?:${numberWords})(?:[-\\s]+(?:${numberWords})){0,7})\\s+(gold|silver|copper)\\b`, "gi");
    let wordMatch = wordPattern.exec(context);

    while (wordMatch != null) {
        const value = parseEnglishNumberPhrase(wordMatch[1]);

        if (value != null) {
            matched = addUniqueWalletAmount(amounts, value, wordMatch[2], seenAmounts) || matched;
        }

        wordMatch = wordPattern.exec(context);
    }

    return matched ? amounts : null;
}

function addUniqueWalletAmount(amounts: WalletAmounts, amount: number, unit: string, seenAmounts: Set<string>): boolean {
    const key = `${Math.max(0, Math.floor(amount))}:${normalizeWalletUnit(unit)}`;

    if (seenAmounts.has(key)) {
        return false;
    }

    seenAmounts.add(key);
    addWalletAmount(amounts, amount, unit);
    return true;
}

function addWalletAmount(amounts: WalletAmounts, amount: number, unit: string): void {
    const safeAmount = Math.max(0, Math.floor(amount));
    const cleanUnit = normalizeWalletUnit(unit);

    if (cleanUnit === "gold") {
        amounts.gold += safeAmount;
    } else if (cleanUnit === "silver") {
        amounts.silver += safeAmount;
    } else {
        amounts.copper += safeAmount;
    }
}

function normalizeWalletUnit(unit: string): "gold" | "silver" | "copper" {
    const clean = unit.toLowerCase();

    if (clean === "g" || clean === "gold") {
        return "gold";
    }

    if (clean === "s" || clean === "silver") {
        return "silver";
    }

    return "copper";
}

function parseEnglishNumberPhrase(value: string): number | null {
    const tokens = value
        .toLowerCase()
        .replace(/-/g, " ")
        .split(/\s+/g)
        .map((token) => token.trim())
        .filter((token) => token.length > 0 && token !== "and");
    let current = 0;
    let matched = false;

    for (const token of tokens) {
        if (token === "hundred") {
            current = Math.max(1, current) * 100;
            matched = true;
            continue;
        }

        const amount = NUMBER_WORDS[token];
        if (amount == null) {
            return null;
        }

        current += amount;
        matched = true;
    }

    return matched && current > 0 ? current : null;
}

function walletExpenseTransactionIsSupported(context: string): boolean {
    const lowerContext = context.toLowerCase();

    if (walletContextIndicatesIncomeToUser(lowerContext)) {
        return false;
    }

    if (/\bback\s+into\s+(?:my|your|the)\s+(?:wallet|purse|pouch|pocket)\b/i.test(context)) {
        return false;
    }

    return containsAnyCue(lowerContext, WALLET_PAYMENT_ACTION_CUES)
        && (
            /\b(?:i|me|my|you|\{\{user\}\})\b/i.test(context)
            || /\b(?:to|toward|towards)\s+[A-Z][A-Za-z'._-]+\b/.test(context)
            || /\b(?:on|onto)\s+the\s+(?:table|counter|desk|wood)\b/i.test(context)
        );
}

function walletIncomeTransactionIsSupported(context: string): boolean {
    const lowerContext = context.toLowerCase();

    return containsAnyCue(lowerContext, WALLET_INCOME_ACTION_CUES)
        && (
            walletContextIndicatesIncomeToUser(lowerContext)
            || /\b(?:i|you|\{\{user\}\})\s+(?:receive|received|earn|earned|gain|gained|loot|looted|found)\b/i.test(context)
        );
}

function walletLossTransactionIsSupported(context: string): boolean {
    const lowerContext = context.toLowerCase();

    return containsAnyCue(lowerContext, ["loses", "lost", "stolen", "robbed", "confiscated"])
        && (
            /\b(?:i|me|my|you|your|\{\{user\}\})\b/i.test(context)
            || containsAnyCue(lowerContext, ["wallet", "purse", "pouch", "money", "coin", "coins", "gold", "silver", "copper"])
        );
}

function walletContextIsPriceDiscussionOnly(context: string): boolean {
    const lowerContext = context.toLowerCase();
    const hasValuationCue = /\b(?:worth|valued at|value|asking price|market price|price tag|to the right buyer|right buyer|buyer|buyers|seller|sellers)\b/i.test(context)
        || /\b(?:cost|costs|costing|price|fee)\b/i.test(context)
        || /\btrade\s+you\s+information\s+for\s+information\b/i.test(context);

    if (!hasValuationCue) {
        return false;
    }

    return !walletExpenseTransactionIsSupported(context)
        && !walletIncomeTransactionIsSupported(context)
        && !walletLossTransactionIsSupported(context)
        && !containsAnyCue(lowerContext, ["received payment", "payment received", "has been paid", "was paid"]);
}

function walletContextIndicatesIncomeToUser(lowerContext: string): boolean {
    if (/\b(?:i|we)\s+(?:give|gives|gave|hand|hands|handed|pay|pays|paid)\s+(?:you|\{\{user\}\})\b/i.test(lowerContext)) {
        return false;
    }

    return /\b(?:gives?|gave|hands?|handed|pays?)\s+(?:you|\{\{user\}\})\b/i.test(lowerContext)
        || /\b(?:to|toward|towards|into)\s+(?:you|your|\{\{user\}\})\b/i.test(lowerContext)
        || /\byou\s+(?:receive|received|earn|earned|gain|gained|found)\b/i.test(lowerContext);
}

function walletToCopper(wallet: WalletAmounts): number {
    return (wallet.gold * 10000) + (wallet.silver * 100) + wallet.copper;
}

function copperToWallet(totalCopper: number): WalletAmounts {
    const safeCopper = Math.max(0, Math.floor(totalCopper));
    const gold = Math.floor(safeCopper / 10000);
    const silver = Math.floor((safeCopper % 10000) / 100);
    const copper = safeCopper % 100;

    return {gold, silver, copper};
}

function normalizeStatus(
    rawStatus: string,
    fallbackStatus: string,
    kind: "you" | "npc",
    race: string,
    context: string = "",
    options: NormalizeStatusOptions = {},
): string {
    const defaultStatus = kind === "you" ? DEFAULT_STATE.you.match(/\((.*)\)$/)?.[1] ?? "Regular clothing; Standing; hands visible" : defaultNpcStatusForRace(race);
    const fallbackParts = statusParts(fallbackStatus || defaultStatus, kind);
    const defaultParts = statusParts(defaultStatus, kind);
    const rawParts = statusParts(rawStatus, kind);

    const fallbackClothing = normalizeClothing(fallbackParts[0] ?? defaultParts[0], defaultParts[0]);
    const fallbackPosition = normalizePosition(fallbackParts[1] ?? defaultParts[1], defaultParts[1], kind);
    const clothingContext = kind === "you" ? clothingNarrativeEvidenceContext(context) : context;
    const inferredClothing = kind === "you" ? inferYouClothingFromContext(clothingContext) : null;
    const rawClothing = normalizeClothing(inferredClothing ?? rawParts[0] ?? fallbackClothing, fallbackClothing);
    const rawPosition = normalizePosition(rawParts[1] ?? fallbackPosition, fallbackPosition, kind);
    const position = options.trustRawStatus === true
        ? rawPosition
        : (statusChangeIsSupported(rawPosition, fallbackPosition, context, "position", kind)
            || (options.sceneChanged === true && rawParts[1] != null && !isGenericStatusPart(rawPosition))
            ? rawPosition
            : fallbackPosition);
    const clothing = options.trustRawStatus === true
        ? rawClothing
        : (statusChangeIsSupported(rawClothing, fallbackClothing, clothingContext, "clothing", kind) ? rawClothing : fallbackClothing);
    const fallbackDetail = normalizeDetail(fallbackParts[2] ?? defaultParts[2], defaultParts[2], kind);
    const rawDetail = normalizeDetail(rawParts[2] ?? fallbackDetail, fallbackDetail, kind);
    const detail = rawDetail;

    return `${clothing}; ${position}; ${detail}`;
}

function statusParts(status: string, kind: "you" | "npc"): string[] {
    const clean = cleanFragment(status).replace(/^\(/, "").replace(/\)$/, "");

    if (isPlaceholder(clean)) {
        return [];
    }

    const parts = clean.includes(";") || kind === "npc" ? splitStatusByFormat(clean) : [clean];
    const normalized = parts
        .flatMap(splitMixedStatusPart)
        .map(cleanFragment)
        .filter((part) => !isPlaceholder(part));
    const unique: string[] = [];

    for (const part of normalized) {
        if (!unique.some((u) => sameText(u, part))) {
            unique.push(part);
        }
    }

    return orderStatusParts(unique);
}

function orderStatusParts(parts: string[]): string[] {
    if (parts.length === 0) {
        return [];
    }

    const clothingIndex = parts.findIndex(isClothingStatusPart);
    const clothing = clothingIndex >= 0 ? parts[clothingIndex] : "";
    const nonClothing = parts.filter((_part, index) => index !== clothingIndex);
    const positionCandidates = nonClothing
        .map((part, index) => ({part, index}))
        .filter(({part}) => statusPartLooksLikePosition(part) && !statusPartLooksLikeDetailOnly(part));

    if (positionCandidates.length > 0) {
        positionCandidates.sort((a, b) => {
            const scoreA = positionSignalScore(a.part);
            const scoreB = positionSignalScore(b.part);
            if (scoreA !== scoreB) return scoreB - scoreA;
            return b.part.split(/\s+/).length - a.part.split(/\s+/).length;
        });
    }

    const bestPosition = positionCandidates.length > 0 ? positionCandidates[0] : null;
    const position = bestPosition != null ? bestPosition.part : "";
    const remaining = nonClothing.filter((_p, i) => bestPosition == null || i !== bestPosition.index);
    const detailParts = remaining.filter((p) => !isPurePositionPart(p));
    const uniqueDetail: string[] = [];

    for (const p of detailParts) {
        if (!uniqueDetail.some((u) => sameText(u, p))) {
            uniqueDetail.push(p);
        }
    }

    return [clothing, position, uniqueDetail.join(", ")];
}

function positionSignalScore(value: string): number {
    const lower = value.toLowerCase();

    if (positionMeansWalking(lower) || positionMeansStanding(lower) || positionMeansSeated(lower) || positionMeansProne(lower)) {
        return 3;
    }

    if (containsAnyCue(lower, POSITION_SPATIAL_CUES)) {
        return 2;
    }

    if (containsAnyCue(lower, POSITION_CHANGE_CUES)) {
        return 1;
    }

    return 0;
}

function isPurePositionPart(value: string): boolean {
    return statusPartLooksLikePosition(value) && !statusPartLooksLikeDetail(value);
}

function splitMixedStatusPart(part: string): string[] {
    const clean = cleanFragment(part);

    if (clean.length === 0) {
        return [];
    }

    const commaParts = splitTopLevel(clean, ",").map(cleanFragment).filter(Boolean);
    if (commaParts.length > 1 && commaParts.some(statusPartLooksLikePosition) && commaParts.some(statusPartLooksLikeDetail)) {
        return commaParts;
    }

    const withDetail = clean.match(/^(.*?\b(?:standing|seated|sitting|walking|kneeling|crouching|lying|above|below|beneath|under|over|atop|upon|against|beyond|past|around|inside|outside|alongside|beside|before|behind|near|facing|left|right|front|table|door|counter)\b.*?)\s+with\s+((?:his|her|their|your|both|one)?\s*(?:eye|eyes|gaze|tail|tails|ear|ears|wing|wings|horn|horns|hand|hands|arm|arms|posture|body)\b.*)$/i);
    if (withDetail != null) {
        return [withDetail[1], withDetail[2]].map(cleanFragment).filter(Boolean);
    }

    return [clean];
}

function isClothingStatusPart(value: string): boolean {
    return looksLikeClothingSlot(value);
}

function statusPartLooksLikePosition(value: string): boolean {
    const clean = cleanFragment(value);
    const lower = clean.toLowerCase();

    return positionMeansWalking(lower)
        || positionMeansStanding(lower)
        || positionMeansSeated(lower)
        || positionMeansProne(lower)
        || containsAnyCue(lower, POSITION_SPATIAL_CUES)
        || containsAnyCue(lower, POSITION_CHANGE_CUES);
}

function statusPartLooksLikeDetail(value: string): boolean {
    return BODY_RACIAL_DETAIL_PATTERN.test(value);
}

function statusPartLooksLikeDetailOnly(value: string): boolean {
    return statusPartLooksLikeDetail(value) && !statusPartLooksLikePosition(value);
}

function splitStatusByFormat(status: string): string[] {
    return status.split(";").map((s) => s.trim());
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
    }

    clean = limitWords(clean, 40);

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
        return "Regular clothing; Standing nearby; tails still, ears attentive";
    }

    if (lower.includes("catkin")) {
        return "Regular clothing; Standing nearby; ears attentive, tail still";
    }

    if (lower.includes("dragonkin")) {
        return "Regular clothing; Standing nearby; wings settled, tail still, horns visible";
    }

    if (lower.includes("angel")) {
        return "Regular clothing; Standing nearby; wings settled, halo visible";
    }

    if (lower.includes("demon")) {
        return "Regular clothing; Standing nearby; horns visible, tail still, eyes alert";
    }

    if (lower.includes("vampire")) {
        return "Regular clothing; Standing nearby; fangs hidden, eyes alert";
    }

    if (lower.includes("pixie") || lower.includes("fey")) {
        return "Regular clothing; Standing nearby; wings still, faint glow visible";
    }

    return "Regular clothing; Standing nearby; posture attentive";
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
    const clean = cleanFragment(value);

    return TERMINAL_THREAD_STATUS_TAG_PATTERN.test(clean)
        || TERMINAL_THREAD_END_PATTERN.test(clean)
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
        if (kind === "you") {
            return youClothingChangeIsSupported(candidate, previous, context);
        }

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

    if (!isGenericStatusPart(previous) && isDefaultClothingValue(candidate)) {
        return contextMentionsCandidate(candidate, lowerContext);
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

function clothingNarrativeEvidenceContext(context: string): string {
    return nonDialogueEvidenceContext(context);
}

function nonDialogueEvidenceContext(context: string): string {
    return stripUnquotedSpeakerSpeech(stripDoubleQuotedText(context));
}

function stripDoubleQuotedText(value: string): string {
    let result = "";
    let inQuote = false;

    for (const char of value) {
        if (char === "\"" || char === "“" || char === "”") {
            inQuote = !inQuote;
            result += " ";
            continue;
        }

        if (!inQuote) {
            result += char;
        }
    }

    return result;
}

function stripUnquotedSpeakerSpeech(value: string): string {
    return normalizeLineEndings(value)
        .split("\n")
        .map((line) => {
            const match = line.match(/^(\s*(?:\*\*)?[A-Z][A-Za-z0-9'._ -]{0,60}(?::|\*\*:)\s*)(.*)$/);

            if (match == null) {
                return line;
            }

            const actionBeats = match[2].match(/\*[^*\n]+\*/g);
            return actionBeats == null ? match[1] : `${match[1]} ${actionBeats.join(" ")}`;
        })
        .join("\n");
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

    if (staleObjectInteractionCanYieldToSettledCandidate(candidate, previous, context)) {
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
        || staleObjectInteractionCanYieldToSettledCandidate(candidate, previous, context)
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

    if (!isSettledYouDetailCandidate(candidate)) {
        return false;
    }

    return containsAnyCue(lowerContext, POSITION_CHANGE_CUES)
        || containsAnyCue(lowerContext, LOCATION_TRANSITION_CUES)
        || containsAnyCue(lowerContext, DETAIL_SETTLED_BODY_CUES);
}

function staleObjectInteractionCanYieldToSettledCandidate(candidate: string, previous: string, context: string): boolean {
    return isTransientObjectYouDetail(previous)
        && !youDetailHasCurrentEvidence(previous, context)
        && isSettledYouDetailCandidate(candidate);
}

function isSettledYouDetailCandidate(candidate: string): boolean {
    const lowerCandidate = candidate.toLowerCase();

    return containsAnyCue(lowerCandidate, DETAIL_BODY_PART_CUES)
        && containsAnyCue(lowerCandidate, DETAIL_SETTLED_BODY_CUES);
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

function isTransientObjectYouDetail(value: string): boolean {
    const clean = cleanFragment(value).toLowerCase();

    return containsAnyCue(clean, DETAIL_BODY_PART_CUES)
        && containsAnyCue(clean, DETAIL_OBJECT_INTERACTION_CUES)
        && containsAnyCue(clean, [
            "holding",
            "gripping",
            "grasping",
            "clutching",
            "pulling",
            "tugging",
            "drawing",
            "lifting",
            "lowering",
            "releasing",
            "released",
            "release",
            "placing",
            "placed",
            "setting",
            "set down",
            "sliding",
            "slid",
            "pushing",
            "pushed",
        ]);
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

function isDefaultClothingValue(value: string): boolean {
    const clean = cleanFragment(value).toLowerCase();
    return clean === "regular clothing"
        || clean === "regular clothes"
        || clean === "regular outfit"
        || clean === "standard clothing"
        || clean === "standard clothes"
        || clean === "standard outfit"
        || clean === "normal clothing"
        || clean === "normal clothes"
        || clean === "normal outfit"
        || clean === "ordinary clothing"
        || clean === "ordinary clothes"
        || clean === "simple clothing"
        || clean === "simple clothes";
}

function contextMentionsCandidate(candidate: string, lowerContext: string): boolean {
    const clean = cleanFragment(candidate).toLowerCase();
    const directMatches = [
        clean,
        clean.replace(/\bclothing\b/g, "clothes"),
        clean.replace(/\bclothes\b/g, "clothing"),
        clean.replace(/\boutfit\b/g, "clothing"),
    ];
    if (directMatches.some((m) => lowerContext.includes(m))) {
        return true;
    }
    const words = clothingWords(candidate);
    return words.length > 0 && words.some((w) => containsAnyCue(lowerContext, [w]));
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
    const cleanNarrative = normalizeNarrativeFormat(narrative, state);
    const header = formatHeader(state);

    if (cleanNarrative.length === 0) {
        return header;
    }

    return `${header}\n\n${cleanNarrative}`;
}

function normalizeNarrativeFormat(narrative: string, state: AetherNovaMessageState): string {
    const clean = normalizeLineEndings(narrative).trim();

    if (clean.length === 0) {
        return "";
    }

    const formatState: NarrativeFormatState = {
        npcNames: npcSpeakerNamesFromState(state.npc),
        recentSpeaker: null,
    };

    return clean
        .split(/\n{2,}/)
        .map((block) => normalizeNarrativeBlock(block, formatState))
        .filter((block) => block.length > 0)
        .join("\n\n");
}

function normalizeNarrativeBlock(block: string, state: NarrativeFormatState): string {
    return block
        .split("\n")
        .map((line) => normalizeNarrativeLine(line, state))
        .filter((line) => line.length > 0)
        .join("\n");
}

function normalizeNarrativeLine(line: string, state: NarrativeFormatState): string {
    const clean = line.trim();

    if (clean.length === 0) {
        return "";
    }

    const dialogue = normalizeDialogueLine(clean);
    if (dialogue != null) {
        state.recentSpeaker = speakerFromExplicitDialogueLine(clean) ?? state.recentSpeaker;
        return dialogue;
    }

    const inferredDialogue = normalizeBareDialogueLine(clean, state);
    if (inferredDialogue != null) {
        return inferredDialogue;
    }

    const actionDialogue = normalizeActionBeatDialogueLine(clean, state);
    if (actionDialogue != null) {
        return actionDialogue;
    }

    const content = replaceInlineEmphasis(stripOuterSingleItalic(clean));
    state.recentSpeaker = inferRecentSpeakerFromNarrative(content, state) ?? state.recentSpeaker;
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

function normalizeBareDialogueLine(line: string, state: NarrativeFormatState): string | null {
    const clean = stripOuterSingleItalic(line.trim());

    if (!clean.startsWith("\"")) {
        return null;
    }

    const speaker = inferBareDialogueSpeaker(clean, state);

    if (speaker == null) {
        return normalizeDialogueText(clean);
    }

    state.recentSpeaker = speaker;
    return `${speaker}: ${normalizeDialogueText(clean)}`;
}

function normalizeActionBeatDialogueLine(line: string, state: NarrativeFormatState): string | null {
    const clean = stripOuterSingleItalic(line.trim());

    const firstQuote = clean.indexOf('"');
    if (firstQuote <= 0) return null;

    const before = clean.slice(0, firstQuote).trim();
    const after = clean.slice(firstQuote).trim();

    if (before.length === 0) return null;

    if (before.startsWith("*") && before.endsWith("*")) {
        const inner = before.slice(1, -1).trim();
        if (!looksLikeInlineNarrationBeat(inner)) return null;
        const speaker = inferBareDialogueSpeaker(after, state);
        if (speaker != null) {
            state.recentSpeaker = speaker;
            return `${speaker}: *${inner}* ${normalizeDialogueText(after)}`;
        }
        return `*${inner}* ${normalizeDialogueText(after)}`;
    }

    if (!looksLikeInlineNarrationBeat(before)) return null;
    if (before.startsWith("*") || before.startsWith("'") || before.startsWith('"')) return null;

    const speaker = inferBareDialogueSpeaker(after, state);
    if (speaker != null) {
        state.recentSpeaker = speaker;
        return `${speaker}: *${before}* ${normalizeDialogueText(after)}`;
    }
    return `*${before}* ${normalizeDialogueText(after)}`;
}

function inferBareDialogueSpeaker(line: string, state: NarrativeFormatState): string | null {
    const namedSpeaker = speakerFromDialogueAttribution(line, state);

    if (namedSpeaker != null) {
        return namedSpeaker;
    }

    if (dialogueHasPronounAttribution(line) && state.recentSpeaker != null) {
        return state.recentSpeaker;
    }

    if (state.recentSpeaker != null && state.npcNames.includes(state.recentSpeaker)) {
        return state.recentSpeaker;
    }

    return state.npcNames.length === 1 ? state.npcNames[0] : null;
}

function speakerFromDialogueAttribution(line: string, state: NarrativeFormatState): string | null {
    const pattern = /\b([A-Z][A-Za-z'._-]{1,60})\s+(?:says|said|asks|asked|answers|answered|replies|replied|murmurs|murmured|whispers|whispered|mutters|muttered|calls|called|continues|continued)\b/;
    const match = line.match(pattern);

    if (match == null) {
        return null;
    }

    return speakerNameFromMention(match[1], state);
}

function dialogueHasPronounAttribution(line: string): boolean {
    return /\b(?:he|she|they)\s+(?:says|said|asks|asked|answers|answered|replies|replied|murmurs|murmured|whispers|whispered|mutters|muttered|calls|called|continues|continued)\b/i.test(line);
}

function speakerFromExplicitDialogueLine(line: string): string | null {
    const parsed = parseDialogueLine(stripOuterSingleItalic(line.trim()));
    return parsed == null ? null : parsed.speaker;
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

        if (isDialoguePayloadText(text) || isSimpleSpeakerName(speaker)) {
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
    const clean = formatPlainActionBeatBetweenDialogue(formatInlineNarrationInDialogue(stripOuterSingleItalic(value.trim())));
    const repaired = formatLeadingMisquotedActionBeat(clean);
    const beatBeforeDialogue = formatLeadingActionBeatBeforeDialogue(repaired);
    const wrapped = wrapLeadingPlainActionBeat(beatBeforeDialogue);

    if (wrapped.length === 0) {
        return "";
    }

    if (wrapped !== beatBeforeDialogue) {
        return wrapped;
    }

    if (wrapped.startsWith("\"") || wrapped.startsWith("*")) {
        return wrapped;
    }

    return `"${wrapped}"`;
}

function formatLeadingMisquotedActionBeat(value: string): string {
    const match = value.match(/^"\s*'([^'\n]{2,180})'\s*(.*?)"\s*$/);

    if (match == null) {
        return value;
    }

    const beat = match[1].trim();
    const dialogue = match[2].trim();

    if (!looksLikeInlineNarrationBeat(beat)) {
        return value;
    }

    const formattedBeat = `*${beat}*`;
    return dialogue.length === 0 ? formattedBeat : `${formattedBeat} ${formatDialogueRemainder(dialogue)}`;
}

function formatDialogueRemainder(value: string): string {
    const clean = value.trim();

    if (clean.length === 0) {
        return "";
    }

    if (clean.startsWith("\"")) {
        return clean;
    }

    return `"${clean}"`;
}

function formatLeadingActionBeatBeforeDialogue(value: string): string {
    const match = value.match(/^\*([^*\n]{2,180})\*\s+(".*)$/);

    if (match == null) {
        return value;
    }

    const beat = match[1].trim();
    const dialogue = match[2].trim();

    return looksLikeInlineNarrationBeat(beat) ? `*${beat}* ${dialogue}` : value;
}

function wrapLeadingPlainActionBeat(value: string): string {
    const firstQuote = value.indexOf('"');
    if (firstQuote <= 0) {
        return value;
    }

    const before = value.slice(0, firstQuote).trim();
    const after = value.slice(firstQuote);

    if (before.length === 0) {
        return value;
    }

    if (before.startsWith("*") || before.startsWith("'") || before.startsWith('"')) {
        return value;
    }

    if (!looksLikeInlineNarrationBeat(before)) {
        return value;
    }

    return `*${before}* ${after}`;
}

function isLeadingActionBeatBeforeDialogue(value: string): boolean {
    const match = value.match(/^\*([^*\n]{2,180})\*\s+".*$/);
    return match != null && looksLikeInlineNarrationBeat(match[1]);
}

function formatInlineNarrationInDialogue(value: string): string {
    return value.replace(/(^|[\s([{])'([^'\n]{2,180})'(?=$|[\s).,!?:;\]}])/g, (match, prefix: string, inner: string) => {
        const clean = inner.trim();
        return looksLikeInlineNarrationBeat(clean) ? `${prefix}*${clean}*` : match;
    });
}

function formatPlainActionBeatBetweenDialogue(value: string): string {
    return value.replace(/("\s+)([^"\n*]{2,220}?)(\s+")/g, (match, before: string, beat: string, after: string) => {
        const clean = beat.trim().replace(/\s+/g, " ");
        return looksLikeInlineNarrationBeat(clean) ? `${before}*${clean}*${after}` : match;
    });
}

function npcSpeakerNamesFromState(npcLine: string): string[] {
    if (isNoNpcValue(npcLine)) {
        return [];
    }

    const names: string[] = [];
    for (const entry of splitTopLevel(npcLine, ",")) {
        const parsed = parseIdentityStatus(entry);
        const identity = splitIdentity(parsed.identity, "", "");
        const fullName = cleanSpeakerName(identity.left);

        if (fullName.length === 0 || /^unknown npc$/i.test(fullName)) {
            continue;
        }

        addUniqueSpeakerName(names, fullName);

        const firstName = fullName.split(/\s+/)[0];
        if (firstName != null && firstName.length > 0) {
            addUniqueSpeakerName(names, firstName);
        }
    }

    return names;
}

function addUniqueSpeakerName(names: string[], name: string): void {
    if (!names.some((entry) => sameText(entry, name))) {
        names.push(name);
    }
}

function inferRecentSpeakerFromNarrative(narrative: string, state: NarrativeFormatState): string | null {
    let bestSpeaker: string | null = null;
    let bestIndex = -1;

    for (const name of state.npcNames) {
        const index = lastSpeakerNameIndex(narrative, name);

        if (index > bestIndex) {
            bestIndex = index;
            bestSpeaker = name;
        }
    }

    return bestSpeaker;
}

function lastSpeakerNameIndex(value: string, name: string): number {
    const matches = [...value.matchAll(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"))];
    const last = matches[matches.length - 1];
    return last?.index ?? -1;
}

function speakerNameFromMention(value: string, state: NarrativeFormatState): string | null {
    const clean = cleanSpeakerName(value);

    return state.npcNames.find((name) => sameText(name, clean)) ?? null;
}

function looksLikeInlineNarrationBeat(value: string): boolean {
    const clean = cleanFragment(value);
    const words = clean.split(/\s+/).filter(Boolean);

    if (words.length < 2) {
        return false;
    }

    return inlineNarrationStartsLikeBeat(clean)
        || inlineNarrationStartsWithActionVerb(clean)
        || inlineNarrationHasBeatAction(clean);
}

function inlineNarrationStartsLikeBeat(value: string): boolean {
    return /^(?:he|she|they|it|his|her|their|the|yume)\b/i.test(value)
        || /^[A-Z][A-Za-z'._-]*\b/.test(value);
}

function inlineNarrationHasBeatAction(value: string): boolean {
    return /\b(?:lip|lips|mouth|smile|smiles|smiled|grin|grins|grinned|eye|eyes|gaze|tail|tails|ear|ears|hand|hands|finger|fingers|arm|arms|shoulder|shoulders|head|face|cheek|cheeks|coin|coins|grunt|grunts|grunted|nod|nods|nodded|tilt|tilts|tilted|curve|curves|curved|catch|catches|caught|catching|glance|glances|glanced|look|looks|looked|turn|turns|turned|step|steps|stepped|breath|breathes|breathed|sigh|sighs|sighed|voice|posture)\b/i.test(value);
}

function inlineNarrationStartsWithActionVerb(value: string): boolean {
    return /^(?:catching|taking|grabbing|holding|watching|looking|glancing|turning|stepping|walking|nodding|smiling|grinning|sighing|breathing|leaning|standing|sitting|kneeling|raising|lowering|flicking|tossing|throwing|placing)\b/i.test(value);
}

function isQuotedDialogueText(value: string): boolean {
    return value.trim().startsWith("\"");
}

function isDialoguePayloadText(value: string): boolean {
    const clean = value.trim();

    return isQuotedDialogueText(clean)
        || /^'[^'\n]{2,180}'\s+"/.test(clean)
        || /^\*[^*\n]{2,180}\*\s+"/.test(clean)
        || /".{2,}"/.test(clean);
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
        const clean = inner.trim();
        return clean.length > 0 ? `${prefix}'${clean}'` : _match;
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

    if (walletContextIsPriceDiscussionOnly(context)) {
        return false;
    }

    const lowerContext = context.toLowerCase();
    const hasMoneyCue = containsAnyCue(lowerContext, WALLET_MONEY_CUES) || WALLET_AMOUNT_PATTERN.test(context);

    return hasMoneyCue
        && (
            walletExpenseTransactionIsSupported(context)
            || walletIncomeTransactionIsSupported(context)
            || walletLossTransactionIsSupported(context)
            || containsAnyCue(lowerContext, ["received payment", "payment received", "has been paid", "was paid"])
        );
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
        || lower === "current scene"
        || lower === "current topic"
        || lower === "current event"
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
