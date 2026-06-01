import type {NormalizeStatusOptions} from "../types";
import {DEFAULT_STATE, CLOTHING_DAMAGE_WORDS, CLOTHING_SLOT_PATTERN, GARMENT_NAMES, TRANSIENT_YOU_DETAIL_PATTERN} from "../constants";
import {cleanFragment, cleanHeaderText, cleanLabeledValue, isPlaceholder, sameText, limitWords} from "../utils/text";
import {containsAnyCue, escapeRegExp} from "../utils/regex";
import {splitTopLevel} from "../utils/split";
import {nonDialogueEvidenceContext} from "../utils/nonDialogue";
import {defaultNpcStatusForRace} from "../state/defaultState";
import {
    POSITION_CHANGE_CUES, POSITION_SPATIAL_CUES, POSTURE_BODY_KEYWORDS,
    CLOTHING_CHANGE_CUES, CLOTHING_REMOVAL_CUES, CLOTHING_DAMAGE_CUES, CLOTHING_ADJUSTMENT_CUES,
    DETAIL_VISIBLE_INTERACTION_CUES, DETAIL_BODY_PART_CUES,
    DETAIL_OBJECT_INTERACTION_CUES, DETAIL_SETTLED_BODY_CUES,
    DETAIL_POSTURE_CHANGE_CUES, DETAIL_CONTACT_ACTION_CUES,
} from "./statusConstants";
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

function positionMeansSeated(value: string): boolean {
    return /\b(sit|sitting|seated|sat)\b/i.test(value);
}

function positionMeansProne(value: string): boolean {
    return /\b(lying|prone|collapsed|kneeling|crouched)\b/i.test(value);
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

    if (commaParts.length > 1) {
      const hasGarment = commaParts.some((p) => hasGarmentKeyword(p));
      const hasOnlyPosture = commaParts.some((p) => !hasGarmentKeyword(p) && hasPostureBodyKeyword(p));
      if (hasGarment && hasOnlyPosture) {
        return commaParts;
      }
    }

    const withDetail = clean.match(/^(.*?\b(?:standing|seated|sitting|walking|kneeling|crouching|lying|above|below|beneath|under|over|atop|upon|against|beyond|past|around|inside|outside|alongside|beside|before|behind|near|facing|left|right|front|table|door|counter)\b.*?)\s+with\s+((?:his|her|their|your|both|one)?\s*(?:eye|eyes|gaze|tail|tails|ear|ears|wing|wings|horn|horns|hand|hands|arm|arms|posture|body)\b.*)$/i);
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

    return positionMeansWalking(lower)
        || positionMeansStanding(lower)
        || positionMeansSeated(lower)
        || positionMeansProne(lower)
        || containsAnyCue(lower, POSITION_SPATIAL_CUES)
        || containsAnyCue(lower, POSITION_CHANGE_CUES);
}

function statusPartLooksLikeDetail(value: string): boolean {
    const BODY_RACIAL_DETAIL_PATTERN = /\b(eye|eyes|gaze|tail|tails|ear|ears|wing|wings|horn|horns|halo|fang|fangs|claw|claws|scale|scales|hand|hands|palm|palms|finger|fingers|arm|arms|elbow|elbows|head|face|cheek|cheeks|forehead|chin|mouth|nose|hair|shoulder|shoulders|back|body|torso|waist|hip|hips|knee|knees|posture|voice|weapon|sword|blade|staff)\b/i;
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
    return /\b(robe|robes|over[-\s]?robe|under[-\s]?robe|overrobe|underrobe|kimono|yukata|haori|hakama|dress|gown|uniform|armor|armour|cloak|mantle|cape|shirt|blouse|tunic|jacket|coat|pants|trousers|skirt|silk|linen|cotton|wool|leather|garment|garments|layer|layers)\b/i.test(candidate);
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
    const clothing = options.trustRawStatus === true
        ? rawClothing
        : (statusChangeIsSupported(rawClothing, fallbackClothing, clothingContext, "clothing", kind) ? rawClothing : fallbackClothing);
    const fallbackDetail = normalizeDetail(fallbackParts[2] ?? defaultParts[2], defaultParts[2], kind);
    const rawDetail = normalizeDetail(rawParts[2] ?? fallbackDetail, fallbackDetail, kind);

    return `${clothing}; ${position}; ${rawDetail}`;
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
