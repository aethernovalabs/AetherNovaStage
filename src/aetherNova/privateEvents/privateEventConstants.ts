import type {PrivateEventStatus, PrivateEventUrgency} from "../types";

export const PRIVATE_EVENT_STATUSES: PrivateEventStatus[] = [
    "scheduled",
    "soon",
    "imminent",
    "overdue",
    "risk_active",
    "complete",
    "failed",
    "cancelled",
    "expired",
];

export const PRIVATE_EVENT_URGENCIES: PrivateEventUrgency[] = [
    "safe",
    "soon",
    "imminent",
    "overdue",
    "risk_active",
];

export const PRIVATE_EVENT_TERMINAL_STATUSES: PrivateEventStatus[] = [
    "complete",
    "failed",
    "cancelled",
    "expired",
];

export const PRIVATE_EVENT_VALID_CUES = [
    "meet me at",
    "meet me in",
    "meet me by",
    "i'll wait for you at",
    "i will wait for you at",
    "i'll be waiting at",
    "i will be waiting at",
    "i'll be waiting",
    "come to",
    "don't be late",
    "do not be late",
    "if you're late",
    "if you are late",
    "if you're not there",
    "if you are not there",
    "if you don't come",
    "if you do not come",
    "i will come looking for you",
    "i'll come looking for you",
    "i'll hold you to that promise",
    "i will hold you to that promise",
    "hold you to that promise",
    "promise me",
    "i promise",
    "appointment",
    "rendezvous",
    "private meeting",
    "deadline",
    "warning",
    "threat",
    "consequence",
];

export const PRIVATE_EVENT_VAGUE_REJECT_CUES = [
    "i hope we meet again",
    "maybe someday",
    "we should talk later",
    "i might visit",
    "let's see what happens",
    "perhaps we can meet",
    "i would like to speak someday",
];

export const PRIVATE_EVENT_PRIVACY_NOTE = "Private event. Only {{user}} and listed NPCs know this unless revealed in RP.";
