export const DEBUG_STORAGE_KEY = "aether-nova-stage.pendingNpcDebugQuery";
export const DEBUG_UI_VERSION = "V1.7";

export const CLOCK_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
export const TIME_OF_DAYS = ["Morning", "Afternoon", "Evening", "Night"] as const;
export const HEADER_DIVIDER = "***";
export const NPC_MEMORY_COMMAND_PATTERN = /(?:[\[【]\s*)?npc[\s_-]*memory\s+((?:delete|remove|clearfacts|clear\s+facts|clear|set|update|add\s+fact|addfact|relation\s+event|relationship\s+event|relationship|relation|behavior\s+score|behavior|mood|show)\s*:?\s*[^\n\]】]+)(?:[\]】])?/gi;

export const CLOTHING_DAMAGE_WORDS = /\b(burned|burnt|scorched|torn|ripped|shredded|slashed|bloody|bloodied|stained|soaked|wet|muddy|damaged|destroyed|cracked|frayed|singed|loose|loosened|baggy|caught|snagged|stuck|hooked|tangled|slipping|untucked|unbuttoned|unfastened|missing|robek|terbakar|longgar|tersangkut)\b/i;
export const CLOTHING_SLOT_PATTERN = /\b(cloth|clothes|clothing|garment|garments|layer|layers|outfit|attire|garb|uniform|armor|armour|robe|robes|over-robe|under-robe|overrobe|underrobe|kimono|yukata|haori|hakama|dress|gown|suit|shirt|blouse|tunic|jacket|coat|cloak|mantle|cape|hood|pants|pant|trousers|jeans|shorts|skirt|leggings|boots|shoes|sandals|gloves|mask|veil|hat|cap|helmet|apron|vest|corset|sash|belt|scarf|shawl|wrap|rags|disguise|leather|silk|linen|cotton|wool|chainmail|mail|sleeve|sleeves|collar|hem|cuff|cuffs|waistband|pantleg|pantlegs|naked|nude|unclothed|bare|baju|celana|pakaian|kemeja|lengan baju|kain)\b/i;
export const BODY_RACIAL_DETAIL_PATTERN = /\b(eye|eyes|gaze|tail|tails|ear|ears|wing|wings|horn|horns|halo|fang|fangs|claw|claws|scale|scales|hand|hands|palm|palms|finger|fingers|arm|arms|elbow|elbows|head|face|cheek|cheeks|forehead|chin|mouth|nose|hair|shoulder|shoulders|back|body|torso|waist|hip|hips|knee|knees|posture|voice|weapon|sword|blade|staff)\b/i;
export const WALLET_AMOUNT_PATTERN = /\b\d+\s*(?:g|gold|s|silver|c|copper)\b/i;
export const VAGUE_STATUS_PATTERN = /\b(mood|emotion|feeling|feelings|thought|thoughts|status|role|happy|sad|angry|calm|nervous|worried|confused|curious|suspicious|jealous|afraid|scared|determined|focused)\b/i;
export const USER_FORBIDDEN_DETAIL_PATTERN = /\b(thinking|thinks|feeling|feels|expression|expressions|smiling|smiles|frowning|grinning|says|said|speaks|asks|answers|chooses|choosing|choice|decides|attacks|attack|transforms|transforming|consents|consent|refuses|dialogue)\b/i;
export const MINOR_THREAD_PATTERN = /\b(normal topic|normal topics|casual question|casual questions|temporary mood|small suspicion|minor jealousy|minor tension|small talk)\b/i;
export const TERMINAL_THREAD_STATUS = "(?:resolved|complete|completed|done|finished|concluded|closed|settled|refused|declined|rejected|failed|abandoned|expired|irrelevant|cancelled|canceled)";
export const TERMINAL_THREAD_STATUS_TAG_PATTERN = new RegExp(`\\([^)]*\\b${TERMINAL_THREAD_STATUS}\\b[^)]*\\)`, "i");
export const TERMINAL_THREAD_END_PATTERN = new RegExp(`\\b(?:resolved|complete|completed|done|finished|concluded|settled|refused|declined|rejected|failed|abandoned|expired|irrelevant|cancelled|canceled)\\b\\s*$`, "i");
export const TRANSIENT_YOU_DETAIL_PATTERN = /\b(holding|gripping|grasping|clutching|touching|stroking|caressing|petting|rubbing|tilted|tilting|cocked|angled|resting|leaning|pressing|bracing|supporting|pushing|pulling|tugging|drawing|lifting|lowering|cleaning|wiping|washing|brushing|drying|patting|releasing|released|release|placing|placed|setting|set down|sliding|slid|hand on|hands on|arm around|arms around|head on|against|upon|on top of)\b/i;

export const DEFAULT_USER_STATUS = {
    gender: "Unknown",
    apparentRace: "Human",
    clothing: {} as Record<string, never>,
    weapons: [] as Array<never>,
    importantItems: [] as Array<never>,
};

export const DEFAULT_STATE = {
    location: "Unknown Region - Current Place - Active Area",
    timeOfDay: "Morning" as const,
    clock: "09:00",
    you: "Unknown - Human (Regular clothing; Standing; hands visible)",
    npc: "None",
    thread: "None",
    wallet: "0G ; 0S ; 0C",
    walletInitialized: false,
    npcMemory: {} as Record<string, unknown>,
    pendingNpcDebugQuery: null,
    pendingNpcMemoryCommand: null,
    userStatus: { ...DEFAULT_USER_STATUS },
};

export const RACE_KEYWORDS = [
    "Kitsune", "Catkin", "Dragonkin", "Angel", "Demon",
    "Vampire", "Pixie", "Fey", "Elf", "Dwarf", "Orc", "Human",
];

export const GARMENT_NAMES = [
    "shirt", "blouse", "tunic", "jacket", "coat", "cloak", "mantle", "cape",
    "hood", "pants", "trousers", "jeans", "shorts", "skirt", "leggings",
    "boots", "shoes", "sandals", "gloves", "mask", "veil", "hat", "cap",
    "helmet", "apron", "vest", "corset", "sash", "belt", "scarf", "shawl",
    "wrap", "dress", "gown", "robe", "uniform", "armor", "armour", "sleeve",
    "sleeves", "collar", "hem", "cuff", "cuffs", "waistband",
    "underwear", "bra", "panties", "boxers", "briefs",
];

export const WEAPON_KEYWORDS = [
    "sword", "blade", "dagger", "knife", "staff", "bow", "arrow", "axe",
    "hammer", "mace", "spear", "lance", "whip", "shield", "wand", "scepter",
    "rapier", "scimitar", "katana", "halberd", "polearm", "scythe", "club",
    "flail", "crossbow", "dart", "shuriken", "chakram", "saber",
];

export const ITEM_KEYWORDS = [
    "pendant", "necklace", "ring", "brooch", "pin", "amulet", "talisman",
    "charm", "bracelet", "bangle", "earring", "crown", "tiara", "medal",
    "badge", "document", "letter", "scroll", "book", "map", "note",
    "journal", "diary", "key", "lockpick", "potion", "vial", "herb",
    "ingredient", "pouch", "bag", "sack", "bottle", "flask", "lantern",
    "torch", "rope",
];

export const OBJECT_DAMAGE_WORDS = [
    "door", "table", "wall", "window", "floor", "ground", "object", "barrel",
    "crate", "chair", "bench", "desk", "shelf", "cabinet", "gate", "fence",
    "stone", "rock", "boulder", "pillar", "column", "statue", "post",
    "rail", "railing", "counter", "wood", "plank", "beam", "brick",
];
