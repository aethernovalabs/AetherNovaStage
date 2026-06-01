import type {ReactElement} from "react";
import React, {useState, useEffect, useRef} from "react";
import type {AetherNovaMessageState, UserStatusState, NpcMemoryEntry} from "../types";
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

const DEBUG_UI_MINIMIZED_STORAGE_KEY = "aether-nova-stage.debugUiMinimized";
const DEBUG_UI_COLLAPSED_NPCS_STORAGE_KEY = "aether-nova-stage.collapsedNpcCards";

type EditableMetricField = {
    key: string;
    label: string;
    value: string;
    multiline?: boolean;
    options?: string[];
};

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

function confirmAction(message: string): boolean {
    try {
        return window.confirm(message);
    } catch {
        return false;
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
    const npcMemoryEntries = Object.values(snapshot.state.npcMemory ?? {});
    const [editingName, setEditingName] = useState<string | null>(null);
    const [draft, setDraft] = useState<NpcMemoryDraft>(emptyNpcMemoryDraft());
    const originalEntryRef = useRef<NpcMemoryEntry | null>(null);

    const [editingSection, setEditingSection] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Record<string, string>>({});
    const [editUserStatusClothing, setEditUserStatusClothing] = useState<Record<string, string>>({});
    const [editUserWeaponsText, setEditUserWeaponsText] = useState("");
    const [editUserItemsText, setEditUserItemsText] = useState("");

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
    };

    const saveEdit = (patch: Partial<AetherNovaMessageState & {userStatusPatch?: Partial<UserStatusState>}>): void => {
        setSnapshot(onStateEdit(patch));
        setEditingSection(null);
        setEditForm({});
        setEditUserStatusClothing({});
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
                        if (confirmAction("Clear all debug logs?")) {
                            setSnapshot(onClearLogs());
                        }
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
                <EditableMetric
                    label="Thread"
                    value={snapshot.state.thread}
                    editing={editingSection === "thread"}
                    fields={[
                        {key: "thread", label: "Thread items", value: snapshot.state.thread, multiline: true},
                    ]}
                    editForm={editForm}
                    onEdit={() => startEdit("thread", {thread: snapshot.state.thread})}
                    onCancel={cancelEdit}
                    onChange={setEditForm}
                    onSave={() => saveEdit({thread: editForm.thread ?? snapshot.state.thread})}
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
                                                    if (confirmAction(`Clear OnlyKnows facts for ${entry.name}?`)) {
                                                        setSnapshot(onApplyCommand(`npc memory clearfacts: ${entry.name}`));
                                                    }
                                                }}>Clear Facts</button>
                                                <button className="danger" type="button" onClick={() => {
                                                    if (!confirmAction(`Delete NPC memory for ${entry.name}? This cannot be undone.`)) {
                                                        return;
                                                    }
                                                    setSnapshot(onApplyCommand(`npc memory delete: ${entry.name}`));
                                                    removeCollapsedNpcCard(entry.name);
                                                    if (editingName === entry.name) {
                                                        setEditingName(null);
                                                        setDraft(emptyNpcMemoryDraft());
                                                    }
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
                                                    <ul>
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
                        />
                    ))}
                </div>
            </section>

            <details className="aether-debug-details">
                <summary>Stage Directions</summary>
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
        </main>
    );
}

function DebugLogPanel({
    title,
    events,
    emptyText,
    defaultOpen,
    onClear,
}: {
    title: string;
    events: DebugEvent[];
    emptyText: string;
    defaultOpen: boolean;
    onClear: () => void;
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
                    if (confirmAction(`Clear ${title}?`)) {
                        onClear();
                    }
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
            <label className="wide">
                OnlyKnows
                <textarea value={draft.onlyKnowsText} onChange={(event) => onChange({...draft, onlyKnowsText: event.target.value})} />
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
