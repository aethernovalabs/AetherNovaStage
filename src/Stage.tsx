import {ReactElement, useEffect, useState} from "react";
import {InitialData, LoadResponse, Message, StageBase, StageResponse} from "@chub-ai/stages-ts";
import {
    AetherNovaMessageState,
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
const DEBUG_UI_VERSION = "V1.2";

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
        const commandResult = applyNpcMemoryCommands(preparedState, originalUserMessage);

        this.state = commandResult.state;
        this.latestUserMessage = commandResult.cleanedMessage;
        this.latestNpcMemoryCommandMessage = commandResult.applied ? originalUserMessage : "";
        this.state = {
            ...this.state,
            pendingNpcMemoryCommand: commandResult.applied ? originalUserMessage : null,
        };
        if (commandResult.systemMessage != null) {
            this.lastSystemMessage = commandResult.systemMessage;
        }
        this.lastStageDirections = buildStageDirections(this.state, this.latestUserMessage);
        this.pushDebugEvent(
            "beforePrompt",
            `directions injected (${this.lastStageDirections.length} chars); debug request: ${debugQuery ?? "none"}; memory command: ${commandResult.applied ? "applied" : "none"}`,
        );

        return {
            stageDirections: this.lastStageDirections,
            messageState: this.state,
            modifiedMessage: commandResult.cleanedMessage !== originalUserMessage ? commandResult.cleanedMessage : null,
            systemMessage: commandResult.systemMessage,
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

        return <AetherNovaDebugPanel getSnapshot={() => this.createDebugSnapshot()} />;
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
}

function AetherNovaDebugPanel({getSnapshot}: {getSnapshot: () => DebugSnapshot}): ReactElement {
    const [snapshot, setSnapshot] = useState<DebugSnapshot>(() => getSnapshot());
    const npcMemoryEntries = Object.values(snapshot.state.npcMemory ?? {});

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
                    <code>~npc memory delete: Debi~</code>
                    <code>~npc memory clearfacts: Debi~</code>
                    <code>~npc memory set: Debi | role=Market broker | racial=Human | relationship=guarded | fact={"{{user}}"} paid Kaelen to find Debi~</code>
                </div>
                {npcMemoryEntries.length === 0 ? (
                    <p className="aether-debug-empty">No NPC memory stored yet.</p>
                ) : (
                    <div className="aether-debug-memory-list">
                        {npcMemoryEntries.map((entry) => (
                            <article className="aether-debug-memory-card" key={entry.name}>
                                <h3>{entry.name}</h3>
                                <dl>
                                    <DebugDetail label="Role" value={entry.roleTitle} />
                                    <DebugDetail label="Racial" value={entry.racial} />
                                    <DebugDetail label="Relationship" value={entry.relationship} />
                                </dl>
                                <p className="aether-debug-facts-label">KnownFacts</p>
                                {entry.knownFacts.length === 0 ? (
                                    <p className="aether-debug-empty compact">None</p>
                                ) : (
                                    <ul>
                                        {entry.knownFacts.map((fact) => <li key={fact}>{fact}</li>)}
                                    </ul>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className="aether-debug-section">
                <div className="aether-debug-section-title">
                    <h2>Stage Activity</h2>
                    <span>{snapshot.debugEvents.length}</span>
                </div>
                <ol className="aether-debug-events">
                    {snapshot.debugEvents.map((event) => (
                        <li key={event.id}>
                            <time>{event.at}</time>
                            <strong>{event.label}</strong>
                            <span>{event.detail}</span>
                        </li>
                    ))}
                </ol>
            </section>

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
