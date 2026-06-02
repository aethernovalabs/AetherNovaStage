import type {NpcMemoryStore, NpcMemoryEntry, NpcHeaderMemoryEntry, MoodInference, BehaviorEvidence, RelationshipUpdate} from "../types";
import {cleanFragment, normalizeLineEndings, sameText} from "../utils/text";
import {escapeRegExp} from "../utils/regex";
import {
    cleanNpcMemoryName,
    firstNameOf,
    cleanMemoryField,
    cleanFactText,
    cleanMemoryLabel,
    mergeUniqueList,
    clampBehaviorScore,
    normalizeMemoryLabelList,
    normalizeRelationshipList,
} from "./npcMemoryHelpers";
import {npcNameRegexSource} from "./npcMemoryState";

const OPPOSITE_TRAIT_PAIRS: Record<string, string[]> = {
    happy: ["sad"],
    sad: ["happy"],
    calm: ["angry", "tense"],
    angry: ["calm"],
    tense: ["calm"],
    trusting: ["suspicious", "distrustful"],
    suspicious: ["trusting"],
    affectionate: ["cold", "distant", "detached"],
    cold: ["affectionate", "warm"],
    playful: ["serious", "formal"],
    teasing: ["serious", "formal"],
    serious: ["playful", "teasing"],
    formal: ["playful", "teasing", "affectionate", "possessive", "jealous"],
    protective: ["hostile"],
    hostile: ["protective"],
    respectful: ["arrogant"],
    arrogant: ["respectful"],
    loyal: ["defiant", "rebellious"],
    defiant: ["loyal", "obedient"],
    obedient: ["defiant", "rebellious"],
    rebellious: ["loyal", "obedient"],
    brave: ["fearful"],
    fearful: ["brave"],
    possessive: ["detached"],
    detached: ["possessive"],
    jealous: ["secure"],
    secure: ["jealous"],
    proud: ["humble"],
    humble: ["proud"],
    wise: ["reckless"],
    reckless: ["wise"],
    defensive: ["relaxed", "open"],
    relaxed: ["defensive", "tense"],
    dismissive: ["affectionate", "attentive"],
};

const NEGATION_CONTRAST_PATTERNS = [
    /\bnot\s+\w+[\s,]+(?:but|rather|only|merely|simply)\s+\w+/i,
    /\bnot\s+out\s+of\s+\w+[\s,]+(?:but|rather|only)\s+\w+/i,
    /\bnot\s+[\w]+[.;:]\s*(?:rather|instead)\s+\w+/i,
    /\bwithout\s+(?:any\s+)?\w+/i,
    /\bno\s+\w+/i,
    /\bless\s+\w+\s+than\s+\w+/i,
    /\bmore\s+\w+\s+than\s+\w+/i,
];

const SUPPRESSED_MOOD_PHRASES: Array<{pattern: RegExp; suppressedTags: string[]}> = [
    {pattern: /\b(lost its teasing edge|no longer teasing|without teasing|teasing faded|teasing vanished)\b/i, suppressedTags: ["teasing", "playful"]},
    {pattern: /\b(not amused|without amusement|amusement faded|not laughing|no hint of amusement)\b/i, suppressedTags: ["amused"]},
    {pattern: /\b(not afraid|without fear|fear faded|fearless|no fear|not fearful)\b/i, suppressedTags: ["afraid", "fearful"]},
    {pattern: /\b(not cold|not out of coldness|not coldly|without coldness)\b/i, suppressedTags: ["cold"]},
    {pattern: /\b(no hostility|not hostile|without hostility)\b/i, suppressedTags: ["hostile"]},
];

function detectSuppressedMoodTags(context: string): Set<string> {
    const suppressed = new Set<string>();
    const lower = context.toLowerCase();
    for (const {pattern, suppressedTags} of SUPPRESSED_MOOD_PHRASES) {
        if (pattern.test(lower)) {
            for (const tag of suppressedTags) {
                suppressed.add(tag);
            }
        }
    }
    return suppressed;
}

function hasRequiredEvidence(tag: string, context: string): boolean {
    if (tag === "afraid" || tag === "fearful") {
        const directFear = /\b(afraid|fearful|frightened|terrified|scared|fear\s+flickered|voice\s+trembled\s+in\s+fear|stepped\s+back\s+in\s+fear|eyes\s+widened\s+with\s+fear|panic|dread)\b/i;
        return directFear.test(context);
    }
    if (tag === "cold") {
        const directCold = /\b(coldly|icy|emotionless|chilling|cold\s+disdain|cold\s+contempt|warmth\s+(?:vanished|drained)|detached\s+and\s+cold|frosty|chillingly)\b/i;
        if (directCold.test(context)) return true;
        const formalEvidence = /\b(formal|stern|authoritative|commanding|composed|controlled|chin\s+lifted)\b/i;
        if (formalEvidence.test(context)) return false;
        return true;
    }
    return true;
}

const MOOD_ONLY_TRAITS = new Set([
    "happy",
    "sad",
    "angry",
    "calm",
    "embarrassed",
    "tense",
    "afraid",
    "confused",
    "relieved",
    "shy",
    "proud",
    "wise",
    "defensive",
    "relaxed",
    "annoyed",
    "curious",
    "amused",
    "excited",
    "solemn",
    "bored",
    "tired",
    "worried",
    "nervous",
    "watchful",
    "stern",
    "controlled",
    "composed",
    "authoritative",
    "commanding",
]);

const STABLE_BEHAVIOR_CANDIDATES = new Set([
    "protective",
    "possessive",
    "playful",
    "teasing",
    "formal",
    "suspicious",
    "hostile",
    "affectionate",
    "cold",
    "loyal",
    "obedient",
    "defiant",
    "respectful",
    "arrogant",
    "cautious",
    "manipulative",
    "jealous",
    "dismissive",
    "brave",
    "fearful",
    "secure",
    "humble",
    "reckless",
]);

const ROMANTIC_VOLATILE_TRAITS = new Set(["affectionate", "possessive", "jealous"]);

const BUSINESS_CONTEXT_PATTERN = /\b(?:business|deal|contract|payment|paid|price|coin|coins|wallet|commission|merchant|broker|client|customer|supplier|trade|transaction|negotiate|negotiation|bargain|market|job|work|service|professional|formal employment|business partner|partnership|agreement|invoice|fee|wage|salary)\b/i;
const EXPLICIT_ROMANCE_CONTEXT_PATTERN = /\b(?:romantic|romance|lover|lovers?|i love you|love you too|confesses?\s+love|confession accepted|proposal accepted|marriage accepted|kiss(?:es|ed|ing)?|flirts?|flirting|desire|attraction|intimate|intimacy|courtship|date|dating|caress(?:es|ed|ing)?|cuddles?|loving)\b/i;
const SOCIAL_STRESS_CONTEXT_PATTERN = /\b(?:angry|furious|rage|afraid|fearful|terrified|hostile|suspicious|wary|distrust|cautious|tense|threatens?|attacks?|betrays?|betrayal|argument|conflict)\b/i;

