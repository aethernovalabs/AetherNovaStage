export type {
    AetherNovaMessageState, UserStatusState, NpcMemoryEntry, NpcMemoryStore,
    NpcCanonEntry, NpcMemoryCommandResult, WalletAmounts, NormalizedWallet,
} from "./types";

export {
    DEFAULT_STATE, HEADER_DIVIDER, CLOCK_PATTERN,
    CLOTHING_DAMAGE_WORDS, CLOTHING_SLOT_PATTERN, GARMENT_NAMES,
    RACE_KEYWORDS, TRANSIENT_YOU_DETAIL_PATTERN,
    VAGUE_STATUS_PATTERN, USER_FORBIDDEN_DETAIL_PATTERN,
} from "./constants";

export {
    cleanFragment, cleanHeaderText, cleanLabeledValue, isPlaceholder,
    isNoNpcValue, sameText, limitWords, normalizeLineEndings,
} from "./utils/text";
export {escapeRegExp, containsAnyCue} from "./utils/regex";
export {splitTopLevel} from "./utils/split";
export {nonDialogueEvidenceContext, stripDoubleQuotedText} from "./utils/nonDialogue";

export type {NormalizeStatusOptions} from "./types";

export {normalizeLocation, normalizeLocationTimeLine} from "./header/normalizeLocation";
export {normalizeClock, timeOfDayForClock, asTimeOfDay} from "./header/normalizeClock";
export {normalizeYouLine, normalizeStatus, parseIdentityStatus, splitIdentity} from "./header/normalizeYouLine";
export {normalizeNpcLine} from "./header/normalizeNpcLine";
export {formatHeader} from "./header/headerBuilder";

export {normalizeThreadLine} from "./thread/normalizeThreadLine";
export {applyThreadWaitingLock} from "./thread/threadWaitingLock";

export {coerceWalletState, normalizeWalletLine} from "./wallet/normalizeWalletLine";
export {parseWalletAmounts, formatWallet, walletToCopper, copperToWallet} from "./wallet/walletMath";

export {coerceNpcMemory, updateNpcMemory, buildNpcMemoryDirections} from "./npcMemory/updateNpcMemory";
export {npcHeaderMemoryEntries, npcMemoryKeysFromHeader, npcSpeakerNamesFromState} from "./npcMemory/npcMemoryState";
export {NPC_CANON_REGISTRY, findNpcCanonByNameOrAlias} from "./npcMemory/npcCanonRegistry";

export {coerceUserStatus, updateUserStatus} from "./userStatus/userStatusState";

export {createDefaultState, defaultNpcStatusForRace} from "./state/defaultState";
export {coerceHeaderState, createInitialHeaderState} from "./state/coerceHeaderState";

export {normalizeAetherNovaResponse, debugNpcQuery} from "./response/normalizeAetherNovaResponse";
export {extractHeader} from "./response/extractHeader";
export {formatResponse} from "./response/formatResponse";
