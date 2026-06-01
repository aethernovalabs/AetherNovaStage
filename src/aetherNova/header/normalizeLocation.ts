import type {AetherNovaMessageState} from "../types";
import {DEFAULT_STATE} from "../constants";
import {cleanFragment, cleanHeaderText, sameText, isPlaceholder} from "../utils/text";
import {containsAnyCue} from "../utils/regex";
import {LOCATION_TRANSITION_CUES, LOCATION_SCENE_ANCHOR_CUES, LOCATION_STOP_WORDS} from "./locationConstants";
import {CLOCK_PATTERN} from "../constants";

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

export function normalizeLocation(rawLocation: string, previousLocation: string, context: string = ""): string {
    const parts = splitLocation(previousLocation);
    const currentParts = splitLocation(rawLocation);

    if (isPlaceholder(rawLocation) || rawLocation.toLowerCase().includes("main location")) {
        return previousLocation;
    }

    let candidate: string;

    if (currentParts.length >= 3) {
        candidate = [currentParts[0], currentParts[1], currentParts.slice(2).join(" - ")].join(" - ");
    } else if (currentParts.length === 2) {
        const detailedArea = sameText(currentParts[0], parts[0]) && sameText(currentParts[1], parts[1])
            ? parts[2]
            : "Active Area";
        candidate = [currentParts[0], currentParts[1], detailedArea].join(" - ");
    } else if (currentParts.length === 1) {
        if (previousLocation.toLowerCase().includes(currentParts[0].toLowerCase())) {
            candidate = previousLocation;
        } else {
            candidate = [currentParts[0], "Current Place", "Active Area"].join(" - ");
        }
    } else {
        candidate = previousLocation;
    }

    return locationChangeIsSupported(candidate, previousLocation, context) ? candidate : previousLocation;
}

import {normalizeClock, timeOfDayForClock, asTimeOfDay} from "./normalizeClock";

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
