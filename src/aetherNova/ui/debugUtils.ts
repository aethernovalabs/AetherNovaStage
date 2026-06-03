import type {AetherNovaMessageState, NpcMemoryEntry, NpcMemoryStore, PrivateEventEntry, UserStatusState} from "../types";
import type {NpcMemoryDraft} from "./types";
import {DEBUG_STORAGE_KEY} from "./types";
import {formatBehaviorScoreValue} from "../npcMemory/npcMemoryHelpers";
import {parseIdentityStatus, splitIdentity, statusParts} from "../header/normalizeYouLine";
import {splitLocation, splitTopLevel} from "../utils/split";
import {cleanFragment, cleanLabeledValue, isNoNpcValue, isNoThreadValue, sameText} from "../utils/text";
import {copperToWallet, formatWallet, parseWalletAmounts, walletToCopper} from "../wallet/walletMath";

function behaviorScoresDraftText(scores: Record<string, number>): string {
    return Object.entries(scores).map(([label, score]) => `${label}: ${formatBehaviorScoreValue(score)}`).join("; ");
}

export function computeDirtyFields(draft: NpcMemoryDraft, original: NpcMemoryEntry | null): Set<string> {
    const dirty = new Set<string>();
    if (original == null) {
        return dirty;
    }
    if (draft.name !== original.name) dirty.add("name");
    if (draft.roleTitle !== original.roleTitle) dirty.add("roleTitle");
    if (draft.race !== original.race) dirty.add("race");
    if (draft.physicalExtra !== original.physicalExtra) dirty.add("physicalExtra");
    if (draft.currentMood !== original.currentMood) dirty.add("currentMood");
    if (draft.lastInteractionTone !== (original.lastInteractionTone ?? "")) dirty.add("lastInteractionTone");
    if (draft.behaviorTowardUserText !== original.behaviorTowardUser.join(", ")) dirty.add("behaviorTowardUserText");
    if (draft.behaviorScoresText !== behaviorScoresDraftText(original.behaviorScores)) dirty.add("behaviorScoresText");
    if (draft.relationshipWithUserText !== original.relationshipWithUser.join(", ")) dirty.add("relationshipWithUserText");
    if (draft.relationshipEventsText !== original.relationshipEvents.join("; ")) dirty.add("relationshipEventsText");
    if (draft.onlyKnowsText !== original.onlyKnows.join("; ")) dirty.add("onlyKnowsText");
    return dirty;
}

export function emptyNpcMemoryDraft(): NpcMemoryDraft {
    return {
        name: "",
        roleTitle: "",
        race: "",
        physicalExtra: "",
        currentMood: "",
        lastInteractionTone: "",
        behaviorTowardUserText: "",
        behaviorScoresText: "",
        relationshipWithUserText: "",
        relationshipEventsText: "",
        onlyKnowsText: "",
    };
}

export function draftFromNpcMemory(entry: NpcMemoryEntry): NpcMemoryDraft {
    return {
        name: entry.name,
        roleTitle: entry.roleTitle,
        race: entry.race,
        physicalExtra: entry.physicalExtra,
        currentMood: entry.currentMood,
        lastInteractionTone: entry.lastInteractionTone ?? "",
        behaviorTowardUserText: entry.behaviorTowardUser.join(", "),
        behaviorScoresText: behaviorScoresDraftText(entry.behaviorScores),
        relationshipWithUserText: entry.relationshipWithUser.join(", "),
        relationshipEventsText: entry.relationshipEvents.join("; "),
        onlyKnowsText: entry.onlyKnows.join("; "),
    };
}

