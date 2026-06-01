import {normalizeLineEndings} from "./text";

export function stripDoubleQuotedText(value: string): string {
    let result = "";
    let inQuote = false;

    for (const char of value) {
        if (char === "\"" || char === "\u201C" || char === "\u201D") {
            inQuote = !inQuote;
            result += " ";
            continue;
        }

        if (!inQuote) {
            result += char;
        }
    }

    return result;
}

export function stripUnquotedSpeakerSpeech(value: string): string {
    return normalizeLineEndings(value)
        .split("\n")
        .map((line) => {
            const match = line.match(/^(\s*(?:\*\*)?[A-Z][A-Za-z0-9'._ -]{0,60}(?::|\*\*:)\s*)(.*)$/);

            if (match == null) {
                return line;
            }

            const actionBeats = match[2].match(/\*[^*\n]+\*/g);
            return actionBeats == null ? match[1] : `${match[1]} ${actionBeats.join(" ")}`;
        })
        .join("\n");
}

export function nonDialogueEvidenceContext(context: string): string {
    return stripUnquotedSpeakerSpeech(stripDoubleQuotedText(context));
}
