import type {NarrativeFormatState} from "../types";
import {cleanFragment, sameText} from "../utils/text";

export function cleanSpeakerName(value: string): string {
    return cleanFragment(value).replace(/:$/, "");
}

export function stripOuterSingleItalic(value: string): string {
    const clean = value.trim();

    if (clean.startsWith("*") && clean.endsWith("*") && !clean.startsWith("**") && !clean.endsWith("**")) {
        return clean.slice(1, -1).trim();
    }

    return clean;
}

export function replaceInlineEmphasis(value: string): string {
    return value.replace(/(^|[^*])\*([^*\n]{1,80})\*(?!\*)/g, (_match, prefix: string, inner: string) => {
        const clean = inner.trim();
        return clean.length > 0 ? `${prefix}'${clean}'` : _match;
    });
}

export function isCommonNarrativeSubject(value: string): boolean {
    return /^(he|she|they|it|you|i|we|the|a|an|his|her|their)$/i.test(cleanSpeakerName(value));
}

export function isSimpleSpeakerName(value: string): boolean {
    const clean = cleanSpeakerName(value);

    return clean === "{{char}}" || clean === "{{user}}" || !/\s/.test(clean);
}

export function isValidSpeakerName(value: string): boolean {
    const clean = cleanSpeakerName(value);

    if (clean.length === 0 || clean.length > 80 || /[.!?]/.test(clean)) {
        return false;
    }

    return clean === "{{char}}"
        || clean === "{{user}}"
        || /^[A-Z][A-Za-z0-9'._ -]*(?:\s+\{\{user\}\})?$/.test(clean);
}

function inlineNarrationStartsLikeBeat(value: string): boolean {
    return /^(?:he|she|they|it|his|her|their|the|yume)\b/i.test(value)
        || /^[A-Z][A-Za-z'._-]*\b/.test(value);
}

function inlineNarrationHasBeatAction(value: string): boolean {
    return /\b(?:lip|lips|mouth|smile|smiles|smiled|grin|grins|grinned|eye|eyes|gaze|tail|tails|ear|ears|hand|hands|finger|fingers|arm|arms|shoulder|shoulders|head|face|cheek|cheeks|coin|coins|grunt|grunts|grunted|nod|nods|nodded|tilt|tilts|tilted|curve|curves|curved|catch|catches|caught|catching|glance|glances|glanced|look|looks|looked|turn|turns|turned|step|steps|stepped|breath|breathes|breathed|sigh|sighs|sighed|voice|posture)\b/i.test(value);
}

function inlineNarrationStartsWithActionVerb(value: string): boolean {
    return /^(?:catching|taking|grabbing|holding|watching|looking|glancing|turning|stepping|walking|nodding|smiling|grinning|sighing|breathing|leaning|standing|sitting|kneeling|raising|lowering|flicking|tossing|throwing|placing)\b/i.test(value);
}

export function looksLikeInlineNarrationBeat(value: string): boolean {
    const clean = cleanFragment(value);
    const words = clean.split(/\s+/).filter(Boolean);

    if (words.length < 2) {
        return false;
    }

    return inlineNarrationStartsLikeBeat(clean)
        || inlineNarrationStartsWithActionVerb(clean)
        || inlineNarrationHasBeatAction(clean);
}

export function speakerNameFromMention(value: string, state: NarrativeFormatState): string | null {
    const clean = cleanSpeakerName(value);

    return state.npcNames.find((name) => sameText(name, clean)) ?? null;
}