export function npcMemorySetCommand(draft: NpcMemoryDraft, targetName: string = draft.name, dirtyFields?: Set<string>): string | null {
    const name = cleanDebugValue(draft.name);
    const target = cleanDebugValue(targetName || draft.name);
    if (name.length === 0 || target.length === 0) {
        return null;
    }

    const parts: string[] = [`npc memory set: ${target}`];

    if (dirtyFields == null || dirtyFields.has("name")) {
        parts.push(`name=${name}`);
    }
    if (dirtyFields == null || dirtyFields.has("roleTitle")) {
        parts.push(`role=${cleanDebugValue(draft.roleTitle) || "Unknown role/title"}`);
    }
    if (dirtyFields == null || dirtyFields.has("race")) {
        parts.push(`race=${cleanDebugValue(draft.race) || "Unknown"}`);
    }
    if (dirtyFields == null || dirtyFields.has("physicalExtra")) {
        parts.push(`physical=${cleanDebugValue(draft.physicalExtra) || "none"}`);
    }
    if (dirtyFields == null || dirtyFields.has("currentMood")) {
        parts.push(`mood=${cleanDebugValue(draft.currentMood) || "unknown"}`);
    }
    if (dirtyFields == null || dirtyFields.has("lastInteractionTone")) {
        parts.push(`tone=${cleanDebugValue(draft.lastInteractionTone)}`);
    }
    if (dirtyFields == null || dirtyFields.has("behaviorTowardUser") || dirtyFields.has("behaviorTowardUserText")) {
        parts.push(`behavior=${cleanDebugList(draft.behaviorTowardUserText)}`);
    }
    if (dirtyFields == null || dirtyFields.has("behaviorScores") || dirtyFields.has("behaviorScoresText")) {
        parts.push(`behaviorScores=${cleanDebugScoreMap(draft.behaviorScoresText)}`);
    }
    if (dirtyFields == null || dirtyFields.has("relationshipWithUser") || dirtyFields.has("relationshipWithUserText")) {
        parts.push(`relationship=${cleanDebugList(draft.relationshipWithUserText) || "stranger"}`);
    }
    if (dirtyFields == null || dirtyFields.has("relationshipEvents") || dirtyFields.has("relationshipEventsText")) {
        parts.push(`event=${cleanDebugFacts(draft.relationshipEventsText)}`);
    }
    if (dirtyFields == null || dirtyFields.has("onlyKnows") || dirtyFields.has("onlyKnowsText")) {
        parts.push(`onlyKnows=${cleanDebugFacts(draft.onlyKnowsText)}`);
    }

    return parts.join(" | ");
}

function cleanDebugValue(value: string): string {
    return value.replace(/[|\n\r\]】]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanDebugFacts(value: string): string {
    return value
        .split(/\n+|;/g)
        .map(cleanDebugValue)
        .filter(Boolean)
        .join("; ");
}

function cleanDebugList(value: string): string {
    return value
        .split(/\n+|;|,/g)
        .map(cleanDebugValue)
        .filter(Boolean)
        .join(", ");
}

function cleanDebugScoreMap(value: string): string {
    return value
        .split(/\n+|;|,/g)
        .map(cleanDebugValue)
        .map((entry) => {
            const match = /^([A-Za-z][A-Za-z -]{1,40})\s*(?:=|:|\s)\s*([+-]?\d+(?:\.\d+)?)$/i.exec(entry);
            return match == null ? "" : `${match[1].trim()}:${match[2]}`;
        })
        .filter(Boolean)
        .join("; ");
}

export function formatDebugList(values: string[], fallback: string): string {
    return values.length > 0 ? values.join(", ") : fallback;
}

export function formatDebugScores(scores: Record<string, number>): string {
    const entries = Object.entries(scores)
        .filter(([_label, score]) => score > 0)
        .sort((left, right) => right[1] - left[1]);

    return entries.length > 0 ? entries.map(([label, score]) => `${label}:${formatBehaviorScoreValue(score)}`).join(", ") : "none";
}

function formatMemoryList(values: string[] | undefined): string {
    return values != null && values.length > 0 ? values.join("; ") : "None";
}

function pushScoreChanges(details: string[], npcName: string, previous: Record<string, number>, next: Record<string, number>): void {
    const labels = new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})]);
    for (const label of [...labels].sort()) {
        const previousScore = previous?.[label] ?? 0;
        const nextScore = next?.[label] ?? 0;
        if (previousScore !== nextScore) {
            details.push(`${npcName} behaviorScores.${label}: ${formatBehaviorScoreValue(previousScore)} -> ${formatBehaviorScoreValue(nextScore)}`);
        }
    }
}

