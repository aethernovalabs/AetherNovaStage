import type {AetherNovaMessageState, PrivateEventEntry, PrivateEventStatus, PrivateEventUrgency} from "../types";
import {cleanFragment, meaningfulTokens, sameText} from "../utils/text";
import {splitTopLevel} from "../utils/split";
import {PRIVATE_EVENT_PRIVACY_NOTE, PRIVATE_EVENT_STATUSES, PRIVATE_EVENT_TERMINAL_STATUSES, PRIVATE_EVENT_URGENCIES} from "./privateEventConstants";

const USER_KNOWN_LABEL = "{{user}}";

export function privateEventKey(value: string): string {
    return cleanFragment(value)
        .toLowerCase()
        .replace(/\{\{user\}\}/g, "user")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

export function privateEventId(parts: string[]): string {
    const key = privateEventKey(parts.filter(Boolean).join(" "));
    return key.length > 0 ? key : "private_event";
}

export function cleanPrivateEventList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return uniqueStrings(value.filter((entry): entry is string => typeof entry === "string"));
    }

    if (typeof value === "string") {
        return uniqueStrings(value.split(/[,;\n]+/g));
    }

    return [];
}

export function uniqueStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const clean = cleanFragment(value);
        if (clean.length > 0 && !result.some((entry) => sameText(entry, clean))) {
            result.push(clean);
        }
    }
    return result;
}

export function normalizePrivateEventStatus(value: unknown): PrivateEventStatus {
    return typeof value === "string" && PRIVATE_EVENT_STATUSES.includes(value as PrivateEventStatus)
        ? value as PrivateEventStatus
        : "scheduled";
}

export function normalizePrivateEventUrgency(value: unknown): PrivateEventUrgency {
    return typeof value === "string" && PRIVATE_EVENT_URGENCIES.includes(value as PrivateEventUrgency)
        ? value as PrivateEventUrgency
        : "safe";
}

export function isTerminalPrivateEvent(event: PrivateEventEntry): boolean {
    return PRIVATE_EVENT_TERMINAL_STATUSES.includes(event.status);
}

function optionalClean(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const clean = cleanFragment(value);
    return clean.length > 0 ? clean : undefined;
}

export function coercePrivateEvent(value: unknown): PrivateEventEntry | null {
    if (value == null || typeof value !== "object") {
        return null;
    }

    const raw = value as Partial<PrivateEventEntry>;
    const npcNames = cleanPrivateEventList(raw.npcNames);
    const knownBy = uniqueStrings([USER_KNOWN_LABEL, ...cleanPrivateEventList(raw.knownBy), ...npcNames]);
    const context = optionalClean(raw.context)
        ?? optionalClean(raw.sourceSummary)
        ?? optionalClean(raw.lastEvidence)
        ?? "";

    if (context.length === 0 && npcNames.length === 0) {
        return null;
    }

    const location = optionalClean(raw.location);
    const timeAnchor = optionalClean(raw.timeAnchor);
    const deadline = optionalClean(raw.deadline);
    const parentThreadKey = optionalClean(raw.parentThreadKey)
        ?? privateEventId([context, npcNames.join(" "), location ?? "", timeAnchor ?? ""]);
    const id = optionalClean(raw.id)
        ?? privateEventId([parentThreadKey, npcNames.join(" "), location ?? "", timeAnchor ?? ""]);

    return {
        id,
        parentThreadKey,
        status: normalizePrivateEventStatus(raw.status),
        urgencyLabel: normalizePrivateEventUrgency(raw.urgencyLabel),
        npcNames,
        knownBy,
        timeAnchor,
        deadline,
        location,
        context: context || "Private event pending.",
        condition: optionalClean(raw.condition),
        threatContext: optionalClean(raw.threatContext),
        consequence: optionalClean(raw.consequence),
        keywords: uniqueStrings(cleanPrivateEventList(raw.keywords)),
        secrecyNote: optionalClean(raw.secrecyNote) ?? PRIVATE_EVENT_PRIVACY_NOTE,
        sourceSummary: optionalClean(raw.sourceSummary),
        lastEvidence: optionalClean(raw.lastEvidence),
        createdAtClock: optionalClean(raw.createdAtClock),
        updatedAtClock: optionalClean(raw.updatedAtClock),
    };
}

export function coercePrivateEvents(value: unknown): PrivateEventEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const result: PrivateEventEntry[] = [];
    for (const rawEvent of value) {
        const event = coercePrivateEvent(rawEvent);
        if (event == null) {
            continue;
        }

        if (!result.some((existing) => privateEventsOverlap(existing, event))) {
            result.push(event);
        }
    }

    return result.slice(0, 12);
}

