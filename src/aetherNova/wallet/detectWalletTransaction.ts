import type {WalletAmounts} from "../types";
import {WALLET_PAYMENT_ACTION_CUES, WALLET_INCOME_ACTION_CUES, NUMBER_WORDS} from "./walletConstants";
import {
    parseWalletAmounts,
    walletToCopper,
    copperToWallet,
    formatWallet,
    parseEnglishNumberPhrase,
    addUniqueWalletAmount,
} from "./walletMath";
import {sameText} from "../utils/text";
import {containsAnyCue} from "../utils/regex";

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

export function inferWalletDeltaFromContext(context: string): {direction: "expense" | "income"; amounts: WalletAmounts} | null {
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