function pushNpcMemoryFieldChanges(details: string[], previous: NpcMemoryEntry, next: NpcMemoryEntry): void {
    const npcName = next.name || previous.name;
    pushTextChange(details, `${npcName} name`, previous.name, next.name);
    pushTextChange(details, `${npcName} roleTitle`, previous.roleTitle, next.roleTitle);
    pushTextChange(details, `${npcName} race`, previous.race, next.race);
    pushTextChange(details, `${npcName} physicalExtra`, previous.physicalExtra, next.physicalExtra);
    pushTextChange(details, `${npcName} currentMood`, previous.currentMood, next.currentMood);
    pushTextChange(details, `${npcName} lastInteractionTone`, previous.lastInteractionTone ?? "", next.lastInteractionTone ?? "");
    pushTextChange(details, `${npcName} behaviorTowardUser`, formatMemoryList(previous.behaviorTowardUser), formatMemoryList(next.behaviorTowardUser));
    pushScoreChanges(details, npcName, previous.behaviorScores, next.behaviorScores);
    pushTextChange(details, `${npcName} relationshipWithUser`, formatMemoryList(previous.relationshipWithUser), formatMemoryList(next.relationshipWithUser));
    pushTextChange(details, `${npcName} relationshipEvents`, formatMemoryList(previous.relationshipEvents), formatMemoryList(next.relationshipEvents));
    pushTextChange(details, `${npcName} onlyKnows`, formatMemoryList(previous.onlyKnows), formatMemoryList(next.onlyKnows));
}

export function npcMemoryChangeDetails(previous: NpcMemoryStore, next: NpcMemoryStore): string[] {
    const previousKeys = Object.keys(previous ?? {});
    const nextKeys = Object.keys(next ?? {});
    const details: string[] = [];

    for (const key of nextKeys) {
        if (previous?.[key] == null) {
            details.push(`Added NPC memory: ${next[key].name}`);
            details.push(`${next[key].name} roleTitle: ${displayValue(next[key].roleTitle)}`);
            details.push(`${next[key].name} race: ${displayValue(next[key].race)}`);
            details.push(`${next[key].name} currentMood: ${displayValue(next[key].currentMood)}`);
            continue;
        }

        if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
            pushNpcMemoryFieldChanges(details, previous[key], next[key]);
        }
    }

    for (const key of previousKeys) {
        if (next?.[key] == null) {
            details.push(`Removed NPC memory: ${previous[key].name}`);
        }
    }

    return details.length > 0 ? details : ["NPC memory unchanged."];
}

function privateEventLogKey(event: PrivateEventEntry): string {
    return cleanFragment(event.id || event.parentThreadKey || event.context).toLowerCase();
}

function formatEventList(values: string[] | undefined): string {
    return values != null && values.length > 0 ? values.join(", ") : "None";
}

function pushPrivateEventFieldChanges(details: string[], previous: PrivateEventEntry, next: PrivateEventEntry): void {
    const label = next.id || previous.id;
    pushTextChange(details, `${label} status`, previous.status, next.status);
    pushTextChange(details, `${label} urgency`, previous.urgencyLabel, next.urgencyLabel);
    pushTextChange(details, `${label} parentThreadKey`, previous.parentThreadKey, next.parentThreadKey);
    pushTextChange(details, `${label} npcNames`, formatEventList(previous.npcNames), formatEventList(next.npcNames));
    pushTextChange(details, `${label} knownBy`, formatEventList(previous.knownBy), formatEventList(next.knownBy));
    pushTextChange(details, `${label} timeAnchor`, previous.timeAnchor ?? "", next.timeAnchor ?? "");
    pushTextChange(details, `${label} deadline`, previous.deadline ?? "", next.deadline ?? "");
    pushTextChange(details, `${label} location`, previous.location ?? "", next.location ?? "");
    pushTextChange(details, `${label} context`, previous.context, next.context);
    pushTextChange(details, `${label} condition`, previous.condition ?? "", next.condition ?? "");
    pushTextChange(details, `${label} threatContext`, previous.threatContext ?? "", next.threatContext ?? "");
    pushTextChange(details, `${label} consequence`, previous.consequence ?? "", next.consequence ?? "");
    pushTextChange(details, `${label} keywords`, formatEventList(previous.keywords), formatEventList(next.keywords));
}

