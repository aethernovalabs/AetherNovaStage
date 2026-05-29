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
const DEBUG_UI_VERSION = "V1.5";

interface DebugEvent {
    id: number;
    at: string;
    label: string;
    detail: string;
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
    relationship: string;
    behavior: string;
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
        this.pushDebugEvent("init", `state ready; ${countNpcMemory(this.state)} NPC memory entries`);
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {
        this.pushDebugEvent("load", `messageState loaded; debug UI ${this.debugUiEnabled ? "enabled" : "disabled"}`);

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
        this.pushDebugEvent("setState", `branch/swipe state restored; ${countNpcMemory(this.state)} NPC memory entries`);
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const originalUserMessage = userMessage.content;
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
            "beforePrompt",
            `directions injected (${this.lastStageDirections.length} chars); debug request: ${debugQuery ?? "none"}; memory command: ${pendingMemoryCommand != null ? "pending" : "none"}`,
        );

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
        this.pushDebugEvent(
            "afterResponse",
            `response ${this.lastModifiedMessageChanged ? "modified" : "unchanged"}; changed: ${changedFields.length > 0 ? changedFields.join(", ") : "none"}; NPC memory ${previousNpcMemoryCount} -> ${countNpcMemory(this.state)}; memory command reapply ${afterResponseCommand?.applied === true ? "yes" : "no"}; system debug ${this.lastSystemMessage.length > 0 ? "sent" : "none"}`,
        );
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

    private pushDebugEvent(label: string, detail: string): void {
        this.debugEventId += 1;
        this.debugEvents = [
            {
                id: this.debugEventId,
                at: new Date().toLocaleTimeString(),
                label,
                detail,
            },
            ...this.debugEvents,
        ].slice(0, 30);
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
        this.pushDebugEvent("uiMemory", result.systemMessage ?? "No NPC memory command applied.");
        return this.createDebugSnapshot();
    }
}

function AetherNovaDebugPanel({
    getSnapshot,
    onApplyCommand,
}: {
    getSnapshot: () => DebugSnapshot;
    onApplyCommand: (command: string) => DebugSnapshot;
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
                <span className={snapshot.lastModifiedMessageChanged ? "aether-debug-pill active" : "aether-debug-pill"}>
                    {snapshot.lastModifiedMessageChanged ? "Modified" : "Idle"}
                </span>
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
                    <code>npc memory add fact: Debi | fact={'{{user}}'} paid Kaelen to find Debi</code>
                    <code>npc memory relation: Debi | relationship=friendly</code>
                    <code>npc memory show: Debi</code>
                    <code>npc memory set: Debi | role=Market broker | race=Human | physical=none | relationship=guarded | behavior=guarded | onlyKnows={'{{user}}'} paid Kaelen to find Debi</code>
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
                                            <DebugDetail label="Relationship" value={entry.relationship} />
                                            <DebugDetail label="Behavior" value={entry.behavior} />
                                        </dl>
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

            <details className="aether-debug-details" open>
                <summary>Stage Activity <span className="aether-debug-summary-badge">{snapshot.debugEvents.length}</span></summary>
                <ol className="aether-debug-events">
                    {snapshot.debugEvents.map((event) => (
                        <li key={event.id}>
                            <time>{event.at}</time>
                            <strong>{event.label}</strong>
                            <span>{event.detail}</span>
                        </li>
                    ))}
                </ol>
            </details>

            <details className="aether-debug-details">
                <summary>Stage Directions</summary>
                <pre>{snapshot.lastStageDirections || "No stage directions captured yet."}</pre>
            </details>

            <details className="aether-debug-details">
                <summary>System Debug Message</summary>
                <pre>{snapshot.lastSystemMessage || "No system debug message captured yet."}</pre>
            </details>

            <details className="aether-debug-details">
                <summary>Latest User Message</summary>
                <pre>{snapshot.latestUserMessage || "No pending user message."}</pre>
            </details>
        </main>
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
                Relationship
                <input value={draft.relationship} onChange={(event) => onChange({...draft, relationship: event.target.value})} />
            </label>
            <label>
                Behavior
                <input value={draft.behavior} onChange={(event) => onChange({...draft, behavior: event.target.value})} />
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
        relationship: "",
        behavior: "",
        onlyKnowsText: "",
    };
}

function draftFromNpcMemory(entry: NpcMemoryEntry): NpcMemoryDraft {
    return {
        name: entry.name,
        roleTitle: entry.roleTitle,
        race: entry.race,
        physicalExtra: entry.physicalExtra,
        relationship: entry.relationship,
        behavior: entry.behavior,
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
        `relationship=${cleanDebugValue(draft.relationship) || "Unknown"}`,
        `behavior=${cleanDebugValue(draft.behavior) || "Unknown"}`,
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
