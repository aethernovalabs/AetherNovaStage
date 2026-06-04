import type {NormalizeStatusOptions} from "../types";
import {DEFAULT_STATE, CLOTHING_DAMAGE_WORDS, CLOTHING_SLOT_PATTERN, BODY_RACIAL_DETAIL_PATTERN, GARMENT_NAMES, TRANSIENT_YOU_DETAIL_PATTERN} from "../constants";
import {cleanFragment, cleanHeaderText, cleanLabeledValue, isPlaceholder, sameText, limitWords} from "../utils/text";
import {containsAnyCue, escapeRegExp} from "../utils/regex";
import {splitTopLevel} from "../utils/split";
import {nonDialogueEvidenceContext} from "../utils/nonDialogue";
import {defaultNpcStatusForRace} from "../state/defaultState";
import {isClothingActionPhrase} from "../userStatus/clothingClassifier";
import {
    POSITION_CHANGE_CUES, POSITION_SPATIAL_CUES, POSTURE_BODY_KEYWORDS,
    CLOTHING_CHANGE_CUES, CLOTHING_REMOVAL_CUES, CLOTHING_DAMAGE_CUES, CLOTHING_ADJUSTMENT_CUES,
    DETAIL_VISIBLE_INTERACTION_CUES, DETAIL_BODY_PART_CUES,
    DETAIL_OBJECT_INTERACTION_CUES, DETAIL_SETTLED_BODY_CUES,
    DETAIL_POSTURE_CHANGE_CUES, DETAIL_CONTACT_ACTION_CUES,
} from "./statusConstants";
import {LOCATION_TRANSITION_CUES} from "./locationConstants";
import {VAGUE_STATUS_PATTERN, USER_FORBIDDEN_DETAIL_PATTERN} from "../constants";