export function privateEventChangeDetails(previous: PrivateEventEntry[] = [], next: PrivateEventEntry[] = []): string[] {
    const previousByKey = new Map(previous.map((event) => [privateEventLogKey(event), event]));
    const nextByKey = new Map(next.map((event) => [privateEventLogKey(event), event]));
    const details: string[] = [];

    for (const nextEvent of next) {
        const key = privateEventLogKey(nextEvent);
        const previousEvent = previousByKey.get(key);
        if (previousEvent == null) {
            details.push(`Added private event: ${nextEvent.id}`);
            details.push(`${nextEvent.id} context: ${nextEvent.context}`);
            if (nextEvent.timeAnchor != null) details.push(`${nextEvent.id} timeAnchor: ${nextEvent.timeAnchor}`);
            if (nextEvent.deadline != null) details.push(`${nextEvent.id} deadline: ${nextEvent.deadline}`);
            if (nextEvent.location != null) details.push(`${nextEvent.id} location: ${nextEvent.location}`);
            if (nextEvent.threatContext != null) details.push(`${nextEvent.id} threatContext: ${nextEvent.threatContext}`);
            continue;
        }

        if (JSON.stringify(previousEvent) !== JSON.stringify(nextEvent)) {
            pushPrivateEventFieldChanges(details, previousEvent, nextEvent);
        }
    }

    for (const previousEvent of previous) {
        if (!nextByKey.has(privateEventLogKey(previousEvent))) {
            details.push(`Removed private event: ${previousEvent.id}`);
        }
    }

    return details;
}

interface ParsedHeaderStatus {
    name: string;
    race: string;
    clothing: string;
    position: string;
    detail: string;
    raw: string;
}

function parseHeaderStatusEntry(rawEntry: string, kind: "you" | "npc"): ParsedHeaderStatus | null {
    const raw = cleanFragment(rawEntry);
    if (raw.length === 0) {
        return null;
    }

    const parsed = parseIdentityStatus(raw);
    const identity = splitIdentity(parsed.identity, kind === "you" ? "Unknown" : "Unknown NPC", "Human");
    const parts = statusParts(parsed.status, kind);

    return {
        name: identity.left,
        race: identity.right,
        clothing: parts[0] ?? "",
        position: parts[1] ?? "",
        detail: parts[2] ?? "",
        raw,
    };
}

function displayValue(value: string): string {
    const clean = cleanFragment(value);
    return clean.length > 0 ? clean : "None";
}

function pushTextChange(details: string[], label: string, previous: string, next: string): void {
    if (!sameText(previous, next)) {
        details.push(`${label}: ${displayValue(previous)} -> ${displayValue(next)}`);
    }
}

export function locationChangeDetails(previousLocation: string, nextLocation: string): string[] {
    const previousParts = splitLocation(previousLocation);
    const nextParts = splitLocation(nextLocation);
    const labels = ["Location region", "Location place", "Location area"];
    const maxLength = Math.max(previousParts.length, nextParts.length, labels.length);
    const details: string[] = [];

    for (let index = 0; index < maxLength; index++) {
        pushTextChange(details, labels[index] ?? `Location part ${index + 1}`, previousParts[index] ?? "", nextParts[index] ?? "");
    }

    return details;
}

export function timeChangeDetails(previousTimeOfDay: string, previousClock: string, nextTimeOfDay: string, nextClock: string): string[] {
    const details: string[] = [];
    pushTextChange(details, "Time of day", previousTimeOfDay, nextTimeOfDay);
    pushTextChange(details, "Clock", previousClock, nextClock);
    return details;
}

interface ParsedThreadItem {
    item: string;
    key: string;
    label: string;
    status: string;
}

function threadLogItems(value: string): ParsedThreadItem[] {
    if (isNoThreadValue(value)) {
        return [];
    }

    return splitTopLevel(value, ";")
        .map(cleanFragment)
        .filter(Boolean)
        .map((item) => {
            const statusMatch = item.match(/\(([^()]*)\)\s*$/);
            const label = cleanFragment(statusMatch == null ? item : item.slice(0, statusMatch.index));
            const status = cleanFragment(statusMatch?.[1] ?? "");
            const key = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
            return {item, key: key || item.toLowerCase(), label: label || item, status};
        });
}

export function threadLineChangeDetails(previousThread: string, nextThread: string): string[] {
    const previousItems = threadLogItems(previousThread);
    const nextItems = threadLogItems(nextThread);
    const previousByKey = new Map(previousItems.map((item) => [item.key, item]));
    const nextByKey = new Map(nextItems.map((item) => [item.key, item]));
    const details: string[] = [];

    for (const nextItem of nextItems) {
        const previousItem = previousByKey.get(nextItem.key);
        if (previousItem == null) {
            details.push(`Added thread: ${nextItem.item}`);
            continue;
        }

        pushTextChange(details, `Thread status ${nextItem.label}`, previousItem.status, nextItem.status);
        if (!sameText(previousItem.item, nextItem.item) && sameText(previousItem.status, nextItem.status)) {
            details.push(`Thread item text: ${previousItem.item} -> ${nextItem.item}`);
        }
    }

    for (const previousItem of previousItems) {
        if (!nextByKey.has(previousItem.key)) {
            details.push(`Removed thread: ${previousItem.item}`);
        }
    }

    return details;
}

