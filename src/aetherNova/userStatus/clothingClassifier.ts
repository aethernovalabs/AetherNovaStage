import type {UserStatusState} from "../types";
import {GARMENT_NAMES, OBJECT_DAMAGE_WORDS} from "../constants";
import {CLOTHING_CHANGE_CUES, CLOTHING_DAMAGE_CUES, CLOTHING_REMOVAL_CUES} from "../header/statusConstants";
import {escapeRegExp, containsAnyCue} from "../utils/regex";
import {cleanFragment, sameText} from "../utils/text";

export function coerceClothing(raw: unknown): UserStatusState["clothing"] {
  if (raw == null || typeof raw !== "object") return {};
  const c = raw as Partial<UserStatusState["clothing"]>;
  const result: UserStatusState["clothing"] = {};
  if (typeof c.upper === "string" && c.upper.length > 0) result.upper = c.upper;
  if (typeof c.lower === "string" && c.lower.length > 0) result.lower = c.lower;
  if (typeof c.footwear === "string" && c.footwear.length > 0) result.footwear = c.footwear;
  if (typeof c.outerwear === "string" && c.outerwear.length > 0) result.outerwear = c.outerwear;
  if (Array.isArray(c.accessories)) {
    const filtered = c.accessories.filter((a): a is string => typeof a === "string" && a.length > 0);
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
  const hasConcreteGarmentInYouLine = GARMENT_NAMES.some((g) =>
    new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(youClothingRaw),
  );

  if (hasConcreteGarmentInYouLine && !/regular clothing/i.test(youClothingRaw)) {
    const prevUpper = clothing.upper ?? "";
    const prevMatchesPrev = GARMENT_NAMES.some((g) =>
      new RegExp(`\\b${escapeRegExp(g)}\\b`, "i").test(prevUpper),
    );
    if (!prevMatchesPrev || !sameText(youClothingRaw, prevUpper)) {
      clothing.upper = youClothingRaw;
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
            if (slot === "upper") clothing.upper = newDesc;
            else if (slot === "lower") clothing.lower = newDesc;
            else if (slot === "outerwear") clothing.outerwear = newDesc;
            else if (slot === "footwear") clothing.footwear = newDesc;
          }
        } else if (slot === "accessories") {
          if (!clothing.accessories) clothing.accessories = [];
          const newAcc = extractNewGarmentDesc(narrativeContext, garment);
          if (newAcc != null && !clothing.accessories.includes(newAcc)) {
            clothing.accessories.push(newAcc);
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