function getOppositeReduction(evidenceWeight: number): number {
    if (evidenceWeight >= 1) return 1;
    if (evidenceWeight >= 0.5) return 0.5;
    if (evidenceWeight > 0) return 0.2;
    return 0;
}

function reduceBehaviorScore(scores: Record<string, number>, label: string, amount: number): void {
    const clean = cleanMemoryLabel(label, "");
    if (clean.length === 0 || amount <= 0 || scores[clean] == null || scores[clean] <= 0) {
        return;
    }

    const next = clampBehaviorScore(scores[clean] - amount);
    if (next <= 0) {
        delete scores[clean];
    } else {
        scores[clean] = next;
    }
}

function hasBusinessContext(context: string): boolean {
    return BUSINESS_CONTEXT_PATTERN.test(context);
}

function hasExplicitRomanceContext(context: string): boolean {
    return EXPLICIT_ROMANCE_CONTEXT_PATTERN.test(context);
}

function isMoodOnlyTrait(label: string): boolean {
    return MOOD_ONLY_TRAITS.has(label);
}

function mergeBehaviorEvidence(evidence: BehaviorEvidence[]): BehaviorEvidence[] {
    const merged = new Map<string, number>();
    for (const item of evidence) {
        const label = cleanMemoryLabel(item.label, "");
        if (label.length === 0) {
            continue;
        }
        const current = merged.get(label) ?? 0;
        merged.set(label, Math.max(current, item.weight));
    }

    return Array.from(merged.entries()).map(([label, weight]) => ({
        label,
        weight: weight >= 3 ? 1 : weight >= 2 ? 0.5 : 0.1,
    }));
}

function detectNegation(text: string, traitLabel: string): boolean {
    const lowerText = text.toLowerCase();
    const traitWords = traitLabel.toLowerCase().split(/\s+/);

    for (const pattern of NEGATION_CONTRAST_PATTERNS) {
        const match = lowerText.match(pattern);
        if (match == null) {
            continue;
        }

        const matchedStr = match[0].toLowerCase();
        for (const word of traitWords) {
            if (word.length < 3) continue;
            if (matchedStr.includes(word) || matchedStr.includes(word.replace(/y$/, "i"))) {
                return true;
            }
        }

        const negatedWord = match[0].split(/\s+/).slice(1, 3).join(" ");
        for (const word of traitWords) {
            if (negatedWord.includes(word)) {
                return true;
            }
        }
    }

    return false;
}

function determineTraitTarget(
    sentence: string,
    traitLabel: string,
    npcName: string,
    _memory: NpcMemoryStore,
): "user" | "other-npc" | "object" | "general" {
    const lower = sentence.toLowerCase();
    const userNamePattern = /\{\{user\}\}/i;

    if (userNamePattern.test(lower)) {
        return "user";
    }

    const first = firstNameOf(npcName).toLowerCase();
    const selfPattern = new RegExp(`\\b${npcNameRegexSource(first)}\\b`, "i");
    const otherNpcNames = Object.values(_memory)
        .map((entry) => entry.name)
        .filter((name) => name.toLowerCase() !== npcName.toLowerCase());

    for (const otherName of otherNpcNames) {
        const otherFirst = firstNameOf(otherName).toLowerCase();
        if (otherFirst.length > 0 && otherFirst !== first) {
            const otherPattern = new RegExp(`\\b${npcNameRegexSource(otherFirst)}\\b`, "i");
            if (otherPattern.test(lower)) {
                return "other-npc";
            }
        }
        if (otherName.toLowerCase() !== npcName.toLowerCase()) {
            const otherPattern = new RegExp(`\\b${npcNameRegexSource(otherName)}\\b`, "i");
            if (otherPattern.test(lower)) {
                return "other-npc";
            }
        }
    }

    const objectCues = /\b(?:over\s+(?:the|an?|that|this)|toward\s+(?:the|an?|that|this)|at\s+(?:the|an?|that|this)|after\s+(?:the|an?|that|this)|for\s+(?:the|an?|that|this))\s+(?!\w+self\b)(\w+)/i;
    if (objectCues.test(lower)) {
        return "object";
    }

    return "general";
}