export function lockedThreadChangeDetails(previousLocked: string[] = [], nextLocked: string[] = []): string[] {
    const details: string[] = [];
    const previousKeys = new Set(previousLocked.map((item) => cleanFragment(item).toLowerCase()));
    const nextKeys = new Set(nextLocked.map((item) => cleanFragment(item).toLowerCase()));

    for (const item of nextLocked) {
        if (!previousKeys.has(cleanFragment(item).toLowerCase())) {
            details.push(`Locked thread added: ${item}`);
        }
    }

    for (const item of previousLocked) {
        if (!nextKeys.has(cleanFragment(item).toLowerCase())) {
            details.push(`Locked thread removed: ${item}`);
        }
    }

    return details;
}

function formatCopperDelta(deltaCopper: number): string {
    if (deltaCopper === 0) {
        return "0G ; 0S ; 0C";
    }

    const sign = deltaCopper > 0 ? "+" : "-";
    return `${sign}${formatWallet(copperToWallet(Math.abs(deltaCopper)))}`;
}

export function walletChangeDetails(previousWallet: string, nextWallet: string): string[] {
    const previous = parseWalletAmounts(previousWallet);
    const next = parseWalletAmounts(nextWallet);
    const details: string[] = [];

    if (previous == null || next == null) {
        pushTextChange(details, "Wallet raw", previousWallet, nextWallet);
        return details;
    }

    pushTextChange(details, "Wallet gold", String(previous.gold), String(next.gold));
    pushTextChange(details, "Wallet silver", String(previous.silver), String(next.silver));
    pushTextChange(details, "Wallet copper", String(previous.copper), String(next.copper));

    const previousTotal = walletToCopper(previous);
    const nextTotal = walletToCopper(next);
    if (previousTotal !== nextTotal) {
        details.push(`Wallet total delta: ${formatCopperDelta(nextTotal - previousTotal)}`);
    }

    return details;
}

export function youLineChangeDetails(previousLine: string, nextLine: string): string[] {
    const previous = parseHeaderStatusEntry(cleanLabeledValue(previousLine, "You"), "you");
    const next = parseHeaderStatusEntry(cleanLabeledValue(nextLine, "You"), "you");

    if (previous == null || next == null) {
        return [];
    }

    const details: string[] = [];
    pushTextChange(details, "You gender", previous.name, next.name);
    pushTextChange(details, "You apparent race", previous.race, next.race);
    pushTextChange(details, "You clothing", previous.clothing, next.clothing);
    pushTextChange(details, "You position", previous.position, next.position);
    pushTextChange(details, "You detail", previous.detail, next.detail);
    return details;
}

function npcStatusEntries(line: string): ParsedHeaderStatus[] {
    const value = cleanLabeledValue(line, "NPC");
    if (isNoNpcValue(value)) {
        return [];
    }

    return splitTopLevel(value, ",")
        .map((entry) => parseHeaderStatusEntry(entry, "npc"))
        .filter((entry): entry is ParsedHeaderStatus => entry != null);
}

