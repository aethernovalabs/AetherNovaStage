import type {NpcMemoryStore, NpcMemoryEntry, NpcHeaderMemoryEntry} from "../types";
import {isNoNpcValue, cleanFragment, normalizeLineEndings, sameText} from "../utils/text";
import {splitTopLevel} from "../utils/split";
import {escapeRegExp} from "../utils/regex";
import {parseIdentityStatus, splitIdentity} from "../header/normalizeYouLine";
import {cleanNpcMemoryName, firstNameOf, cleanMemoryField} from "./npcMemoryHelpers";

function titleCase(value: string): string {
    return value.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function cleanSpeakerName(value: string): string {
    return cleanFragment(value).replace(/:$/, "");
}

function addUniqueSpeakerName(names: string[], name: string): void {
    if (!names.some((entry) => sameText(entry, name))) {
        names.push(name);
    }
}

export function npcMemoryKey(name: string): string {
    return cleanNpcMemoryName(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveNpcMemoryKey(name: string, memory: NpcMemoryStore): string | null {
    const clean = cleanNpcMemoryName(name);
    const exactKey = npcMemoryKey(clean);

    if (memory[exactKey] != null) {
        return exactKey;
    }

    const first = firstNameOf(clean).toLowerCase();
    const match = Object.entries(memory).find(([_key, entry]) => {
        return first.length > 0 && firstNameOf(entry.name).toLowerCase() === first;
    });

    return match?.[0] ?? null;
}

export function npcHeaderMemoryEntries(npcLine: string): NpcHeaderMemoryEntry[] {
    if (isNoNpcValue(npcLine)) {
        return [];
    }

    return splitTopLevel(npcLine, ",")
        .map((entry) => {
            const parsed = parseIdentityStatus(entry);
            const identity = splitIdentity(parsed.identity, "Unknown NPC", "Human");
            const titleName = splitNpcTitleFromName(identity.left);
            const name = cleanNpcMemoryName(titleName.name);

            if (name.length === 0 || /^unknown npc$/i.test(name)) {
                return null;
            }

            return {
                name,
                firstName: firstNameOf(name),
                titleFromName: titleName.title,
                race: cleanMemoryField(identity.right, "Unknown racial"),
                status: cleanFragment(parsed.status),
            };
        })
        .filter((entry): entry is NpcHeaderMemoryEntry => entry != null);
}

export function npcMemoryKeysFromHeader(npcLine: string, memory: NpcMemoryStore): string[] {
    return npcHeaderMemoryEntries(npcLine)
        .map((entry) => resolveNpcMemoryKey(entry.name, memory))
        .filter((key): key is string => key != null);
}

export function npcMemoryKeysMentionedInText(text: string, memory: NpcMemoryStore): string[] {
    const keys: string[] = [];

    for (const [key, entry] of Object.entries(memory)) {
        if (npcMemoryEntryMentioned(entry, text)) {
            keys.push(key);
        }
    }

    return keys;
}

export function npcMemoryEntryMentioned(entry: NpcMemoryEntry, text: string): boolean {
    const clean = normalizeLineEndings(text);
    const names = [entry.name, firstNameOf(entry.name)].filter((name) => name.length > 0);
    return names.some((name) => new RegExp(`\\b${npcNameRegexSource(name)}\\b`, "i").test(clean));
}

export function splitNpcTitleFromName(value: string): {name: string; title: string} {
    const clean = cleanNpcMemoryName(value);
    const match = clean.match(/^(King|Queen|Prince|Princess|Emperor|Empress|Lord|Lady|Duke|Duchess|Sir|Captain|Commander|General|Minister|Priest|Priestess|Knight|Guard|Merchant|Broker|Informant|Innkeeper)\s+(.+)$/i);

    if (match == null) {
        return {name: clean, title: ""};
    }

    return {
        name: cleanNpcMemoryName(match[2]),
        title: titleCase(match[1]),
    };
}

export function npcNameRegexSource(name: string): string {
    return cleanNpcMemoryName(name).split(/\s+/g).filter(Boolean).map(escapeRegExp).join("\\s+");
}

export function npcSpeakerNamesFromState(npcLine: string): string[] {
    if (isNoNpcValue(npcLine)) {
        return [];
    }

    const names: string[] = [];
    for (const entry of splitTopLevel(npcLine, ",")) {
        const parsed = parseIdentityStatus(entry);
        const identity = splitIdentity(parsed.identity, "", "");
        const fullName = cleanSpeakerName(identity.left);

        if (fullName.length === 0 || /^unknown npc$/i.test(fullName)) {
            continue;
        }

        addUniqueSpeakerName(names, fullName);

        const firstName = fullName.split(/\s+/)[0];
        if (firstName != null && firstName.length > 0) {
            addUniqueSpeakerName(names, firstName);
        }
    }

    return names;
}
