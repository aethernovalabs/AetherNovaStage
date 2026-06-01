import type {AetherNovaMessageState, NpcMemoryCommand, NpcMemoryCommandUpdates, NpcMemoryCommandResult, NpcMemoryEntry, NpcMemoryStore} from "../types";
import {NPC_MEMORY_COMMAND_PATTERN} from "../constants";
import {coerceNpcMemory} from "./updateNpcMemory";
import {resolveNpcMemoryKey, npcMemoryKey} from "./npcMemoryState";
import {cleanNpcMemoryName, cleanMemoryField, cleanMemoryLabel, cleanFactText, formatMemoryLabels, formatBehaviorScores, normalizeMemoryLabelList, normalizeRelationshipList, normalizeBehaviorScores, ensureBehaviorScoresForStableLabels, applyBehaviorScoreDeltas, clampBehaviorScore, mergeUniqueList, completeNpcMemoryName, isEmptyNpcMemoryValue} from "./npcMemoryHelpers";
import {mergeKnownFacts, stableBehaviorLabels} from "./npcMemoryInference";
import {findNpcCanonByNameOrAlias} from "./npcCanonRegistry";
import {cleanFragment, normalizeLineEndings} from "../utils/text";
import {splitTopLevel} from "../utils/split";

function parseBehaviorScoreDelta(value: string): {label: string; delta: number} | null {
    const match = /^([A-Za-z][A-Za-z -]{1,40})\s*([+-]\d+)$/i.exec(cleanFragment(value));
    if (match == null) {
        return null;
    }

    const label = cleanMemoryLabel(match[1], "");
    const delta = Number.parseInt(match[2], 10);
    return label.length > 0 && Number.isFinite(delta) ? {label, delta} : null;
}

function parseBehaviorScoreMap(value: string): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const part of splitMemoryFields(value)) {
        const match = /^([A-Za-z][A-Za-z -]{1,40})\s*(?:=|:|\s)\s*([+-]?\d+)$/i.exec(part);
        if (match == null) {
            continue;
        }

        const label = cleanMemoryLabel(match[1], "");
        const score = Number.parseInt(match[2], 10);
        if (label.length > 0 && Number.isFinite(score)) {
            scores[label] = clampBehaviorScore(score);
        }
    }
    return scores;
}

function splitMemoryFields(value: string): string[] {
    return cleanFragment(value)
        .split(/\s*[,;]\s*/g)
        .map(cleanFragment)
        .filter(Boolean);
}

function splitNpcMemoryFacts(value: string): string[] {
    return value
        .split(/\s*;\s*/g)
        .map(cleanFactText)
        .filter(Boolean);
}

function splitRelationshipEvents(value: string): string[] {
    return value
        .split(/\s*;\s*/g)
        .map(cleanFactText)
        .filter(Boolean);
}

