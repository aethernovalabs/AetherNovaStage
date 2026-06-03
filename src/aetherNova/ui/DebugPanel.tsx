import type {ReactElement} from "react";
import React, {useState, useEffect, useRef} from "react";
import type {AetherNovaMessageState, UserStatusState, NpcMemoryEntry, PrivateEventEntry, PrivateEventStatus, PrivateEventUrgency} from "../types";
import type {DebugSnapshot, DebugEvent, NpcMemoryDraft, DebugCategory} from "./types";
import {DEBUG_UI_VERSION, DEBUG_LOG_GROUPS} from "./types";
import {
    emptyNpcMemoryDraft,
    draftFromNpcMemory,
    npcMemorySetCommand,
    computeDirtyFields,
    formatDebugList,
    formatDebugScores,
} from "./debugUtils";
import {isTerminalThreadItem, threadItemsOverlap} from "../thread/normalizeThreadLine";

const DEBUG_UI_MINIMIZED_STORAGE_KEY = "aether-nova-stage.debugUiMinimized";
const DEBUG_UI_COLLAPSED_NPCS_STORAGE_KEY = "aether-nova-stage.collapsedNpcCards";
const PRIVATE_EVENT_STATUS_OPTIONS: PrivateEventStatus[] = ["scheduled", "soon", "imminent", "overdue", "risk_active", "complete", "failed", "cancelled", "expired"];
const PRIVATE_EVENT_URGENCY_OPTIONS: PrivateEventUrgency[] = ["safe", "soon", "imminent", "overdue", "risk_active"];

type EditableMetricField = {
    key: string;
    label: string;
    value: string;
    multiline?: boolean;
    options?: string[];
};

type ConfirmRequest = {
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
};

function cleanThreadItem(value: string): string {
    return value.trim().replace(/\s+/g, " ");
}

function threadItemsForDisplay(value: string): string[] {
    const clean = cleanThreadItem(value);
    if (clean.length === 0 || clean.toLowerCase() === "none") {
        return [];
    }

    return clean
        .split(/\s*;\s*/g)
        .map(cleanThreadItem)
        .filter((item) => item.length > 0);
}

function threadItemIsLocked(item: string, lockedItems: string[]): boolean {
    return lockedItems.some((lockedItem) => threadItemsOverlap(lockedItem, item));
}

function privateEventKeyFromText(value: string): string {
    return value
        .toLowerCase()
        .replace(/\{\{user\}\}/g, "user")
        .replace(/\([^)]*\)/g, " ")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

function privateEventThreadLabel(threadItem: string): string {
    return cleanThreadItem(threadItem.replace(/\s*\([^)]*\)\s*$/g, ""));
}

function privateEventStatusFromThread(threadItem: string): PrivateEventStatus {
    const lower = threadItem.toLowerCase();
    if (/\bfailed|abandoned|refused|declined|rejected\b/.test(lower)) return "failed";
    if (/\bcancelled|canceled\b/.test(lower)) return "cancelled";
    if (/\bexpired\b/.test(lower)) return "expired";
    if (/\bcomplete|completed|done|finished|resolved|settled\b/.test(lower)) return "complete";
    if (/\bimminent|urgent\b/.test(lower)) return "imminent";
    if (/\bsoon\b/.test(lower)) return "soon";
    return "scheduled";
}

function npcNamesFromHeader(npcLine: string): string[] {
    const clean = cleanThreadItem(npcLine);
    if (clean.length === 0 || clean.toLowerCase() === "none") {
        return [];
    }

    return clean
        .split(/\s*,\s*/g)
        .map((entry) => cleanThreadItem(entry.replace(/\([^)]*\)/g, "").split(/\s+-\s+/)[0] ?? ""))
        .filter(Boolean);
}

function privateEventNpcNamesFromThread(threadItem: string, npcLine: string): string[] {
    const lowerThread = threadItem.toLowerCase();
    const headerNames = npcNamesFromHeader(npcLine);
    const matchedHeaderNames = headerNames.filter((name) => {
        const lowerName = name.toLowerCase();
        const firstName = lowerName.split(/\s+/)[0] ?? lowerName;
        return lowerThread.includes(lowerName) || lowerThread.includes(firstName);
    });

    if (matchedHeaderNames.length > 0) {
        return matchedHeaderNames;
    }

    const skip = new Set([
        "Meet", "Mission", "Quest", "Thread", "Travel", "Promise", "Waiting", "Rendezvous",
        "Pending", "Scheduled", "Ongoing", "Complete", "Failed", "Cancelled", "Expired",
    ]);
    return Array.from(threadItem.matchAll(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3}\b/g))
        .map((match) => cleanThreadItem(match[0]))
        .filter((name) => !skip.has(name.split(/\s+/)[0] ?? name));
}

function privateEventKeywordsFromThread(threadItem: string, npcNames: string[]): string[] {
    const keywords = [
        ...npcNames,
        privateEventThreadLabel(threadItem),
        ...threadItem
            .replace(/\([^)]*\)/g, " ")
            .split(/[^A-Za-z0-9]+/g)
            .map((word) => word.trim())
            .filter((word) => word.length > 3 && !["with", "from", "that", "this", "into", "about", "scheduled", "ongoing", "pending"].includes(word.toLowerCase())),
    ];
    return parsePrivateEventList(keywords.join(", "));
}

function uniquePrivateEventId(baseId: string, events: PrivateEventEntry[], excludeId?: string): string {
    const cleanBase = baseId.length > 0 ? baseId : "manual_private_event";
    let candidate = cleanBase;
    let index = 2;
    while (events.some((event) => event.id === candidate && event.id !== excludeId)) {
        candidate = `${cleanBase}_${index}`;
        index += 1;
    }
    return candidate;
}

function privateEventDraftFromThread(
    threadItem: string,
    state: AetherNovaMessageState,
    existingEvents: PrivateEventEntry[],
): PrivateEventEntry {
    const label = privateEventThreadLabel(threadItem);
    const parentThreadKey = privateEventKeyFromText(label);
    const id = uniquePrivateEventId(`manual_${parentThreadKey}`, existingEvents);
    const npcNames = privateEventNpcNamesFromThread(threadItem, state.npc);
    const status = privateEventStatusFromThread(threadItem);
    const urgencyLabel: PrivateEventUrgency = status === "imminent"
        ? "imminent"
        : status === "soon"
            ? "soon"
            : "safe";

    return {
        id,
        parentThreadKey,
        status,
        urgencyLabel,
        npcNames,
        knownBy: parsePrivateEventList(["{{user}}", ...npcNames].join(", ")),
        context: `{{user}} has a private event linked to Thread: ${label}.`,
        keywords: privateEventKeywordsFromThread(threadItem, npcNames),
        secrecyNote: "Private event. Only {{user}} and listed NPCs know this unless revealed in RP.",
        sourceSummary: `Manually created from Thread: ${threadItem}`,
        createdAtClock: state.clock,
        updatedAtClock: state.clock,
    };
}

function privateEventListText(values: string[] | undefined): string {
    return values != null && values.length > 0 ? values.join(", ") : "";
}