function extractTraitsFromText(
    npcName: string,
    context: string,
    statusText: string,
    memory: NpcMemoryStore,
): Array<{label: string; weight: number; target: string}> {
    const results: Array<{label: string; weight: number; target: string}> = [];
    const searchable = `${statusText}\n${context}`.toLowerCase();
    const sentences = searchable.split(/[.!?\n]+/).filter(Boolean);

    const traitPatterns: Array<{label: string; pattern: RegExp; weight: number; requiresUserTarget: boolean}> = [
        {label: "happy", pattern: /\b(happy|joyful|delighted|cheerful|gleeful|elated|content)\b/, weight: 1, requiresUserTarget: false},
        {label: "sad", pattern: /\b(sad|sorrowful|grief-stricken|mournful|tearful|heartbroken|weepy|gloomy|melancholy)\b/, weight: 1, requiresUserTarget: false},
        {label: "angry", pattern: /\b(angry|furious|rage|enraged|irate|livid|seething)\b/, weight: 1, requiresUserTarget: false},
        {label: "annoyed", pattern: /\b(annoyed|irritated|exasperated|huff|scoff|rolls?\s+eyes|sigh|grumbles?)\b/, weight: 1, requiresUserTarget: false},
        {label: "calm", pattern: /\b(calm|composed|serene|peaceful|tranquil|collected|unruffled)\b/, weight: 1, requiresUserTarget: false},
        {label: "tense", pattern: /\b(tense|strained|uneasy|on edge|stiffen|rigid|clenched|taut|wired)\b/, weight: 1, requiresUserTarget: false},
        {label: "afraid", pattern: /\b(afraid|scared|fearful|terrified|frightened|panicked|shaken|alarmed)\b/, weight: 1, requiresUserTarget: false},
        {label: "curious", pattern: /\b(curious|intrigued|interested|studying|examining|peers? closer|leans? closer|inquisitive)\b/, weight: 1, requiresUserTarget: false},
        {label: "embarrassed", pattern: /\b(embarrassed|flustered|blush|bashful|shy|flustered|mortified)\b/, weight: 1, requiresUserTarget: false},
        {label: "amused", pattern: /\b(amused|laughs?|chuckles?|smirks?|grins?|smiling|lips? curled|arched brow|arch(?:ed)?\s+brow)\b/, weight: 1, requiresUserTarget: false},
        {label: "confused", pattern: /\b(confused|puzzled|uncertain|bewildered|tilts? head|frowns?|baffled)\b/, weight: 1, requiresUserTarget: false},
        {label: "excited", pattern: /\b(excited|eager|enthusiastic|animated|beams?|brightens?|thrilled)\b/, weight: 1, requiresUserTarget: false},
        {label: "solemn", pattern: /\b(solemn|grave|serious|somber|pensive|contemplative|sober)\b/, weight: 1, requiresUserTarget: false},
        {label: "relieved", pattern: /\b(relieved|relaxes?|softens?|exhales?|sags?\s+with relief)\b/, weight: 1, requiresUserTarget: false},
        {label: "bored", pattern: /\b(bored|uninterested|disinterested|listless|apathetic|yawns?)\b/, weight: 1, requiresUserTarget: false},
        {label: "worried", pattern: /\b(worried|concerned|anxious|apprehensive|troubled|uneasy)\b/, weight: 1, requiresUserTarget: false},
        {label: "protective", pattern: /\b(protects?|protected|guarding|guards?|defends?|defended|shields?|stands?\s+between|shield|guardian)\b/, weight: 2, requiresUserTarget: false},
        {label: "possessive", pattern: /\b(possessive|possessively|mine|claim|claims?|claimed|belongs?\s+to\s+me|stak(?:e|es)?\s+claim)\b/, weight: 2, requiresUserTarget: true},
        {label: "playful", pattern: /\b(playful|mischievous|whimsical|light.?hearted|banter|jest)\b/, weight: 1, requiresUserTarget: false},
        {label: "teasing", pattern: /\b(teasing|teases?|teased|teasingly|ribbing|chaffing)\b/, weight: 1, requiresUserTarget: false},
        {label: "formal", pattern: /\b(formal|protocol|courteous|proper|courtly|professional|cordial)\b/, weight: 1, requiresUserTarget: false},
        {label: "suspicious", pattern: /\b(suspicious|wary|guarded|distrust|cautious|skeptical|narrowed eyes|side-eye)\b/, weight: 1, requiresUserTarget: false},
        {label: "hostile", pattern: /\b(hostile|attacks?|attacked|threatens?|threatened|betray|orders?\s+(?:your|their)\s+capture|tries?\s+to\s+kill|aggressive)\b/, weight: 2, requiresUserTarget: false},
        {label: "affectionate", pattern: /\b(affectionate|gentle|warm|tender|caress|hugs?|kisses?|loving|cuddles?)\b/, weight: 2, requiresUserTarget: true},
        {label: "cold", pattern: /\b(cold|distant|icy|unfriendly|detached|aloof|frosty|chilly)\b/, weight: 1, requiresUserTarget: false},
        {label: "loyal", pattern: /\b(loyal|devoted|faithful|steadfast|stands?\s+with|remains?\s+by\s+(?:your|{{user}})\s+side)\b/, weight: 2, requiresUserTarget: false},
        {label: "respectful", pattern: /\b(respectful|deferential|honors?|honour|reverent|obeisance|bows?|curtsey)\b/, weight: 1, requiresUserTarget: false},
        {label: "arrogant", pattern: /\b(arrogant|condescending|smug|superior|haughty|disdainful|pompous)\b/, weight: 1, requiresUserTarget: false},
        {label: "obedient", pattern: /\b(obeys?|obedient|follows?\s+(?:your|{{user}}'?s?)\s+order|accepts?\s+(?:your|{{user}}'?s?)\s+command|submissive)\b/, weight: 1, requiresUserTarget: false},
        {label: "defiant", pattern: /\b(defiant|defies?|rebels?|rebellious|insubordinate|disobedient|challenges?)\b/, weight: 1, requiresUserTarget: false},
        {label: "fearful", pattern: /\b(fearful|frightened|terrified|trembling|quivering|cowering|timid)\b/, weight: 1, requiresUserTarget: false},
        {label: "brave", pattern: /\b(brave|courageous|fearless|valiant|undaunted|bold|intrepid)\b/, weight: 1, requiresUserTarget: false},
        {label: "jealous", pattern: /\b(jealous|envy|envious|green.?eyed)\b/, weight: 1, requiresUserTarget: true},
        {label: "proud", pattern: /\b(proud|pride|prideful|dignified)\b/, weight: 1, requiresUserTarget: false},
        {label: "wise", pattern: /\b(wise|sage|knowledgeable|insightful|perceptive|astute)\b/, weight: 1, requiresUserTarget: false},
        {label: "shy", pattern: /\b(shy|timid|bashful|reserved|withdrawn|reticent)\b/, weight: 1, requiresUserTarget: false},
        {label: "nervous", pattern: /\b(nervous|anxious|jittery|fidget|restless|uneasy)\b/, weight: 1, requiresUserTarget: false},
        {label: "manipulative", pattern: /\b(manipulative|calculating|deceptive|scheming|conniving)\b/, weight: 2, requiresUserTarget: false},
        {label: "cautious", pattern: /\b(cautious|careful|heedful|watchful|vigilant|attentive)\b/, weight: 1, requiresUserTarget: false},
        {label: "dismissive", pattern: /\b(dismissive|dismisses?|dismissed|brushes?\s+off|waves?\s+off|ignores?|ignored)\b/, weight: 1, requiresUserTarget: false},
        {label: "defensive", pattern: /\b(defensive|defense|defend|defends?|defended|defending|guard\s+(?:stance|position))\b/, weight: 1, requiresUserTarget: false},
        {label: "relaxed", pattern: /\b(relaxed|at ease|unwind|loose|unclenched|settling\s+in)\b/, weight: 1, requiresUserTarget: false},
        {label: "watchful", pattern: /\b(watchful|observant|monitoring|surveying|scanning)\b/, weight: 1, requiresUserTarget: false},
        {label: "authoritative", pattern: /\b(authoritative|authority|commands?\s+(?!\w+ing)|ordering\s+(?!food|drink)|step aside|you heard me|i said)\b/, weight: 2, requiresUserTarget: false},
        {label: "commanding", pattern: /\b(commanding|giving orders|issues?\s+orders|in charge)\b/, weight: 2, requiresUserTarget: false},
        {label: "stern", pattern: /\b(stern|strict|firm|unsmiling|unyielding|jaw\s+set)\b/, weight: 1, requiresUserTarget: false},
        {label: "controlled", pattern: /\b(controlled|composed|measured|restrained|contained|voice\s+level)\b/, weight: 1, requiresUserTarget: false},
        {label: "composed", pattern: /\b(composed|poised|collected|unruffled|gathered)\b/, weight: 1, requiresUserTarget: false},
    ];

    for (const trait of traitPatterns) {
        const match = searchable.match(trait.pattern);
        if (match == null) {
            continue;
        }

        if (detectNegation(searchable, trait.label)) {
            continue;
        }

        const matchSentence = sentences.find((sent) => trait.pattern.test(sent)) ?? searchable;
        const target = determineTraitTarget(matchSentence, trait.label, npcName, memory);
        if (trait.requiresUserTarget && target !== "user") {
            continue;
        }
        let weight = trait.weight;

        if ((trait.label === "possessive" || trait.label === "protective") && target === "user") {
            weight = Math.min(weight + 1, 3);
        }

        if (trait.label === "defensive" || trait.label === "suspicious") {
            const strongCues = /\b(settl(?:e|es|ing)\s+into|adopt(?:s|ed)?|take\s+(?:up|on)|braces?\s+(?:for|against))/i;
            if (strongCues.test(matchSentence)) {
                weight = Math.min(weight + 1, 2);
            }
        }

        results.push({label: trait.label, weight: Math.min(weight, 3), target});
    }

    return results;
}