function parseNpcMemoryCommandUpdates(segments: string[]): Partial<NpcMemoryCommandUpdates> {
    const updates: Partial<NpcMemoryCommandUpdates> = {};
    const addFacts: string[] = [];
    const behaviorScoreDeltas: Record<string, number> = {};
    const relationshipEvents: string[] = [];

    for (const segment of segments) {
        const scoreDelta = parseBehaviorScoreDelta(segment);
        if (scoreDelta != null) {
            behaviorScoreDeltas[scoreDelta.label] = (behaviorScoreDeltas[scoreDelta.label] ?? 0) + scoreDelta.delta;
            continue;
        }

        const match = /^([A-Za-z ]+)\s*(?:=|:)\s*(.*)$/i.exec(segment);
        if (match == null) {
            continue;
        }

        const key = match[1].toLowerCase().replace(/\s+/g, "");
        const value = cleanFragment(match[2]);
        if (value.length === 0 && key !== "onlyknows" && key !== "knownfacts" && key !== "facts") {
            continue;
        }

        if (key === "name" || key === "fullname" || key === "fullnpcname") {
            updates.name = cleanNpcMemoryName(value);
        } else if (key === "role" || key === "title" || key === "roletitle") {
            updates.roleTitle = cleanMemoryField(value, "Unknown role/title");
        } else if (key === "race" || key === "racial") {
            updates.race = cleanMemoryField(value, "Unknown");
        } else if (key === "relationship" || key === "relation" || key === "relationshipwithuser") {
            updates.relationshipWithUser = normalizeRelationshipList(value);
        } else if (key === "behavior" || key === "behaviour") {
            updates.behaviorTowardUser = normalizeMemoryLabelList(value, []);
        } else if (key === "mood" || key === "currentmood") {
            updates.currentMood = cleanMemoryLabel(value, "unknown");
        } else if (key === "tone" || key === "lastinteractiontone") {
            updates.lastInteractionTone = cleanMemoryLabel(value, "neutral");
        } else if (key === "physical" || key === "physicalextra") {
            updates.physicalExtra = cleanMemoryField(value, "none");
        } else if (key === "event" || key === "relationevent" || key === "relationshipevent") {
            relationshipEvents.push(...splitRelationshipEvents(value));
        } else if (key === "onlyknows" || key === "knownfacts" || key === "facts") {
            updates.onlyKnows = splitNpcMemoryFacts(value);
        } else if (key === "fact" || key === "knownfact" || key === "addfact") {
            addFacts.push(...splitNpcMemoryFacts(value));
        } else if (key === "behaviorscore" || key === "score") {
            for (const scorePart of splitMemoryFields(value)) {
                const parsed = parseBehaviorScoreDelta(scorePart);
                if (parsed != null) {
                    behaviorScoreDeltas[parsed.label] = (behaviorScoreDeltas[parsed.label] ?? 0) + parsed.delta;
                }
            }
        } else if (key === "behaviorscores" || key === "scores") {
            updates.behaviorScores = parseBehaviorScoreMap(value);
        }
    }

    if (addFacts.length > 0) {
        updates.addFacts = addFacts;
    }
    if (relationshipEvents.length > 0) {
        updates.relationshipEvents = relationshipEvents;
    }
    if (Object.keys(behaviorScoreDeltas).length > 0) {
        updates.behaviorScoreDeltas = behaviorScoreDeltas;
    }

    return updates;
}

function parseNpcMemoryCommandBody(rawBody: string): NpcMemoryCommand | null {
    const segments = splitTopLevel(rawBody, "|").map(cleanFragment).filter(Boolean);
    const head = segments.shift() ?? "";
    const actionMatch = /^(delete|remove|clearfacts|clear\s+facts|clear|set|update|add\s+fact|addfact|relation\s+event|relationship\s+event|relationship|relation|behavior\s+score|behavior|mood|show)\s*:?\s*(.*)$/i.exec(head);

    if (actionMatch == null) {
        return null;
    }

    const actionWord = actionMatch[1].toLowerCase().replace(/\s+/g, "");
    let action: NpcMemoryCommand["action"];

    if (actionWord === "delete" || actionWord === "remove" || actionWord === "clear") {
        action = "delete";
    } else if (actionWord === "clearfacts") {
        action = "clearfacts";
    } else if (actionWord === "addfact") {
        action = "addfact";
    } else if (actionWord === "relation" || actionWord === "relationship") {
        action = "relationship";
    } else if (actionWord === "relationevent" || actionWord === "relationshipevent") {
        action = "relationevent";
    } else if (actionWord === "mood") {
        action = "mood";
    } else if (actionWord === "behavior") {
        action = "behavior";
    } else if (actionWord === "behaviorscore") {
        action = "behaviorscore";
    } else if (actionWord === "show") {
        action = "show";
    } else {
        action = "set";
    }

    const target = cleanNpcMemoryName(actionMatch[2]);

    if (target.length === 0 && action !== "show") {
        return null;
    }

    return {
        raw: cleanFragment(rawBody),
        action,
        target,
        updates: parseNpcMemoryCommandUpdates(segments),
    };
}

