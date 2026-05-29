import {ReactElement, useEffect, useState} from "react";
import {InitialData, LoadResponse, Message, StageBase, StageResponse} from "@chub-ai/stages-ts";
import {
    AetherNovaMessageState,
    NpcMemoryEntry,
    applyNpcMemoryCommands,
    buildStageDirections,
    coerceHeaderState,
    createInitialHeaderState,
    debugNpcQuery,
    normalizeAetherNovaResponse,
    prepareAetherNovaStateForPrompt,
} from "./aetherNovaHeader";

type MessageStateType = AetherNovaMessageState;
type ConfigType = {
    debugUi?: boolean;
};
type InitStateType = Record<string, never>;
type ChatStateType = Record<string, never>;
const DEBUG_STORAGE_KEY = "aether-nova-stage.pendingNpcDebugQuery";
const DEBUG_UI_VERSION = "V1.7";

type DebugCategory = "lifecycle" | "npcMemory" | "headerFormat" | "narrativeFormat" | "walletThread" | "system";

const DEBUG_LOG_GROUPS: Array<{category: DebugCategory; title: string; emptyText: string; defaultOpen?: boolean}> = [
    {category: "npcMemory", title: "NPC Memory Log", emptyText: "No NPC memory activity yet.", defaultOpen: true},
    {category: "headerFormat", title: "Format Header Log", emptyText: "No header formatting activity yet.", defaultOpen: true},
    {category: "narrativeFormat", title: "Format Narrative Log", emptyText: "No narrative formatting activity yet."},
    {category: "walletThread", title: "Wallet / Thread Log", emptyText: "No wallet or thread activity yet."},
    {category: "lifecycle", title: "Lifecycle Log", emptyText: "No lifecycle activity yet."},
    {category: "system", title: "System Message Log", emptyText: "No system messages captured yet."},
];

interface DebugEvent {
    id: number;
    at: string;
    category: DebugCategory;
    label: string;
    detail: string;
    details?: string[];
}

interface DebugSnapshot {
    state: AetherNovaMessageState;
    latestUserMessage: string;
    lastStageDirections: string;
    lastSystemMessage: string;
    lastModifiedMessageChanged: boolean;
    debugEvents: DebugEvent[];
}