function npcStatusKey(entry: ParsedHeaderStatus): string {
    return cleanFragment(entry.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function npcLineChangeDetails(previousLine: string, nextLine: string): string[] {
    const previousEntries = npcStatusEntries(previousLine);
    const nextEntries = npcStatusEntries(nextLine);
    const previousByName = new Map(previousEntries.map((entry) => [npcStatusKey(entry), entry]));
    const nextByName = new Map(nextEntries.map((entry) => [npcStatusKey(entry), entry]));
    const details: string[] = [];

    for (const next of nextEntries) {
        const previous = previousByName.get(npcStatusKey(next));
        if (previous == null) {
            details.push(`Added NPC: ${next.raw}`);
            continue;
        }

        pushTextChange(details, `${next.name} race`, previous.race, next.race);
        pushTextChange(details, `${next.name} clothing`, previous.clothing, next.clothing);
        pushTextChange(details, `${next.name} position`, previous.position, next.position);
        pushTextChange(details, `${next.name} detail`, previous.detail, next.detail);
    }

    for (const previous of previousEntries) {
        if (!nextByName.has(npcStatusKey(previous))) {
            details.push(`Removed NPC: ${previous.raw}`);
        }
    }

    return details;
}

function formatUserStatusList(values: string[] | undefined): string {
    return values != null && values.length > 0 ? values.join(", ") : "None";
}

function formatUserStatusItems(items: Array<{name: string; location: string; status?: string}> | undefined): string {
    if (items == null || items.length === 0) {
        return "None";
    }

    return items
        .map((item) => [item.name, item.location, item.status].map((part) => cleanFragment(part ?? "")).filter(Boolean).join(" @ "))
        .join("; ");
}

export function userStatusChangeDetails(previous: UserStatusState, next: UserStatusState): string[] {
    const details: string[] = [];
    pushTextChange(details, "Status User gender", previous.gender, next.gender);
    pushTextChange(details, "Status User apparent race", previous.apparentRace, next.apparentRace);
    pushTextChange(details, "Status User clothing.upper", previous.clothing.upper ?? "", next.clothing.upper ?? "");
    pushTextChange(details, "Status User clothing.lower", previous.clothing.lower ?? "", next.clothing.lower ?? "");
    pushTextChange(details, "Status User clothing.footwear", previous.clothing.footwear ?? "", next.clothing.footwear ?? "");
    pushTextChange(details, "Status User clothing.outerwear", previous.clothing.outerwear ?? "", next.clothing.outerwear ?? "");
    pushTextChange(details, "Status User clothing.accessories", formatUserStatusList(previous.clothing.accessories), formatUserStatusList(next.clothing.accessories));
    pushTextChange(details, "Status User weapons", formatUserStatusItems(previous.weapons), formatUserStatusItems(next.weapons));
    pushTextChange(details, "Status User important items", formatUserStatusItems(previous.importantItems), formatUserStatusItems(next.importantItems));
    return details;
}

export function countNpcMemory(state: AetherNovaMessageState): number {
    return Object.keys(state.npcMemory ?? {}).length;
}

export function changedStateFields(previous: AetherNovaMessageState, next: AetherNovaMessageState): string[] {
    const fields: Array<keyof AetherNovaMessageState> = [
        "location",
        "timeOfDay",
        "clock",
        "you",
        "npc",
        "thread",
        "wallet",
        "walletInitialized",
        "pendingNpcDebugQuery",
        "pendingNpcMemoryCommand",
    ];
    const changed = fields.filter((field) => previous[field] !== next[field]).map(String);

    if (JSON.stringify(previous.lockedThreadItems ?? []) !== JSON.stringify(next.lockedThreadItems ?? [])) {
        changed.push("lockedThreadItems");
    }

    if (JSON.stringify(previous.npcMemory ?? {}) !== JSON.stringify(next.npcMemory ?? {})) {
        changed.push("npcMemory");
    }

    if (JSON.stringify(previous.privateEvents ?? []) !== JSON.stringify(next.privateEvents ?? [])) {
        changed.push("privateEvents");
    }

    if (JSON.stringify(previous.userStatus ?? {}) !== JSON.stringify(next.userStatus ?? {})) {
        changed.push("userStatus");
    }

    return changed;
}

export function joinSystemMessages(...messages: Array<string | null | undefined>): string {
    return messages.map((message) => message ?? "").filter((message) => message.length > 0).join("\n");
}

export function writePendingDebugQuery(query: string): void {
    try {
        window.localStorage.setItem(DEBUG_STORAGE_KEY, query);
    } catch {
        // Debug fallback only; ignore storage failures.
    }
}

export function readPendingDebugQuery(): string | null {
    try {
        const value = window.localStorage.getItem(DEBUG_STORAGE_KEY);
        return value == null || value.trim().length === 0 ? null : value.trim();
    } catch {
        return null;
    }
}

export function clearPendingDebugQuery(): void {
    try {
        window.localStorage.removeItem(DEBUG_STORAGE_KEY);
    } catch {
        // Debug fallback only; ignore storage failures.
    }
}

export function deepMergeUserStatus(previous: UserStatusState, patch: Partial<UserStatusState>): UserStatusState {
    return {
        gender: patch.gender ?? previous.gender,
        apparentRace: patch.apparentRace ?? previous.apparentRace,
        clothing: {
            ...previous.clothing,
            ...patch.clothing,
        },
        weapons: patch.weapons ?? previous.weapons,
        importantItems: patch.importantItems ?? previous.importantItems,
    };
}
