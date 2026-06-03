import type {UserStatusState} from "../types";
import {GARMENT_NAMES, OBJECT_DAMAGE_WORDS, POSTURE_BODY_KEYWORDS} from "../constants";
import {CLOTHING_CHANGE_CUES, CLOTHING_DAMAGE_CUES, CLOTHING_REMOVAL_CUES} from "../header/statusConstants";
import {looksLikeClothingSlot} from "../header/normalizeYouLine";
import {escapeRegExp, containsAnyCue} from "../utils/regex";
import {cleanFragment, sameText, isPlaceholder} from "../utils/text";

const CLOTHING_ACTION_CUES = [
  "pulling on", "putting on", "put on", "putting my",
  "wearing", "getting dressed", "dressed himself", "dressed herself",
  "dressing", "buttoning", "fastening", "tightening belt",
  "slipping into", "stepping into pants", "putting legs into",
  "pulls on trousers", "pulls on pants", "my clothes",
  "i put on", "i pulled on", "i tightened", "i slipped into",
  "i put my", "put my", "pulled my",
];

export function isClothingActionPhrase(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (lower.length === 0) return false;
  const isAction = CLOTHING_ACTION_CUES.some((cue) => lower.includes(cue));
  if (isAction) return true;
  if (lower.split(/\s+/).length > 6) {
    const actionVerbs = /\b(pull|put|wear|dress|slip|step|tighten|fasten|button|strip|remove)\b/i;
    const match = lower.match(actionVerbs);
    if (match != null) {
      const wordsAfter = lower.split(match[0].toLowerCase())[1] ?? "";
      if (wordsAfter.trim().length > 10) return true;
    }
  }
  return false;
}

export function normalizeStableClothingValue(raw: string, previous?: string): string {
  const trimmed = cleanFragment(raw);
  if (trimmed.length === 0) return previous ?? "";
  if (isClothingActionPhrase(trimmed)) {
    const lower = trimmed.toLowerCase();
    if (lower.includes("armor") || lower.includes("armour")) return "Armor";
    if (lower.includes("disguise") && (lower.includes("cloak") || lower.includes("robe"))) {
      const match = trimmed.match(/(?:black\s+)?(?:royal\s+)?(?:disguise\s+)?(?:cloak|robe)/i);
      return match ? match[0] : "Regular clothing";
    }
    return "Regular clothing";
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("regular clothing") || lower === "regular") return "Regular clothing";
  if (lower.includes("naked") || lower.includes("nude") || lower.includes("unclothed")) return trimmed;
  if (lower.includes("shirtless")) return trimmed;
  if (lower.includes("armor") || lower.includes("armour")) return trimmed;
  if (lower.includes("without")) return trimmed;
  return trimmed;
}

export function hasGarmentKeyword(value: string): boolean {
  return GARMENT_NAMES.some((g) => new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(value));
}

export function hasPostureBodyKeyword(value: string): boolean {
  return POSTURE_BODY_KEYWORDS.some((kw) => new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(value));
}

export function isOnlyPostureBodyDetail(value: string): boolean {
  const clean = cleanFragment(value);
  if (isPlaceholder(clean)) return false;
  if (hasGarmentKeyword(clean)) return false;
  return hasPostureBodyKeyword(clean);
}

