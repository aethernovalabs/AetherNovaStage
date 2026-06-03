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
    synchronizeLockedThreadItems,
    waitingThreadItemsFromThread,
} from "./aetherNova";
import type {DebugCategory, DebugEvent, DebugSnapshot} from "./aetherNova/ui/types";
import {
    countNpcMemory,
    joinSystemMessages,
    writePendingDebugQuery,
    readPendingDebugQuery,
    clearPendingDebugQuery,
    npcMemoryChangeDetails,
    changedStateFields,
    locationChangeDetails,
    lockedThreadChangeDetails,
    npcLineChangeDetails,
    threadLineChangeDetails,
    timeChangeDetails,
    userStatusChangeDetails,
    walletChangeDetails,
    youLineChangeDetails,
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
        const previousNpcMemory = this.state.npcMemory;
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
            const promptLines = this.lastStageDirections.split("\n");
            this.pushDebugEvent("stagePrompt", "beforePrompt", `${promptLines.length} lines, ${this.lastStageDirections.length} chars`, [this.lastStageDirections]);
        }
        if (JSON.stringify(previousNpcMemory ?? {}) !== JSON.stringify(this.state.npcMemory ?? {})) {
            this.pushDebugEvent(
                "npcMemory",
                "beforePrompt",
                `NPC memory ${previousNpcMemoryCount} -> ${countNpcMemory(this.state)}`,
                npcMemoryChangeDetails(previousNpcMemory, this.state.npcMemory),
            );
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
        this.pushDebugEvent(
            "lifecycle",
            "afterResponse",
            `response ${this.lastModifiedMessageChanged ? "modified" : "unchanged"}; changed: ${changedFields.length > 0 ? changedFields.join(", ") : "none"}; NPC memory ${previousNpcMemoryCount} -> ${countNpcMemory(this.state)}; memory command reapply ${afterResponseCommand?.applied === true ? "yes" : "no"}; system debug ${this.lastSystemMessage.length > 0 ? "sent" : "none"}`,
        );
        this.pushFieldChange(
            "location",
            "afterResponse",
            "Location",
            previousState.location,
            this.state.location,
            locationChangeDetails(previousState.location, this.state.location),
        );
        this.pushFieldChange(
            "time",
            "afterResponse",
            "Time",
            `${previousState.timeOfDay} | ${previousState.clock}`,
            `${this.state.timeOfDay} | ${this.state.clock}`,
            timeChangeDetails(previousState.timeOfDay, previousState.clock, this.state.timeOfDay, this.state.clock),
        );
        const youDetails = [
            ...youLineChangeDetails(previousState.you, this.state.you),
            ...userStatusChangeDetails(previousState.userStatus, this.state.userStatus),
        ];
        const npcDetails = npcLineChangeDetails(previousState.npc, this.state.npc);
        this.pushFieldChange(
            "youLine",
            "afterResponse",
            "You",
            previousState.you,
            this.state.you,
            youDetails,
        );
        this.pushFieldChange("npcLine", "afterResponse", "NPC", previousState.npc, this.state.npc, npcDetails);
        this.pushFieldChange(
            "threadLine",
            "afterResponse",
            "Thread",
            previousState.thread,
            this.state.thread,
            [
                ...threadLineChangeDetails(previousState.thread, this.state.thread),
                ...lockedThreadChangeDetails(previousState.lockedThreadItems, this.state.lockedThreadItems),
            ],
        );
        this.pushFieldChange(
            "walletLine",
            "afterResponse",
            "Wallet",
            previousState.wallet,
            this.state.wallet,
            walletChangeDetails(previousState.wallet, this.state.wallet),
        );
        if (this.lastModifiedMessageChanged) {
            this.pushDebugEvent(
                "narrative",
                "afterResponse",
                `response modified; chars ${botMessage.content.length} -> ${normalized.content.length}`,
                [
                    `Original chars: ${botMessage.content.length}`,
                    `Normalized chars: ${normalized.content.length}`,
                    changedFields.length > 0 ? `State changed: ${changedFields.join(", ")}` : "State did not change.",
                ],
            );
        }
        if (JSON.stringify(previousNpcMemory ?? {}) !== JSON.stringify(this.state.npcMemory ?? {})) {
            this.pushDebugEvent(
                "npcMemory",
                "afterResponse",
                `NPC memory ${previousNpcMemoryCount} -> ${countNpcMemory(this.state)}`,
                npcMemoryChangeDetails(previousNpcMemory, this.state.npcMemory),
            );
        }
        this.latestUserMessage = "";
        this.latestNpcMemoryCommandMessage = "";
        clearPendingDebugQuery();

        return {
            stageDirections: null,
            messageState: this.state,
            modifiedMessage: this.lastModifiedMessageChanged ? normalized.content : null,
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
        const nextThread = statePatch.thread ?? this.state.thread;
        const lockedWaitingThreads = statePatch.thread != null
            ? waitingThreadItemsFromThread(statePatch.thread)
            : this.state.lockedWaitingThreads;
        const terminalThreadGraceItems = statePatch.thread != null
            ? []
            : this.state.terminalThreadGraceItems;
        const lockedThreadItems = statePatch.lockedThreadItems != null
            ? synchronizeLockedThreadItems(nextThread, statePatch.lockedThreadItems)
            : statePatch.thread != null
                ? synchronizeLockedThreadItems(nextThread, this.state.lockedThreadItems ?? [])
                : this.state.lockedThreadItems;
        this.state = {
            ...this.state,
            ...statePatch,
            lockedWaitingThreads,
            lockedThreadItems,
            terminalThreadGraceItems,
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

    private pushFieldChange(
        category: DebugCategory,
        label: string,
        fieldName: string,
        previous: string,
        next: string,
        extraDetails?: string[],
    ): void {
        if (previous === next && (extraDetails == null || extraDetails.length === 0)) {
            return;
        }

        this.pushDebugEvent(
            category,
            label,
            `${fieldName} changed`,
            [
                `Before: ${previous}`,
                `After: ${next}`,
                ...(extraDetails ?? []),
            ],
        );
    }

    private applyUiNpcMemoryCommand(command: string): DebugSnapshot {
        const previousNpcMemory = this.state.npcMemory;
        const result = applyNpcMemoryCommands(this.state, command);
        this.state = {
            ...result.state,
            pendingNpcMemoryCommand: result.applied ? command : this.state.pendingNpcMemoryCommand,
        };
        if (result.systemMessage != null) {
            this.lastSystemMessage = result.systemMessage;
        }
        if (JSON.stringify(previousNpcMemory ?? {}) !== JSON.stringify(this.state.npcMemory ?? {})) {
            this.pushDebugEvent("npcMemory", "uiMemory", result.systemMessage ?? "NPC memory changed.", [`Command: ${command}`]);
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
