import {ReactElement} from "react";
import {InitialData, LoadResponse, Message, StageBase, StageResponse} from "@chub-ai/stages-ts";
import {
    AetherNovaMessageState,
    buildStageDirections,
    coerceHeaderState,
    createInitialHeaderState,
    debugNpcQuery,
    normalizeAetherNovaResponse,
    prepareAetherNovaStateForPrompt,
} from "./aetherNovaHeader";

type MessageStateType = AetherNovaMessageState;
type ConfigType = Record<string, never>;
type InitStateType = Record<string, never>;
type ChatStateType = Record<string, never>;
const DEBUG_STORAGE_KEY = "aether-nova-stage.pendingNpcDebugQuery";

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    private state: AetherNovaMessageState;
    private latestUserMessage: string;

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
        this.state = createInitialHeaderState(data.characters, data.messageState);
        this.latestUserMessage = "";
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {
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
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        this.latestUserMessage = userMessage.content;
        const debugQuery = debugNpcQuery(this.latestUserMessage);
        if (debugQuery != null) {
            writePendingDebugQuery(debugQuery);
        }
        this.state = prepareAetherNovaStateForPrompt(this.state, this.latestUserMessage);

        return {
            stageDirections: buildStageDirections(this.state, this.latestUserMessage),
            messageState: this.state,
            modifiedMessage: null,
            systemMessage: null,
            error: null,
            chatState: null,
        };
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const storedDebugQuery = this.state.pendingNpcDebugQuery ?? readPendingDebugQuery();
        if (storedDebugQuery != null) {
            this.state = {
                ...this.state,
                pendingNpcDebugQuery: storedDebugQuery,
            };
        }

        const normalized = normalizeAetherNovaResponse(botMessage.content, this.state, this.latestUserMessage);
        this.state = normalized.state;
        this.latestUserMessage = "";
        clearPendingDebugQuery();

        return {
            stageDirections: null,
            messageState: this.state,
            modifiedMessage: normalized.content,
            systemMessage: null,
            error: null,
            chatState: null,
        };
    }

    render(): ReactElement {
        return <></>;
    }
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
