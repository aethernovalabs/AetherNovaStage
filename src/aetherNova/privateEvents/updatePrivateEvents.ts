import type {AetherNovaMessageState, PrivateEventEntry, PrivateEventStatus} from "../types";
import {cleanFragment} from "../utils/text";
import {stripDoubleQuotedText} from "../utils/nonDialogue";
import {isTerminalThreadItem, threadItemsOverlap} from "../thread/normalizeThreadLine";
import {inferPrivateEventCandidate} from "./privateEventInference";
import {coercePrivateEvents, privateEventsOverlap, refreshPrivateEventUrgency, uniqueStrings} from "./privateEventUtils";

export interface PrivateEventUpdateResult {
    privateEvents: PrivateEventEntry[];
    logEntries: string[];
}

interface PrivateEventUpdateInput {
    previousEvents: unknown;
    state: Pick<AetherNovaMessageState, "location" | "clock" | "npc" | "thread">;
    previousThread: string;
    evidence: string;
}

function mergePrivateEvent(previous: PrivateEventEntry, next: PrivateEventEntry, clock: string): PrivateEventEntry {
    const merged: PrivateEventEntry = {
        ...previous,
        ...next,
        id: previous.id,
        parentThreadKey: previous.parentThreadKey || next.parentThreadKey,
        status: previous.status === "complete" || previous.status === "failed" || previous.status === "cancelled" || previous.status === "expired"
            ? previous.status
            : next.status,
        urgencyLabel: next.urgencyLabel,
        npcNames: uniqueStrings([...previous.npcNames, ...next.npcNames]),
        knownBy: uniqueStrings([...previous.knownBy, ...next.knownBy]),
        keywords: uniqueStrings([...previous.keywords, ...next.keywords]),
        timeAnchor: moreSpecific(next.timeAnchor, previous.timeAnchor),
        deadline: moreSpecific(next.deadline, previous.deadline),
        location: moreSpecific(next.location, previous.location),
        context: moreSpecific(next.context, previous.context) ?? previous.context,
        condition: moreSpecific(next.condition, previous.condition),
        threatContext: moreSpecific(next.threatContext, previous.threatContext),
        consequence: moreSpecific(next.consequence, previous.consequence),
        sourceSummary: moreSpecific(next.sourceSummary, previous.sourceSummary),
        lastEvidence: next.lastEvidence ?? previous.lastEvidence,
        createdAtClock: previous.createdAtClock ?? next.createdAtClock,
        updatedAtClock: clock,
    };

    return merged;
}

function specificityScore(value: string | undefined): number {
    if (value == null || cleanFragment(value).length === 0) {
        return 0;
    }

    const clean = cleanFragment(value);
    if (/\b([01]?\d|2[0-3]):([0-5]\d)\b/.test(clean)) return 5;
    if (/\b\d+\s+hours?\b|\b(one|two|three|four|five|six)\s+hours?\b/i.test(clean)) return 4;
    if (clean.split(/\s+/).length >= 4) return 3;
    if (/\b(midday|morning|afternoon|evening|nightfall|dawn|sunrise|night)\b/i.test(clean)) return 2;
    return 1;
}

function moreSpecific(next: string | undefined, previous: string | undefined): string | undefined {
    return specificityScore(next) >= specificityScore(previous) ? (next ?? previous) : previous;
}

function statusFromTerminalThread(item: string): PrivateEventStatus {
    const lower = item.toLowerCase();
    if (/\bfailed|abandoned|refused|declined|rejected\b/i.test(lower)) return "failed";
    if (/\bcancelled|canceled\b/i.test(lower)) return "cancelled";
    if (/\bexpired\b/i.test(lower)) return "expired";
    return "complete";
}

function applyTerminalThreadStatus(events: PrivateEventEntry[], currentThread: string): {events: PrivateEventEntry[]; logs: string[]} {
    const rawItems = currentThread
        .split(/\s*;\s*/g)
        .map(cleanFragment)
        .filter(Boolean);
    const terminalItems = rawItems.filter(isTerminalThreadItem);
    const logs: string[] = [];

    if (terminalItems.length === 0) {
        return {events, logs};
    }

    const nextEvents = events.map((event) => {
        const match = terminalItems.find((item) =>
            threadItemsOverlap(item, event.parentThreadKey)
            || threadItemsOverlap(item, event.context)
            || event.keywords.some((keyword) => threadItemsOverlap(item, keyword)),
        );

        if (match == null) {
            return event;
        }

        const status = statusFromTerminalThread(match);
        if (event.status !== status) {
            logs.push(`${event.id} status: ${event.status} -> ${status} from Thread terminal item "${match}"`);
        }
        return {...event, status, urgencyLabel: "safe" as const, updatedAtClock: event.updatedAtClock};
    });

    return {events: nextEvents, logs};
}

function applyNarrativeCompletion(events: PrivateEventEntry[], evidence: string, clock: string): {events: PrivateEventEntry[]; logs: string[]} {
    const logs: string[] = [];
    const actionEvidence = stripDoubleQuotedText(evidence);
    const lower = actionEvidence.toLowerCase();
    const nextEvents = events.map((event) => {
        if (event.status === "complete" || event.status === "failed" || event.status === "cancelled" || event.status === "expired") {
            return event;
        }

        const mentionsNpc = event.npcNames.some((name) => lower.includes(name.toLowerCase().split(/\s+/)[0] ?? name.toLowerCase()));
        const mentionsLocation = event.location != null
            && event.location.toLowerCase().split(/\s+-\s+/).some((part) => part.length > 3 && lower.includes(part));

        if (mentionsNpc && mentionsLocation && /\b(?:arrive|arrives|arrived|met|reunite|reunites|found)\b/i.test(actionEvidence)) {
            logs.push(`${event.id} status: ${event.status} -> complete from narrative meeting evidence`);
            return {...event, status: "complete" as const, urgencyLabel: "safe" as const, updatedAtClock: clock};
        }

        return event;
    });

    return {events: nextEvents, logs};
}

export function updatePrivateEvents(input: PrivateEventUpdateInput): PrivateEventUpdateResult {
    const logs: string[] = [];
    let events = coercePrivateEvents(input.previousEvents);
    const candidate = inferPrivateEventCandidate({
        state: input.state,
        previousThread: input.previousThread,
        evidence: input.evidence,
    });

    if (candidate != null) {
        const existingIndex = events.findIndex((event) => privateEventsOverlap(event, candidate));
        if (existingIndex >= 0) {
            const previous = events[existingIndex];
            const merged = mergePrivateEvent(previous, candidate, input.state.clock);
            events = events.map((event, index) => index === existingIndex ? merged : event);
            logs.push(`${merged.id} updated: ${previous.context} -> ${merged.context}`);
        } else {
            events = [candidate, ...events];
            logs.push(`Added private event: ${candidate.id}`);
        }
    }

    const terminalResult = applyTerminalThreadStatus(events, input.state.thread);
    events = terminalResult.events;
    logs.push(...terminalResult.logs);

    const completionResult = applyNarrativeCompletion(events, input.evidence, input.state.clock);
    events = completionResult.events;
    logs.push(...completionResult.logs);

    events = events
        .map((event) => refreshPrivateEventUrgency(event, input.state))
        .slice(0, 12);

    return {privateEvents: events, logEntries: logs};
}
