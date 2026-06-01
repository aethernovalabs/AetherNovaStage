import type {NarrativeFormatState} from "../types";
import {cleanFragment, sameText} from "../utils/text";
import {escapeRegExp} from "../utils/regex";
import {
    stripOuterSingleItalic,
    looksLikeInlineNarrationBeat,
    speakerNameFromMention,
    cleanSpeakerName,
    isValidSpeakerName,
    isSimpleSpeakerName,
    isCommonNarrativeSubject,
} from "./italicRules";

function isQuotedDialogueText(value: string): boolean {
    return value.trim().startsWith("\"");
}

export function isDialoguePayloadText(value: string): boolean {
    const clean = value.trim();

    return isQuotedDialogueText(clean)
        || /^'[^'\n]{2,180}'\s+"/.test(clean)
        || /^\*[^*\n]{2,180}\*\s+"/.test(clean)
        || /".{2,}"/.test(clean);
}

export function parseDialogueLine(line: string): {speaker: string; text: string; bold: boolean} | null {
    const boldColon = line.match(/^\*\*([^*\n:]{1,80}):\*\*\s*(.*)$/);
    if (boldColon != null && isValidSpeakerName(boldColon[1])) {
        return {speaker: cleanSpeakerName(boldColon[1]), text: boldColon[2].trim(), bold: true};
    }

    const boldNameColon = line.match(/^\*\*([^*\n:]{1,80})\*\*:\s*(.*)$/);
    if (boldNameColon != null && isValidSpeakerName(boldNameColon[1])) {
        return {speaker: cleanSpeakerName(boldNameColon[1]), text: boldNameColon[2].trim(), bold: true};
    }

    const plainColon = line.match(/^([^:"\n]{1,80}):\s*(.*)$/);
    if (plainColon != null && isValidSpeakerName(plainColon[1])) {
        const speaker = cleanSpeakerName(plainColon[1]);
        const text = plainColon[2].trim();

        if (isDialoguePayloadText(text) || isSimpleSpeakerName(speaker)) {
            return {speaker, text, bold: false};
        }
    }

    const missingColon = line.match(/^([A-Z][A-Za-z0-9'._ -]{0,60})\s+(".*)$/);
    if (missingColon != null && isValidSpeakerName(missingColon[1]) && !isCommonNarrativeSubject(missingColon[1])) {
        return {speaker: cleanSpeakerName(missingColon[1]), text: missingColon[2].trim(), bold: false};
    }

    return null;
}

export function normalizeDialogueLine(line: string): string | null {
    const clean = stripOuterSingleItalic(line.trim());
    const parsed = parseDialogueLine(clean);

    if (parsed == null) {
        return null;
    }

    const speaker = parsed.bold ? `**${parsed.speaker}:**` : `${parsed.speaker}:`;
    const text = normalizeDialogueText(parsed.text);

    return text.length === 0 ? speaker : `${speaker} ${text}`;
}

export function normalizeBareDialogueLine(line: string, state: NarrativeFormatState): string | null {
    const clean = stripOuterSingleItalic(line.trim());

    if (!clean.startsWith("\"")) {
        return null;
    }

    const speaker = inferBareDialogueSpeaker(clean, state);

    if (speaker == null) {
        return normalizeDialogueText(clean);
    }

    state.recentSpeaker = speaker;
    return `${speaker}: ${normalizeDialogueText(clean)}`;
}

export function normalizeActionBeatDialogueLine(line: string, state: NarrativeFormatState): string | null {
    const clean = stripOuterSingleItalic(line.trim());

    const firstQuote = clean.indexOf('"');
    if (firstQuote <= 0) return null;

    const before = clean.slice(0, firstQuote).trim();
    const after = clean.slice(firstQuote).trim();

    if (before.length === 0) return null;

    if (before.startsWith("*") && before.endsWith("*")) {
        const inner = before.slice(1, -1).trim();
        if (!looksLikeInlineNarrationBeat(inner)) return null;
        const speaker = inferBareDialogueSpeaker(after, state);
        if (speaker != null) {
            state.recentSpeaker = speaker;
            return `${speaker}: *${inner}* ${normalizeDialogueText(after)}`;
        }
        return `*${inner}* ${normalizeDialogueText(after)}`;
    }

    if (!looksLikeInlineNarrationBeat(before)) return null;
    if (before.startsWith("*") || before.startsWith("'") || before.startsWith('"')) return null;

    const speaker = inferBareDialogueSpeaker(after, state);
    if (speaker != null) {
        state.recentSpeaker = speaker;
        return `${speaker}: *${before}* ${normalizeDialogueText(after)}`;
    }
    return `*${before}* ${normalizeDialogueText(after)}`;
}

export function speakerFromExplicitDialogueLine(line: string): string | null {
    const parsed = parseDialogueLine(stripOuterSingleItalic(line.trim()));
    return parsed == null ? null : parsed.speaker;
}

export function speakerFromDialogueAttribution(line: string, state: NarrativeFormatState): string | null {
    const pattern = /\b([A-Z][A-Za-z'._-]{1,60})\s+(?:says|said|asks|asked|answers|answered|replies|replied|murmurs|murmured|whispers|whispered|mutters|muttered|calls|called|continues|continued)\b/;
    const match = line.match(pattern);

    if (match == null) {
        return null;
    }

    return speakerNameFromMention(match[1], state);
}

export function dialogueHasPronounAttribution(line: string): boolean {
    return /\b(?:he|she|they)\s+(?:says|said|asks|asked|answers|answered|replies|replied|murmurs|murmured|whispers|whispered|mutters|muttered|calls|called|continues|continued)\b/i.test(line);
}

export function inferBareDialogueSpeaker(line: string, state: NarrativeFormatState): string | null {
    const namedSpeaker = speakerFromDialogueAttribution(line, state);

    if (namedSpeaker != null) {
        return namedSpeaker;
    }

    if (dialogueHasPronounAttribution(line) && state.recentSpeaker != null) {
        return state.recentSpeaker;
    }

    if (state.recentSpeaker != null && state.npcNames.includes(state.recentSpeaker)) {
        return state.recentSpeaker;
    }

    return state.npcNames.length === 1 ? state.npcNames[0] : null;
}

export function formatInlineNarrationInDialogue(value: string): string {
    return value.replace(/(^|[\s([{])'([^'\n]{2,180})'(?=$|[\s).,!?:;\]}])/g, (match, prefix: string, inner: string) => {
        const clean = inner.trim();
        return looksLikeInlineNarrationBeat(clean) ? `${prefix}*${clean}*` : match;
    });
}

export function formatPlainActionBeatBetweenDialogue(value: string): string {
    return value.replace(/("\s+)([^"\n*]{2,220}?)(\s+")/g, (match, before: string, beat: string, after: string) => {
        const clean = beat.trim().replace(/\s+/g, " ");
        return looksLikeInlineNarrationBeat(clean) ? `${before}*${clean}*${after}` : match;
    });
}

export function formatLeadingMisquotedActionBeat(value: string): string {
    const match = value.match(/^"\s*'([^'\n]{2,180})'\s*(.*?)"\s*$/);

    if (match == null) {
        return value;
    }

    const beat = match[1].trim();
    const dialogue = match[2].trim();

    if (!looksLikeInlineNarrationBeat(beat)) {
        return value;
    }

    const formattedBeat = `*${beat}*`;
    return dialogue.length === 0 ? formattedBeat : `${formattedBeat} ${formatDialogueRemainder(dialogue)}`;
}

export function formatDialogueRemainder(value: string): string {
    const clean = value.trim();

    if (clean.length === 0) {
        return "";
    }

    if (clean.startsWith("\"")) {
        return clean;
    }

    return `"${clean}"`;
}

export function formatLeadingActionBeatBeforeDialogue(value: string): string {
    const match = value.match(/^\*([^*\n]{2,180})\*\s+(".*)$/);

    if (match == null) {
        return value;
    }

    const beat = match[1].trim();
    const dialogue = match[2].trim();

    return looksLikeInlineNarrationBeat(beat) ? `*${beat}* ${dialogue}` : value;
}

export function wrapLeadingPlainActionBeat(value: string): string {
    const firstQuote = value.indexOf('"');
    if (firstQuote <= 0) {
        return value;
    }

    const before = value.slice(0, firstQuote).trim();
    const after = value.slice(firstQuote);

    if (before.length === 0) {
        return value;
    }

    if (before.startsWith("*") || before.startsWith("'") || before.startsWith('"')) {
        return value;
    }

    if (!looksLikeInlineNarrationBeat(before)) {
        return value;
    }

    return `*${before}* ${after}`;
}

export function normalizeDialogueText(value: string): string {
    const clean = formatPlainActionBeatBetweenDialogue(formatInlineNarrationInDialogue(stripOuterSingleItalic(value.trim())));
    const repaired = formatLeadingMisquotedActionBeat(clean);
    const beatBeforeDialogue = formatLeadingActionBeatBeforeDialogue(repaired);
    const wrapped = wrapLeadingPlainActionBeat(beatBeforeDialogue);

    if (wrapped.length === 0) {
        return "";
    }

    if (wrapped !== beatBeforeDialogue) {
        return wrapped;
    }

    if (wrapped.startsWith("\"") || wrapped.startsWith("*")) {
        return wrapped;
    }

    return `"${wrapped}"`;
}

function lastSpeakerNameIndex(value: string, name: string): number {
    const matches = [...value.matchAll(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"))];
    const last = matches[matches.length - 1];
    return last?.index ?? -1;
}

export function inferRecentSpeakerFromNarrative(narrative: string, state: NarrativeFormatState): string | null {
    let bestSpeaker: string | null = null;
    let bestIndex = -1;

    for (const name of state.npcNames) {
        const index = lastSpeakerNameIndex(narrative, name);

        if (index > bestIndex) {
            bestIndex = index;
            bestSpeaker = name;
        }
    }

    return bestSpeaker;
}