export function containsObjectDamageWithoutUserGarment(context: string): boolean {
  const hasGarment = GARMENT_NAMES.some((g) => new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(context));
  if (hasGarment) return false;
  const objectWords = ["door", "table", "wall", "window", "floor", "ground", "barrel", "crate", "chair", "bench", "desk", "gate", "fence", "stone", "rock", "pillar", "column"];
  const damageCues = ["crack", "break", "shatter", "splinter", "burst", "destroy", "smash"];
  const mentionsObject = objectWords.some((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(context));
  const mentionsDamage = damageCues.some((c) => new RegExp(`\\b${escapeRegExp(c)}\\w*\\b`, "i").test(context));
  const mentionsUser = /\{\{user\}\}|\byou\b/i.test(context);
  return mentionsObject && mentionsDamage && mentionsUser;
}

export function isValidClothingContent(value: string): boolean {
  const clean = cleanFragment(value);
  if (isPlaceholder(clean)) return false;
  if (isOnlyPostureBodyDetail(clean)) return false;
  if (/^[A-Z][a-z]+\s+(?:posture|stance|body|expression|gaze|eyes?)\b/i.test(clean)) return false;
  return hasGarmentKeyword(clean) || looksLikeClothingSlot(clean);
}

export function coerceClothing(raw: unknown): UserStatusState["clothing"] {
  if (raw == null || typeof raw !== "object") return {};
  const c = raw as Partial<UserStatusState["clothing"]>;
  const result: UserStatusState["clothing"] = {};
  if (typeof c.upper === "string" && c.upper.length > 0) result.upper = normalizeStableClothingValue(c.upper);
  if (typeof c.lower === "string" && c.lower.length > 0) result.lower = normalizeStableClothingValue(c.lower);
  if (typeof c.footwear === "string" && c.footwear.length > 0) result.footwear = normalizeStableClothingValue(c.footwear);
  if (typeof c.outerwear === "string" && c.outerwear.length > 0) result.outerwear = normalizeStableClothingValue(c.outerwear);
  if (Array.isArray(c.accessories)) {
    const filtered = c.accessories
      .filter((a): a is string => typeof a === "string" && a.length > 0)
      .map((a) => normalizeStableClothingValue(a))
      .filter((a) => a !== "none" && !a.includes("Regular"));
    if (filtered.length > 0) result.accessories = filtered;
  }
  return result;
}

export function updateUserClothing(
  previous: UserStatusState["clothing"],
  youStatus: string,
  narrativeContext: string,
): UserStatusState["clothing"] {
  const clothing = { ...previous };
  for (const key of Object.keys(clothing) as Array<keyof UserStatusState["clothing"]>) {
    if (clothing[key] === "none" || clothing[key] === "removed") {
      delete clothing[key];
    }
  }
  if (clothing.accessories != null) {
    clothing.accessories = clothing.accessories.filter((a) => a !== "none" && a !== "removed");
    if (clothing.accessories.length === 0) delete clothing.accessories;
  }

  const youParts = youStatus.split(";").map((s) => s.trim()).filter(Boolean);
  const youClothingRaw = youParts[0] ?? "";
  const normalizedYouClothing = normalizeStableClothingValue(youClothingRaw, clothing.upper);
  const hasConcreteGarmentInYouLine = GARMENT_NAMES.some((g) =>
    new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(normalizedYouClothing),
  );

  if (hasConcreteGarmentInYouLine && !/regular clothing/i.test(normalizedYouClothing)) {
    const prevUpper = clothing.upper ?? "";
    const prevMatchesPrev = GARMENT_NAMES.some((g) =>
      new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(prevUpper),
    );
    if (!prevMatchesPrev || !sameText(normalizedYouClothing, prevUpper)) {
      clothing.upper = normalizedYouClothing;
    }
  }

  if (isObjectDamageOnly(narrativeContext)) {
    return clothing;
  }

  if (containsAnyCue(narrativeContext, CLOTHING_REMOVAL_CUES)) {
    const upperVal = clothing.upper;
    if (upperVal != null && typeof upperVal === "string") {
      const slotWords = upperVal.toLowerCase().split(/\s+/);
      if (slotWords.some((w) => w.length > 3 && narrativeContext.includes(w))) {
        const removalDetail = extractGarmentRemovalDetail(narrativeContext, upperVal);
        if (removalDetail != null) clothing.upper = removalDetail;
      }
    }
    const outerVal = clothing.outerwear;
    if (outerVal != null && typeof outerVal === "string") {
      const slotWords = outerVal.toLowerCase().split(/\s+/);
      if (slotWords.some((w) => w.length > 3 && narrativeContext.includes(w))) {
        const removalDetail = extractGarmentRemovalDetail(narrativeContext, outerVal);
        if (removalDetail != null) clothing.outerwear = removalDetail;
      }
    }
  }

  if (
    containsAnyCue(narrativeContext, CLOTHING_DAMAGE_CUES) &&
    GARMENT_NAMES.some((g) => new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(narrativeContext))
  ) {
    for (const entry of [["upper", clothing.upper] as const, ["lower", clothing.lower] as const, ["outerwear", clothing.outerwear] as const, ["footwear", clothing.footwear] as const]) {
      const slot = entry[0] as "upper" | "lower" | "outerwear" | "footwear";
      const slotVal = entry[1];
      if (slotVal != null && typeof slotVal === "string") {
        const slotWords = slotVal.toLowerCase().split(/\s+/);
        const garmentMentioned = GARMENT_NAMES.some(
          (g) => slotWords.includes(g) && new RegExp(`\\b${escapeRegExp(g)}\\b`).test(narrativeContext),
        );
        if (garmentMentioned) {
          const damaged = applyClothingDamage(slotVal, narrativeContext);
          if (damaged != null) {
            if (slot === "upper") clothing.upper = damaged;
            else if (slot === "lower") clothing.lower = damaged;
            else if (slot === "outerwear") clothing.outerwear = damaged;
            else if (slot === "footwear") clothing.footwear = damaged;
          }
        }
      }
    }
  }

  if (
    containsAnyCue(narrativeContext, CLOTHING_CHANGE_CUES) &&
    GARMENT_NAMES.some((g) => new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(narrativeContext))
  ) {
    for (const garment of GARMENT_NAMES) {
      const re = new RegExp(`\\b${escapeRegExp(garment)}\\b`, "i");
      if (re.test(narrativeContext)) {
        const slot = inferClothingSlot(garment);
        if (slot != null && slot !== "accessories") {
          const newDesc = extractNewGarmentDesc(narrativeContext, garment);
          if (newDesc != null) {
            const stableDesc = normalizeStableClothingValue(newDesc, clothing[slot]);
            if (slot === "upper") clothing.upper = stableDesc;
            else if (slot === "lower") clothing.lower = stableDesc;
            else if (slot === "outerwear") clothing.outerwear = stableDesc;
            else if (slot === "footwear") clothing.footwear = stableDesc;
          }
        } else if (slot === "accessories") {
          if (isClothingActionPhrase(narrativeContext) && garment === "belt") {
            continue;
          }
          if (!clothing.accessories) clothing.accessories = [];
          const newAcc = extractNewGarmentDesc(narrativeContext, garment);
          if (newAcc != null && !clothing.accessories.includes(newAcc)) {
            const stableAcc = normalizeStableClothingValue(newAcc);
            if (!stableAcc.includes("Regular") && stableAcc !== "none") {
              clothing.accessories.push(stableAcc);
            }
          }
        }
      }
    }
  }

  return clothing;
}

export function isObjectDamageOnly(context: string): boolean {
  const hasGarment = GARMENT_NAMES.some(
    (g) => new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(context),
  );
  if (hasGarment) return false;
  const hasObjectDamage = OBJECT_DAMAGE_WORDS.some(
    (w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(context),
  );
  const hasDamageCue = CLOTHING_DAMAGE_CUES.some(
    (cue) => new RegExp(`\\b${escapeRegExp(cue)}\\b`, "i").test(context),
  );
  const hasUserAction = /\{\{user\}\}|\byou\b/i.test(context);
  return hasObjectDamage && hasDamageCue && hasUserAction;
}

export function inferClothingSlot(garment: string): keyof UserStatusState["clothing"] | null {
  const lower = garment.toLowerCase();
  if (["pants", "trousers", "jeans", "shorts", "skirt", "leggings", "boxers", "briefs", "panties", "underwear"].includes(lower)) {
    return "lower";
  }
  if (["boots", "shoes", "sandals"].includes(lower)) {
    return "footwear";
  }
  if (["cloak", "mantle", "cape", "jacket", "coat", "outerwear", "armor", "armour", "hood", "vest"].includes(lower)) {
    return "outerwear";
  }
  if (lower === "belt" || lower === "sash" || lower === "scarf" || lower === "gloves" || lower === "hat" || lower === "cap") {
    return "accessories";
  }
  return "upper";
}

export function extractGarmentRemovalDetail(context: string, currentGarment: string): string | null {
  if (/\b(?:remove|removes|removed|take off|takes off|took off|strip|strips|stripped)\b/i.test(context)) {
    return "removed";
  }
  return null;
}

export function applyClothingDamage(currentGarment: string, context: string): string | null {
  const damageWords = [
    "burned", "burnt", "scorched", "torn", "ripped", "shredded", "slashed",
    "bloody", "bloodied", "stained", "soaked", "wet", "muddy", "damaged",
    "destroyed", "frayed", "singed", "loose", "loosened", "baggy",
    "caught", "snagged", "stuck", "hooked", "tangled", "slipping",
    "untucked", "unbuttoned", "unfastened", "torn sleeve",
  ];
  const foundDamage = damageWords.find((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(context));
  if (foundDamage == null) return null;
  const lowerGarment = currentGarment.toLowerCase();
  for (const garment of GARMENT_NAMES) {
    if (lowerGarment.includes(garment) && new RegExp(`\\b${escapeRegExp(garment)}\\b`, "i").test(context)) {
      if (lowerGarment.includes(foundDamage)) return null;
      return `${foundDamage} ${currentGarment}`;
    }
  }
  if (new RegExp(`\\b${escapeRegExp(foundDamage)}\\b`, "i").test(context)) {
    const garmentMention = GARMENT_NAMES.find((g) =>
      new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(context),
    );
    if (garmentMention && lowerGarment.includes(garmentMention)) {
      return `${foundDamage} ${currentGarment}`;
    }
  }
  return null;
}

export function extractNewGarmentDesc(context: string, garment: string): string | null {
  const re = new RegExp(
    `(?:wear|wears|wearing|wore|put on|puts on|dressed in|clad in|don|dons|donned|change into|changes into|changed into|slip into|slips into|slipped into)\\s+(?:a\\s+|an\\s+|the\\s+)?([^.;,\n]{2,60}?)\\b${escapeRegExp(garment)}\\b`,
    "i",
  );
  const match = re.exec(context);
  if (match != null) {
    const desc = cleanFragment(match[1] + garment);
    if (desc.length > 0 && desc.length <= 80) return desc;
  }
  const simpleRe = new RegExp(
    `(?:wear|wears|wearing|wore|put on|puts on|dressed in|clad in|don|dons|donned)\\s+(?:a\\s+|an\\s+|the\\s+)?([^.;,\n]{2,80})`,
    "i",
  );
  const simpleMatch = simpleRe.exec(context);
  if (simpleMatch != null) {
    const desc = cleanFragment(simpleMatch[1]);
    if (desc.length > 0 && desc.length <= 80 && GARMENT_NAMES.some((g) => desc.toLowerCase().includes(g))) {
      return desc;
    }
  }
  const wearPattern = new RegExp("\\b(?:wearing|wears|wore)\\s+(?:his|her|their|a|an|the)?\\s*([^.;,\\n]{2,80})", "i");
  const wearMatch = wearPattern.exec(context);
  if (wearMatch != null) {
    const desc = cleanFragment(wearMatch[1]);
    if (GARMENT_NAMES.some((g) => desc.toLowerCase().includes(g)) && desc.length <= 80) {
      return desc;
    }
  }
  return null;
}
