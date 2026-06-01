import type {AetherNovaMessageState} from "../types";
import {DEFAULT_STATE, CLOCK_PATTERN, TIME_OF_DAYS} from "../constants";
import {cleanFragment, cleanHeaderText, sameText, isPlaceholder} from "../utils/text";
import {containsAnyCue} from "../utils/regex";
import {LOCATION_TRANSITION_CUES, LOCATION_SCENE_ANCHOR_CUES, LOCATION_STOP_WORDS} from "./locationConstants";
import {normalizeClock, timeOfDayForClock, asTimeOfDay} from "./normalizeClock";

function splitLocation(value: string): string[] {
    return cleanFragment(value).split(/\s+-\s+/).map(cleanFragment).filter(Boolean);
}

function meaningfulLocationTokens(value: string): string[] {
    return cleanFragment(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !LOCATION_STOP_WORDS.has(word));
}

function locationCandidateIsSceneAnchored(candidateParts: string[], lowerContext: string): boolean {
    const tokens = meaningfulLocationTokens(candidateParts.slice(1).join(" "));

    if (tokens.length === 0) {
        return false;
    }

    const mentionsCandidatePlace = containsAnyCue(lowerContext, tokens);
    const hasSceneAnchor = containsAnyCue(lowerContext, LOCATION_SCENE_ANCHOR_CUES);

    return mentionsCandidatePlace && hasSceneAnchor;
}

function locationCandidateWasNearbyTarget(candidateParts: string[], previous: string): boolean {
    const previousLower = previous.toLowerCase();
    return meaningfulLocationTokens(candidateParts.slice(1).join(" "))
        .some((token) => containsAnyCue(previousLower, [token]));
}

function locationChangeIsSupported(candidate: string, previous: string, context: string): boolean {
    if (sameText(candidate, previous)) {
        return true;
    }

    if (previous === DEFAULT_STATE.location || previous.toLowerCase().includes("unknown")) {
        return true;
    }

    const candidateParts = splitLocation(candidate);
    const previousParts = splitLocation(previous);

    if (
        candidateParts.length >= 3
        && previousParts.length >= 3
        && sameText(candidateParts[0], previousParts[0])
        && sameText(candidateParts[1], previousParts[1])
    ) {
        return true;
    }

    const lowerContext = context.toLowerCase();
    if (
        candidateParts.length >= 2
        && previousParts.length >= 1
        && sameText(candidateParts[0], previousParts[0])
        && locationCandidateIsSceneAnchored(candidateParts, lowerContext)
    ) {
        return true;
    }

    if (
        locationCandidateWasNearbyTarget(candidateParts, previous)
        && locationCandidateIsSceneAnchored(candidateParts, lowerContext)
    ) {
        return true;
    }

    return LOCATION_TRANSITION_CUES.some((cue) => lowerContext.includes(cue));
}

function looksLikeLocationTimeLine(value: string): boolean {
    const lower = value.toLowerCase();
    return value.includes("|")
        && (CLOCK_PATTERN.test(value) || TIME_OF_DAYS.some((timeOfDay) => lower.includes(timeOfDay.toLowerCase())));
}

export function normalizeLocation(rawLocation: string, previousLocation: string, context: string = ""): string {
    const clean = cleanHeaderText(rawLocation).replace(/^(?:location|time)\s*:\s*/i, "");
    const previous = previousLocation || DEFAULT_STATE.location;

    if (isPlaceholder(clean) || clean.toLowerCase().includes("main location")) {
        return previous;
    }

    const previousParts = splitLocation(previous);
    const parts = splitLocation(clean);
    let candidate: string;

    if (parts.length >= 3) {
        candidate = [parts[0], parts[1], parts.slice(2).join(" - ")].join(" - ");
    } else if (parts.length === 2) {
        const detailedArea = sameText(parts[0], previousParts[0]) && sameText(parts[1], previousParts[1])
            ? previousParts[2]
            : "Active Area";
        candidate = [parts[0], parts[1], detailedArea].join(" - ");
    } else if (parts.length === 1) {
        if (previous.toLowerCase().includes(parts[0].toLowerCase())) {
            candidate = previous;
        } else {
            candidate = [parts[0], "Current Place", "Active Area"].join(" - ");
        }
    } else {
        candidate = previous;
    }

    return locationChangeIsSupported(candidate, previous, context) ? candidate : previous;
}

export function normalizeLocationTimeLine(
    rawLine: string | null,
    previousState: AetherNovaMessageState,
    context: string,
): Pick<AetherNovaMessageState, "location" | "timeOfDay" | "clock"> {
    if (rawLine == null || isPlaceholder(rawLine)) {
        return {
            location: previousState.location,
            timeOfDay: previousState.timeOfDay,
            clock: previousState.clock,
        };
    }

    const clean = cleanHeaderText(rawLine).replace(/^(?:location|time)\s*:\s*/i, "");
    const segments = clean.split("|").map(cleanFragment).filter((segment) => segment.length > 0);
    const clockSource = segments.find((segment) => CLOCK_PATTERN.test(segment)) ?? clean;
    const clock = normalizeClock(clockSource, previousState.clock);
    const locationSource = segments.find((segment) => !CLOCK_PATTERN.test(segment) && asTimeOfDay(segment) == null) ?? "";

    return {
        location: normalizeLocation(locationSource, previousState.location, context),
        timeOfDay: timeOfDayForClock(clock),
        clock,
    };
}
