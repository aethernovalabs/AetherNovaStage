import {parseIdentityStatus, splitIdentity} from "../header/normalizeYouLine";

export function resolveUserIdentity(
    youLine: string,
    genderFallback: string,
    raceFallback: string,
): {gender: string; apparentRace: string} {
    const parsed = parseIdentityStatus(youLine);
    const identity = splitIdentity(parsed.identity, genderFallback, raceFallback);
    return {
        gender: identity.left,
        apparentRace: identity.right,
    };
}