interface NpcMemoryDraft {
    name: string;
    roleTitle: string;
    race: string;
    physicalExtra: string;
    currentMood: string;
    lastInteractionTone: string;
    behaviorTowardUserText: string;
    behaviorScoresText: string;
    relationshipWithUserText: string;
    relationshipEventsText: string;
    onlyKnowsText: string;
}

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    private state: AetherNovaMessageState;
    private latestUserMessage: string;
    private debugUiEnabled: boolean;
    private debugEventId: number;
    private debugEvents: DebugEvent[];
    private lastStageDirections: string;
    private lastSystemMessage: string;
    private lastModifiedMessageChanged: boolean;
    private latestNpcMemoryCommandMessage: string;

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
        this.state = createInitialHeaderState(data.characters, data.messageState);
        this.latestUserMessage = "";
        this.debugUiEnabled = data.config?.debugUi !== false;
        this.debugEventId = 0;
        this.debugEvents = [];
        this.lastStageDirections = "";
        this.lastSystemMessage = "";
        this.lastModifiedMessageChanged = false;
        this.latestNpcMemoryCommandMessage = "";
        this.pushDebugEvent("lifecycle", "init", `state ready; ${countNpcMemory(this.state)} NPC memory entries`);
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {
        this.pushDebugEvent("lifecycle", "load", `messageState loaded; debug UI ${this.debugUiEnabled ? "enabled" : "disabled"}`);

        return {
            success: true,
            error: null,
            initState: null,
            chatState: null,
            messageState: this.state,
        };
    }

    async setState(state: MessageStateType): Promise<void> {
        this.state = coerceHeaderState(state, this.state);
        this.pushDebugEvent("lifecycle", "setState", `branch/swipe state restored; ${countNpcMemory(this.state)} NPC memory entries`);
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const originalUserMessage = userMessage.content;
        const previousNpcMemoryCount = countNpcMemory(this.state);
        const debugQuery = debugNpcQuery(originalUserMessage);
        if (debugQuery != null) {
            writePendingDebugQuery(debugQuery);
        }
        const preparedState = prepareAetherNovaStateForPrompt(this.state, originalUserMessage);
        const pendingCommand = preparedState.pendingNpcMemoryCommand;
        const pendingCommandResult = pendingCommand == null
            ? null
            : applyNpcMemoryCommands(preparedState, pendingCommand);
        const commandResult = applyNpcMemoryCommands(pendingCommandResult?.state ?? preparedState, originalUserMessage);
        const pendingMemoryCommand = commandResult.applied
            ? originalUserMessage
            : pendingCommand;

        this.state = commandResult.state;
        this.latestUserMessage = commandResult.cleanedMessage;
        this.latestNpcMemoryCommandMessage = pendingMemoryCommand ?? "";
        this.state = {
            ...this.state,
            pendingNpcMemoryCommand: pendingMemoryCommand,
        };
        const commandSystemMessage = joinSystemMessages(pendingCommandResult?.systemMessage, commandResult.systemMessage);
        if (commandSystemMessage.length > 0) {
            this.lastSystemMessage = commandSystemMessage;
        }
        this.lastStageDirections = buildStageDirections(this.state, this.latestUserMessage);
        this.pushDebugEvent(
            "lifecycle",
            "beforePrompt",
            `directions injected (${this.lastStageDirections.length} chars); debug request: ${debugQuery ?? "none"}; memory command: ${pendingMemoryCommand != null ? "pending" : "none"}`,
        );
        this.pushDebugEvent(
            "npcMemory",
            "beforePrompt",
            `NPC memory ${previousNpcMemoryCount} -> ${countNpcMemory(this.state)}; command applied: ${commandResult.applied ? "yes" : "no"}; pending reapply: ${pendingMemoryCommand != null ? "yes" : "no"}`,
            [
                `Debug query: ${debugQuery ?? "none"}`,
                `Cleaned user message chars: ${this.latestUserMessage.length}`,
                commandSystemMessage.length > 0 ? `System message:\n${commandSystemMessage}` : "System message: none",
            ],
        );
        if (commandSystemMessage.length > 0) {
            this.pushDebugEvent("system", "beforePrompt", "systemMessage returned from NPC memory command", [commandSystemMessage]);
        }

        return {
            stageDirections: this.lastStageDirections,
            messageState: this.state,
            modifiedMessage: commandResult.cleanedMessage !== originalUserMessage
                ? (commandResult.cleanedMessage.length > 0 ? commandResult.cleanedMessage : " ")
                : null,
            systemMessage: commandSystemMessage.length > 0 ? commandSystemMessage : null,
            error: null,
            chatState: null,
        };
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const previousState = this.state;
        const previousNpcMemory = this.state.npcMemory;
        const previousNpcMemoryCount = countNpcMemory(this.state);
        const storedDebugQuery = this.state.pendingNpcDebugQuery ?? readPendingDebugQuery();
        if (storedDebugQuery != null) {
            this.state = {
                ...this.state,
                pendingNpcDebugQuery: storedDebugQuery,
            };
        }

        const normalized = normalizeAetherNovaResponse(botMessage.content, this.state, this.latestUserMessage);
        const pendingMemoryCommand = this.state.pendingNpcMemoryCommand ?? this.latestNpcMemoryCommandMessage;
        const afterResponseCommand = pendingMemoryCommand.length > 0
            ? applyNpcMemoryCommands(normalized.state, pendingMemoryCommand)
            : null;
        const finalState = {
            ...(afterResponseCommand?.state ?? normalized.state),
            pendingNpcMemoryCommand: null,
        };
        const changedFields = changedStateFields(previousState, finalState);
        this.state = finalState;
        this.lastModifiedMessageChanged = normalized.content !== botMessage.content;
        this.lastSystemMessage = joinSystemMessages(normalized.systemMessage, afterResponseCommand?.systemMessage);
        const headerDetails = headerStateChangeDetails(previousState, this.state);
        const trackedHeaderChanged = headerDetails.some((detail) => detail.includes(" -> "));
        this.pushDebugEvent(
            "lifecycle",
            "afterResponse",
            `response ${this.lastModifiedMessageChanged ? "modified" : "unchanged"}; changed: ${changedFields.length > 0 ? changedFields.join(", ") : "none"}; NPC memory ${previousNpcMemoryCount} -> ${countNpcMemory(this.state)}; memory command reapply ${afterResponseCommand?.applied === true ? "yes" : "no"}; system debug ${this.lastSystemMessage.length > 0 ? "sent" : "none"}`,
        );
        this.pushDebugEvent(
            "headerFormat",
            "afterResponse",
            trackedHeaderChanged ? `${headerDetails.length} tracked header field(s) changed` : "tracked header fields unchanged",
            headerDetails,
        );
        this.pushDebugEvent(
            "narrativeFormat",
            "afterResponse",
            `response ${this.lastModifiedMessageChanged ? "modified" : "unchanged"}; chars ${botMessage.content.length} -> ${normalized.content.length}`,
            narrativeFormatDetails(botMessage.content, normalized.content, changedFields),
        );
        this.pushDebugEvent(
            "npcMemory",
            "afterResponse",
            `NPC memory ${previousNpcMemoryCount} -> ${countNpcMemory(this.state)}; command reapply: ${afterResponseCommand?.applied === true ? "yes" : "no"}`,
            npcMemoryChangeDetails(previousNpcMemory, this.state.npcMemory),
        );
        this.pushDebugEvent(
            "walletThread",
            "afterResponse",
            walletThreadSummary(previousState, this.state),
            walletThreadDetails(previousState, this.state),
        );
        if (this.lastSystemMessage.length > 0) {
            this.pushDebugEvent("system", "afterResponse", "systemMessage returned after response", [this.lastSystemMessage]);
        }
        this.latestUserMessage = "";
        this.latestNpcMemoryCommandMessage = "";
        clearPendingDebugQuery();

        return {
            stageDirections: null,
            messageState: this.state,
            modifiedMessage: normalized.content,
            systemMessage: this.lastSystemMessage.length > 0 ? this.lastSystemMessage : null,
            error: null,
            chatState: null,
        };
    }

    render(): ReactElement {
        if (!this.debugUiEnabled) {
            return <></>;
        }

        return (
            <AetherNovaDebugPanel
                getSnapshot={() => this.createDebugSnapshot()}
                onApplyCommand={(command) => this.applyUiNpcMemoryCommand(command)}
                onClearLogs={(category) => this.clearDebugEvents(category)}
            />
        );
    }

    private createDebugSnapshot(): DebugSnapshot {
        return {
            state: this.state,
            latestUserMessage: this.latestUserMessage,
            lastStageDirections: this.lastStageDirections,
            lastSystemMessage: this.lastSystemMessage,
            lastModifiedMessageChanged: this.lastModifiedMessageChanged,
            debugEvents: this.debugEvents.slice(),
        };
    }

    private pushDebugEvent(category: DebugCategory, label: string, detail: string, details?: string[]): void {
        this.debugEventId += 1;
        this.debugEvents = [
            {
                id: this.debugEventId,
                at: new Date().toLocaleTimeString(),
                category,
                label,
                detail,
                details: details?.filter((entry) => entry.length > 0),
            },
            ...this.debugEvents,
        ].slice(0, 120);
    }

    private applyUiNpcMemoryCommand(command: string): DebugSnapshot {
        const result = applyNpcMemoryCommands(this.state, command);
        this.state = {
            ...result.state,
            pendingNpcMemoryCommand: result.applied ? command : this.state.pendingNpcMemoryCommand,
        };
        if (result.systemMessage != null) {
            this.lastSystemMessage = result.systemMessage;
        }
        this.pushDebugEvent("npcMemory", "uiMemory", result.systemMessage ?? "No NPC memory command applied.", [`Command: ${command}`]);
        if (result.systemMessage != null) {
            this.pushDebugEvent("system", "uiMemory", "systemMessage returned from debug UI command", [result.systemMessage]);
        }
        return this.createDebugSnapshot();
    }

    private clearDebugEvents(category?: DebugCategory): DebugSnapshot {
        this.debugEvents = category == null
            ? []
            : this.debugEvents.filter((event) => event.category !== category);
        return this.createDebugSnapshot();
    }
}

