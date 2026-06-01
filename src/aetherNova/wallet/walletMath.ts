import type {WalletAmounts} from "../types";
import {cleanHeaderText, isPlaceholder, sameText} from "../utils/text";
import {containsAnyCue} from "../utils/regex";
import {NUMBER_WORDS, WALLET_PAYMENT_ACTION_CUES, WALLET_INCOME_ACTION_CUES, WALLET_MONEY_CUES} from "./walletConstants";

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

export function walletExpenseTransactionIsSupported(context: string): boolean {
    const lowerContext = context.toLowerCase();

    if (walletContextIndicatesIncomeToUser(lowerContext)) {
        return false;
    }

    if (/\bback\s+into\s+(?:my|your|the)\s+(?:wallet|purse|pouch|pocket)\b/i.test(context)) {
        return false;
    }

    return containsAnyCue(lowerContext, WALLET_PAYMENT_ACTION_CUES)
        && (
            /\b(?:i|me|my|you|\{\{user\}\})\b/i.test(context)
            || /\b(?:to|toward|towards)\s+[A-Z][A-Za-z'._-]+\b/.test(context)
            || /\b(?:on|onto)\s+the\s+(?:table|counter|desk|wood)\b/i.test(context)
        );
}

export function walletIncomeTransactionIsSupported(context: string): boolean {
    const lowerContext = context.toLowerCase();

    return containsAnyCue(lowerContext, WALLET_INCOME_ACTION_CUES)
        && (
            walletContextIndicatesIncomeToUser(lowerContext)
            || /\b(?:i|you|\{\{user\}\})\s+(?:receive|received|earn|earned|gain|gained|loot|looted|found)\b/i.test(context)
        );
}

export function walletLossTransactionIsSupported(context: string): boolean {
    const lowerContext = context.toLowerCase();

    return containsAnyCue(lowerContext, ["loses", "lost", "stolen", "robbed", "confiscated"])
        && (
            /\b(?:i|me|my|you|your|\{\{user\}\})\b/i.test(context)
            || containsAnyCue(lowerContext, ["wallet", "purse", "pouch", "money", "coin", "coins", "gold", "silver", "copper"])
        );
}

export function walletContextIsPriceDiscussionOnly(context: string): boolean {
    const lowerContext = context.toLowerCase();
    const hasValuationCue = /\b(?:worth|valued at|value|asking price|market price|price tag|to the right buyer|right buyer|buyer|buyers|seller|sellers)\b/i.test(context)
        || /\b(?:cost|costs|costing|price|fee)\b/i.test(context)
        || /\btrade\s+you\s+information\s+for\s+information\b/i.test(context);

    if (!hasValuationCue) {
        return false;
    }

    return !walletExpenseTransactionIsSupported(context)
        && !walletIncomeTransactionIsSupported(context)
        && !walletLossTransactionIsSupported(context)
        && !containsAnyCue(lowerContext, ["received payment", "payment received", "has been paid", "was paid"]);
}

export function walletContextIndicatesIncomeToUser(lowerContext: string): boolean {
    if (/\b(?:i|we)\s+(?:give|gives|gave|hand|hands|handed|pay|pays|paid)\s+(?:you|\{\{user\}\})\b/i.test(lowerContext)) {
        return false;
    }

    return /\b(?:gives?|gave|hands?|handed|pays?)\s+(?:you|\{\{user\}\})\b/i.test(lowerContext)
        || /\b(?:to|toward|towards|into)\s+(?:you|your|\{\{user\}\})\b/i.test(lowerContext)
        || /\byou\s+(?:receive|received|earn|earned|gain|gained|found)\b/i.test(lowerContext);
}

export function extractMoneyMentionAmounts(context: string): WalletAmounts | null {
    const amounts: WalletAmounts = {gold: 0, silver: 0, copper: 0};
    const seenAmounts = new Set<string>();
    let matched = false;
    const numericPattern = /(\d+)\s*(g|gold|s|silver|c|copper)\b/gi;
    let numericMatch = numericPattern.exec(context);

    while (numericMatch != null) {
        matched = addUniqueWalletAmount(amounts, Number(numericMatch[1]), numericMatch[2], seenAmounts) || matched;
        numericMatch = numericPattern.exec(context);
    }

    const numberWords = Object.keys(NUMBER_WORDS).concat("hundred", "and").join("|");
    const wordPattern = new RegExp(`\\b((?:${numberWords})(?:[-\\s]+(?:${numberWords})){0,7})\\s+(gold|silver|copper)\\b`, "gi");
    let wordMatch = wordPattern.exec(context);

    while (wordMatch != null) {
        const value = parseEnglishNumberPhrase(wordMatch[1]);

        if (value != null) {
            matched = addUniqueWalletAmount(amounts, value, wordMatch[2], seenAmounts) || matched;
        }

        wordMatch = wordPattern.exec(context);
    }

    return matched ? amounts : null;
}

function inferWalletDeltaFromContext(context: string): {direction: "expense" | "income"; amounts: WalletAmounts} | null {
    if (walletContextIsPriceDiscussionOnly(context)) {
        return null;
    }

    const amounts = extractMoneyMentionAmounts(context);

    if (amounts == null) {
        return null;
    }

    if (walletExpenseTransactionIsSupported(context)) {
        return {direction: "expense", amounts};
    }

    if (walletIncomeTransactionIsSupported(context)) {
        return {direction: "income", amounts};
    }

    return null;
}

export function inferWalletFromContext(previousWallet: string, context: string): string | null {
    const previous = parseWalletAmounts(previousWallet);
    const delta = inferWalletDeltaFromContext(context);

    if (previous == null || delta == null) {
        return null;
    }

    const previousCopper = walletToCopper(previous);
    const deltaCopper = walletToCopper(delta.amounts);

    if (deltaCopper <= 0) {
        return null;
    }

    const nextCopper = delta.direction === "expense"
        ? Math.max(0, previousCopper - deltaCopper)
        : previousCopper + deltaCopper;
    const next = formatWallet(copperToWallet(nextCopper));

    return sameText(next, previousWallet) ? null : next;
}
