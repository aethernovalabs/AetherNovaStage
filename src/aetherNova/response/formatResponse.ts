import type {AetherNovaMessageState} from "../types";
import {formatHeader} from "../header/headerBuilder";
import {normalizeNarrativeFormat} from "../narrative/normalizeNarrativeFormat";

export function formatResponse(state: AetherNovaMessageState, narrative: string): string {
    const cleanNarrative = normalizeNarrativeFormat(narrative, state);
    const header = formatHeader(state);

    if (cleanNarrative.length === 0) {
        return header;
    }

    return `${header}\n\n${cleanNarrative}`;
}
