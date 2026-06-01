import type {AetherNovaMessageState, NarrativeFormatState} from "../types";
import {normalizeLineEndings} from "../utils/text";
import {npcSpeakerNamesFromState} from "../npcMemory/npcMemoryState";
import {
    normalizeDialogueLine,
    normalizeBareDialogueLine,
    normalizeActionBeatDialogueLine,
    inferRecentSpeakerFromNarrative,
    speakerFromExplicitDialogueLine,
} from "./dialogueFormatter";
import {
    replaceInlineEmphasis,
    stripOuterSingleItalic,
} from "./italicRules";

function normalizeNarrativeLine(line: string, state: NarrativeFormatState): string {
    const clean = line.trim();

    if (clean.length === 0) {
        return "";
    }

    const dialogue = normalizeDialogueLine(clean);
    if (dialogue != null) {
        state.recentSpeaker = speakerFromExplicitDialogueLine(clean) ?? state.recentSpeaker;
        return dialogue;
    }

    const inferredDialogue = normalizeBareDialogueLine(clean, state);
    if (inferredDialogue != null) {
        return inferredDialogue;
    }

    const actionDialogue = normalizeActionBeatDialogueLine(clean, state);
    if (actionDialogue != null) {
        return actionDialogue;
    }

    const content = replaceInlineEmphasis(stripOuterSingleItalic(clean));
    state.recentSpeaker = inferRecentSpeakerFromNarrative(content, state) ?? state.recentSpeaker;
    return content.length === 0 ? "" : `*${content}*`;
}

function normalizeNarrativeBlock(block: string, state: NarrativeFormatState): string {
    return block
        .split("\n")
        .map((line) => normalizeNarrativeLine(line, state))
        .filter((line) => line.length > 0)
        .join("\n");
}

export function normalizeNarrativeFormat(narrative: string, state: AetherNovaMessageState): string {
    const clean = normalizeLineEndings(narrative).trim();

    if (clean.length === 0) {
        return "";
    }

    const formatState: NarrativeFormatState = {
        npcNames: npcSpeakerNamesFromState(state.npc),
        recentSpeaker: null,
    };

    return clean
        .split(/\n{2,}/)
        .map((block) => normalizeNarrativeBlock(block, formatState))
        .filter((block) => block.length > 0)
        .join("\n\n");
}
