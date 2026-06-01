import type {ReactElement} from "react";
import {InitialData, LoadResponse, Message, StageBase, StageResponse} from "@chub-ai/stages-ts";
import type {AetherNovaMessageState, UserStatusState} from "./aetherNova";
import {
    applyNpcMemoryCommands,
    buildStageDirections,
    coerceHeaderState,
    createInitialHeaderState,
    debugNpcQuery,
    normalizeAetherNovaResponse,
    prepareAetherNovaStateForPrompt,
} from "./aetherNova";
import type {DebugCategory, DebugEvent, DebugSnapshot} from "./aetherNova/ui/types";
import {
    countNpcMemory,
    joinSystemMessages,
    writePendingDebugQuery,
    readPendingDebugQuery,
    clearPendingDebugQuery,
    headerStateChangeDetails,
    narrativeFormatDetails,
    npcMemoryChangeDetails,
    walletThreadSummary,
    walletThreadDetails,
    changedStateFields,
    deepMergeUserStatus,
} from "./aetherNova/ui/debugUtils";
import {AetherNovaDebugPanel} from "./aetherNova/ui/DebugPanel";

type MessageStateType = AetherNovaMessageState;
type ConfigType = {
    debugUi?: boolean;
};
type InitStateType = Record<string, never>;
type ChatStateType = Record<string, never>;

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
        if (this.lastStageDirections.length > 0) {
            const injectionLines = this.lastStageDirections.split("\n");
            const summary = injectionLines.length > 0 ? injectionLines[0] : "";
            this.pushDebugEvent("injection", "stageDirections", `${injectionLines.length} lines, ${this.lastStageDirections.length} chars`, [this.lastStageDirections]);
        }
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
                onStateEdit={(patch) => this.applyStateEdit(patch)}
            />
        );
    }

    private applyStateEdit(patch: Partial<AetherNovaMessageState & {userStatusPatch?: Partial<UserStatusState>}>): DebugSnapshot {
        const {userStatusPatch, ...statePatch} = patch;
        this.state = {
            ...this.state,
            ...statePatch,
            manualEditOverrides: {
                ...(this.state.manualEditOverrides ?? {}),
                ...(statePatch.location != null ? {location: statePatch.location} : {}),
                ...(statePatch.you != null ? {you: statePatch.you} : {}),
                ...(statePatch.npc != null ? {npc: statePatch.npc} : {}),
                ...(statePatch.thread != null ? {thread: statePatch.thread} : {}),
                ...(statePatch.wallet != null ? {wallet: statePatch.wallet} : {}),
            },
            userStatus: userStatusPatch
                ? deepMergeUserStatus(this.state.userStatus, userStatusPatch)
                : this.state.userStatus,
        };
        this.pushDebugEvent("lifecycle", "uiEdit", `Manual edit applied: ${Object.keys(patch).join(", ")}`);
        return this.createDebugSnapshot();
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

