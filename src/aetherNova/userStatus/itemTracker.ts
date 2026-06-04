import type {UserStatusState} from "../types";
import {WEAPON_KEYWORDS, ITEM_KEYWORDS} from "../constants";
import {escapeRegExp} from "../utils/regex";
import {cleanFragment, sameText} from "../utils/text";

const INVALID_LOCATION_VALUES = new Set(["the", "a", "an", "it", "there", "nearby", ""]);

const USER_ACTION_WORDS =
  "carr(?:y|ies|ying|ied)|hold(?:s|ing|held)?|wield(?:s|ing|ed)?|draw(?:s|ing|drew|n)?|" +
  "pull(?:s|ed|ing)?|take(?:s|n|ing|took)?|pick(?:s|ed|ing)?\\s+up|" +
  "wear(?:s|ing|wore)?|slip(?:s|ing|ped)?|tuck(?:s|ing|ed)?|put(?:s|ting)?|" +
  "grip(?:s|ing|ped)?|grasp(?:s|ing|ped)?|lift(?:s|ing|ed)?|grab(?:s|ing|bed)?|" +
  "snatch(?:es|ing|ed)?";

const LOCATION_RING_PATTERNS = [
  /\bUpper Ring\b/i, /\bLower Ring\b/i, /\bInner Ring\b/i, /\bOuter Ring\b/i,
  /\bMiddle Ring\b/i, /\bRoyal Ring\b/i, /\bNoble Ring\b/i, /\bMarket Ring\b/i,
  /\bTemple Ring\b/i, /\bCity Ring\b/i, /\bRing District\b/i, /\bRing Road\b/i,
  /\bRing Avenue\b/i, /\bRing Gate\b/i,
];

const LOCATION_CONTEXT_WORDS = /\b(?:passed\s+through|entered|arrived\s+at|moved\s+into|walked\s+into|through\s+the\s+archway|streets|district|avenue|architecture|marble|crowds|buildings|ring\s+of\s+the\s+city)\b/i;
const ANATOMICAL_ITEM_FALSE_LOCATION = /\b(?:first\s+inch|inch|veined|flesh|skin|pulse|heartbeat|breath|groin|belly|abdomen|breasts?)\b/i;

function isValidLocationValue(location: string): boolean {
  const clean = cleanFragment(location).toLowerCase();
  return clean.length > 2 && !INVALID_LOCATION_VALUES.has(clean) && !ANATOMICAL_ITEM_FALSE_LOCATION.test(clean);
}

function hasUserOwnership(context: string, itemName: string): boolean {
  const lower = context.toLowerCase();
  const item = itemName.toLowerCase();
  const itemEscaped = escapeRegExp(item);

  if (new RegExp(`(?:\\{\\{user\\}\\}'s|your)\\s+(?:\\w+\\s+){0,3}${itemEscaped}\\b`, "i").test(lower)) return true;
  if (new RegExp(`\\b(?:you|\\{\\{user\\}\\})\\s+(?:${USER_ACTION_WORDS})\\s+(?:the|an?|that|this|a)\\s+${itemEscaped}\\b`, "i").test(lower)) return true;
  if (new RegExp(`${itemEscaped}\\s+(?:at|on|in|around|behind|across|upon)\\s+(?:your|\\{\\{user\\}\\}'s)\\b`, "i").test(lower)) return true;
  return false;
}

function hasNpcOwnership(context: string, itemName: string): boolean {
  const lower = context.toLowerCase();
  const item = itemName.toLowerCase();
  const itemEscaped = escapeRegExp(item);

  const pronounAfter = new RegExp(`${itemEscaped}\\s+(?:\\w+\\s+){0,5}(?:her|his|their|its)\\s+`, "i");
  if (pronounAfter.test(lower)) {
    const nearbyUser = new RegExp(`\\{\\{user\\}\\}\\s+(?:\\w+\\s+){0,5}${itemEscaped}`, "i").test(lower)
      || new RegExp(`\\byou\\s+(?:\\w+\\s+){0,5}${itemEscaped}`, "i").test(lower);
    if (!nearbyUser) return true;
  }

  const pronounBefore = new RegExp(`\\b(?:her|his|their|its)\\s+(?:\\w+\\s+){0,2}${itemEscaped}\\b`, "i");
  if (pronounBefore.test(lower)) {
    const nearbyUser = new RegExp(`\\{\\{user\\}\\}\\s+(?:\\w+\\s+){0,5}${itemEscaped}`, "i").test(lower)
      || new RegExp(`\\byou\\s+(?:\\w+\\s+){0,5}${itemEscaped}`, "i").test(lower);
    if (!nearbyUser) return true;
  }

  const namePossessive = new RegExp(`\\b\\w+'s\\s+${itemEscaped}\\b`, "i");
  if (namePossessive.test(lower)) {
    if (new RegExp(`\\{\\{user\\}\\}'s\\s+${itemEscaped}`, "i").test(lower)) return false;
    return true;
  }

  return false;
}