function parseNpcMemoryCommands(userMessage: string): NpcMemoryCommand[] {
    return Array.from(userMessage.matchAll(NPC_MEMORY_COMMAND_PATTERN))
        .map((match) => parseNpcMemoryCommandBody(match[1]))
        .filter((command): command is NpcMemoryCommand => command != null);
}

function stripNpcMemoryCommands(userMessage: string): string {
    return normalizeLineEndings(userMessage)
        .replace(NPC_MEMORY_COMMAND_PATTERN, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function applyNpcMemoryCommand(memory: NpcMemoryStore, command: NpcMemoryCommand): {memory: NpcMemoryStore; message: string} {
    const next = coerceNpcMemory(memory);
    const key = resolveNpcMemoryKey(command.target, next);

    if (command.action === "delete") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        const deletedName = next[key]?.name ?? command.target;
        delete next[key];
        return {memory: next, message: `NPC memory command: deleted ${deletedName}.`};
    }

    if (command.action === "clearfacts") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        next[key] = {
            ...next[key],
            onlyKnows: [],
        };
        return {memory: next, message: `NPC memory command: cleared OnlyKnows for ${next[key].name}.`};
    }

    if (command.action === "addfact") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        next[key] = {
            ...next[key],
            onlyKnows: mergeKnownFacts(next[key].onlyKnows, command.updates.addFacts ?? []),
        };
        return {memory: next, message: `NPC memory command: added fact(s) to ${next[key].name}.`};
    }

    if (command.action === "relationship") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        next[key] = {
            ...next[key],
            relationshipWithUser: normalizeRelationshipList(command.updates.relationshipWithUser ?? next[key].relationshipWithUser),
        };
        return {memory: next, message: `NPC memory command: updated relationship for ${next[key].name}.`};
    }

    if (command.action === "relationevent") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        next[key] = {
            ...next[key],
            relationshipEvents: mergeKnownFacts(next[key].relationshipEvents, command.updates.relationshipEvents ?? []),
        };
        return {memory: next, message: `NPC memory command: added relationship event(s) for ${next[key].name}.`};
    }

    if (command.action === "mood") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        next[key] = {
            ...next[key],
            currentMood: cleanMemoryLabel(command.updates.currentMood, next[key].currentMood),
            lastInteractionTone: command.updates.lastInteractionTone ?? next[key].lastInteractionTone,
        };
        return {memory: next, message: `NPC memory command: updated mood for ${next[key].name}.`};
    }

    if (command.action === "behavior") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        const behaviorTowardUser = normalizeMemoryLabelList(command.updates.behaviorTowardUser, next[key].behaviorTowardUser);
        next[key] = {
            ...next[key],
            behaviorTowardUser,
            behaviorScores: ensureBehaviorScoresForStableLabels(next[key].behaviorScores, behaviorTowardUser),
        };
        return {memory: next, message: `NPC memory command: updated behavior for ${next[key].name}.`};
    }

    if (command.action === "behaviorscore") {
        if (key == null) {
            return {memory: next, message: `NPC memory command: no stored memory found for ${command.target}.`};
        }

        const behaviorScores = applyBehaviorScoreDeltas(next[key].behaviorScores, command.updates.behaviorScoreDeltas ?? {});
        next[key] = {
            ...next[key],
            behaviorScores,
            behaviorTowardUser: stableBehaviorLabels(next[key].behaviorTowardUser, behaviorScores),
        };
        return {memory: next, message: `NPC memory command: updated behavior score for ${next[key].name}.`};
    }

    if (command.action === "show") {
        const exists = key == null ? null : next[key];
        if (exists == null) {
            return {memory: next, message: `[system: npcMemory]\nNo stored NPC memory found for ${command.target}.`};
        }
        return {
            memory: next,
            message: [
                `[system: npcMemory]`,
                `Name: ${exists.name}`,
                `Role/Title: ${exists.roleTitle}`,
                `Race: ${exists.race}`,
                `Physical Extra: ${exists.physicalExtra}`,
                `Current Mood: ${exists.currentMood}`,
                `Last Interaction Tone: ${exists.lastInteractionTone ?? "unknown"}`,
                `Behavior toward {{user}}: ${formatMemoryLabels(exists.behaviorTowardUser, "None stable yet")}`,
                `Behavior Scores: ${formatBehaviorScores(exists.behaviorScores)}`,
                `Relationship with {{user}}: ${formatMemoryLabels(exists.relationshipWithUser, "stranger")}`,
                `Relationship Events: ${exists.relationshipEvents.length > 0 ? exists.relationshipEvents.join(" ; ") : "None recorded"}`,
                `OnlyKnows: ${exists.onlyKnows.length > 0 ? exists.onlyKnows.join(" ; ") : "None recorded"}`,
            ].join("\n"),
        };
    }

    const previous = key == null ? null : next[key];
    const name = completeNpcMemoryName(command.updates.name ?? command.target, previous, next);

    const canon = findNpcCanonByNameOrAlias(command.target);
    const canonName = canon != null ? canon.name : name;
    const canonKey = npcMemoryKey(canonName);

    const entry: NpcMemoryEntry = {
        name: canonName,
        roleTitle: canon != null ? canon.roleTitle : cleanMemoryField(command.updates.roleTitle ?? previous?.roleTitle, "Unknown role/title"),
        race: canon != null ? canon.race : cleanMemoryField(command.updates.race ?? previous?.race, "Unknown"),
        physicalExtra: canon != null ? canon.physicalExtra : cleanMemoryField(command.updates.physicalExtra ?? previous?.physicalExtra, "none"),
        currentMood: cleanMemoryLabel(command.updates.currentMood ?? previous?.currentMood, "unknown"),
        lastInteractionTone: command.updates.lastInteractionTone ?? previous?.lastInteractionTone,
        behaviorTowardUser: normalizeMemoryLabelList(command.updates.behaviorTowardUser ?? previous?.behaviorTowardUser, []),
        behaviorScores: command.updates.behaviorScores != null
            ? ensureBehaviorScoresForStableLabels(command.updates.behaviorScores, normalizeMemoryLabelList(command.updates.behaviorTowardUser ?? previous?.behaviorTowardUser, []))
            : applyBehaviorScoreDeltas(
                ensureBehaviorScoresForStableLabels(previous?.behaviorScores ?? {}, normalizeMemoryLabelList(command.updates.behaviorTowardUser ?? previous?.behaviorTowardUser, [])),
                command.updates.behaviorScoreDeltas ?? {},
            ),
        relationshipWithUser: normalizeRelationshipList(command.updates.relationshipWithUser ?? previous?.relationshipWithUser),
        relationshipEvents: mergeKnownFacts(previous?.relationshipEvents ?? [], command.updates.relationshipEvents ?? []),
        onlyKnows: command.updates.onlyKnows != null
            ? mergeKnownFacts([], command.updates.onlyKnows)
            : mergeKnownFacts(previous?.onlyKnows ?? [], command.updates.addFacts ?? []),
    };
    entry.behaviorTowardUser = stableBehaviorLabels(entry.behaviorTowardUser, entry.behaviorScores);

    if (key != null && key !== canonKey) {
        delete next[key];
    }

    next[canonKey] = entry;

    return {
        memory: next,
        message: `NPC memory command: saved ${entry.name}.`,
    };
}

export function applyNpcMemoryCommands(
    state: AetherNovaMessageState,
    userMessage: string,
): NpcMemoryCommandResult {
    const commands = parseNpcMemoryCommands(userMessage);

    if (commands.length === 0) {
        return {
            state,
            cleanedMessage: userMessage,
            systemMessage: null,
            applied: false,
        };
    }

    let npcMemory = coerceNpcMemory(state.npcMemory);
    const messages: string[] = [];

    for (const command of commands) {
        const result = applyNpcMemoryCommand(npcMemory, command);
        npcMemory = result.memory;
        messages.push(result.message);
    }

    return {
        state: {
            ...state,
            npcMemory,
        },
        cleanedMessage: stripNpcMemoryCommands(userMessage),
        systemMessage: messages.length > 0 ? messages.join("\n") : null,
        applied: true,
    };
}