export function privateEventsOverlap(left: PrivateEventEntry, right: PrivateEventEntry): boolean {
    if (sameText(left.id, right.id) || sameText(left.parentThreadKey, right.parentThreadKey)) {
        return true;
    }

    const leftNpc = left.npcNames.map((name) => name.toLowerCase());
    const rightNpc = right.npcNames.map((name) => name.toLowerCase());
    const sharesNpc = leftNpc.length === 0
        || rightNpc.length === 0
        || leftNpc.some((name) => rightNpc.some((other) => name.includes(other) || other.includes(name)));
    if (!sharesNpc) {
        return false;
    }

    if (
        left.location != null
        && right.location != null
        && (sameText(left.location, right.location) || tokenOverlap(left.location, right.location) >= 2)
    ) {
        return true;
    }

    if (
        left.timeAnchor != null
        && right.timeAnchor != null
        && (sameText(left.timeAnchor, right.timeAnchor) || tokenOverlap(left.timeAnchor, right.timeAnchor) >= 2)
    ) {
        return true;
    }

    return tokenOverlap(
        [left.context, left.sourceSummary ?? "", left.keywords.join(" ")].join(" "),
        [right.context, right.sourceSummary ?? "", right.keywords.join(" ")].join(" "),
    ) >= 3;
}

export function tokenOverlap(left: string, right: string): number {
    const leftTokens = meaningfulTokens(left);
    const rightTokens = meaningfulTokens(right);
    return [...leftTokens].filter((token) => rightTokens.has(token)).length;
}

export function splitNpcNamesFromHeader(npcLine: string): string[] {
    const clean = cleanFragment(npcLine);
    if (clean.length === 0 || clean.toLowerCase() === "none") {
        return [];
    }

    return splitTopLevel(clean, ",")
        .map((entry) => cleanFragment(entry.replace(/\([^)]*\)/g, "")))
        .map((entry) => cleanFragment(entry.split(/\s+-\s+/)[0] ?? ""))
        .filter(Boolean);
}

export function resolveNpcName(name: string, npcLine: string): string {
    const cleanName = cleanFragment(name);
    const lowerName = cleanName.toLowerCase();
    const headerNames = splitNpcNamesFromHeader(npcLine);
    const match = headerNames.find((headerName) => {
        const lowerHeader = headerName.toLowerCase();
        return lowerHeader === lowerName
            || lowerHeader.startsWith(`${lowerName} `)
            || lowerName.startsWith(`${lowerHeader} `);
    });
    return match ?? cleanName;
}

function clockMinutes(clock: string): number | null {
    const match = clock.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (match == null) {
        return null;
    }

    return Number(match[1]) * 60 + Number(match[2]);
}

export function refreshPrivateEventUrgency(event: PrivateEventEntry, state: Pick<AetherNovaMessageState, "clock">): PrivateEventEntry {
    if (isTerminalPrivateEvent(event)) {
        return {...event, urgencyLabel: "safe"};
    }

    const currentMinutes = clockMinutes(state.clock);
    let urgency: PrivateEventUrgency = "safe";

    if (currentMinutes != null && event.deadline != null) {
        const deadline = event.deadline.toLowerCase();
        if (deadline.includes("midday")) {
            if (currentMinutes >= 12 * 60) {
                urgency = event.threatContext != null || event.consequence != null ? "risk_active" : "overdue";
            } else if (currentMinutes >= 11 * 60 + 30) {
                urgency = "imminent";
            } else if (currentMinutes >= 10 * 60) {
                urgency = "soon";
            }
        } else if (deadline.includes("nightfall") && currentMinutes >= 17 * 60) {
            urgency = event.threatContext != null || event.consequence != null ? "risk_active" : "overdue";
        } else if ((deadline.includes("dawn") || deadline.includes("sunrise")) && currentMinutes >= 6 * 60) {
            urgency = event.threatContext != null || event.consequence != null ? "risk_active" : "overdue";
        }
    }

    const status: PrivateEventStatus = urgency === "risk_active"
        ? "risk_active"
        : urgency === "overdue"
            ? "overdue"
            : urgency === "imminent"
                ? "imminent"
                : urgency === "soon"
                    ? "soon"
                    : event.status;

    return {...event, status, urgencyLabel: urgency};
}

export function privateEventDisplayTitle(event: PrivateEventEntry): string {
    const base = event.context.replace(/\{\{user\}\}/g, "User");
    return cleanFragment(base).slice(0, 120) || event.id;
}