function AetherNovaDebugPanel({
    getSnapshot,
    onApplyCommand,
    onClearLogs,
}: {
    getSnapshot: () => DebugSnapshot;
    onApplyCommand: (command: string) => DebugSnapshot;
    onClearLogs: (category?: DebugCategory) => DebugSnapshot;
}): ReactElement {
    const [snapshot, setSnapshot] = useState<DebugSnapshot>(() => getSnapshot());
    const npcMemoryEntries = Object.values(snapshot.state.npcMemory ?? {});
    const [editingName, setEditingName] = useState<string | null>(null);
    const [draft, setDraft] = useState<NpcMemoryDraft>(emptyNpcMemoryDraft());

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setSnapshot(getSnapshot());
        }, 500);

        return () => window.clearInterval(intervalId);
    }, [getSnapshot]);

    return (
        <main className="aether-debug-shell">
            <header className="aether-debug-header">
                <div>
                    <p className="aether-debug-kicker">Aether Nova Stage</p>
                    <h1>Debug UI <span>{DEBUG_UI_VERSION}</span></h1>
                </div>
                <div className="aether-debug-header-actions">
                    <button type="button" onClick={() => setSnapshot(onClearLogs())}>Clear Logs</button>
                    <span className={snapshot.lastModifiedMessageChanged ? "aether-debug-pill active" : "aether-debug-pill"}>
                        {snapshot.lastModifiedMessageChanged ? "Modified" : "Idle"}
                    </span>
                </div>
            </header>

            <section className="aether-debug-grid" aria-label="Current header state">
                <DebugMetric label="Location" value={`${snapshot.state.location} | ${snapshot.state.timeOfDay} | ${snapshot.state.clock}`} />
                <DebugMetric label="You" value={snapshot.state.you} />
                <DebugMetric label="NPC" value={snapshot.state.npc} />
                <DebugMetric label="Thread" value={snapshot.state.thread} />
                <DebugMetric label="Wallet" value={snapshot.state.wallet} />
                <DebugMetric label="Pending NPC Debug" value={snapshot.state.pendingNpcDebugQuery ?? "None"} />
                <DebugMetric label="Pending Memory Command" value={snapshot.state.pendingNpcMemoryCommand ?? "None"} />
            </section>

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
                        {npcMemoryEntries.map((entry) => (
                            <article className="aether-debug-memory-card" key={entry.name}>
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
                                            const command = npcMemorySetCommand(draft, entry.name);
                                            if (command == null) {
                                                return;
                                            }
                                            setSnapshot(onApplyCommand(command));
                                            setEditingName(null);
                                            setDraft(emptyNpcMemoryDraft());
                                        }}
                                    />
                                ) : (
                                    <>
                                        <div className="aether-debug-card-header">
                                            <h3>{entry.name}</h3>
                                            <div className="aether-debug-card-actions">
                                                <button type="button" onClick={() => {
                                                    setEditingName(entry.name);
                                                    setDraft(draftFromNpcMemory(entry));
                                                }}>Edit</button>
                                                <button type="button" onClick={() => setSnapshot(onApplyCommand(`npc memory clearfacts: ${entry.name}`))}>Clear Facts</button>
                                                <button className="danger" type="button" onClick={() => {
                                                    setSnapshot(onApplyCommand(`npc memory delete: ${entry.name}`));
                                                    if (editingName === entry.name) {
                                                        setEditingName(null);
                                                        setDraft(emptyNpcMemoryDraft());
                                                    }
                                                }}>Delete</button>
                                            </div>
                                        </div>
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
                            </article>
                        ))}
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
                    onClear();
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