function mergeMultiTagMood(
    previousMood: string,
    newMoodLabels: string[],
    rebuildFromNew: boolean,
    suppressedTags: Set<string>,
): string {
    if (newMoodLabels.length === 0) {
        return previousMood;
    }

    if (previousMood === "unknown" || previousMood === "neutral" || rebuildFromNew) {
        const result = newMoodLabels
            .map((l) => cleanMemoryLabel(l, ""))
            .filter(Boolean)
            .slice(0, 6);
        return result.length > 0 ? result.join(", ") : previousMood;
    }

    const previous = previousMood.split(/\s*,\s*/)
        .map((m) => m.toLowerCase().trim())
        .filter(Boolean);
    const merged: string[] = [];
    const seen = new Set<string>();

    for (const label of newMoodLabels) {
        const clean = cleanMemoryLabel(label, "");
        if (clean.length > 0 && !seen.has(clean)) {
            merged.push(clean);
            seen.add(clean);
        }
    }

    for (const label of previous) {
        const clean = cleanMemoryLabel(label, "");
        if (clean.length === 0 || seen.has(clean) || suppressedTags.has(clean)) {
            continue;
        }
        merged.push(clean);
        seen.add(clean);
    }

    return merged.slice(0, 6).join(", ");
}

function npcMemorySentences(context: string): string[] {
    return normalizeLineEndings(context)
        .split(/(?:[.!?]\s+|\n+)/g)
        .map(cleanFragment)
        .filter((sentence) => sentence.length > 0);
}

function npcMentionedInText(name: string, text: string): boolean {
    return new RegExp(`\\b${npcNameRegexSource(name)}\\b`, "i").test(text)
        || new RegExp(`\\b${npcNameRegexSource(firstNameOf(name))}\\b`, "i").test(text);
}

function nearNpcContext(name: string, context: string): string {
    const sentences = npcMemorySentences(context);
    const related = sentences.filter((sentence) => npcMentionedInText(name, sentence));
    return related.join(" ");
}

function userActionTargetsNpc(name: string, context: string, actionSource: string): boolean {
    const nameSource = npcNameRegexSource(name);
    const firstNameSource = npcNameRegexSource(firstNameOf(name));
    const targetSource = `(?:${nameSource}|${firstNameSource})`;

    return new RegExp(`\\b(?:i|you|\\{\\{user\\}\\})(?:\\s+\\w+){0,3}\\s+${actionSource}\\s+${targetSource}\\b`, "i").test(context)
        || new RegExp(`\\b${targetSource}\\b[^.!?\\n]{0,40}\\b(?:was|is|had been|has been)\\s+${actionSource}\\b`, "i").test(context);
}

function extractNpcDialogueFromNarrative(npcName: string, aliases: string[], narrative: string): string[] {
    const dialogueLines: string[] = [];
    const searchNames = [npcName, ...aliases].filter((n) => n.length > 0);

    for (const name of searchNames) {
        const escaped = npcNameRegexSource(name);
        const pattern = new RegExp(
            `(?:\\*{0,2})\\b${escaped}\\b(?:\\*{0,2})\\s*:\\s*(?:"[^"]*"|'[^']*')`,
            "gi",
        );
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(narrative)) !== null) {
            dialogueLines.push(match[0]);
        }
    }

    return dialogueLines;
}

function buildNpcSpecificEvidenceContext(params: {
    npcName: string;
    aliases: string[];
    npcHeaderStatus: string;
    narrative: string;
}): string {
    const {npcName, aliases, npcHeaderStatus, narrative} = params;
    const searchNames = [npcName, ...aliases].filter((n) => n.length > 0);

    const sentences = npcMemorySentences(narrative);
    const relatedSentences = sentences.filter((sentence) =>
        searchNames.some((name) =>
            new RegExp(`\\b${npcNameRegexSource(name)}\\b`, "i").test(sentence),
        ),
    );

    const dialogueLines = extractNpcDialogueFromNarrative(npcName, aliases, narrative);

    const parts = [
        npcHeaderStatus,
        ...relatedSentences,
        ...dialogueLines,
    ].filter((part) => part.length > 0);

    return parts.join("\n");
}

