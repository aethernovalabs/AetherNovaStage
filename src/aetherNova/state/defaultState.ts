import type {Character} from "@chub-ai/stages-ts";
import type {AetherNovaMessageState} from "../types";
import {DEFAULT_STATE} from "../constants";
import {cleanFragment, inferRace} from "../utils/text";

export function defaultNpcStatusForRace(race: string): string {
    const lower = race.toLowerCase();

    if (lower.includes("kitsune")) {
        return "Regular clothing; Standing nearby; tails still, ears attentive";
    }

    if (lower.includes("catkin")) {
        return "Regular clothing; Standing nearby; ears attentive, tail still";
    }

    if (lower.includes("dragonkin")) {
        return "Regular clothing; Standing nearby; wings settled, tail still, horns visible";
    }

    if (lower.includes("angel")) {
        return "Regular clothing; Standing nearby; wings settled, halo visible";
    }

    if (lower.includes("demon")) {
        return "Regular clothing; Standing nearby; horns visible, tail still, eyes alert";
    }

    if (lower.includes("vampire")) {
        return "Regular clothing; Standing nearby; fangs hidden, eyes alert";
    }

    if (lower.includes("pixie") || lower.includes("fey")) {
        return "Regular clothing; Standing nearby; wings still, faint glow visible";
    }

    return "Regular clothing; Standing nearby; posture attentive";
}

export function createDefaultState(characters: Record<string, Character>): AetherNovaMessageState {
    const character = Object.values(characters).find((entry) => !entry.isRemoved && entry.name.trim().length > 0);

    if (character == null) {
        return {...DEFAULT_STATE};
    }

    const race = inferRace(character);
    const name = cleanFragment(character.name) || "Unknown NPC";

    return {
        ...DEFAULT_STATE,
        npc: `${name} - ${race} (${defaultNpcStatusForRace(race)})`,
    };
}
