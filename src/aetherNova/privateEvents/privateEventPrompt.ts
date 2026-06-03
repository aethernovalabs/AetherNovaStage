import type {AetherNovaMessageState, PrivateEventEntry} from "../types";
import {cleanFragment} from "../utils/text";
import {splitNpcNamesFromHeader, tokenOverlap} from "./privateEventUtils";

function mentionsKeyword(text: string, keywords: string[]): boolean {
    const lower = text.toLowerCase();
    return keywords.some((keyword) => {
        const clean = cleanFragment(keyword).toLowerCase();
        return clean.length > 2 && lower.includes(clean);
    });
}

function privateEventRelevanceScore(event: PrivateEventEntry, state: AetherNovaMessageState, userMessage: string): number {
    if (event.status === "complete" || event.status === "failed" || event.status === "cancelled" || event.status === "expired") {
        return 0;
    }

    let score = 0;
    if (event.status === "imminent" || event.status === "overdue" || event.status === "risk_active") score += 80;
    if (event.urgencyLabel === "imminent" || event.urgencyLabel === "overdue" || event.urgencyLabel === "risk_active") score += 80;

    const headerNpcNames = splitNpcNamesFromHeader(state.npc).map((name) => name.toLowerCase());
    if (event.npcNames.some((name) => headerNpcNames.some((headerName) => headerName.includes(name.toLowerCase()) || name.toLowerCase().includes(headerName)))) {
        score += 40;
    }

    if (mentionsKeyword(userMessage, event.keywords)) {
        score += 35;
    }

    if (event.location != null && tokenOverlap(state.location, event.location) >= 2) {
        score += 30;
    }

    if (
        tokenOverlap(state.thread, event.parentThreadKey) >= 2
        || tokenOverlap(state.thread, event.context) >= 2
        || mentionsKeyword(state.thread, event.keywords)
    ) {
        score += 30;
    }

    if ((event.threatContext != null || event.consequence != null) && score > 0) {
        score += 15;
    }

    return score;
}

function eventLine(event: PrivateEventEntry): string {
    const lines = [
        `- Event: ${event.context}`,
        `  Status: ${event.status}.`,
        `  Known By: ${event.knownBy.join(", ")}.`,
    ];

    if (event.timeAnchor != null) lines.push(`  Time: ${event.timeAnchor}.`);
    if (event.deadline != null) lines.push(`  Deadline: ${event.deadline}.`);
    if (event.location != null) lines.push(`  Location: ${event.location}.`);
    if (event.condition != null) lines.push(`  Condition: ${event.condition}`);
    if (event.threatContext != null || event.consequence != null) {
        const consequence = [event.condition, event.threatContext, event.consequence].filter(Boolean).join(" ");
        lines.push(`  Conditional consequence: ${consequence}`);
    }
    if (event.secrecyNote.length > 0) lines.push(`  Privacy: ${event.secrecyNote}`);

    return lines.join("\n");
}

export function formatPrivateEventsForPrompt(
    privateEvents: PrivateEventEntry[] | undefined,
    state: AetherNovaMessageState,
    userMessage: string,
): string {
    const scored = (privateEvents ?? [])
        .map((event) => ({event, score: privateEventRelevanceScore(event, state, userMessage)}))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);

    if (scored.length === 0) {
        return "";
    }

    return [
        "[Private Event Context - Secret]",
        "This information is private world-state. Do not reveal it to NPCs who do not know it. NPCs not listed in Known By must not act as if they know this event unless RP explicitly reveals it.",
        "",
        ...scored.map(({event}) => eventLine(event)),
    ].join("\n");
}