function isLocationPhraseItem(context: string, itemName: string): boolean {
  if (itemName.toLowerCase() === "ring") {
    if (LOCATION_RING_PATTERNS.some((p) => p.test(context))) return true;
    if (LOCATION_CONTEXT_WORDS.test(context) && new RegExp(`\\b${escapeRegExp(itemName)}\\b`, "i").test(context)) return true;
  }
  return false;
}

function isAnatomicalItemMention(context: string, item: string, matchIndex: number): boolean {
  if (!sameText(item, "crown")) {
    return false;
  }

  const window = context.slice(Math.max(0, matchIndex - 60), matchIndex + item.length + 80);
  return ANATOMICAL_ITEM_FALSE_LOCATION.test(window);
}

function hasNonAnatomicalItemMention(context: string, item: string): boolean {
  const re = new RegExp(`\\b${escapeRegExp(item)}\\b`, "gi");
  let match = re.exec(context);

  while (match != null) {
    if (!isAnatomicalItemMention(context, item, match.index)) {
      return true;
    }
    match = re.exec(context);
  }

  return false;
}

function isAnatomicalItemFalsePositive(entry: UserStatusState["importantItems"][number]): boolean {
  return ANATOMICAL_ITEM_FALSE_LOCATION.test(entry.location);
}

