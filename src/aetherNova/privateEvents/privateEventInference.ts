import type {AetherNovaMessageState, PrivateEventEntry} from "../types";
import {cleanFragment, normalizeLineEndings, titleCase} from "../utils/text";
import {containsAnyCue} from "../utils/regex";
import {splitThreadItems, threadItemsOverlap} from "../thread/normalizeThreadLine";
import {PRIVATE_EVENT_PRIVACY_NOTE, PRIVATE_EVENT_VAGUE_REJECT_CUES, PRIVATE_EVENT_VALID_CUES} from "./privateEventConstants";
import {privateEventId, privateEventKey, resolveNpcName, splitNpcNamesFromHeader, uniqueStrings} from "./privateEventUtils";

interface PrivateEventCandidateContext {
    state: Pick<AetherNovaMessageState, "location" | "clock" | "npc" | "thread">;
    previousThread: string;
    evidence: string;
}

function sentenceWindow(value: string, maxChars: number): string {
    return cleanFragment(value.replace(/\n+/g, " ")).slice(0, maxChars);
}

function extractDialogueSpeakers(evidence: string, npcLine: string): string[] {
    const names = Array.from(normalizeLineEndings(evidence).matchAll(/^\s*([A-Z][A-Za-z'._-]{2,}(?:\s+[A-Z][A-Za-z'._-]{2,}){0,3})\s*:/gm))
        .map((match) => resolveNpcName(match[1], npcLine));
    return uniqueStrings(names);
}

function extractPrimaryNpc(evidence: string, npcLine: string): string[] {
    const speakers = extractDialogueSpeakers(evidence, npcLine);
    if (speakers.length > 0) {
        return [speakers[0]];
    }

    const headerNames = splitNpcNamesFromHeader(npcLine);
    return headerNames.length > 0 ? [headerNames[0]] : [];
}

function extractTimeAnchor(evidence: string): string | undefined {
    const exactClock = evidence.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (exactClock != null) {
        return exactClock[0];
    }

    const relative = evidence.match(/\b(?:one|two|three|four|five|six|\d+)\s+hours?\s+after\s+(?:sunrise|dawn)\b/i);
    if (relative != null) {
        return cleanFragment(relative[0].toLowerCase());
    }

    const broad = evidence.match(/\b(?:at|by|before|around)\s+(dawn|sunrise|morning|midday|afternoon|evening|nightfall|night)\b/i);
    if (broad != null) {
        return cleanFragment(broad[1].toLowerCase());
    }

    return undefined;
}

function extractDeadline(evidence: string): string | undefined {
    if (/\b(?:by|before|around)\s+midday\b/i.test(evidence)) {
        return "before/around midday";
    }

    const deadline = evidence.match(/\b(?:by|before|around)\s+(dawn|sunrise|morning|afternoon|evening|nightfall|night)\b/i);
    if (deadline != null) {
        return cleanFragment(`${deadline[0].toLowerCase()}`);
    }

    return undefined;
}

