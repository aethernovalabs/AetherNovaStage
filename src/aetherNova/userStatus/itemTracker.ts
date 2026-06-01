import type {UserStatusState} from "../types";
import {WEAPON_KEYWORDS, ITEM_KEYWORDS} from "../constants";
import {escapeRegExp} from "../utils/regex";
import {cleanFragment, sameText} from "../utils/text";

export function updateUserWeapons(
  previous: UserStatusState["weapons"],
  narrativeContext: string,
): UserStatusState["weapons"] {
  const weapons = previous.filter((w) => w.status !== "destroyed" && w.status !== "removed" && w.status !== "lost");
  const weaponMentions = WEAPON_KEYWORDS.filter((w) =>
    new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(narrativeContext),
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
      const location = extractWeaponLocation(narrativeContext, weapon);
      if (location != null) existing.location = location;
      continue;
    }
    const addCue = /\b(?:hold|holds|holding|carry|carries|carrying|wield|wields|wielding|draw|draws|drew|pull|pulls|pulled|grip|grips|gripping|grasp|grasps|grasping|with|and|,\s*)\b/i;
    if (addCue.test(narrativeContext)) {
      const location = extractWeaponLocation(narrativeContext, weapon) || `in ${getDefaultWeaponLocation(weapon)}`;
      weapons.push({ name: weapon, location, status: "intact" });
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
    return cleanFragment(match[1]);
  }
  const beforeRe = new RegExp(
    `(?:in|on|at|behind|under|beneath|beside|against|across)\\s+([^.;,\\n]{2,40})\\s+${escapeRegExp(weapon)}`,
    "i",
  );
  const beforeMatch = beforeRe.exec(context);
  if (beforeMatch != null) {
    return cleanFragment(beforeMatch[1]);
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
  const items = previous.filter((i) => i.status !== "destroyed" && i.status !== "removed" && i.status !== "lost");
  const itemMentions = ITEM_KEYWORDS.filter((w) =>
    new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(narrativeContext),
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
      const location = extractItemLocation(narrativeContext, item);
      if (location != null) existing.location = location;
      continue;
    }
    const addCue = /\b(?:hold|holds|holding|carry|carries|carrying|with|wear|wears|wearing|around|about)\b/i;
    if (addCue.test(narrativeContext)) {
      const location = extractItemLocation(narrativeContext, item) || `in {{user}}'s possession`;
      items.push({ name: item, location, status: "intact" });
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
    return cleanFragment(match[1]);
  }
  const beforeRe = new RegExp(
    `(?:in|on|at|behind|under|beneath|beside|against|around|about|inside)\\s+([^.;,\\n]{2,40})\\s+${escapeRegExp(item)}`,
    "i",
  );
  const beforeMatch = beforeRe.exec(context);
  if (beforeMatch != null) {
    return cleanFragment(beforeMatch[1]);
  }
  return null;
}