function isAnatomicalWeaponMention(context: string, weapon: string, matchIndex: number): boolean {
  if (!sameText(weapon, "blade")) {
    return false;
  }

  const window = context.slice(Math.max(0, matchIndex - 50), matchIndex + weapon.length + 50);
  return /\b(?:your|\{\{user\}\}'s|his|her|their)?\s*(?:left|right)?\s*shoulder[-\s]+blades?\b/i.test(window)
    || /\bblades?\s+of\s+(?:your|\{\{user\}\}'s|his|her|their)?\s*(?:left|right)?\s*shoulder\b/i.test(window);
}

function hasNonAnatomicalWeaponMention(context: string, weapon: string): boolean {
  const re = new RegExp(`\\b${escapeRegExp(weapon)}\\b`, "gi");
  let match = re.exec(context);

  while (match != null) {
    if (!isAnatomicalWeaponMention(context, weapon, match.index)) {
      return true;
    }
    match = re.exec(context);
  }

  return false;
}

function isAnatomicalBladeFalsePositive(entry: UserStatusState["weapons"][number], context: string): boolean {
  if (!sameText(entry.name, "blade")) {
    return false;
  }

  const locationLooksAnatomical = /\b(?:your|\{\{user\}\}'s)?\s*(?:left|right)?\s*shoulder\b/i.test(entry.location);
  return locationLooksAnatomical && !hasNonAnatomicalWeaponMention(context, "blade") && /\bshoulder[-\s]+blades?\b/i.test(context);
}

export function updateUserWeapons(
  previous: UserStatusState["weapons"],
  narrativeContext: string,
): UserStatusState["weapons"] {
  const weapons = previous.filter((w) =>
    w.status !== "destroyed"
    && w.status !== "removed"
    && w.status !== "lost"
    && !isAnatomicalBladeFalsePositive(w, narrativeContext)
  );
  const weaponMentions = WEAPON_KEYWORDS.filter((w) =>
    hasNonAnatomicalWeaponMention(narrativeContext, w),
  );
  const damageCues = ["destroyed", "broken", "shattered", "lost", "dropped", "falls?\\s+", "leave", "leaves", "left", "handed over", "given away", "thrown", "threw", "abandoned", "discarded"];
  const removeCues = ["leave", "leaves", "left", "handed over", "give", "gives", "gave", "drop", "drops", "dropped", "throw", "throws", "threw", "put away", "stow", "stows", "stowed", "sheathe", "sheathes", "sheathed"];

  for (const weapon of weaponMentions) {
    const existing = weapons.find((w) => sameText(w.name, weapon));
    const hasDamageCue = damageCues.some((c) => new RegExp(`\\b${escapeRegExp(c)}\\b`, "i").test(narrativeContext));
    const hasRemoveCue = removeCues.some((c) => new RegExp(`\\b${escapeRegExp(c)}\\b`, "i").test(narrativeContext));
    if (existing != null && (hasDamageCue || hasRemoveCue)) {
      existing.status = hasDamageCue ? "destroyed" : "removed";
      continue;
    }
    if (existing != null) {
      if (!hasNpcOwnership(narrativeContext, weapon)) {
        const location = extractWeaponLocation(narrativeContext, weapon);
        if (location != null) existing.location = location;
      }
      continue;
    }
    if (hasUserOwnership(narrativeContext, weapon) && !hasNpcOwnership(narrativeContext, weapon)) {
      const location = extractWeaponLocation(narrativeContext, weapon) || `in ${getDefaultWeaponLocation(weapon)}`;
      if (isValidLocationValue(location)) {
        weapons.push({ name: weapon, location, status: "intact" });
      }
    }
  }

  return weapons;
}

export function extractWeaponLocation(context: string, weapon: string): string | null {
  const re = new RegExp(
    `${escapeRegExp(weapon)}\\s+(?:in|on|at|behind|under|beneath|beside|against|across|over|upon)\\s+([^.;,\\n]{2,40})`,
    "i",
  );
  const match = re.exec(context);
  if (match != null) {
    const loc = cleanFragment(match[1]);
    return isValidLocationValue(loc) ? loc : null;
  }
  const beforeRe = new RegExp(
    `(?:in|on|at|behind|under|beneath|beside|against|across)\\s+([^.;,\\n]{2,40})\\s+${escapeRegExp(weapon)}`,
    "i",
  );
  const beforeMatch = beforeRe.exec(context);
  if (beforeMatch != null) {
    const loc = cleanFragment(beforeMatch[1]);
    return isValidLocationValue(loc) ? loc : null;
  }
  return null;
}

export function getDefaultWeaponLocation(weapon: string): string {
  const small = ["dagger", "knife", "dart", "shuriken"];
  if (small.includes(weapon.toLowerCase())) {
    return "{{user}}'s belt";
  }
  return "{{user}}'s hand";
}

export function updateUserItems(
  previous: UserStatusState["importantItems"],
  narrativeContext: string,
): UserStatusState["importantItems"] {
  const items = previous.filter((i) =>
    i.status !== "destroyed"
    && i.status !== "removed"
    && i.status !== "lost"
    && !isAnatomicalItemFalsePositive(i)
  );
  const itemMentions = ITEM_KEYWORDS.filter((w) =>
    hasNonAnatomicalItemMention(narrativeContext, w),
  );

  const removeCues = [
    "leave", "leaves", "left", "handed over", "give", "gives", "gave",
    "drop", "drops", "dropped", "throw", "throws", "threw",
    "lost", "loses", "lose", "stolen", "stole",
    "put away", "stow", "stows", "stowed", "store", "stores", "stored",
  ];
  const damageCues = [
    "destroyed", "broken", "shattered", "burns", "burned", "burnt",
    "ashes", "ash", "consumed", "melted", "crushed", "torn", "ripped",
  ];

  for (const item of itemMentions) {
    const existing = items.find((i) => sameText(i.name, item));
    const hasDamageCue = damageCues.some((c) => new RegExp(`\\b${escapeRegExp(c)}\\b`, "i").test(narrativeContext));
    const hasRemoveCue = removeCues.some((c) => new RegExp(`\\b${escapeRegExp(c)}\\b`, "i").test(narrativeContext));
    if (existing != null) {
      if (hasDamageCue) {
        existing.status = "destroyed";
        continue;
      }
      if (hasRemoveCue) {
        existing.status = "removed";
        continue;
      }
      if (!hasNpcOwnership(narrativeContext, item)) {
        const location = extractItemLocation(narrativeContext, item);
        if (location != null) existing.location = location;
      }
      continue;
    }
    if (isLocationPhraseItem(narrativeContext, item)) continue;
    if (hasUserOwnership(narrativeContext, item) && !hasNpcOwnership(narrativeContext, item)) {
      const location = extractItemLocation(narrativeContext, item) || `in {{user}}'s possession`;
      if (isValidLocationValue(location)) {
        items.push({ name: item, location, status: "intact" });
      }
    }
  }

  return items;
}

export function extractItemLocation(context: string, item: string): string | null {
  const re = new RegExp(
    `${escapeRegExp(item)}\\s+(?:in|on|at|behind|under|beneath|beside|against|around|about|upon|inside)\\s+([^.;,\\n]{2,40})`,
    "i",
  );
  const match = re.exec(context);
  if (match != null) {
    const loc = cleanFragment(match[1]);
    return isValidLocationValue(loc) ? loc : null;
  }
  const beforeRe = new RegExp(
    `(?:in|on|at|behind|under|beneath|beside|against|around|about|inside)\\s+([^.;,\\n]{2,40})\\s+${escapeRegExp(item)}`,
    "i",
  );
  const beforeMatch = beforeRe.exec(context);
  if (beforeMatch != null) {
    const loc = cleanFragment(beforeMatch[1]);
    return isValidLocationValue(loc) ? loc : null;
  }
  return null;
}