function parsePrivateEventList(value: string): string[] {
    const result: string[] = [];
    for (const item of value.split(/[,;\n]+/g)) {
        const clean = item.trim().replace(/\s+/g, " ");
        if (clean.length > 0 && !result.some((entry) => entry.toLowerCase() === clean.toLowerCase())) {
            result.push(clean);
        }
    }
    return result;
}

function privateEventToForm(event: PrivateEventEntry): Record<string, string> {
    return {
        id: event.id,
        parentThreadKey: event.parentThreadKey,
        status: event.status,
        urgencyLabel: event.urgencyLabel,
        npcNames: privateEventListText(event.npcNames),
        knownBy: privateEventListText(event.knownBy),
        timeAnchor: event.timeAnchor ?? "",
        deadline: event.deadline ?? "",
        location: event.location ?? "",
        context: event.context,
        condition: event.condition ?? "",
        threatContext: event.threatContext ?? "",
        consequence: event.consequence ?? "",
        keywords: privateEventListText(event.keywords),
        secrecyNote: event.secrecyNote,
        sourceSummary: event.sourceSummary ?? "",
        lastEvidence: event.lastEvidence ?? "",
    };
}

function optionalPrivateEventField(value: string | undefined): string | undefined {
    const clean = value?.trim().replace(/\s+/g, " ") ?? "";
    return clean.length > 0 ? clean : undefined;
}

function privateEventFromForm(original: PrivateEventEntry, form: Record<string, string>): PrivateEventEntry {
    const id = optionalPrivateEventField(form.id) ?? original.id;
    const parentThreadKey = optionalPrivateEventField(form.parentThreadKey) ?? original.parentThreadKey;
    const npcNames = parsePrivateEventList(form.npcNames ?? "");
    const knownBy = parsePrivateEventList(form.knownBy ?? "");
    const keywords = parsePrivateEventList(form.keywords ?? "");

    return {
        ...original,
        id,
        parentThreadKey,
        status: (form.status as PrivateEventStatus) || original.status,
        urgencyLabel: (form.urgencyLabel as PrivateEventUrgency) || original.urgencyLabel,
        npcNames,
        knownBy: knownBy.length > 0 ? knownBy : ["{{user}}", ...npcNames],
        timeAnchor: optionalPrivateEventField(form.timeAnchor),
        deadline: optionalPrivateEventField(form.deadline),
        location: optionalPrivateEventField(form.location),
        context: optionalPrivateEventField(form.context) ?? original.context,
        condition: optionalPrivateEventField(form.condition),
        threatContext: optionalPrivateEventField(form.threatContext),
        consequence: optionalPrivateEventField(form.consequence),
        keywords,
        secrecyNote: optionalPrivateEventField(form.secrecyNote) ?? original.secrecyNote,
        sourceSummary: optionalPrivateEventField(form.sourceSummary),
        lastEvidence: optionalPrivateEventField(form.lastEvidence),
    };
}

function readMinimizedPreference(): boolean {
    try {
        return window.localStorage.getItem(DEBUG_UI_MINIMIZED_STORAGE_KEY) === "true";
    } catch {
        return false;
    }
}

function writeMinimizedPreference(value: boolean): void {
    try {
        window.localStorage.setItem(DEBUG_UI_MINIMIZED_STORAGE_KEY, String(value));
    } catch {
        // Debug UI preference only; ignore storage failures.
    }
}

function readCollapsedNpcCards(): Set<string> {
    try {
        const stored = window.localStorage.getItem(DEBUG_UI_COLLAPSED_NPCS_STORAGE_KEY);
        const parsed = stored == null ? [] : JSON.parse(stored);
        return new Set(Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : []);
    } catch {
        return new Set();
    }
}

function writeCollapsedNpcCards(value: Set<string>): void {
    try {
        window.localStorage.setItem(DEBUG_UI_COLLAPSED_NPCS_STORAGE_KEY, JSON.stringify(Array.from(value)));
    } catch {
        // Debug UI preference only; ignore storage failures.
    }
}