function emptyNpcMemoryDraft(): NpcMemoryDraft {
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

function draftFromNpcMemory(entry: NpcMemoryEntry): NpcMemoryDraft {
    return {
        name: entry.name,
        roleTitle: entry.roleTitle,
        race: entry.race,
        physicalExtra: entry.physicalExtra,
        currentMood: entry.currentMood,
        lastInteractionTone: entry.lastInteractionTone ?? "",
        behaviorTowardUserText: entry.behaviorTowardUser.join(", "),
        behaviorScoresText: Object.entries(entry.behaviorScores).map(([label, score]) => `${label}: ${score}`).join("; "),
        relationshipWithUserText: entry.relationshipWithUser.join(", "),
        relationshipEventsText: entry.relationshipEvents.join("; "),
        onlyKnowsText: entry.onlyKnows.join("; "),
    };
}

function npcMemorySetCommand(draft: NpcMemoryDraft, targetName: string = draft.name): string | null {
    const name = cleanDebugValue(draft.name);
    const target = cleanDebugValue(targetName || draft.name);
    if (name.length === 0 || target.length === 0) {
        return null;
    }

    return [
        `npc memory set: ${target}`,
        `name=${name}`,
        `role=${cleanDebugValue(draft.roleTitle) || "Unknown role/title"}`,
        `race=${cleanDebugValue(draft.race) || "Unknown"}`,
        `physical=${cleanDebugValue(draft.physicalExtra) || "none"}`,
        `mood=${cleanDebugValue(draft.currentMood) || "unknown"}`,
        `tone=${cleanDebugValue(draft.lastInteractionTone)}`,
        `behavior=${cleanDebugList(draft.behaviorTowardUserText)}`,
        `behaviorScores=${cleanDebugScoreMap(draft.behaviorScoresText)}`,
        `relationship=${cleanDebugList(draft.relationshipWithUserText) || "stranger"}`,
        `event=${cleanDebugFacts(draft.relationshipEventsText)}`,
        `onlyKnows=${cleanDebugFacts(draft.onlyKnowsText)}`,
    ].join(" | ");
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
            const match = /^([A-Za-z][A-Za-z -]{1,40})\s*(?:=|:|\s)\s*([+-]?\d+)$/i.exec(entry);
            return match == null ? "" : `${match[1].trim()}:${match[2]}`;
        })
        .filter(Boolean)
        .join("; ");
}