function formatLocation(candidate: string, currentLocation: string): string {
    const clean = cleanFragment(candidate)
        .replace(/^the\s+/i, "")
        .replace(/\b(?:not|instead|rather)\b.*$/i, "")
        .replace(/\b(?:when|where|because|if|and|but)\b.*$/i, "")
        .replace(/["'`]+/g, "");
    const lower = clean.toLowerCase();

    if (lower.includes("east courtyard") && lower.includes("fountain")) {
        const root = currentLocation.split(/\s+-\s+/)[0] ?? "Solmeryn Palace";
        const region = cleanFragment(root).length > 0 && !/^unknown/i.test(root) ? cleanFragment(root) : "Solmeryn Palace";
        return `${region} - East Courtyard - Fountain`;
    }

    return titleCase(clean);
}

function extractLocation(evidence: string, currentLocation: string): string | undefined {
    const directFountain = evidence.match(/\b(?:at|to|in)\s+(?:the\s+)?(east\s+courtyard\s+fountain)\b/i)
        ?? evidence.match(/\b(east\s+courtyard\s+fountain)\b/i);
    if (directFountain != null) {
        return formatLocation(directFountain[1], currentLocation);
    }

    const location = evidence.match(/\b(?:meet|waiting|wait|come|rendezvous)\b[^.!?\n]{0,80}?\b(?:at|in|to)\s+(?:the\s+)?([^.!?\n"]{3,90}?(?:fountain|courtyard|room|hall|garden|gate|tavern|district|palace))\b/i);
    if (location != null) {
        return formatLocation(location[1], currentLocation);
    }

    return undefined;
}

function extractCondition(evidence: string): string | undefined {
    if (/\bif\s+(?:you(?:'re| are)?\s+)?(?:not\s+there|late|absent|don't\s+come|do\s+not\s+come)\b/i.test(evidence)) {
        return "If {{user}} is late or absent.";
    }

    return undefined;
}

function extractThreat(npcNames: string[], evidence: string): {threatContext?: string; consequence?: string} {
    const npc = npcNames[0] ?? "The NPC";
    const lower = evidence.toLowerCase();
    const hasBlade = /\bblade|sword|knife|weapon\b/i.test(evidence);
    const hasMap = /\bmap\b/i.test(evidence);
    const hasLowLantern = /\blow lantern\b/i.test(evidence);

    if (!containsAnyCue(lower, ["come looking for you", "come looking", "search for you", "hunt you down", "bring a blade", "threat"])) {
        return {};
    }

    const tools: string[] = [];
    if (hasBlade) tools.push("a blade");
    if (hasMap && hasLowLantern) tools.push("her own Low Lantern map");
    else if (hasMap) tools.push("a map");

    const threatContext = tools.length > 0
        ? `${npc} intends to come looking with ${tools.join(" and ")}.`
        : `${npc} intends to come looking for {{user}}.`;

    const consequence = hasLowLantern || /\btaverns?\b/i.test(evidence)
        ? "She may search taverns in Low Lantern aggressively until she finds {{user}}."
        : "The threat may become active if {{user}} misses the private event.";

    return {threatContext, consequence};
}

function extractKeywords(event: Omit<PrivateEventEntry, "keywords">, evidence: string): string[] {
    const keywords = [
        ...event.npcNames,
        event.location ?? "",
        event.timeAnchor ?? "",
        event.deadline ?? "",
    ];

    if (/\beast courtyard\b/i.test(evidence)) keywords.push("east courtyard");
    if (/\bfountain\b/i.test(evidence)) keywords.push("fountain");
    if (/\btwo hours after sunrise\b/i.test(evidence)) keywords.push("two hours after sunrise");
    if (/\bmidday\b/i.test(evidence)) keywords.push("midday");
    if (/\blow lantern\b/i.test(evidence)) keywords.push("Low Lantern");
    if (/\bblade\b/i.test(evidence)) keywords.push("blade");
    if (/\bpromise\b/i.test(evidence)) keywords.push("promise");
    if (/\bmeeting|meet|waiting|rendezvous\b/i.test(evidence)) keywords.push("meeting");

    return uniqueStrings(keywords);
}

function parentThreadKeyForEvent(npcNames: string[], location: string | undefined, stateThread: string, previousThread: string): string {
    const seed = privateEventId(["meet", npcNames[0] ?? "", location ?? "private event"]);
    const threadItems = [...splitThreadItems(stateThread), ...splitThreadItems(previousThread)];
    const overlapping = threadItems.find((item) => threadItemsOverlap(item, seed) || (location != null && threadItemsOverlap(item, location)));
    return overlapping != null ? privateEventKey(overlapping) : seed;
}

function eventLooksValid(evidence: string, location: string | undefined, timeAnchor: string | undefined, deadline: string | undefined, condition: string | undefined, threatContext: string | undefined): boolean {
    const lower = evidence.toLowerCase();
    const hasValidCue = containsAnyCue(lower, PRIVATE_EVENT_VALID_CUES);
    const hasVagueReject = PRIVATE_EVENT_VAGUE_REJECT_CUES.some((cue) => lower.includes(cue));
    if (!hasValidCue || hasVagueReject) {
        return false;
    }

    const hasMeetingCue = containsAnyCue(lower, ["meet me", "meet", "waiting", "wait for you", "come to", "appointment", "rendezvous", "private meeting"]);
    const hasPromiseCue = containsAnyCue(lower, ["promise", "hold you to that promise"]);
    const hasThreatCue = condition != null || threatContext != null;

    return (hasMeetingCue && (location != null || timeAnchor != null))
        || (hasPromiseCue && (location != null || timeAnchor != null || deadline != null))
        || (hasThreatCue && (deadline != null || location != null || timeAnchor != null));
}

export function inferPrivateEventCandidate(context: PrivateEventCandidateContext): PrivateEventEntry | null {
    const evidence = sentenceWindow(context.evidence, 1800);
    const location = extractLocation(evidence, context.state.location);
    const timeAnchor = extractTimeAnchor(evidence);
    const deadline = extractDeadline(evidence);
    const npcNames = extractPrimaryNpc(evidence, context.state.npc);
    const condition = extractCondition(evidence);
    const threat = extractThreat(npcNames, evidence);

    if (!eventLooksValid(evidence, location, timeAnchor, deadline, condition, threat.threatContext)) {
        return null;
    }

    const knownBy = uniqueStrings(["{{user}}", ...npcNames]);
    const parentThreadKey = parentThreadKeyForEvent(npcNames, location, context.state.thread, context.previousThread);
    const id = parentThreadKey;
    const npcLabel = npcNames[0] ?? "the NPC";
    const placeLabel = location?.split(/\s+-\s+/).slice(-1)[0] ?? "the private meeting place";
    const contextText = `{{user}} promised to meet ${npcLabel} privately at ${placeLabel.toLowerCase()}.`;
    const sourceSummary = `${npcLabel} told {{user}} to meet privately${location != null ? ` at ${placeLabel.toLowerCase()}` : ""}${timeAnchor != null ? ` ${timeAnchor}` : ""}.`;
    const baseEvent = {
        id,
        parentThreadKey,
        status: "scheduled" as const,
        urgencyLabel: "safe" as const,
        npcNames,
        knownBy,
        timeAnchor,
        deadline,
        location,
        context: contextText,
        condition,
        threatContext: threat.threatContext,
        consequence: threat.consequence,
        secrecyNote: PRIVATE_EVENT_PRIVACY_NOTE,
        sourceSummary,
        lastEvidence: evidence,
        createdAtClock: context.state.clock,
        updatedAtClock: context.state.clock,
    };

    return {
        ...baseEvent,
        keywords: extractKeywords(baseEvent, evidence),
    };
}
