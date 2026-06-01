import type {AetherNovaMessageState} from "../types";
import {HEADER_DIVIDER} from "../constants";

export function formatHeader(state: AetherNovaMessageState): string {
    return [
        `**${state.location} | ${state.timeOfDay} | ${state.clock}**`,
        `**You: ${state.you}**`,
        `**NPC: ${state.npc}**`,
        `**Thread: ${state.thread}**`,
        `**Wallet: ${state.wallet}**`,
        HEADER_DIVIDER,
    ].join("\n");
}