export function parseIdentityStatus(rawValue: string): {identity: string; status: string} {
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

export function splitIdentity(rawIdentity: string, fallbackLeft: string, fallbackRight: string): {left: string; right: string} {
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

function hasGarmentKeyword(value: string): boolean {
    return GARMENT_NAMES.some((g) => new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(value));
}

function hasPostureBodyKeyword(value: string): boolean {
    return POSTURE_BODY_KEYWORDS.some((kw) => new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(value));
}

function isOnlyPostureBodyDetail(value: string): boolean {
    const clean = cleanFragment(value);
    if (isPlaceholder(clean)) return false;
    if (hasGarmentKeyword(clean)) return false;
    return hasPostureBodyKeyword(clean);
}

export function looksLikeClothingSlot(value: string): boolean {
    const clean = cleanFragment(value);

    if (isPlaceholder(clean) || isInvalidStatusPart(clean, "npc")) {
        return false;
    }

    return sameText(clean, "Regular clothing")
        || CLOTHING_SLOT_PATTERN.test(clean)
        || CLOTHING_DAMAGE_WORDS.test(clean);
}

function isInvalidStatusPart(value: string, kind: "you" | "npc"): boolean {
    const clean = cleanFragment(value);

    if (clean.length === 0 || VAGUE_STATUS_PATTERN.test(clean)) {
        return true;
    }

    return kind === "you" && USER_FORBIDDEN_DETAIL_PATTERN.test(clean);
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

function positionMeansWalking(value: string): boolean {
    return /\b(walk|walking|moving|stepping|approaching|running)\b/i.test(value);
}

function positionMeansStanding(value: string): boolean {
    return /\b(stand|standing|stood|stopped|halted)\b/i.test(value);
}

function hasExplicitPostureCue(value: string): boolean {
    return /\b(walk|walking|moving|stepping|approaching|running|stand|standing|stood|stopped|halted|sit|sitting|seated|sat|lie|lies|lying|lay|laid|prone|supine|reclin(?:e|es|ing|ed)|sprawl(?:s|ing|ed)?|collapsed|kneeling|crouched|crouching|sideways|pin|pins|pinned|pinning|hold(?:s|ing)? down|held down|restrain|restrains|restrained|restraining|straddle|straddles|straddling|mount|mounts|mounted|mounting|grapple|grapples|grappling|berdiri|duduk|berlutut|berbaring|rebah|tidur|miring|telentang|terlentang|tengkurap|menahan|menindih)\b/i.test(value);
}

function isAppearanceBodyDetail(value: string): boolean {
    const clean = cleanFragment(value);
    const lower = clean.toLowerCase();

    if (!BODY_RACIAL_DETAIL_PATTERN.test(clean) || hasExplicitPostureCue(clean)) {
        return false;
    }

    const hasAppearanceSubject = /\b(hair|locks|tresses|bangs|braid|braids|sheet|sheets|blanket|blankets|cloth|fabric|silk|linen|robe|robes|gown|dress|shirt|cloak|mantle|cape|sleeve|sleeves)\b/i.test(clean);
    const hasAppearanceMotion = /\b(tumble(?:d|s|ing)?|spill(?:ed|s|ing)?|pool(?:ed|s|ing)?|drape(?:d|s|ing)?|fall(?:en|s|ing)?|hang(?:s|ing)?|slid|slide(?:s|d|ing)?|slip(?:s|ped|ping)?|spread(?:s|ing)?|curl(?:s|ed|ing)?|brush(?:es|ed|ing)?|frame(?:s|d|ing)?|cover(?:s|ed|ing)?|wrap(?:s|ped|ping)?|settle(?:s|d|ing)?|rest(?:s|ed|ing)?)\b/i.test(clean);
    const hasBodyAnchor = /\b(shoulder|shoulders|hip|hips|waist|chest|back|torso|lap|neck|face|cheek|cheeks|forehead|arm|arms|hand|hands|thigh|thighs|knee|knees)\b/i.test(clean);

    return hasBodyAnchor
        && (hasAppearanceSubject || hasAppearanceMotion)
        && (hasAppearanceMotion || containsAnyCue(lower, POSITION_SPATIAL_CUES));
}

function positionMeansSeated(value: string): boolean {
    return /\b(sit|sitting|seated|sat)\b/i.test(value);
}

function positionMeansProne(value: string): boolean {
    return /\b(lie|lies|lying|lay|laid|prone|supine|reclin(?:e|es|ing|ed)|sprawl(?:s|ing|ed)?|collapsed|kneeling|crouched|sideways|berbaring|rebah|tidur|miring|telentang|terlentang|tengkurap)\b/i.test(value);
}

function positionMeansGrappling(value: string): boolean {
    return /\b(pin|pins|pinned|pinning|hold(?:s|ing)? down|held down|restrain|restrains|restrained|restraining|straddle|straddles|straddling|mount|mounts|mounted|mounting|grapple|grapples|grappling|menahan|menindih)\b/i.test(value);
}

export function clothingChangeIsNegated(context: string): boolean {
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

function clothingWords(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !["the", "and", "with", "regular", "clothing", "clothes", "outfit", "only", "fully", "mostly"].includes(word));
}

function sharesMeaningfulClothingWord(candidate: string, previous: string): boolean {
    const previousWords = new Set(clothingWords(previous));
    return clothingWords(candidate).some((word) => previousWords.has(word));
}

export function clothingIsMentioned(candidate: string, context: string): boolean {
    const lowerContext = context.toLowerCase();
    return clothingWords(candidate).some((word) => containsAnyCue(lowerContext, [word]));
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

function clothingValueMeansNaked(value: string): boolean {
    return /\b(?:naked|nude|unclothed)\b/i.test(value);
}

function contextHasDressingAction(context: string): boolean {
    return /\b(?:put(?:s|ting)? on|pull(?:s|ed|ing)? on|get(?:s|ting)? dressed|got dressed|dress(?:es|ed|ing)? in|change(?:s|d|ing)? into|slip(?:s|ped|ping)? into|wrap(?:s|ped|ping)? (?:himself|herself|yourself|themselves)?\s*(?:in|into|with)?|cover(?:s|ed|ing)? (?:himself|herself|yourself|their body|his body|her body)|mengenakan|memakai)\b/i.test(context);
}

function positionSignalScore(value: string): number {
    const lower = value.toLowerCase();

    if (isAppearanceBodyDetail(value)) {
        return 0;
    }

    const hasExplicitPosition = positionMeansWalking(lower) || positionMeansStanding(lower) || positionMeansSeated(lower) || positionMeansProne(lower) || positionMeansGrappling(lower);

    if (hasExplicitPosition) {
        return 3;
    }

    const hasSpatialCue = containsAnyCue(lower, POSITION_SPATIAL_CUES);
    const hasChangeCue = containsAnyCue(lower, POSITION_CHANGE_CUES);

    if ((hasSpatialCue || hasChangeCue) && BODY_RACIAL_DETAIL_PATTERN.test(value)) {
        return 0;
    }

    if (hasSpatialCue) {
        return 2;
    }

    if (hasChangeCue) {
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

    if (commaParts.length > 1) {
      const hasGarment = commaParts.some((p) => hasGarmentKeyword(p));
      const hasOnlyPosture = commaParts.some((p) => !hasGarmentKeyword(p) && hasPostureBodyKeyword(p));
      if (hasGarment && hasOnlyPosture) {
        return commaParts;
      }
    }

    const withDetail = clean.match(/^(.*?\b(?:standing|seated|sitting|walking|kneeling|crouching|lying|above|below|beneath|under|over|atop|upon|against|beyond|past|around|inside|outside|alongside|beside|before|behind|near|facing|left|right|front|table|door|counter)\b.*?)\s+with\s+((?:his|her|their|your|both|one)?\s*(?:(?:\w+)\s+){0,3}(?:eye|eyes|gaze|tail|tails|ear|ears|wing|wings|horn|horns|hand|hands|arm|arms|shoulder|shoulders|back|hair|waist|hip|hips|posture|body)\b.*)$/i);
    if (withDetail != null) {
        return [withDetail[1], withDetail[2]].map(cleanFragment).filter(Boolean);
    }

    return [clean];
}

function isClothingStatusPart(value: string): boolean {
    if (isOnlyPostureBodyDetail(value)) return false;
    if (!hasGarmentKeyword(value) && hasPostureBodyKeyword(value)) return false;
    return looksLikeClothingSlot(value);
}

function statusPartLooksLikePosition(value: string): boolean {
    const clean = cleanFragment(value);
    const lower = clean.toLowerCase();

    if (isAppearanceBodyDetail(clean)) {
        return false;
    }

    const hasExplicitPosition = positionMeansWalking(lower)
        || positionMeansStanding(lower)
        || positionMeansSeated(lower)
        || positionMeansProne(lower)
        || positionMeansGrappling(lower);

    if (hasExplicitPosition) {
        return true;
    }

    const hasSpatialCue = containsAnyCue(lower, POSITION_SPATIAL_CUES);
    const hasChangeCue = containsAnyCue(lower, POSITION_CHANGE_CUES);

    if ((hasSpatialCue || hasChangeCue) && BODY_RACIAL_DETAIL_PATTERN.test(clean)) {
        return false;
    }

    return hasSpatialCue || hasChangeCue;
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

export function statusParts(status: string, kind: "you" | "npc"): string[] {
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

function stripGenericScenePosition(value: string): string {
    const clean = cleanFragment(value)
        .replace(/\b(?:in|within|inside)\s+(?:the\s+)?(?:current\s+)?scene\b/gi, "")
        .replace(/\bscene\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    return cleanFragment(clean);
}

function stripDramaticLanguage(value: string): string {
    return cleanFragment(value)
        .replace(/\b(ancient|overwhelming|legendary|unreadable|mysterious|divine|cosmic|all-consuming|supreme|omnipotent|godlike)\b/gi, "")
        .replace(/\b(aura|auras|emotional tension|dramatic tension)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

export function normalizePosition(value: string, fallback: string, kind: "you" | "npc"): string {
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

export function normalizeClothing(value: string, fallback: string): string {
    const safeFallback = safeStatusFallback(fallback, "Regular clothing", "npc");
    let clean = cleanFragment(value) || safeFallback;
    clean = clean.replace(/\s+/g, " ").trim();
    clean = limitWords(clean, 18);

    if (isInvalidStatusPart(clean, "npc")) {
        return safeFallback;
    }

    return cleanFragment(clean) || safeFallback;
}

export function normalizeDetail(value: string, fallback: string, kind: "you" | "npc"): string {
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

function isPersistentYouPostureDetail(value: string): boolean {
    return /\b(?:lean|leans|leaning|leaned|recline|reclines|reclining|reclined)\s+(?:back|backward|backwards|against|into|toward|towards|forward|forwards)\b/i.test(value)
        || /\b(?:head tilted|tilted head|shoulders? relaxed|back against|body angled)\b/i.test(value);
}

function contextContradictsPersistentPostureDetail(context: string): boolean {
    return /\b(?:straighten|straightens|straightened|sits? upright|sat upright|stands? up|stood up|rises?|rose|leans? forward|leaned forward|pulls? away|pulled away)\b/i.test(context);
}

function mergePersistentYouPostureDetail(
    rawDetail: string,
    fallbackDetail: string,
    position: string,
    fallbackPosition: string,
    context: string,
    sceneChanged: boolean,
): string {
    if (
        sceneChanged
        || contextContradictsPersistentPostureDetail(context)
        || !sameText(position, fallbackPosition)
    ) {
        return rawDetail;
    }

    const rawParts = splitTopLevel(rawDetail, ",").map(cleanFragment).filter(Boolean);
    const fallbackPostureParts = splitTopLevel(fallbackDetail, ",")
        .map(cleanFragment)
        .filter((part) => isPersistentYouPostureDetail(part));
    const merged = [...rawParts];

    for (const part of fallbackPostureParts) {
        if (!merged.some((existing) => sameText(existing, part))) {
            merged.unshift(part);
        }
    }

    return merged.length > 0 ? merged.join(", ") : rawDetail;
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

function contextHasClothingReference(context: string): boolean {
    return CLOTHING_SLOT_PATTERN.test(context)
        || containsAnyCue(context, ["double layer", "under-layer", "outer layer", "inner layer"]);
}

function candidateHasConcreteGarment(candidate: string): boolean {
    return /\b(robe|robes|over[-\s]?robe|under[-\s]?robe|overrobe|underrobe|kimono|yukata|haori|hakama|dress|gown|nightgown|nightdress|pajama|pajamas|uniform|armor|armour|cloak|mantle|cape|shirt|blouse|tunic|jacket|coat|pants|trousers|skirt|silk|linen|cotton|wool|leather|garment|garments|layer|layers)\b/i.test(candidate);
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
        return containsAnyCue(lowerContext, [
            "lie", "lies", "lying", "lay", "laid", "prone", "supine",
            "recline", "reclines", "reclining", "reclined",
            "sprawl", "sprawls", "sprawling", "sprawled",
            "collapse", "collapses", "collapsed",
            "sideways", "on side", "on his side", "on her side", "on their side", "on your side",
            "bed", "mattress", "couch", "floor", "ground",
            "berbaring", "rebah", "tidur", "miring", "kasur", "ranjang", "lantai",
            "telentang", "terlentang", "tengkurap",
        ]);
    }

    if (positionMeansGrappling(lowerCandidate)) {
        return containsAnyCue(lowerContext, [
            "pin", "pins", "pinned", "pinning",
            "hold down", "holds down", "held down", "holding down",
            "restrain", "restrains", "restrained", "restraining",
            "straddle", "straddles", "straddling",
            "mount", "mounts", "mounted", "mounting",
            "grapple", "grapples", "grappling",
            "above", "over", "on top of", "atop", "upon", "beneath", "below", "under",
            "enemy", "opponent", "foe", "target",
            "menahan", "menindih", "musuh", "lawan", "di atas", "di bawah",
        ]);
    }

    return containsAnyCue(lowerContext, POSITION_CHANGE_CUES)
        && meaningfulPositionWords(candidate).some((word) => lowerContext.includes(word));
}

function meaningfulPositionWords(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3 && !["near", "beside", "before", "behind", "through", "toward", "from"].includes(word));
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

    if (clothingValueMeansNaked(previous) && !clothingValueMeansNaked(candidate)) {
        return contextHasDressingAction(context)
            && (clothingIsMentioned(candidate, context) || isDefaultClothingValue(candidate));
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

    if (field === "clothing" && clothingValueMeansNaked(previous) && !clothingValueMeansNaked(candidate)) {
        return contextHasDressingAction(context)
            && (clothingIsMentioned(candidate, context) || isDefaultClothingValue(candidate));
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

export function normalizeStatus(
    rawStatus: string,
    fallbackStatus: string,
    kind: "you" | "npc",
    race: string,
    context: string = "",
    options: NormalizeStatusOptions = {},
): string {
    const defaultStatus = kind === "you"
        ? (DEFAULT_STATE as {you: string}).you.match(/\((.*)\)$/)?.[1] ?? "Regular clothing; Standing; hands visible"
        : defaultNpcStatusForRace(race);
    const fallbackParts = statusParts(fallbackStatus || defaultStatus, kind);
    const defaultParts = statusParts(defaultStatus, kind);
    const rawParts = statusParts(rawStatus, kind);

    const fallbackClothing = normalizeClothing(fallbackParts[0] ?? defaultParts[0], defaultParts[0]);
    const fallbackPosition = normalizePosition(fallbackParts[1] ?? defaultParts[1], defaultParts[1], kind);
    const clothingContext = kind === "you" ? nonDialogueEvidenceContext(context) : context;
    const inferredClothing = kind === "you" ? inferYouClothingFromContext(clothingContext) : null;
    const rawClothing = normalizeClothing(inferredClothing ?? rawParts[0] ?? fallbackClothing, fallbackClothing);
    const rawPosition = normalizePosition(rawParts[1] ?? fallbackPosition, fallbackPosition, kind);
    const position = options.trustRawStatus === true
        ? rawPosition
        : (statusChangeIsSupported(rawPosition, fallbackPosition, context, "position", kind)
            || (options.sceneChanged === true && rawParts[1] != null && !isGenericStatusPart(rawPosition))
            ? rawPosition
            : fallbackPosition);
    let clothing: string;
    if (options.trustRawStatus === true) {
      clothing = rawClothing;
    } else {
      const settledClothing = isClothingActionPhrase(rawClothing) && !containsAnyCue(clothingContext.toLowerCase(), ["pulling on", "putting on", "dressing", "buttoning", "fastening"])
        ? "Regular clothing"
        : rawClothing;
      clothing = statusChangeIsSupported(settledClothing, fallbackClothing, clothingContext, "clothing", kind) ? settledClothing : fallbackClothing;
    }
    const fallbackDetail = normalizeDetail(fallbackParts[2] ?? defaultParts[2], defaultParts[2], kind);
    const rawDetail = normalizeDetail(rawParts[2] ?? fallbackDetail, fallbackDetail, kind);
    const detail = kind === "you"
        ? mergePersistentYouPostureDetail(rawDetail, fallbackDetail, position, fallbackPosition, context, options.sceneChanged === true)
        : rawDetail;

    return `${clothing}; ${position}; ${detail}`;
}

function contextSuggestsSceneShift(context: string): boolean {
    const lowerContext = context.toLowerCase();
    return containsAnyCue(lowerContext, LOCATION_TRANSITION_CUES);
}

function inferYouClothingFromContext(context: string): string | null {
    const lowerContext = context.toLowerCase();

    if (
        lowerContext.includes("only pants") || lowerContext.includes("pants only")
        || lowerContext.includes("only wearing pants") || lowerContext.includes("wearing only pants")
        || lowerContext.includes("wears only pants") || lowerContext.includes("only in pants")
        || lowerContext.includes("hanya memakai celana")
    ) {
        return "Pants only";
    }

    if (
        lowerContext.includes("without clothes") || lowerContext.includes("naked")
        || lowerContext.includes("nude") || lowerContext.includes("unclothed")
    ) {
        return inferNakedClothingState(context) ?? "Naked";
    }

    if (lowerContext.includes("without shirt") || lowerContext.includes("shirtless")) {
        return "Shirtless";
    }

    if (
        lowerContext.includes("without armor") || lowerContext.includes("remove armor")
        || lowerContext.includes("removes armor") || lowerContext.includes("removed armor")
    ) {
        return "Without armor";
    }

    if (
        lowerContext.includes("without cloak") || lowerContext.includes("remove cloak")
        || lowerContext.includes("removes cloak") || lowerContext.includes("removed cloak")
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

function meaningfulDetailWords(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3 && !["visible", "still", "steady", "hand", "left", "right"].includes(word));
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

function isSettledYouDetailCandidate(candidate: string): boolean {
    const lowerCandidate = candidate.toLowerCase();

    return containsAnyCue(lowerCandidate, DETAIL_BODY_PART_CUES)
        && containsAnyCue(lowerCandidate, DETAIL_SETTLED_BODY_CUES);
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

export function normalizeYouLine(
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