function formatDebugList(values: string[], fallback: string): string {
    return values.length > 0 ? values.join(", ") : fallback;
}

function formatDebugScores(scores: Record<string, number>): string {
    const entries = Object.entries(scores)
        .filter(([_label, score]) => score > 0)
        .sort((left, right) => right[1] - left[1]);

    return entries.length > 0 ? entries.map(([label, score]) => `${label}:${score}`).join(", ") : "none";
}

function headerStateChangeDetails(previous: AetherNovaMessageState, next: AetherNovaMessageState): string[] {
    const details = [
        formatDebugFieldChange("Location", previous.location, next.location),
        formatDebugFieldChange("Time", `${previous.timeOfDay} | ${previous.clock}`, `${next.timeOfDay} | ${next.clock}`),
        formatDebugFieldChange("You", previous.you, next.you),
        formatDebugFieldChange("NPC", previous.npc, next.npc),
        formatDebugFieldChange("Thread", previous.thread, next.thread),
        formatDebugFieldChange("Wallet", previous.wallet, next.wallet),
    ].filter(Boolean);

    return details.length > 0 ? details : ["No tracked header field changed."];
}

function narrativeFormatDetails(originalContent: string, normalizedContent: string, changedFields: string[]): string[] {
    return [
        `Original chars: ${originalContent.length}`,
        `Normalized chars: ${normalizedContent.length}`,
        normalizedContent !== originalContent
            ? "Modified message returned to chat. This can include header repair, narrative italics, speaker labels, or quote/action cleanup."
            : "No modified message returned.",
        changedFields.length > 0
            ? `Stage state changed too: ${changedFields.join(", ")}`
            : "Stage state did not change.",
    ];
}