export function AetherNovaDebugPanel({
    getSnapshot,
    onApplyCommand,
    onClearLogs,
    onStateEdit,
}: {
    getSnapshot: () => DebugSnapshot;
    onApplyCommand: (command: string) => DebugSnapshot;
    onClearLogs: (category?: DebugCategory) => DebugSnapshot;
    onStateEdit: (patch: Partial<AetherNovaMessageState & {userStatusPatch?: Partial<UserStatusState>}>) => DebugSnapshot;
}): ReactElement {
    const [snapshot, setSnapshot] = useState<DebugSnapshot>(() => getSnapshot());
    const [isMinimized, setIsMinimized] = useState<boolean>(() => readMinimizedPreference());
    const [collapsedNpcCards, setCollapsedNpcCards] = useState<Set<string>>(() => readCollapsedNpcCards());
    const [pendingConfirm, setPendingConfirm] = useState<ConfirmRequest | null>(null);
    const npcMemoryEntries = Object.values(snapshot.state.npcMemory ?? {});
    const [editingName, setEditingName] = useState<string | null>(null);
    const [draft, setDraft] = useState<NpcMemoryDraft>(emptyNpcMemoryDraft());
    const originalEntryRef = useRef<NpcMemoryEntry | null>(null);

    const [editingSection, setEditingSection] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Record<string, string>>({});
    const [editUserStatusClothing, setEditUserStatusClothing] = useState<Record<string, string>>({});
    const [editUserWeaponsText, setEditUserWeaponsText] = useState("");
    const [editUserItemsText, setEditUserItemsText] = useState("");
    const [draftPrivateEvent, setDraftPrivateEvent] = useState<PrivateEventEntry | null>(null);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setSnapshot(getSnapshot());
        }, 500);

        return () => window.clearInterval(intervalId);
    }, [getSnapshot]);

    const startEdit = (section: string, fields: Record<string, string>): void => {
        setEditingSection(section);
        setEditForm(fields);
        setEditUserStatusClothing({});
        if (section === "userStatus") {
            const s = snapshot.state.userStatus;
            setEditUserWeaponsText(s.weapons.map((w) => `${w.name} — ${w.location}${w.status ? ` — ${w.status}` : ""}`).join("\n"));
            setEditUserItemsText(s.importantItems.map((i) => `${i.name} — ${i.location}${i.status ? ` — ${i.status}` : ""}`).join("\n"));
        }
    };

    const cancelEdit = (): void => {
        setEditingSection(null);
        setEditForm({});
        setEditUserStatusClothing({});
        setDraftPrivateEvent(null);
    };

    const saveEdit = (patch: Partial<AetherNovaMessageState & {userStatusPatch?: Partial<UserStatusState>}>): void => {
        setSnapshot(onStateEdit(patch));
        setEditingSection(null);
        setEditForm({});
        setEditUserStatusClothing({});
        setDraftPrivateEvent(null);
    };

    const toggleThreadLock = (item: string): void => {
        if (isTerminalThreadItem(item)) {
            return;
        }

        const lockedItems = snapshot.state.lockedThreadItems ?? [];
        const isLocked = threadItemIsLocked(item, lockedItems);
        const nextLocks = isLocked
            ? lockedItems.filter((lockedItem) => !threadItemsOverlap(lockedItem, item))
            : [...lockedItems, item];

        setSnapshot(onStateEdit({lockedThreadItems: nextLocks}));
    };

    const savePrivateEventEdit = (event: PrivateEventEntry): void => {
        const nextEvent = privateEventFromForm(event, editForm);
        const existingEvents = snapshot.state.privateEvents ?? [];
        const safeEvent = {
            ...nextEvent,
            id: uniquePrivateEventId(nextEvent.id, existingEvents, event.id),
        };
        const nextEvents = existingEvents.map((entry) => entry.id === event.id ? safeEvent : entry);
        saveEdit({privateEvents: nextEvents});
    };

    const startPrivateEventCreateFromThread = (threadItem: string): void => {
        const draftEvent = privateEventDraftFromThread(threadItem, snapshot.state, snapshot.state.privateEvents ?? []);
        setDraftPrivateEvent(draftEvent);
        startEdit("privateEvent:create", privateEventToForm(draftEvent));
    };

    const savePrivateEventCreate = (): void => {
        if (draftPrivateEvent == null) {
            return;
        }

        const existingEvents = snapshot.state.privateEvents ?? [];
        const event = privateEventFromForm(draftPrivateEvent, editForm);
        const safeEvent = {
            ...event,
            id: uniquePrivateEventId(event.id, existingEvents),
        };
        saveEdit({privateEvents: [safeEvent, ...existingEvents]});
    };

    const updatePrivateEventStatus = (event: PrivateEventEntry, status: PrivateEventStatus): void => {
        const nextEvents = (snapshot.state.privateEvents ?? []).map((entry) => entry.id === event.id
            ? {
                ...entry,
                status,
                urgencyLabel: status === "complete" || status === "failed" || status === "cancelled" || status === "expired"
                    ? "safe" as PrivateEventUrgency
                    : entry.urgencyLabel,
            }
            : entry);
        setSnapshot(onStateEdit({privateEvents: nextEvents}));
    };

    const deletePrivateEvent = (event: PrivateEventEntry): void => {
        const nextEvents = (snapshot.state.privateEvents ?? []).filter((entry) => entry.id !== event.id);
        setSnapshot(onStateEdit({privateEvents: nextEvents}));
        if (editingSection === `privateEvent:${event.id}`) {
            cancelEdit();
        }
    };

    const toggleMinimized = (): void => {
        const next = !isMinimized;
        setIsMinimized(next);
        writeMinimizedPreference(next);
    };

    const toggleNpcCard = (name: string): void => {
        setCollapsedNpcCards((previous) => {
            const next = new Set(previous);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            writeCollapsedNpcCards(next);
            return next;
        });
    };

    const removeCollapsedNpcCard = (name: string): void => {
        setCollapsedNpcCards((previous) => {
            if (!previous.has(name)) {
                return previous;
            }
            const next = new Set(previous);
            next.delete(name);
            writeCollapsedNpcCards(next);
            return next;
        });
    };

    const requestConfirm = (request: ConfirmRequest): void => {
        setPendingConfirm(() => request);
    };

    const closeConfirm = (): void => {
        setPendingConfirm(null);
    };

    const runPendingConfirm = (): void => {
        const request = pendingConfirm;
        if (request == null) {
            return;
        }
        setPendingConfirm(null);
        request.onConfirm();
    };

    if (isMinimized) {
        return (
            <main className="aether-debug-shell is-minimized">
                <button
                    type="button"
                    className="aether-debug-minibar"
                    aria-expanded="false"
                    onClick={toggleMinimized}
                >
                    <span>Aether Nova Stage</span>
                    <strong>{snapshot.lastModifiedMessageChanged ? "Modified" : "Idle"}</strong>
                    <span>{DEBUG_UI_VERSION}</span>
                    <span>Open</span>
                </button>
            </main>
        );
    }

    return (
        <main className="aether-debug-shell">
            <header className="aether-debug-header">
                <div>
                    <h1>Aether Nova Stage UI <span>{DEBUG_UI_VERSION}</span></h1>
                </div>
                <div className="aether-debug-header-actions">
                    <button type="button" aria-expanded="true" onClick={toggleMinimized}>Minimize</button>
                    <button type="button" onClick={() => {
                        requestConfirm({
                            title: "Clear Logs",
                            message: "Clear all debug logs? State and NPC Memory will stay unchanged.",
                            confirmLabel: "Clear Logs",
                            onConfirm: () => setSnapshot(onClearLogs()),
                        });
                    }}>Clear Logs</button>
                    <span className={snapshot.lastModifiedMessageChanged ? "aether-debug-pill active" : "aether-debug-pill"}>
                        {snapshot.lastModifiedMessageChanged ? "Modified" : "Idle"}
                    </span>
                </div>
            </header>

            <section className="aether-debug-grid" aria-label="Current header state">
                <EditableMetric
                    label="Location"
                    value={`${snapshot.state.location} | ${snapshot.state.timeOfDay} | ${snapshot.state.clock}`}
                    editing={editingSection === "location"}
                    fields={[
                        {key: "location", label: "Main Location - Sub - Detail", value: snapshot.state.location},
                        {key: "timeOfDay", label: "Time of Day", value: snapshot.state.timeOfDay, options: ["Morning", "Midday", "Afternoon", "Evening", "Night"]},
                        {key: "clock", label: "HH:MM", value: snapshot.state.clock},
                    ]}
                    editForm={editForm}
                    onEdit={() => startEdit("location", {
                        location: snapshot.state.location,
                        timeOfDay: snapshot.state.timeOfDay,
                        clock: snapshot.state.clock,
                    })}
                    onCancel={cancelEdit}
                    onChange={setEditForm}
                    onSave={() => {
                        const loc = editForm.location ?? snapshot.state.location;
                        const tod = editForm.timeOfDay ?? snapshot.state.timeOfDay;
                        const clk = editForm.clock ?? snapshot.state.clock;
                        saveEdit({location: loc, timeOfDay: tod as AetherNovaMessageState["timeOfDay"], clock: clk});
                    }}
                />
                <EditableMetric
                    label="You (compact)"
                    value={snapshot.state.you}
                    editing={editingSection === "you"}
                    fields={[
                        {key: "you", label: "Gender - Race (Clothes; Position; Detail)", value: snapshot.state.you, multiline: true},
                    ]}
                    editForm={editForm}
                    onEdit={() => startEdit("you", {you: snapshot.state.you})}
                    onCancel={cancelEdit}
                    onChange={setEditForm}
                    onSave={() => saveEdit({you: editForm.you ?? snapshot.state.you})}
                />
                <EditableMetric
                    label="NPC"
                    value={snapshot.state.npc}
                    editing={editingSection === "npc"}
                    fields={[
                        {key: "npc", label: "NPC entries", value: snapshot.state.npc, multiline: true},
                    ]}
                    editForm={editForm}
                    onEdit={() => startEdit("npc", {npc: snapshot.state.npc})}
                    onCancel={cancelEdit}
                    onChange={setEditForm}
                    onSave={() => saveEdit({npc: editForm.npc ?? snapshot.state.npc})}
                />
                <ThreadMetric
                    label="Thread"
                    value={snapshot.state.thread}
                    lockedItems={snapshot.state.lockedThreadItems ?? []}
                    editing={editingSection === "thread"}
                    fields={[
                        {key: "thread", label: "Thread items", value: snapshot.state.thread, multiline: true},
                    ]}
                    editForm={editForm}
                    onEdit={() => startEdit("thread", {thread: snapshot.state.thread})}
                    onCancel={cancelEdit}
                    onChange={setEditForm}
                    onSave={() => saveEdit({thread: editForm.thread ?? snapshot.state.thread})}
                    onToggleLock={toggleThreadLock}
                />
                <EditableMetric
                    label="Wallet"
                    value={snapshot.state.wallet}
                    editing={editingSection === "wallet"}
                    fields={[
                        {key: "wallet", label: "XG ; XS ; XC", value: snapshot.state.wallet},
                    ]}
                    editForm={editForm}
                    onEdit={() => startEdit("wallet", {wallet: snapshot.state.wallet})}
                    onCancel={cancelEdit}
                    onChange={setEditForm}
                    onSave={() => saveEdit({wallet: editForm.wallet ?? snapshot.state.wallet})}
                />
                <DebugMetric label="Pending NPC Debug" value={snapshot.state.pendingNpcDebugQuery ?? "None"} />
                <DebugMetric label="Pending Memory Command" value={snapshot.state.pendingNpcMemoryCommand ?? "None"} />
            </section>

            <details className="aether-debug-details" open>
                <summary>Status User <button type="button" onClick={(e) => { e.stopPropagation(); startEdit("userStatus", {}); }}>Edit</button></summary>
                {editingSection === "userStatus" ? (
                    <UserStatusEditor
                        status={snapshot.state.userStatus}
                        clothing={editUserStatusClothing}
                        weaponsText={editUserWeaponsText}
                        itemsText={editUserItemsText}
                        onClothingChange={setEditUserStatusClothing}
                        onWeaponsChange={setEditUserWeaponsText}
                        onItemsChange={setEditUserItemsText}
                        onCancel={cancelEdit}
                        onSave={(patch) => {
                            const clothingFields = editUserStatusClothing;
                            const clothingPatch: Partial<UserStatusState["clothing"]> = {};
                            if (clothingFields.upper !== undefined) clothingPatch.upper = clothingFields.upper;
                            if (clothingFields.lower !== undefined) clothingPatch.lower = clothingFields.lower;
                            if (clothingFields.footwear !== undefined) clothingPatch.footwear = clothingFields.footwear;
                            if (clothingFields.outerwear !== undefined) clothingPatch.outerwear = clothingFields.outerwear;
                            if (clothingFields.accessories !== undefined) {
                                clothingPatch.accessories = clothingFields.accessories.split(",").map(s => s.trim()).filter(Boolean);
                            }
                            const parseLine = (line: string) => {
                                const parts = line.split(/\s+(?:—|-|\|)\s+/).map((p) => p.trim());
                                if (parts.length >= 2) {
                                    return {name: parts[0], location: parts[1], status: parts[2] || "intact"};
                                }
                                return null;
                            };
                            const weapons = editUserWeaponsText.split("\n").map(parseLine).filter((w): w is NonNullable<typeof w> => w != null);
                            const importantItems = editUserItemsText.split("\n").map(parseLine).filter((i): i is NonNullable<typeof i> => i != null);
                            saveEdit({
                                userStatusPatch: {
                                    ...patch,
                                    clothing: {...snapshot.state.userStatus.clothing, ...clothingPatch},
                                    weapons,
                                    importantItems,
                                }
                            });
                        }}
                    />
                ) : (
                    <UserStatusPanel status={snapshot.state.userStatus} />
                )}
            </details>

            <PrivateEventsPanel
                events={snapshot.state.privateEvents ?? []}
                threadItems={threadItemsForDisplay(snapshot.state.thread)}
                draftEvent={draftPrivateEvent}
                editingSection={editingSection}
                editForm={editForm}
                onCreateFromThread={startPrivateEventCreateFromThread}
                onSaveCreate={savePrivateEventCreate}
                onEdit={(event) => startEdit(`privateEvent:${event.id}`, privateEventToForm(event))}
                onCancel={cancelEdit}
                onChange={setEditForm}
                onSave={savePrivateEventEdit}
                onMarkComplete={(event) => {
                    requestConfirm({
                        title: "Mark Complete",
                        message: `Mark private event "${event.id}" as complete?`,
                        confirmLabel: "Mark Complete",
                        onConfirm: () => updatePrivateEventStatus(event, "complete"),
                    });
                }}
                onMarkFailed={(event) => {
                    requestConfirm({
                        title: "Mark Failed",
                        message: `Mark private event "${event.id}" as failed?`,
                        confirmLabel: "Mark Failed",
                        danger: true,
                        onConfirm: () => updatePrivateEventStatus(event, "failed"),
                    });
                }}
                onDelete={(event) => {
                    requestConfirm({
                        title: "Delete Private Event",
                        message: `Delete private event "${event.id}"? This cannot be undone.`,
                        confirmLabel: "Delete",
                        danger: true,
                        onConfirm: () => deletePrivateEvent(event),
                    });
                }}
            />

            <section className="aether-debug-section">
                <div className="aether-debug-section-title">
                    <h2>NPC Memory</h2>
                    <span>{npcMemoryEntries.length}</span>
                </div>
                <div className="aether-debug-command-guide" aria-label="NPC memory command examples">
                    <code>npc memory delete: Debi</code>
                    <code>npc memory clearfacts: Debi</code>
                    <code>npc memory mood: Debi | mood=tense | tone=guarded</code>
                    <code>npc memory behavior: Debi | behavior=suspicious, formal</code>
                    <code>npc memory behavior score: Debi | suspicious +1</code>
                    <code>npc memory relationship: Debi | relationship=ally, suspicious</code>
                    <code>npc memory relation event: Debi | event=Debi formed a temporary alliance with {'{{user}}'}</code>
                    <code>npc memory add fact: Debi | fact={'{{user}}'} paid Kaelen to find Debi</code>
                    <code>npc memory show: Debi</code>
                    <code>npc memory set: Debi | role=Market broker | race=Human | physical=none | mood=calm | behavior=suspicious, formal | relationship=acquaintance, formal | onlyKnows={'{{user}}'} paid Kaelen to find Debi</code>
                </div>
                <details className="aether-debug-create">
                    <summary>Create NPC Memory</summary>
                    <NpcMemoryEditor
                        draft={draft}
                        saveLabel="Create"
                        onChange={setDraft}
                        onCancel={() => setDraft(emptyNpcMemoryDraft())}
                        onSave={() => {
                            const command = npcMemorySetCommand(draft);
                            if (command == null) {
                                return;
                            }
                            setSnapshot(onApplyCommand(command));
                            setDraft(emptyNpcMemoryDraft());
                        }}
                    />
                </details>
                {npcMemoryEntries.length === 0 ? (
                    <p className="aether-debug-empty">No NPC memory stored yet.</p>
                ) : (
                    <div className="aether-debug-memory-list">
                        {npcMemoryEntries.map((entry) => {
                            const isNpcCollapsed = collapsedNpcCards.has(entry.name);
                            return (
                            <article className={isNpcCollapsed ? "aether-debug-memory-card is-collapsed" : "aether-debug-memory-card"} key={entry.name}>
                                {editingName === entry.name ? (
                                    <NpcMemoryEditor
                                        draft={draft}
                                        saveLabel="Save"
                                        onChange={setDraft}
                                        onCancel={() => {
                                            setEditingName(null);
                                            setDraft(emptyNpcMemoryDraft());
                                        }}
                                        onSave={() => {
                                            const dirtyFields = computeDirtyFields(draft, originalEntryRef.current);
                                            const command = npcMemorySetCommand(draft, entry.name, dirtyFields);
                                            if (command == null) {
                                                return;
                                            }
                                            setSnapshot(onApplyCommand(command));
                                            setEditingName(null);
                                            setDraft(emptyNpcMemoryDraft());
                                            originalEntryRef.current = null;
                                        }}
                                    />
                                ) : (
                                    <>
                                        <div className="aether-debug-card-header">
                                            <h3>{entry.name}</h3>
                                            <div className="aether-debug-card-actions">
                                                <button type="button" onClick={() => toggleNpcCard(entry.name)}>
                                                    {isNpcCollapsed ? "Expand" : "Minimize"}
                                                </button>
                                                <button type="button" onClick={() => {
                                                    setEditingName(entry.name);
                                                    setDraft(draftFromNpcMemory(entry));
                                                    originalEntryRef.current = entry;
                                                }}>Edit</button>
                                                <button type="button" onClick={() => {
                                                    requestConfirm({
                                                        title: "Clear Facts",
                                                        message: `Clear OnlyKnows facts for ${entry.name}?`,
                                                        confirmLabel: "Clear Facts",
                                                        danger: true,
                                                        onConfirm: () => setSnapshot(onApplyCommand(`npc memory clearfacts: ${entry.name}`)),
                                                    });
                                                }}>Clear Facts</button>
                                                <button className="danger" type="button" onClick={() => {
                                                    requestConfirm({
                                                        title: "Delete NPC Memory",
                                                        message: `Delete NPC memory for ${entry.name}? This cannot be undone.`,
                                                        confirmLabel: "Delete",
                                                        danger: true,
                                                        onConfirm: () => {
                                                            setSnapshot(onApplyCommand(`npc memory delete: ${entry.name}`));
                                                            removeCollapsedNpcCard(entry.name);
                                                            if (editingName === entry.name) {
                                                                setEditingName(null);
                                                                setDraft(emptyNpcMemoryDraft());
                                                            }
                                                        },
                                                    });
                                                }}>Delete</button>
                                            </div>
                                        </div>
                                        {isNpcCollapsed ? (
                                            <p className="aether-debug-card-summary">
                                                {entry.roleTitle || "Unknown role"} | {entry.currentMood || "mood unknown"}
                                            </p>
                                        ) : (
                                            <>
                                                <dl>
                                                    <DebugDetail label="Role" value={entry.roleTitle} />
                                                    <DebugDetail label="Race" value={entry.race} />
                                                    <DebugDetail label="Physical Extra" value={entry.physicalExtra} />
                                                    <DebugDetail label="Current Mood" value={entry.currentMood} />
                                                    <DebugDetail label="Last Tone" value={entry.lastInteractionTone ?? "unknown"} />
                                                    <DebugDetail label="Relationship" value={formatDebugList(entry.relationshipWithUser, "stranger")} />
                                                    <DebugDetail label="Behavior" value={formatDebugList(entry.behaviorTowardUser, "None stable yet")} />
                                                    <DebugDetail label="Behavior Scores" value={formatDebugScores(entry.behaviorScores)} />
                                                </dl>
                                                <p className="aether-debug-facts-label">Relationship Events</p>
                                                {entry.relationshipEvents.length === 0 ? (
                                                    <p className="aether-debug-empty compact">None</p>
                                                ) : (
                                                    <ul>
                                                        {entry.relationshipEvents.map((event) => <li key={event}>{event}</li>)}
                                                    </ul>
                                                )}
                                                <p className="aether-debug-facts-label">OnlyKnows</p>
                                                {entry.onlyKnows.length === 0 ? (
                                                    <p className="aether-debug-empty compact">None</p>
                                                ) : (
                                                    <ul className="aether-onlyknows-list">
                                                        {entry.onlyKnows.map((fact) => <li key={fact}>{fact}</li>)}
                                                    </ul>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <details className="aether-debug-details">
                <summary>Stage Prompt Directions</summary>
                <pre>{snapshot.lastStageDirections || "No stage directions captured yet."}</pre>
            </details>

            <details className="aether-debug-details">
                <summary>Last System Message</summary>
                <pre>{snapshot.lastSystemMessage || "No system debug message captured yet."}</pre>
            </details>

            <details className="aether-debug-details">
                <summary>Latest User Message</summary>
                <pre>{snapshot.latestUserMessage || "No pending user message."}</pre>
            </details>

            <section className="aether-debug-section">
                <div className="aether-debug-section-title">
                    <h2>Debug Logs</h2>
                    <span>{snapshot.debugEvents.length}</span>
                </div>
                <div className="aether-debug-log-grid">
                    {DEBUG_LOG_GROUPS.map((group) => (
                        <DebugLogPanel
                            key={group.category}
                            title={group.title}
                            events={snapshot.debugEvents.filter((event) => event.category === group.category)}
                            emptyText={group.emptyText}
                            defaultOpen={group.defaultOpen === true}
                            onClear={() => setSnapshot(onClearLogs(group.category))}
                            onConfirmAction={requestConfirm}
                        />
                    ))}
                </div>
            </section>
            {pendingConfirm != null ? (
                <ConfirmDialog
                    request={pendingConfirm}
                    onCancel={closeConfirm}
                    onConfirm={runPendingConfirm}
                />
            ) : null}
        </main>
    );
}

function DebugLogPanel({
    title,
    events,
    emptyText,
    defaultOpen,
    onClear,
    onConfirmAction,
}: {
    title: string;
    events: DebugEvent[];
    emptyText: string;
    defaultOpen: boolean;
    onClear: () => void;
    onConfirmAction: (request: ConfirmRequest) => void;
}): ReactElement {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <details className="aether-debug-details aether-debug-log-panel" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
            <summary>
                <span>{title}</span>
                <span className="aether-debug-summary-badge">{events.length}</span>
                <button type="button" onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onConfirmAction({
                        title: "Clear Log",
                        message: `Clear ${title}?`,
                        confirmLabel: "Clear",
                        onConfirm: onClear,
                    });
                }}>Clear</button>
            </summary>
            {events.length === 0 ? (
                <p className="aether-debug-empty compact padded">{emptyText}</p>
            ) : (
                <ol className="aether-debug-events">
                    {events.map((event) => (
                        <li key={event.id}>
                            <div className="aether-debug-event-main">
                                <time>{event.at}</time>
                                <strong>{event.label}</strong>
                                <span>{event.detail}</span>
                            </div>
                            {event.details != null && event.details.length > 0 ? (
                                <ul className="aether-debug-event-details">
                                    {event.details.map((detail, index) => <li key={`${event.id}-${index}`}>{detail}</li>)}
                                </ul>
                            ) : null}
                        </li>
                    ))}
                </ol>
            )}
        </details>
    );
}

function PrivateEventsPanel({
    events,
    threadItems,
    draftEvent,
    editingSection,
    editForm,
    onCreateFromThread,
    onSaveCreate,
    onEdit,
    onCancel,
    onChange,
    onSave,
    onMarkComplete,
    onMarkFailed,
    onDelete,
}: {
    events: PrivateEventEntry[];
    threadItems: string[];
    draftEvent: PrivateEventEntry | null;
    editingSection: string | null;
    editForm: Record<string, string>;
    onCreateFromThread: (threadItem: string) => void;
    onSaveCreate: () => void;
    onEdit: (event: PrivateEventEntry) => void;
    onCancel: () => void;
    onChange: (form: Record<string, string>) => void;
    onSave: (event: PrivateEventEntry) => void;
    onMarkComplete: (event: PrivateEventEntry) => void;
    onMarkFailed: (event: PrivateEventEntry) => void;
    onDelete: (event: PrivateEventEntry) => void;
}): ReactElement {
    const [selectedThreadItem, setSelectedThreadItem] = useState("");
    const activeThreadItem = threadItems.includes(selectedThreadItem)
        ? selectedThreadItem
        : threadItems[0] ?? "";
    const isCreating = editingSection === "privateEvent:create" && draftEvent != null;

    return (
        <section className="aether-debug-section aether-private-events-section">
            <div className="aether-debug-section-title">
                <h2>Private Events</h2>
                <span>{events.length}</span>
            </div>
            <div className="aether-private-event-create-row">
                <select
                    value={activeThreadItem}
                    disabled={threadItems.length === 0 || isCreating}
                    onChange={(event) => setSelectedThreadItem(event.target.value)}
                    aria-label="Select Thread item for private event"
                >
                    {threadItems.length === 0 ? (
                        <option value="">No Thread item available</option>
                    ) : (
                        threadItems.map((item) => <option key={item} value={item}>{item}</option>)
                    )}
                </select>
                <button
                    type="button"
                    disabled={activeThreadItem.length === 0 || isCreating}
                    onClick={() => onCreateFromThread(activeThreadItem)}
                >
                    Add From Thread
                </button>
            </div>
            {isCreating ? (
                <article className="aether-debug-memory-card aether-private-event-card is-creating">
                    <div className="aether-debug-card-header">
                        <h3>New private event from Thread</h3>
                    </div>
                    <PrivateEventEditor
                        event={draftEvent}
                        editForm={editForm}
                        onChange={onChange}
                        onCancel={onCancel}
                        onSave={onSaveCreate}
                    />
                </article>
            ) : null}
            {events.length === 0 && !isCreating ? (
                <p className="aether-debug-empty">No private events stored yet.</p>
            ) : (
                <div className="aether-private-event-list">
                    {events.map((event) => {
                        const isEditing = editingSection === `privateEvent:${event.id}`;
                        return (
                            <article className="aether-debug-memory-card aether-private-event-card" key={event.id}>
                                {isEditing ? (
                                    <PrivateEventEditor
                                        event={event}
                                        editForm={editForm}
                                        onChange={onChange}
                                        onCancel={onCancel}
                                        onSave={() => onSave(event)}
                                    />
                                ) : (
                                    <>
                                        <div className="aether-debug-card-header">
                                            <h3>{event.context}</h3>
                                            <div className="aether-debug-card-actions">
                                                <button type="button" onClick={() => onEdit(event)}>Edit</button>
                                                <button type="button" onClick={() => onMarkComplete(event)} disabled={event.status === "complete"}>Mark Complete</button>
                                                <button type="button" onClick={() => onMarkFailed(event)} disabled={event.status === "failed"}>Mark Failed</button>
                                                <button className="danger" type="button" onClick={() => onDelete(event)}>Delete</button>
                                            </div>
                                        </div>
                                        <div className="aether-private-event-badges">
                                            <span className={`aether-private-event-badge urgency-${event.urgencyLabel}`}>{event.urgencyLabel}</span>
                                            <span className="aether-private-event-badge">{event.status}</span>
                                            <span className="aether-private-event-badge private">Secret</span>
                                        </div>
                                        <dl>
                                            <DebugDetail label="Time" value={event.timeAnchor ?? "None"} />
                                            <DebugDetail label="Deadline" value={event.deadline ?? "None"} />
                                            <DebugDetail label="Location" value={event.location ?? "None"} />
                                            <DebugDetail label="NPC" value={privateEventListText(event.npcNames) || "None"} />
                                            <DebugDetail label="Known By" value={privateEventListText(event.knownBy) || "None"} />
                                            <DebugDetail label="Thread Key" value={event.parentThreadKey} />
                                        </dl>
                                        {event.condition != null || event.threatContext != null || event.consequence != null ? (
                                            <div className="aether-private-event-threat">
                                                {event.condition != null ? <p><strong>Condition:</strong> {event.condition}</p> : null}
                                                {event.threatContext != null ? <p><strong>Threat:</strong> {event.threatContext}</p> : null}
                                                {event.consequence != null ? <p><strong>Consequence:</strong> {event.consequence}</p> : null}
                                            </div>
                                        ) : null}
                                        <p className="aether-debug-facts-label">Keywords</p>
                                        <p className="aether-debug-card-summary">{privateEventListText(event.keywords) || "None"}</p>
                                        <p className="aether-debug-facts-label">Privacy</p>
                                        <p className="aether-debug-card-summary">{event.secrecyNote}</p>
                                    </>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

function PrivateEventEditor({
    event,
    editForm,
    onChange,
    onCancel,
    onSave,
}: {
    event: PrivateEventEntry;
    editForm: Record<string, string>;
    onChange: (form: Record<string, string>) => void;
    onCancel: () => void;
    onSave: () => void;
}): ReactElement {
    const value = (key: string): string => editForm[key] ?? privateEventToForm(event)[key] ?? "";
    const setValue = (key: string, next: string): void => onChange({...editForm, [key]: next});

    return (
        <form className="aether-debug-editor aether-private-event-editor" onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            onSave();
        }}>
            <label>
                ID
                <input value={value("id")} onChange={(changeEvent) => setValue("id", changeEvent.target.value)} />
            </label>
            <label>
                Thread Key
                <input value={value("parentThreadKey")} onChange={(changeEvent) => setValue("parentThreadKey", changeEvent.target.value)} />
            </label>
            <label>
                Status
                <select value={value("status")} onChange={(changeEvent) => setValue("status", changeEvent.target.value)}>
                    {PRIVATE_EVENT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
            </label>
            <label>
                Urgency
                <select value={value("urgencyLabel")} onChange={(changeEvent) => setValue("urgencyLabel", changeEvent.target.value)}>
                    {PRIVATE_EVENT_URGENCY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
            </label>
            <label>
                NPC Names
                <input value={value("npcNames")} onChange={(changeEvent) => setValue("npcNames", changeEvent.target.value)} />
            </label>
            <label>
                Known By
                <input value={value("knownBy")} onChange={(changeEvent) => setValue("knownBy", changeEvent.target.value)} />
            </label>
            <label>
                Time
                <input value={value("timeAnchor")} onChange={(changeEvent) => setValue("timeAnchor", changeEvent.target.value)} />
            </label>
            <label>
                Deadline
                <input value={value("deadline")} onChange={(changeEvent) => setValue("deadline", changeEvent.target.value)} />
            </label>
            <label className="wide">
                Location
                <input value={value("location")} onChange={(changeEvent) => setValue("location", changeEvent.target.value)} />
            </label>
            <label className="wide">
                Context
                <textarea value={value("context")} onChange={(changeEvent) => setValue("context", changeEvent.target.value)} rows={3} />
            </label>
            <label className="wide">
                Condition
                <textarea value={value("condition")} onChange={(changeEvent) => setValue("condition", changeEvent.target.value)} rows={2} />
            </label>
            <label className="wide">
                Threat
                <textarea value={value("threatContext")} onChange={(changeEvent) => setValue("threatContext", changeEvent.target.value)} rows={3} />
            </label>
            <label className="wide">
                Consequence
                <textarea value={value("consequence")} onChange={(changeEvent) => setValue("consequence", changeEvent.target.value)} rows={3} />
            </label>
            <label className="wide">
                Keywords
                <textarea value={value("keywords")} onChange={(changeEvent) => setValue("keywords", changeEvent.target.value)} rows={2} />
            </label>
            <label className="wide">
                Privacy Note
                <textarea value={value("secrecyNote")} onChange={(changeEvent) => setValue("secrecyNote", changeEvent.target.value)} rows={2} />
            </label>
            <label className="wide">
                Source Summary
                <textarea value={value("sourceSummary")} onChange={(changeEvent) => setValue("sourceSummary", changeEvent.target.value)} rows={2} />
            </label>
            <div className="aether-debug-editor-actions">
                <button type="submit">Save</button>
                <button type="button" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}

function ConfirmDialog({
    request,
    onCancel,
    onConfirm,
}: {
    request: ConfirmRequest;
    onCancel: () => void;
    onConfirm: () => void;
}): ReactElement {
    return (
        <div className="aether-confirm-overlay" role="presentation">
            <section className="aether-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="aether-confirm-title">
                <h2 id="aether-confirm-title">{request.title}</h2>
                <p>{request.message}</p>
                <div className="aether-confirm-actions">
                    <button type="button" onClick={onCancel}>Cancel</button>
                    <button
                        type="button"
                        className={request.danger === true ? "danger" : undefined}
                        onClick={onConfirm}
                    >
                        {request.confirmLabel}
                    </button>
                </div>
            </section>
        </div>
    );
}

function NpcMemoryEditor({
    draft,
    saveLabel,
    onChange,
    onCancel,
    onSave,
}: {
    draft: NpcMemoryDraft;
    saveLabel: string;
    onChange: (draft: NpcMemoryDraft) => void;
    onCancel: () => void;
    onSave: () => void;
}): ReactElement {
    return (
        <form className="aether-debug-editor" onSubmit={(event) => {
            event.preventDefault();
            onSave();
        }}>
            <label>
                Name
                <input value={draft.name} onChange={(event) => onChange({...draft, name: event.target.value})} />
            </label>
            <label>
                Role/Title
                <input value={draft.roleTitle} onChange={(event) => onChange({...draft, roleTitle: event.target.value})} />
            </label>
            <label>
                Race
                <input value={draft.race} onChange={(event) => onChange({...draft, race: event.target.value})} />
            </label>
            <label>
                Physical Extra
                <input value={draft.physicalExtra} onChange={(event) => onChange({...draft, physicalExtra: event.target.value})} />
            </label>
            <label>
                Current Mood
                <input value={draft.currentMood} onChange={(event) => onChange({...draft, currentMood: event.target.value})} />
            </label>
            <label>
                Last Tone
                <input value={draft.lastInteractionTone} onChange={(event) => onChange({...draft, lastInteractionTone: event.target.value})} />
            </label>
            <label>
                Relationship
                <input value={draft.relationshipWithUserText} onChange={(event) => onChange({...draft, relationshipWithUserText: event.target.value})} />
            </label>
            <label>
                Behavior
                <input value={draft.behaviorTowardUserText} onChange={(event) => onChange({...draft, behaviorTowardUserText: event.target.value})} />
            </label>
            <label className="wide">
                Behavior Scores
                <textarea value={draft.behaviorScoresText} onChange={(event) => onChange({...draft, behaviorScoresText: event.target.value})} />
            </label>
            <label className="wide">
                Relationship Events
                <textarea value={draft.relationshipEventsText} onChange={(event) => onChange({...draft, relationshipEventsText: event.target.value})} />
            </label>
            <label className="wide long-memory-field">
                OnlyKnows
                <textarea rows={10} value={draft.onlyKnowsText} onChange={(event) => onChange({...draft, onlyKnowsText: event.target.value})} />
            </label>
            <div className="aether-debug-editor-actions">
                <button type="submit">{saveLabel}</button>
                <button type="button" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}

function EditableMetric({
    label,
    value,
    editing,
    fields,
    editForm,
    onEdit,
    onCancel,
    onChange,
    onSave,
}: {
    label: string;
    value: string;
    editing: boolean;
    fields: EditableMetricField[];
    editForm: Record<string, string>;
    onEdit: () => void;
    onCancel: () => void;
    onChange: (form: Record<string, string>) => void;
    onSave: () => void;
}): ReactElement {
    if (editing) {
        return (
            <article className="aether-debug-metric editable">
                <span>{label}</span>
                <div className="aether-edit-form">
                    {fields.map((field) => (
                        <label key={field.key}>
                            {field.label}
                            {field.options != null ? (
                                <select
                                    value={editForm[field.key] ?? field.value}
                                    onChange={(e) => onChange({...editForm, [field.key]: e.target.value})}
                                >
                                    {field.options.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            ) : field.multiline === true ? (
                                <textarea
                                    value={editForm[field.key] ?? field.value}
                                    onChange={(e) => onChange({...editForm, [field.key]: e.target.value})}
                                    rows={3}
                                />
                            ) : (
                                <input
                                    value={editForm[field.key] ?? field.value}
                                    onChange={(e) => onChange({...editForm, [field.key]: e.target.value})}
                                />
                            )}
                        </label>
                    ))}
                    <div className="aether-edit-actions">
                        <button type="button" onClick={onSave}>Save</button>
                        <button type="button" onClick={onCancel}>Cancel</button>
                    </div>
                </div>
            </article>
        );
    }

    return (
        <article className="aether-debug-metric">
            <span>{label}</span>
            <p>{value}</p>
            <button type="button" className="aether-edit-trigger" onClick={onEdit}>Edit</button>
        </article>
    );
}

function LockIcon({locked}: {locked: boolean}): ReactElement {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d={locked
                ? "M7 10V8a5 5 0 0 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z"
                : "M7 10V8a5 5 0 0 1 9.3-2.55l-1.73 1A3 3 0 0 0 9 8v2h9.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7Z"}
            />
        </svg>
    );
}

function ThreadMetric({
    label,
    value,
    lockedItems,
    editing,
    fields,
    editForm,
    onEdit,
    onCancel,
    onChange,
    onSave,
    onToggleLock,
}: {
    label: string;
    value: string;
    lockedItems: string[];
    editing: boolean;
    fields: EditableMetricField[];
    editForm: Record<string, string>;
    onEdit: () => void;
    onCancel: () => void;
    onChange: (form: Record<string, string>) => void;
    onSave: () => void;
    onToggleLock: (item: string) => void;
}): ReactElement {
    if (editing) {
        return (
            <EditableMetric
                label={label}
                value={value}
                editing={editing}
                fields={fields}
                editForm={editForm}
                onEdit={onEdit}
                onCancel={onCancel}
                onChange={onChange}
                onSave={onSave}
            />
        );
    }

    const items = threadItemsForDisplay(value);

    return (
        <article className="aether-debug-metric aether-thread-metric">
            <span>{label}</span>
            <button type="button" className="aether-edit-trigger" onClick={onEdit}>Edit</button>
            {items.length === 0 ? (
                <p>None</p>
            ) : (
                <ol className="aether-thread-list" aria-label="Thread missions">
                    {items.map((item) => {
                        const locked = threadItemIsLocked(item, lockedItems);
                        const terminal = isTerminalThreadItem(item);
                        return (
                            <li key={item} className={locked ? "is-locked" : undefined}>
                                <button
                                    type="button"
                                    className={locked ? "aether-thread-lock is-active" : "aether-thread-lock"}
                                    aria-label={locked ? `Unlock mission: ${item}` : `Lock mission: ${item}`}
                                    aria-pressed={locked}
                                    disabled={terminal}
                                    title={terminal ? "Mission already ended" : locked ? "Unlock mission" : "Lock mission"}
                                    onClick={() => onToggleLock(item)}
                                >
                                    <LockIcon locked={locked} />
                                </button>
                                <span>{item}</span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </article>
    );
}

function UserStatusEditor({
    status,
    clothing,
    weaponsText,
    itemsText,
    onClothingChange,
    onWeaponsChange,
    onItemsChange,
    onCancel,
    onSave,
}: {
    status: UserStatusState;
    clothing: Record<string, string>;
    weaponsText: string;
    itemsText: string;
    onClothingChange: (c: Record<string, string>) => void;
    onWeaponsChange: (v: string) => void;
    onItemsChange: (v: string) => void;
    onCancel: () => void;
    onSave: (patch: Partial<UserStatusState>) => void;
}): ReactElement {
    const [gender, setGender] = useState(status.gender);
    const [race, setRace] = useState(status.apparentRace);
    const upper = clothing.upper ?? status.clothing.upper ?? "";
    const lower = clothing.lower ?? status.clothing.lower ?? "";
    const footwear = clothing.footwear ?? status.clothing.footwear ?? "";
    const outerwear = clothing.outerwear ?? status.clothing.outerwear ?? "";
    const accessories = clothing.accessories ?? (status.clothing.accessories ?? []).join(", ");

    return (
        <form className="aether-user-status-editor" onSubmit={(event) => {
            event.preventDefault();
            onSave({gender, apparentRace: race});
        }}>
            <label>
                <span>Gender</span>
                <input value={gender} onChange={(e) => setGender(e.target.value)} />
            </label>
            <label>
                <span>Race</span>
                <input value={race} onChange={(e) => setRace(e.target.value)} />
            </label>
            <label>
                <span>Upper</span>
                <input value={upper} onChange={(e) => onClothingChange({...clothing, upper: e.target.value})} />
            </label>
            <label>
                <span>Lower</span>
                <input value={lower} onChange={(e) => onClothingChange({...clothing, lower: e.target.value})} />
            </label>
            <label>
                <span>Footwear</span>
                <input value={footwear} onChange={(e) => onClothingChange({...clothing, footwear: e.target.value})} />
            </label>
            <label>
                <span>Outerwear</span>
                <input value={outerwear} onChange={(e) => onClothingChange({...clothing, outerwear: e.target.value})} />
            </label>
            <label className="wide">
                <span>Accessories</span>
                <input value={accessories} onChange={(e) => onClothingChange({...clothing, accessories: e.target.value})} />
            </label>
            <label className="wide">
                <span>Weapons</span>
                <textarea
                    value={weaponsText}
                    onChange={(e) => onWeaponsChange(e.target.value)}
                    placeholder="name | location | status"
                    rows={4}
                />
            </label>
            <label className="wide">
                <span>Important Items</span>
                <textarea
                    value={itemsText}
                    onChange={(e) => onItemsChange(e.target.value)}
                    placeholder="name | location | status"
                    rows={4}
                />
            </label>
            <div className="aether-edit-actions wide">
                <button type="submit">Save</button>
                <button type="button" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}

function UserStatusPanel({status}: {status: UserStatusState}): ReactElement {
  const clothingParts: string[] = [];
  if (status.clothing.upper) clothingParts.push(`Upper: ${status.clothing.upper}`);
  if (status.clothing.lower) clothingParts.push(`Lower: ${status.clothing.lower}`);
  if (status.clothing.footwear) clothingParts.push(`Footwear: ${status.clothing.footwear}`);
  if (status.clothing.outerwear) clothingParts.push(`Outerwear: ${status.clothing.outerwear}`);
  if (status.clothing.accessories && status.clothing.accessories.length > 0) {
    clothingParts.push(`Accessories: ${status.clothing.accessories.join(", ")}`);
  }

  return (
    <div className="aether-user-status">
      <div className="aether-user-status-row">
        <span className="aether-user-status-label">Gender:</span>
        <span>{status.gender}</span>
      </div>
      <div className="aether-user-status-row">
        <span className="aether-user-status-label">Race:</span>
        <span>{status.apparentRace}</span>
      </div>
      {clothingParts.length > 0 && (
        <div className="aether-user-status-section">
          <span className="aether-user-status-label">Clothing:</span>
          <ul className="aether-user-status-list">
            {clothingParts.map((part) => (
              <li key={part}>{part}</li>
            ))}
          </ul>
        </div>
      )}
      {status.weapons.length > 0 && (
        <div className="aether-user-status-section">
          <span className="aether-user-status-label">Weapons:</span>
          <ul className="aether-user-status-list">
            {status.weapons.map((w) => (
              <li key={w.name}>
                {w.name} — {w.location}{w.status ? ` — ${w.status}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {status.importantItems.length > 0 && (
        <div className="aether-user-status-section">
          <span className="aether-user-status-label">Important Items:</span>
          <ul className="aether-user-status-list">
            {status.importantItems.map((item) => (
              <li key={item.name}>
                {item.name} — {item.location}{item.status ? ` — ${item.status}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {clothingParts.length === 0 && status.weapons.length === 0 && status.importantItems.length === 0 && (
        <p className="aether-debug-empty compact">No detailed status data yet.</p>
      )}
    </div>
  );
}

function DebugMetric({label, value}: {label: string; value: string}): ReactElement {
    return (
        <article className="aether-debug-metric">
            <span>{label}</span>
            <p>{value}</p>
        </article>
    );
}

function DebugDetail({label, value}: {label: string; value: string}): ReactElement {
    return (
        <>
            <dt>{label}</dt>
            <dd>{value}</dd>
        </>
    );
}
