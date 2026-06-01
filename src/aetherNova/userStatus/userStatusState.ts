import type {UserStatusState} from "../types";
import {parseIdentityStatus, splitIdentity} from "../header/normalizeYouLine";
import {nonDialogueEvidenceContext} from "../utils/nonDialogue";
import {coerceClothing, updateUserClothing} from "./clothingClassifier";
import {updateUserWeapons, updateUserItems} from "./itemTracker";

export function coerceUserStatus(raw: unknown, youLine: string): UserStatusState {
  if (raw == null || typeof raw !== "object") {
    const parsed = parseIdentityStatus(youLine);
    const identity = splitIdentity(parsed.identity, "Unknown", "Human");
    return {
      gender: identity.left,
      apparentRace: identity.right,
      clothing: {},
      weapons: [],
      importantItems: [],
    };
  }

  const r = raw as Partial<UserStatusState>;
  const parsed = parseIdentityStatus(youLine);
  const identity = splitIdentity(parsed.identity, r.gender ?? "Unknown", r.apparentRace ?? "Human");

  return {
    gender: identity.left || r.gender || "Unknown",
    apparentRace: identity.right || r.apparentRace || "Human",
    clothing: coerceClothing(r.clothing),
    weapons: Array.isArray(r.weapons) ? r.weapons.filter((w) => w && typeof w.name === "string") : [],
    importantItems: Array.isArray(r.importantItems) ? r.importantItems.filter((i) => i && typeof i.name === "string") : [],
  };
}

export function updateUserStatus(
  previous: UserStatusState,
  youLine: string,
  context: string,
): UserStatusState {
  const parsed = parseIdentityStatus(youLine);
  const identity = splitIdentity(parsed.identity, previous.gender, previous.apparentRace);
  const gender = identity.left || previous.gender;
  const apparentRace = identity.right || previous.apparentRace;
  const narrativeContext = nonDialogueEvidenceContext(context).toLowerCase();
  const clothing = updateUserClothing(previous.clothing, parsed.status, narrativeContext);
  const weapons = updateUserWeapons(previous.weapons, narrativeContext);
  const importantItems = updateUserItems(previous.importantItems, narrativeContext);
  return { gender, apparentRace, clothing, weapons, importantItems };
}
