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

const LOCATION_OWNER_OR_TITLE_TOKENS = new Set([
    "queen", "king", "prince", "princess", "lord", "lady", "sir", "madam",
    "personal", "private",
]);

const LOCATION_NOUN_TOKENS = new Set([
    "study", "chamber", "room", "hall", "courtyard", "fountain", "garden",
    "gate", "tower", "balcony", "terrace", "library", "office", "bedroom",
    "sofa", "couch", "bed", "desk", "table",
]);

function possessiveOwnerTokens(value: string): Set<string> {
    const owners = new Set<string>();
    const re = /\b([a-z][a-z0-9]{2,})['’]s\b/gi;
    let match = re.exec(value);

    while (match != null) {
        owners.add(match[1].toLowerCase());
        match = re.exec(value);
    }

    return owners;
}

function locationCandidateWasNearbyTarget(candidateParts: string[], previous: string): boolean {
    const previousLower = previous.toLowerCase();
    const ownerTokens = new Set([
        ...possessiveOwnerTokens(previous),
        ...possessiveOwnerTokens(candidateParts.join(" ")),
    ]);
    const overlaps = meaningfulLocationTokens(candidateParts.slice(1).join(" "))
        .filter((token) => !ownerTokens.has(token) && !LOCATION_OWNER_OR_TITLE_TOKENS.has(token))
        .filter((token) => containsAnyCue(previousLower, [token]));

    return overlaps.length >= 2 || overlaps.some((token) => LOCATION_NOUN_TOKENS.has(token));
}

function hasExplicitLocationTransition(context: string): boolean {
    const lowerContext = context.toLowerCase();

    if (
        /\b(?:scene\s+stays?|stays?|remains?|still)\s+(?:in|inside|within|at)\b/i.test(context)
        || /\b(?:without|no one|nobody)\s+(?:leaving|leaves|entering|enters|moving|moves)\b/i.test(context)
        || /\b(?:does\s+not|doesn't|do\s+not|don't|did\s+not|didn't)\s+(?:leave|enter|move)\b/i.test(context)
    ) {
        return false;
    }

    if (containsAnyCue(lowerContext, ["teleport", "time skip", "scene transition", "meanwhile", "later", "afterward", "afterwards"])) {
        return true;
    }

    return /\b(?:arrive|arrives|arrived)\s+(?:at|in|into|before|outside|inside|near)\b/i.test(context)
        || /\b(?:enter|enters|entered|leave|leaves|left)\s+(?:the|this|that|a|an|his|her|their)?\s*(?:room|hall|study|chamber|palace|courtyard|area|place|building|bedroom|garden|gate|tower)\b/i.test(context)
        || /\b(?:move|moves|moved|walk|walks|walked|step|steps|stepped|lead|leads|led|follow|follows|followed|travel|travels|traveled|journey)\s+(?:to|into|through|toward|towards|across|from|inside|outside)\b/i.test(context);
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
    const lowerContext = context.toLowerCase();
    const hasTransitionCue = hasExplicitLocationTransition(context);

    if (
        candidateParts.length >= 3
        && previousParts.length >= 3
        && sameText(candidateParts[0], previousParts[0])
        && sameText(candidateParts[1], previousParts[1])
    ) {
        return true;
    }

    if (!hasTransitionCue) {
        return false;
    }

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

    return hasTransitionCue;
}

function looksLikeLocationTimeLine(value: string): boolean {
    const lower = value.toLowerCase();
    return value.includes("|")
        && (CLOCK_PATTERN.test(value) || TIME_OF_DAYS.some((timeOfDay) => lower.includes(timeOfDay.toLowerCase())));
}

function clockMinutes(clock: string): number | null {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(clock);
    if (match == null) {
        return null;
    }

    return Number(match[1]) * 60 + Number(match[2]);
}

function forwardClockDelta(previousClock: string, candidateClock: string): number | null {
    const previous = clockMinutes(previousClock);
    const candidate = clockMinutes(candidateClock);
    if (previous == null || candidate == null) {
        return null;
    }

    return (candidate - previous + 1440) % 1440;
}

function hasStrongTimePassage(context: string): boolean {
    return /\b(?:time skip|hours? pass|day passes?|days pass|by the time|wait(?:s|ed|ing)? until|sleep|sleeps|slept|wake|wakes|woke|next morning|next day|midnight|dawn|dusk|sunrise|sunset)\b/i.test(context)
        || /\b(?:after|for|within)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:hour|hours|day|days)\b/i.test(context)
        || /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:hour|hours|day|days)\s+(?:later|pass|passes|passed)\b/i.test(context);
}

function hasVagueTimePassage(context: string): boolean {
    return /\b(?:time passes?|minutes? pass|later|meanwhile|afterward|afterwards|eventually)\b/i.test(context)
        || /\b(?:after|for|within)\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:minute|minutes|hour|hours|day|days)\b/i.test(context)
        || /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:minute|minutes|hour|hours|day|days)\s+(?:later|pass|passes|passed)\b/i.test(context);
}

function normalizeClockForResponse(rawValue: string, previousClock: string, context: string): string {
    const candidate = normalizeClock(rawValue, previousClock);

    if (candidate === previousClock) {
        return previousClock;
    }

    const delta = forwardClockDelta(previousClock, candidate);
    if (delta == null) {
        return previousClock;
    }

    if (delta > 0 && delta <= 20) {
        return candidate;
    }

    return hasStrongTimePassage(context) || (delta <= 60 && hasVagueTimePassage(context)) ? candidate : previousClock;
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
    const clock = normalizeClockForResponse(clockSource, previousState.clock, context);
    const locationSource = segments.find((segment) => !CLOCK_PATTERN.test(segment) && asTimeOfDay(segment) == null) ?? "";

    return {
        location: normalizeLocation(locationSource, previousState.location, context),
        timeOfDay: clock === previousState.clock ? previousState.timeOfDay : timeOfDayForClock(clock),
        clock,
    };
}
