import type {NpcCanonEntry} from "../types";
import {cleanFragment, cleanHeaderText, sameText} from "../utils/text";

export const NPC_CANON_REGISTRY: Record<string, NpcCanonEntry> = {
    "Meridiane Montreval": {
        name: "Meridiane Montreval",
        aliases: ["Meridiane", "Queen Meridiane", "Meridiane Montreval"],
        roleTitle: "Queen of Solmeryn",
        race: "Human",
        physicalExtra: "none",
    },
    "Aveline Montreval": {
        name: "Aveline Montreval",
        aliases: ["Aveline", "Princess Aveline", "Crown Princess Aveline", "Aveline Montreval"],
        roleTitle: "Crown Princess of Solmeryn",
        race: "Human",
        physicalExtra: "none",
    },
    "Halvair Montreval": {
        name: "Halvair Montreval",
        aliases: ["Halvair", "King Halvair", "Halvair Montreval"],
        roleTitle: "King of Solmeryn",
        race: "Human",
        physicalExtra: "none",
    },
    "Debi Marquetta": {
        name: "Debi Marquetta",
        aliases: ["Debi", "Debi Marquetta", "Broker Debi"],
        roleTitle: "Black-Market Broker",
        race: "Human",
        physicalExtra: "none",
    },
    "Elyria Aerendil": {
        name: "Elyria Aerendil",
        aliases: ["Elyria", "Queen Elyria", "Elyria Aerendil"],
        roleTitle: "Queen of Sylvaris",
        race: "Elf",
        physicalExtra: "none",
    },
    "Aelindra Aerendil": {
        name: "Aelindra Aerendil",
        aliases: ["Aelindra", "Princess Aelindra", "Crown Princess Aelindra", "Aelindra Aerendil"],
        roleTitle: "Crown Princess of Sylvaris",
        race: "High Elf",
        physicalExtra: "none",
    },
    "Faelar Aerendil": {
        name: "Faelar Aerendil",
        aliases: ["Faelar", "King Faelar", "Faelar Aerendil"],
        roleTitle: "King of Sylvaris",
        race: "High Elf",
        physicalExtra: "none",
    },
    "Vera Nightshade": {
        name: "Vera Nightshade",
        aliases: ["Vera", "Vera Nightshade"],
        roleTitle: "Exiled Dark Elf Assassin",
        race: "Dark Elf",
        physicalExtra: "none",
    },
    "Seraphina Duskryn": {
        name: "Seraphina Duskryn",
        aliases: ["Seraphina", "Seraphina Duskryn"],
        roleTitle: "Treaty-Breaker Diplomat",
        race: "Half-Elf",
        physicalExtra: "none",
    },
    "Lyra Valeris": {
        name: "Lyra Valeris",
        aliases: ["Lyra", "Queen Lyra", "Lyra Valeris"],
        roleTitle: "Queen of Valerest",
        race: "Half-Catkin",
        physicalExtra: "cat ears; cat tail; claws",
    },
    "Niana Valeris": {
        name: "Niana Valeris",
        aliases: ["Niana", "Princess Niana", "Crown Princess Niana", "Niana Valeris"],
        roleTitle: "Crown Princess of Valerest",
        race: "Catkin",
        physicalExtra: "cat ears; cat tail; claws; fangs",
    },
    "Garrick Valeris": {
        name: "Garrick Valeris",
        aliases: ["Garrick", "King Garrick", "Garrick Valeris"],
        roleTitle: "King of Valerest",
        race: "Lionkin",
        physicalExtra: "lion ears; lion tail; claws; fangs",
    },
    "Elara Vermithor": {
        name: "Elara Vermithor",
        aliases: ["Elara", "Queen Elara", "Elara Vermithor"],
        roleTitle: "Queen of Draconis",
        race: "Dragonkin",
        physicalExtra: "dragon wings; dragon tail; horns; scales; claws; fangs",
    },
    "Talia Vermithor": {
        name: "Talia Vermithor",
        aliases: ["Talia", "Princess Talia", "Crown Princess Talia", "Talia Vermithor"],
        roleTitle: "Crown Princess of Draconis",
        race: "Dragonkin",
        physicalExtra: "dragon wings; dragon tail; horns; scales; claws; fangs",
    },
    "Aelius Vermithor": {
        name: "Aelius Vermithor",
        aliases: ["Aelius", "King Aelius", "Aelius Vermithor"],
        roleTitle: "King of Draconis",
        race: "Dragonkin",
        physicalExtra: "dragon wings; dragon tail; horns; scales; claws; fangs",
    },
    "Maya Ashflare": {
        name: "Maya Ashflare",
        aliases: ["Maya", "Maya Ashflare"],
        roleTitle: "Ash-Road Guide",
        race: "Dragonkin",
        physicalExtra: "dragon tail; horns; scales; claws",
    },
    "Thora Ironfist": {
        name: "Thora Ironfist",
        aliases: ["Thora", "Queen Thora", "Thora Ironfist"],
        roleTitle: "Queen of Khazad Grim",
        race: "Dwarf",
        physicalExtra: "none",
    },
    "Kelda Ironfist": {
        name: "Kelda Ironfist",
        aliases: ["Kelda", "Princess Kelda", "Crown Princess Kelda", "Kelda Ironfist"],
        roleTitle: "Crown Princess of Khazad Grim",
        race: "Dwarf",
        physicalExtra: "none",
    },
    "Magni Ironfist": {
        name: "Magni Ironfist",
        aliases: ["Magni", "King Magni", "Magni Ironfist"],
        roleTitle: "King of Khazad Grim",
        race: "Dwarf",
        physicalExtra: "none",
    },
    "Gara Stonemaw": {
        name: "Gara Stonemaw",
        aliases: ["Gara", "Gara Stonemaw"],
        roleTitle: "Siege-Breaker Bodyguard",
        race: "Half-Ogre",
        physicalExtra: "none",
    },
    "Zora Bloodtusk": {
        name: "Zora Bloodtusk",
        aliases: ["Zora", "Zora Bloodtusk"],
        roleTitle: "Oathbrand Enforcer",
        race: "Half-Orc",
        physicalExtra: "none",
    },
    "Mira Vespera": {
        name: "Mira Vespera",
        aliases: ["Mira", "Mira Vespera"],
        roleTitle: "Crimson Court Matriarch",
        race: "Vampire",
        physicalExtra: "vampire fangs",
    },
    "Sereza Malvora": {
        name: "Sereza Malvora",
        aliases: ["Sereza", "Sereza Malvora"],
        roleTitle: "Infernal Claimbreaker",
        race: "Demon",
        physicalExtra: "demon horns; demon tails",
    },
    "Rina Ashthorn": {
        name: "Rina Ashthorn",
        aliases: ["Rina", "Rina Ashthorn"],
        roleTitle: "Runaway Curse Courier",
        race: "Half-Demon",
        physicalExtra: "demon horns; demon tails",
    },
    "Valla Noctis": {
        name: "Valla Noctis",
        aliases: ["Valla", "Valla Noctis"],
        roleTitle: "Infernal Grand Strategist",
        race: "High Demon",
        physicalExtra: "demon wings; demon horns; demon tails",
    },
    "Elys Seraphelion": {
        name: "Elys Seraphelion",
        aliases: ["Elys", "Elys Seraphelion"],
        roleTitle: "Divine Verdict Keeper",
        race: "Angel",
        physicalExtra: "three pairs of angel wings",
    },
    "Hana Celestine": {
        name: "Hana Celestine",
        aliases: ["Hana", "Hana Celestine"],
        roleTitle: "Pilgrim Healer",
        race: "Half-Angel",
        physicalExtra: "angel wings",
    },
    "Nara Sylverroot": {
        name: "Nara Sylverroot",
        aliases: ["Nara", "Nara Sylverroot"],
        roleTitle: "Grove-Core Warden",
        race: "Dryad",
        physicalExtra: "none",
    },
    "Yume Nozomikara": {
        name: "Yume Nozomikara",
        aliases: ["Yume", "Yume Nozomikara"],
        roleTitle: "Nine-Tail Fate Broker",
        race: "Kitsune",
        physicalExtra: "fox ears; nine ethereal fox tails",
    },
    "Lulu Faeheart": {
        name: "Lulu Faeheart",
        aliases: ["Lulu", "Lulu Faeheart"],
        roleTitle: "Fey Signal Sprite",
        race: "Pixie",
        physicalExtra: "butterfly wings",
    },
    "Kira Moonpetal": {
        name: "Kira Moonpetal",
        aliases: ["Kira", "Kira Moonpetal"],
        roleTitle: "Feygate Mediator",
        race: "Half-Pixie",
        physicalExtra: "butterfly wings",
    },
};

function cleanNpcMemoryName(value: string): string {
    return cleanHeaderText(value).replace(/\s+/g, " ").trim();
}

export function findNpcCanonByNameOrAlias(inputName: string): NpcCanonEntry | null {
    const clean = cleanNpcMemoryName(inputName);
    if (clean.length === 0) return null;

    for (const entry of Object.values(NPC_CANON_REGISTRY)) {
        if (entry.aliases.some((alias) => sameText(alias, clean))) {
            return entry;
        }
    }

    return null;
}
