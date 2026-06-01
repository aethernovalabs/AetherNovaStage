import type {WalletAmounts} from "../types";
import {cleanHeaderText, isPlaceholder} from "../utils/text";
import {NUMBER_WORDS} from "./walletConstants";

export function parseWalletAmounts(value: string): WalletAmounts | null {
    const clean = cleanHeaderText(value).replace(/^wallet\s*:\s*/i, "");

    if (isPlaceholder(clean)) {
        return null;
    }

    let matched = false;
    const amounts: WalletAmounts = {gold: 0, silver: 0, copper: 0};
    const pattern = /(\d+)\s*(g|gold|s|silver|c|copper)\b/gi;
    let match = pattern.exec(clean);

    while (match != null) {
        matched = true;
        const amount = Math.max(0, Number(match[1]));
        const unit = match[2].toLowerCase();

        if (unit === "g" || unit === "gold") {
            amounts.gold = amount;
        } else if (unit === "s" || unit === "silver") {
            amounts.silver = amount;
        } else {
            amounts.copper = amount;
        }

        match = pattern.exec(clean);
    }

    return matched ? amounts : null;
}

export function formatWallet(wallet: WalletAmounts): string {
    return `${wallet.gold}G ; ${wallet.silver}S ; ${wallet.copper}C`;
}

export function normalizeWalletUnit(unit: string): "gold" | "silver" | "copper" {
    const clean = unit.toLowerCase();

    if (clean === "g" || clean === "gold") {
        return "gold";
    }

    if (clean === "s" || clean === "silver") {
        return "silver";
    }

    return "copper";
}

export function addWalletAmount(amounts: WalletAmounts, amount: number, unit: string): void {
    const safeAmount = Math.max(0, Math.floor(amount));
    const cleanUnit = normalizeWalletUnit(unit);

    if (cleanUnit === "gold") {
        amounts.gold += safeAmount;
    } else if (cleanUnit === "silver") {
        amounts.silver += safeAmount;
    } else {
        amounts.copper += safeAmount;
    }
}

export function addUniqueWalletAmount(amounts: WalletAmounts, amount: number, unit: string, seenAmounts: Set<string>): boolean {
    const key = `${Math.max(0, Math.floor(amount))}:${normalizeWalletUnit(unit)}`;

    if (seenAmounts.has(key)) {
        return false;
    }

    seenAmounts.add(key);
    addWalletAmount(amounts, amount, unit);
    return true;
}

export function parseEnglishNumberPhrase(value: string): number | null {
    const tokens = value
        .toLowerCase()
        .replace(/-/g, " ")
        .split(/\s+/g)
        .map((token) => token.trim())
        .filter((token) => token.length > 0 && token !== "and");
    let current = 0;
    let matched = false;

    for (const token of tokens) {
        if (token === "hundred") {
            current = Math.max(1, current) * 100;
            matched = true;
            continue;
        }

        const amount = NUMBER_WORDS[token];
        if (amount == null) {
            return null;
        }

        current += amount;
        matched = true;
    }

    return matched && current > 0 ? current : null;
}

export function walletToCopper(wallet: WalletAmounts): number {
    return (wallet.gold * 10000) + (wallet.silver * 100) + wallet.copper;
}

export function copperToWallet(totalCopper: number): WalletAmounts {
    const safeCopper = Math.max(0, Math.floor(totalCopper));
    const gold = Math.floor(safeCopper / 10000);
    const silver = Math.floor((safeCopper % 10000) / 100);
    const copper = safeCopper % 100;

    return {gold, silver, copper};
}