function normalizeRoleTitle(value: string): string {
    return cleanFragment(value)
        .toLowerCase()
        .replace(/\b[a-z]/g, (char) => char.toUpperCase())
        .replace(/\bBroker\b/g, "broker");
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

function npcSocialContext(headerEntry: NpcHeaderMemoryEntry, context: string): string {
    const nearby = nearNpcContext(headerEntry.name, context);
    return [headerEntry.status, nearby].filter((part) => part.length > 0).join("\n");
}

function applyRelationshipLabels(previous: string[], incoming: string[]): string[] {
    let labels = normalizeRelationshipList(previous);
    const next = normalizeRelationshipList(incoming);

    if (next.some((label) => label !== "stranger")) {
        labels = labels.filter((label) => label !== "stranger");
    }
    if (next.includes("enemy")) {
        labels = labels.filter((label) => !["ally", "friend", "lover", "romantic interest", "romantic tension", "subordinate"].includes(label));
    }
    if (next.includes("lover")) {
        labels = labels.filter((label) => !["stranger", "romantic interest", "romantic tension"].includes(label));
    }
    if (next.includes("friend") || next.includes("ally") || next.includes("subordinate") || next.includes("acquaintance")) {
        labels = labels.filter((label) => label !== "stranger");
    }

    return normalizeRelationshipList(mergeUniqueList(labels.concat(next), 6));
}

function addRelationshipModifier(previous: string[], modifier: string): string[] {
    const labels = normalizeRelationshipList(previous).filter((label) => label !== "stranger" || modifier === "stranger");
    return normalizeRelationshipList(mergeUniqueList(labels.concat(cleanMemoryLabel(modifier, "")), 6));
}

function applyStableRelationshipModifiers(labels: string[], stableBehavior: string[]): string[] {
    let next = normalizeRelationshipList(labels);
    const stable = new Set(stableBehavior);

    if ((next.includes("ally") || next.includes("acquaintance")) && stable.has("suspicious")) {
        next = addRelationshipModifier(next, "suspicious");
    }
    if (next.includes("acquaintance") && stable.has("formal")) {
        next = addRelationshipModifier(next, "formal");
    }

    return next;
}

export function inferNpcRoleTitle(headerEntry: NpcHeaderMemoryEntry, previous: NpcMemoryEntry | null, context: string): string {
    const nearby = nearNpcContext(headerEntry.name, context);
    const direct = inferRoleTitleFromContext(headerEntry.name, `${headerEntry.status}\n${nearby}`) || headerEntry.titleFromName;

    return cleanMemoryField(direct || previous?.roleTitle, "Unknown role/title");
}

export function inferNpcPhysicalExtra(headerEntry: NpcHeaderMemoryEntry, previous: NpcMemoryEntry | null, context: string): string {
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

export function inferNpcMood(headerEntry: NpcHeaderMemoryEntry, previous: NpcMemoryEntry | null, context: string): MoodInference {
    const npcName = headerEntry.name;
    const aliases = [firstNameOf(npcName)].filter((n) => n.length > 0 && n.toLowerCase() !== npcName.toLowerCase());

    const npcContext = buildNpcSpecificEvidenceContext({
        npcName,
        aliases,
        npcHeaderStatus: headerEntry.status ?? "",
        narrative: context,
    });

    const socialContext = npcSocialContext(headerEntry, npcContext);
    const searchable = socialContext.toLowerCase();
    const statusText = (headerEntry.status ?? "").toLowerCase();

    const traits = extractTraitsFromText(headerEntry.name, npcContext, headerEntry.status ?? "", {});
    const suppressedTags = detectSuppressedMoodTags(npcContext);

    const moodLabels = traits
        .filter((t) => !detectNegation(searchable, t.label))
        .filter((t) => !suppressedTags.has(t.label))
        .filter((t) => hasRequiredEvidence(t.label, npcContext))
        .map((t) => t.label);

    const toneMap: Record<string, string> = {
        angry: "tense", annoyed: "tense", tense: "tense", hostile: "tense",
        sad: "soft", afraid: "tense", embarrassed: "soft", relieved: "warm",
        amused: "playful", playful: "playful", teasing: "playful",
        cold: "cold",
        curious: "curious", confused: "uncertain",
        calm: "calm", relaxed: "calm",
        excited: "warm", happy: "warm", affectionate: "warm",
        solemn: "serious", serious: "serious",
        jealous: "tense", suspicious: "tense", defensive: "tense",
        protective: "protective", possessive: "protective",
        watchful: "watchful", cautious: "watchful",
        authoritative: "authoritative", commanding: "authoritative",
        stern: "authoritative", formal: "formal",
        controlled: "controlled", composed: "controlled",
    };

    const tonePriority = [
        "hostile",
        "authoritative",
        "protective",
        "tense",
        "serious",
        "playful",
        "warm",
        "calm",
        "curious",
        "formal",
        "controlled",
        "watchful",
        "soft",
        "uncertain",
        "neutral",
        "cold",
    ];

    let tone = previous?.lastInteractionTone ?? "neutral";

    if (moodLabels.length > 0) {
        const toneCandidates = moodLabels.map((l) => toneMap[l]).filter(Boolean);
        const uniqueTones = [...new Set(toneCandidates)];
        for (const priority of tonePriority) {
            if (uniqueTones.includes(priority)) {
                tone = priority;
                break;
            }
        }
    }

    if (moodLabels.length >= 2) {
        const fresh = moodLabels
            .map((l) => cleanMemoryLabel(l, ""))
            .filter(Boolean)
            .slice(0, 6);
        return {currentMood: fresh.join(", "), lastInteractionTone: tone};
    }

    if (moodLabels.length === 1) {
        const merged = mergeMultiTagMood(
            previous?.currentMood ?? "unknown",
            moodLabels,
            false,
            suppressedTags,
        );
        return {currentMood: merged, lastInteractionTone: tone};
    }

    const statusMoodMatch = /\b(angry|annoyed|sad|happy|calm|curious|nervous|excited|bored|tired|confused|worried|relaxed|serious|playful|shy|cold|distant|possessive|defensive|suspicious|jealous|proud|teasing|watchful|cautious|authoritative|commanding|stern|controlled|composed)\b/i.exec(statusText);
    if (statusMoodMatch != null) {
        const statusLabel = statusMoodMatch[1].toLowerCase();
        if (!suppressedTags.has(statusLabel) && hasRequiredEvidence(statusLabel, npcContext)) {
            return {currentMood: statusLabel, lastInteractionTone: tone};
        }
    }

    return {
        currentMood: previous?.currentMood ?? "neutral",
        lastInteractionTone: previous?.lastInteractionTone,
    };
}

export function inferNpcBehaviorEvidence(headerEntry: NpcHeaderMemoryEntry, context: string, memory: NpcMemoryStore = {}): BehaviorEvidence[] {
    const evidence: BehaviorEvidence[] = [];
    const traits = extractTraitsFromText(headerEntry.name, context, headerEntry.status ?? "", memory);

    for (const trait of traits) {
        const clean = cleanMemoryLabel(trait.label, "");
        if (clean.length === 0) {
            continue;
        }

        if (isMoodOnlyTrait(clean)) {
            continue;
        }

        if (trait.target === "other-npc" || trait.target === "object") {
            continue;
        }

        const weight = Math.min(trait.weight, 3);
        evidence.push({label: clean, weight});
    }

    return mergeBehaviorEvidence(evidence);
}

export function updateBehaviorScores(previousScores: Record<string, number>, evidence: BehaviorEvidence[], context: string = ""): Record<string, number> {
    const next: Record<string, number> = {};
    const evidenceLabels = new Set(evidence.map((item) => cleanMemoryLabel(item.label, "")).filter(Boolean));
    const businessContext = hasBusinessContext(context);
    const explicitRomanceContext = hasExplicitRomanceContext(context);
    const businessWithoutRomance = businessContext && !explicitRomanceContext;

    for (const [label, score] of Object.entries(previousScores)) {
        const clean = cleanMemoryLabel(label, "");
        if (clean.length > 0 && Number.isFinite(score)) {
            next[clean] = clampBehaviorScore(score);
        }
    }

    const highSuspicion = (next["suspicious"] ?? 0) >= 4 || (next["cautious"] ?? 0) >= 4;

    for (const item of evidence) {
        const label = cleanMemoryLabel(item.label, "");
        if (label.length === 0) {
            continue;
        }

        if (label === "affectionate" && highSuspicion && item.weight <= 0.1) {
            continue;
        }

        const weight = ROMANTIC_VOLATILE_TRAITS.has(label) && businessWithoutRomance
            ? Math.min(item.weight, 0.1)
            : item.weight;

        if (weight <= 0) {
            continue;
        }

        next[label] = clampBehaviorScore((next[label] ?? 0) + weight);
    }

    for (const item of evidence) {
        const label = cleanMemoryLabel(item.label, "");
        if (label.length === 0) {
            continue;
        }

        const opposites = OPPOSITE_TRAIT_PAIRS[label];
        if (opposites == null || opposites.length === 0) {
            continue;
        }

        const reduction = getOppositeReduction(item.weight);
        if (reduction <= 0) {
            continue;
        }

        for (const oppositeLabel of opposites) {
            const cleanOpposite = cleanMemoryLabel(oppositeLabel, "");
            if (cleanOpposite.length > 0 && next[cleanOpposite] != null && next[cleanOpposite] > 0) {
                reduceBehaviorScore(next, cleanOpposite, reduction);
            }
        }
    }

    if (businessWithoutRomance) {
        for (const label of ROMANTIC_VOLATILE_TRAITS) {
            const wasWeaklyReinforced = evidenceLabels.has(label);
            reduceBehaviorScore(next, label, wasWeaklyReinforced ? 0.25 : 0.75);
        }
    } else {
        for (const label of ROMANTIC_VOLATILE_TRAITS) {
            if (!evidenceLabels.has(label) && (next[label] ?? 0) >= 4) {
                reduceBehaviorScore(next, label, 0.2);
            }
        }
    }

    if (!explicitRomanceContext && SOCIAL_STRESS_CONTEXT_PATTERN.test(context)) {
        reduceBehaviorScore(next, "affectionate", 0.4);
        reduceBehaviorScore(next, "possessive", 0.3);
    }

    return next;
}

export function stableBehaviorLabels(previousStable: string[], scores: Record<string, number>): string[] {
    const previousSet = new Set(previousStable.map((label) => cleanMemoryLabel(label, "")).filter(Boolean));
    const result: string[] = [];

    for (const [label, score] of Object.entries(scores)) {
        const clean = cleanMemoryLabel(label, "");
        if (clean.length === 0) {
            continue;
        }
        if (score >= 4) {
            result.push(clean);
        } else if (score >= 2 && previousSet.has(clean)) {
            result.push(clean);
        }
    }

    result.sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
    return result.slice(0, 6);
}

export function inferNpcRelationshipUpdate(
    headerEntry: NpcHeaderMemoryEntry,
    previous: NpcMemoryEntry | null,
    context: string,
    stableBehavior: string[],
): RelationshipUpdate {
    const searchable = npcSocialContext(headerEntry, context);
    const businessWithoutRomance = hasBusinessContext(searchable) && !hasExplicitRomanceContext(searchable);
    let labels = previous?.relationshipWithUser?.length ? previous.relationshipWithUser : ["stranger"];
    const events: string[] = [];
    const addEvent = (nextLabels: string[], event: string): void => {
        labels = applyRelationshipLabels(labels, nextLabels);
        events.push(cleanFactText(event));
    };

    if (/\b(?:my name is|call me|i am called|i'm called|my name's)\b/i.test(searchable) && labels.includes("stranger")) {
        addEvent(["acquaintance", "formal"], `${headerEntry.firstName} learned {{user}}'s name or basic identity.`);
    }

    if (/\b(?:alliance formed|formed an alliance|temporary alliance|work together|working together|cooperate|cooperation|join forces|same goal|contract signed|accepted the contract)\b/i.test(searchable)) {
        addEvent(["ally"], `${headerEntry.firstName} formed cooperation or an alliance with {{user}}.`);
    }

    if (/\b(?:true friend|trusted friend|friendship|declares? (?:you|{{user}}) (?:as )?(?:a )?friend|calls? (?:you|{{user}}) (?:a )?friend)\b/i.test(searchable)
        && /\b(?:trust|trusted|saved|helped|protected|continued traveling|stood by|sincere|genuine)\b/i.test(searchable)) {
        addEvent(["friend"], `${headerEntry.firstName} accepted a supported friendship with {{user}}.`);
    }

    if (/\b(?:i love you|love you too|loves? you too|accepted (?:your|{{user}}'s) confession|confession accepted|accepted (?:your|{{user}}'s) proposal|marriage accepted|proposal accepted)\b/i.test(searchable)
        && /\b(?:i love you too|love you too|returns? (?:your|{{user}}'s) love|accepted (?:your|{{user}}'s) confession|confession accepted|marriage accepted|proposal accepted)\b/i.test(searchable)
        && !/\b(?:joking|pretending|acting|lying|mind control|forced|coerced)\b/i.test(searchable)) {
        addEvent(["lover"], `${headerEntry.firstName} mutually confirmed romantic love with {{user}}.`);
    } else if (/\b(?:confesses? love|i love you|romantic tension|flirts?|blush(?:es|ing)?|desire|attraction)\b/i.test(searchable)
        && !businessWithoutRomance
        && !/\b(?:i love you too|love you too|accepted (?:your|{{user}}'s) confession)\b/i.test(searchable)) {
        labels = addRelationshipModifier(labels, "romantic tension");
    }

    if (/\b(?:swears? loyalty|oath sworn|pledges? (?:loyalty|service)|becomes? (?:your|{{user}}'s) servant|officially works? for (?:you|{{user}})|formal employment|accepts? (?:your|{{user}}'s) command structure|surrenders? as (?:your|{{user}}'s) subordinate)\b/i.test(searchable)) {
        addEvent(["subordinate"], `${headerEntry.firstName} entered a clear subordinate structure under {{user}}.`);
    }

    if (/\b(?:declares? (?:you|{{user}}) (?:an )?enemy|enemy declared|betrays?|betrayal|attacks? (?:you|{{user}})|orders? (?:your|{{user}}'s) capture|tries? to kill (?:you|{{user}})|sworn enemy)\b/i.test(searchable)) {
        addEvent(["enemy"], `${headerEntry.firstName} entered open hostility with {{user}}.`);
    }

    if (/\b(?:rival|rivalry)\b/i.test(searchable)) {
        addEvent(["rival"], `${headerEntry.firstName} established a rivalry with {{user}}.`);
    }

    labels = applyStableRelationshipModifiers(labels, stableBehavior);

    return {
        relationshipWithUser: labels,
        events,
    };
}

const HIGH_VALUE_FACT_CUES = [
    /\b(?:his name|her name|my name|their name|true name|real name)\b/i,
    /\b(?:memory loss|amnesia|forget|forgotten|lost memories|kehilangan ingatan)\b/i,
    /\b(?:secret|secretly|confess|confessed|confession|admit|admitted|reveal|revealed|disclose|disclosed)\b/i,
    /\b(?:hidden\s+(?:plan|relic|treasure|weapon|passage|identity))|true\s+identity|real\s+identity\b/i,
    /\b(?:private\s+(?:warning|promise|matter|conversation|secret))|privately\s+(?:told|warned|promised|admitted)\b/i,
    /\b(?:threaten|threatened|threatening|plot|conspiracy|betray|betrayal|kill|assassinate|assassination)\b/i,
    /\b(?:code\s+(?:phrase|word|signal)|password|safe\s+word)\b/i,
    /\b(?:entrusted|entrust)\b/i,
    /\b(?:fear\s+(?:of\s+losing|that)|afraid\s+(?:of\s+losing|that))\b/i,
    /\b(?:promise\s+(?:to|that)|vow|oath|swear|swore)\b/i,
];

const ORDINARY_DIALOGUE_PATTERNS = [
    /\b(?:(?:for\s+)?now|currently|right\s+now)\s+(?:we|i)\s+(?:need|have|should|must|will|want)\s+(?:to\s+)?/i,
    /\b(?:we\s+should|we\s+need\s+to|we\s+have\s+to|we\s+must|i\s+should|i\s+need\s+to|i\s+have\s+to|i\s+must)\b/i,
    /\b(?:meet\s+(?:with\s+)?(?:my|your|his|her|their|our|the)\s+(?:mother|father|parent|family|friend|contact|informant))/i,
    /\b(?:go\s+to\s+the|head\s+to\s+the|come\s+to\s+the|walk\s+to\s+the|travel\s+to\s+the)\b/i,
    /\b(?:let'?s?\s+(?:go|head|move|continue|find|see|talk|ask|meet))\b/i,
    /\b(?:don'?t\s+worr?y|no\s+worr?ies|it'?s?\s+fine|it'?s?\s+ok(?:ay)?)\b/i,
    /\b(?:we\s+will|i\s+will|we'?ll|i'?ll)\s+(?:see|find|look|go|come|meet|talk|ask|continue|wait)\b/i,
    /\bgather\s+(?:co.?conspirators?|allies?|supplies?|everyone|the\s+others?)\b/i,
    /\b(?:tactical|battle\s+plan|formation|defensive\s+position)\b/i,
    /\b(?:small\s+talk|casual\s+(?:chat|conversation|remark))\b/i,
    /\b(?:route\s+plan|travel\s+plan|scout\s+ahead|patrol)\b/i,
];

function isPrivateHighValueFact(factText: string): boolean {
    const lower = factText.toLowerCase();
    return HIGH_VALUE_FACT_CUES.some((cue) => cue.test(lower));
}

function isOrdinaryDialogue(factText: string): boolean {
    const lower = factText.toLowerCase();
    return ORDINARY_DIALOGUE_PATTERNS.some((pattern) => pattern.test(lower));
}

function isMalformedFact(factText: string): boolean {
    const trimmed = factText.trim();
    if (/^[:;,]\s*/.test(trimmed)) return true;
    if ((trimmed.match(/"/g) || []).length % 2 !== 0) return true;
    if (trimmed.length < 8) return true;
    if (/^[""'']/.test(trimmed) || /[""'']$/.test(trimmed)) return true;
    if (/"name\s+npc"/i.test(trimmed)) return true;
    if (/^name\s+npc\b/i.test(trimmed)) return true;
    if (/\{\{npc\}\}/i.test(trimmed)) return true;
    if (/\{\{user\}\}\s+told\s+["""]?name\s+npc["""]?/i.test(trimmed)) return true;
    if (/^(?:undefined|null|\[\]|{}\s*)$/i.test(trimmed)) return true;
    if (/^[:;,.!?]\s/.test(trimmed)) return true;
    return false;
}

function sanitizeFact(factText: string): string {
    let result = factText
        .replace(/^[:;,.\s]+/, "")
        .replace(/[""'']+/g, "")
        .replace(/\s+/g, " ")
        .trim();

    result = result.replace(/^name\s+npc\s*[:;,-]?\s*/i, "").trim();
    result = result.replace(/\s+name\s+npc\s*$/i, "").trim();
    result = result.replace(/^(?:the|a|an)\s+(?:name\s+npc)\b/i, "").trim();

    return result;
}

function filterOnlyKnowsFact(fact: string): string | null {
    if (isMalformedFact(fact)) return null;
    const sanitized = sanitizeFact(fact);
    if (sanitized.length < 8) return null;
    if (isOrdinaryDialogue(sanitized)) return null;
    if (isPrivateHighValueFact(sanitized)) return sanitized;
    return null;
}

export function isExplicitRecipient(npcName: string, context: string): boolean {
    const firstName = firstNameOf(npcName);
    const nameSource = npcNameRegexSource(npcName);
    const firstSource = npcNameRegexSource(firstName);

    const explicitTellCues = [
        new RegExp(`\\b(?:i|you|\\{\\{user\\}\\})\\s+(?:told|tell|whispered\\s+to|quietly\\s+(?:told|warned|said|asked)|answered|replied\\s+to|said\\s+to|confessed\\s+to|admitted\\s+to|gave|handed|warned)\\s+(?:${nameSource}|${firstSource})\\b`, "i"),
        new RegExp(`\\b(?:i|you|\\{\\{user\\}\\})\\s+(?:explain|explained|revealed|reveal|informed|inform|promised|promise)\\s+(?:${nameSource}|${firstSource})\\b`, "i"),
        new RegExp(`\\b(?:${nameSource}|${firstSource})\\s*(?:,|!)\\s*(?:\\s*"+)?(?:you|i)\\s+(?:need|have|should|must|will)\\b`, "i"),
    ];

    return explicitTellCues.some((cue) => cue.test(context));
}

export function hasOverhearEvidence(npcName: string, context: string): boolean {
    const firstName = firstNameOf(npcName);
    const nameSource = npcNameRegexSource(npcName);
    const firstSource = npcNameRegexSource(firstName);

    const overhearCues = [
        new RegExp(`\\b(?:${nameSource}|${firstSource})\\s+(?:overheard|heard|could\\s+hear|listened|caught\\s+(?:every\\s+)?word|was\\s+close\\s+enough\\s+to\\s+hear)\\b`, "i"),
        /\b(?:everyone\s+present\s+(?:heard|knew)|both\s+\w+\s+and\s+\w+\s+heard)\b/i,
        /\b(?:in\s+(?:front\s+of|earshot\s+of))\s+(?:everyone|all|the\s+group)/i,
        new RegExp(`\\b(?:${nameSource}|${firstSource})\\s+(?:was|were|stood|remained|stayed)\\s+(?:nearby|close|behind|in\s+the\s+room)\\b`, "i"),
    ];

    return overhearCues.some((cue) => cue.test(context));
}

export function inferNpcOnlyKnows(headerEntry: NpcHeaderMemoryEntry, context: string): string[] {
    const firstName = headerEntry.firstName || headerEntry.name;
    const facts: string[] = [];
    const npcNear = nearNpcContext(headerEntry.name, context);

    // Recipient check: only extract if NPC is mentioned and is intended recipient or can overhear
    const isRecipient = isExplicitRecipient(headerEntry.name, context);
    const canOverhear = hasOverhearEvidence(headerEntry.name, context);

    if (npcNear.length === 0) {
        return [];
    }

    // If not the intended recipient and cannot overhear, don't extract
    if (!isRecipient && !canOverhear) {
        // Still allow name/memory-loss facts that are NPC-agnostic
        const nameTold = /\b(?:my name is|call me|i am called|i'm called|my name's)\b/i.test(context)
            && npcMentionedInText(headerEntry.name, context);
        if (nameTold) {
            const filtered = filterOnlyKnowsFact(`${firstName} learned {{user}}'s name`);
            if (filtered != null) {
                facts.push(filtered);
            }
        }
        return mergeUniqueList(facts.map(cleanFactText).filter(Boolean));
    }

    // {{user}} and NPC did something together
    const together = npcNear.match(new RegExp(`\\{\\{user\\}\\}\\s+and\\s+${npcNameRegexSource(firstName)}\\s+(.+?)(?:\\.|!|\\?|$)`, "i"));
    if (together != null) {
        const filtered = filterOnlyKnowsFact(together[1]);
        if (filtered != null) {
            facts.push(`{{user}} and ${firstName} ${filtered}`);
        }
    }

    // NPC and {{user}} did something together (reversed order)
    const togetherRev = npcNear.match(new RegExp(`${npcNameRegexSource(firstName)}\\s+and\\s+\\{\\{user\\}\\}\\s+(.+?)(?:\\.|!|\\?|$)`, "i"));
    if (togetherRev != null) {
        const filtered = filterOnlyKnowsFact(togetherRev[1]);
        if (filtered != null) {
            facts.push(`{{user}} and ${firstName} ${filtered}`);
        }
    }

    // {{user}} gave/showed/offered/handed NPC something
    const gave = npcNear.match(new RegExp(`\\{\\{user\\}\\}\\s+(?:gave|showed|offered|handed|passed|returns?|returned)\\s+${npcNameRegexSource(firstName)}\\s+(.+?)(?:\\.|!|\\?|$)`, "i"));
    if (gave != null) {
        const filtered = filterOnlyKnowsFact(gave[1]);
        if (filtered != null) {
            facts.push(`{{user}} gave ${firstName}: ${filtered}`);
        }
    }

    // {{user}} told/asked/informed/warned NPC about something
    const toldAbout = npcNear.match(new RegExp(`\\{\\{user\\}\\}\\s+(?:told|asked|informed|warned)\\s+${npcNameRegexSource(firstName)}\\s+(?:about|of|that)\\s+(.+?)(?:\\.|!|\\?|$)`, "i"));
    if (toldAbout != null) {
        const fact = cleanFactText(toldAbout[1]);
        const filtered = filterOnlyKnowsFact(fact);
        if (filtered != null) {
            facts.push(`{{user}} told ${firstName}: ${filtered}`);
        }
    }

    // {{user}} told NPC their name
    if (/\b(?:my name is|call me|i am called|i'm called|my name's)\b/i.test(context) && npcMentionedInText(headerEntry.name, context)) {
        const filtered = filterOnlyKnowsFact(`${firstName} learned {{user}}'s name`);
        if (filtered != null) {
            facts.push(filtered);
        }
    }

    // {{user}} mentioned memory loss/amnesia near NPC
    if (npcMentionedInText(headerEntry.name, context) && (/\b(?:lost|lose|lost my|lost his|lost her|lost their)\s+(?:memory|memories)\b/i.test(context) || /\b(?:amnesia|cannot remember|can't remember|kehilangan ingatan)\b/i.test(context))) {
        const filtered = filterOnlyKnowsFact(`{{user}} told ${firstName} about memory loss`);
        if (filtered != null) {
            facts.push(filtered);
        }
    }

    // {{user}} threatened or warned NPC
    if (userActionTargetsNpc(headerEntry.name, context, "(?:threaten|threatened|threatening|warn|warned|warning|mengancam)")) {
        const filtered = filterOnlyKnowsFact(`{{user}} threatened or warned ${firstName}`);
        if (filtered != null) {
            facts.push(filtered);
        }
    }

    // {{user}} helped/saved/protected NPC
    if (npcNear.length > 0 && userActionTargetsNpc(headerEntry.name, npcNear, "(?:helped|saved|protected|rescued|aided|assisted|healed)")) {
        const filtered = filterOnlyKnowsFact(`{{user}} helped ${firstName}`);
        if (filtered != null) {
            facts.push(filtered);
        }
    }

    // {{user}} traveled/went with NPC
    const traveled = npcNear.match(new RegExp(`\\{\\{user\\}\\}\\s+(?:went|traveled|travelled|walked|headed|moved|followed)\\s+(?:with|to|into|toward|after)\\s+${npcNameRegexSource(firstName)}`, "i"));
    if (traveled != null) {
        const filtered = filterOnlyKnowsFact(cleanFactText(traveled[0]));
        if (filtered != null) {
            facts.push(filtered);
        }
    }

    // General "I/you/{{user}} told NPC that ..." pattern across full context
    for (const sentence of npcMemorySentences(context)) {
        const toldPattern = new RegExp(`\\b(?:i|you|\\{\\{user\\}\\})\\s+(?:told|tell|revealed|reveal|informed|inform)\\s+(?:${npcNameRegexSource(headerEntry.name)}|${npcNameRegexSource(firstName)}|him|her|them|you)\\b\\s*(?:that\\s+)?(.{4,})`, "i");
        const told = toldPattern.exec(sentence);
        if (told != null) {
            const fact = cleanFactText(told[1]);
            const filtered = filterOnlyKnowsFact(fact);
            if (filtered != null) {
                facts.push(`{{user}} told ${firstName}: ${filtered}`);
            }
        }
    }

    return mergeUniqueList(facts.map(cleanFactText).filter(Boolean));
}

export function mergeRelationshipEvents(previous: string[], incoming: string[]): string[] {
    const combined = previous.concat(incoming).map(cleanFactText).filter(Boolean);
    const result: string[] = [];

    for (let index = combined.length - 1; index >= 0; index -= 1) {
        const event = combined[index];
        if (result.some((entry) => sameText(entry, event))) {
            continue;
        }
        result.unshift(event);
        if (result.length >= 10) {
            break;
        }
    }

    return result;
}

export function mergeKnownFacts(previous: string[], incoming: string[]): string[] {
    return mergeUniqueList(previous.concat(incoming).map(cleanFactText).filter(Boolean));
}
