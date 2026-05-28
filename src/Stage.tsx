import {ReactElement} from "react";
import {InitialData, LoadResponse, Message, StageBase, StageResponse} from "@chub-ai/stages-ts";
import {
    AetherNovaMessageState,
    buildStageDirections,
    coerceHeaderState,
    createInitialHeaderState,
    normalizeAetherNovaResponse,
} from "./aetherNovaHeader";

type MessageStateType = AetherNovaMessageState;
type ConfigType = Record<string, never>;
type InitStateType = Record<string, never>;
type ChatStateType = Record<string, never>;

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
        const normalized = normalizeAetherNovaResponse(botMessage.content, this.state, this.latestUserMessage);
        this.state = normalized.state;
        this.latestUserMessage = "";

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