function npcMemoryChangeDetails(previous: AetherNovaMessageState["npcMemory"], next: AetherNovaMessageState["npcMemory"]): string[] {
    const previousKeys = Object.keys(previous ?? {});
    const nextKeys = Object.keys(next ?? {});
    const added = nextKeys.filter((key) => previous?.[key] == null).map((key) => next[key].name);
    const removed = previousKeys.filter((key) => next?.[key] == null).map((key) => previous[key].name);
    const changed = nextKeys
        .filter((key) => previous?.[key] != null && JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
        .map((key) => next[key].name);
    const details = [
        added.length > 0 ? `Added: ${added.join(", ")}` : "",
        removed.length > 0 ? `Removed: ${removed.join(", ")}` : "",
        changed.length > 0 ? `Changed: ${changed.join(", ")}` : "",
    ].filter(Boolean);

    return details.length > 0 ? details : ["NPC memory unchanged."];
}

function walletThreadSummary(previous: AetherNovaMessageState, next: AetherNovaMessageState): string {
    const walletChanged = previous.wallet !== next.wallet;
    const threadChanged = previous.thread !== next.thread;

    if (walletChanged && threadChanged) {
        return "wallet and thread changed";
    }
    if (walletChanged) {
        return "wallet changed";
    }
    if (threadChanged) {
        return "thread changed";
    }
    return "wallet and thread unchanged";
}

function walletThreadDetails(previous: AetherNovaMessageState, next: AetherNovaMessageState): string[] {
    const details = [
        formatDebugFieldChange("Wallet", previous.wallet, next.wallet),
        formatDebugFieldChange("Thread", previous.thread, next.thread),
    ].filter(Boolean);

    return details.length > 0 ? details : ["No wallet/thread change accepted."];
}

function formatDebugFieldChange(label: string, previous: string, next: string): string {
    return previous === next ? "" : `${label}: ${previous} -> ${next}`;
}

function countNpcMemory(state: AetherNovaMessageState): number {
    return Object.keys(state.npcMemory ?? {}).length;
}

function changedStateFields(previous: AetherNovaMessageState, next: AetherNovaMessageState): string[] {
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

    if (JSON.stringify(previous.npcMemory ?? {}) !== JSON.stringify(next.npcMemory ?? {})) {
        changed.push("npcMemory");
    }

    return changed;
}

function joinSystemMessages(...messages: Array<string | null | undefined>): string {
    return messages.map((message) => message ?? "").filter((message) => message.length > 0).join("\n");
}

function writePendingDebugQuery(query: string): void {
    try {
        window.localStorage.setItem(DEBUG_STORAGE_KEY, query);
    } catch {
        // Debug fallback only; ignore storage failures.
    }
}

function readPendingDebugQuery(): string | null {
    try {
        const value = window.localStorage.getItem(DEBUG_STORAGE_KEY);
        return value == null || value.trim().length === 0 ? null : value.trim();
    } catch {
        return null;
    }
}

function clearPendingDebugQuery(): void {
    try {
        window.localStorage.removeItem(DEBUG_STORAGE_KEY);
    } catch {
        // Debug fallback only; ignore storage failures.
    }
}
