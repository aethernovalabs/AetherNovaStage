import type {AetherNovaMessageState, NormalizedWallet} from "../types";
import {DEFAULT_STATE, WALLET_AMOUNT_PATTERN} from "../constants";
import {parseWalletAmounts, formatWallet, walletToCopper, copperToWallet, inferWalletFromContext} from "./walletMath";
import {walletExpenseTransactionIsSupported, walletIncomeTransactionIsSupported, walletLossTransactionIsSupported, walletContextIsPriceDiscussionOnly} from "./walletMath";
import {cleanLabeledValue, sameText} from "../utils/text";
import {containsAnyCue} from "../utils/regex";
import {WALLET_MONEY_CUES} from "./walletConstants";
import {nonDialogueEvidenceContext} from "../utils/nonDialogue";

export function coerceWalletState(
    raw: Partial<AetherNovaMessageState>,
    fallback: AetherNovaMessageState,
): NormalizedWallet {
    const rawWallet = typeof raw.wallet === "string" ? normalizeWalletValue(raw.wallet) : null;
    const fallbackWallet = normalizeWalletValue(fallback.wallet) ?? DEFAULT_STATE.wallet;
    const explicitInitialized = typeof raw.walletInitialized === "boolean" ? raw.walletInitialized : null;

    if (rawWallet != null) {
        return {
            value: rawWallet,
            initialized: explicitInitialized ?? true,
        };
    }

    return {
        value: fallbackWallet,
        initialized: explicitInitialized ?? fallback.walletInitialized,
    };
}

export function normalizeWalletLine(
    rawLine: string,
    previousWallet: string,
    context: string,
    previousInitialized: boolean,
): NormalizedWallet {
    const previous = normalizeWalletValue(previousWallet) ?? DEFAULT_STATE.wallet;

    if (!previousInitialized) {
        const rawCandidate = cleanLabeledValue(rawLine, "Wallet");
        const candidate = normalizeWalletValue(rawCandidate);
        if (candidate != null) {
            return { value: candidate, initialized: true };
        }
        return { value: previous, initialized: false };
    }

    const walletContext = walletTransactionEvidenceContext(context);
    const inferred = inferWalletFromContext(previous, walletContext);

    if (inferred != null) {
        return { value: inferred, initialized: true };
    }

    return { value: previous, initialized: true };
}

export function normalizeWalletValue(value: string): string | null {
    const amounts = parseWalletAmounts(value);
    return amounts == null ? null : formatWallet(amounts);
}

export function walletTransactionEvidenceContext(context: string): string {
    return nonDialogueEvidenceContext(context);
}

export function walletChangeIsSupported(candidate: string, previousWallet: string, context: string): boolean {
    if (sameText(candidate, previousWallet)) {
        return true;
    }

    if (walletContextIsPriceDiscussionOnly(context)) {
        return false;
    }

    const lowerContext = context.toLowerCase();
    const hasMoneyCue = containsAnyCue(lowerContext, WALLET_MONEY_CUES) || WALLET_AMOUNT_PATTERN.test(context);

    return hasMoneyCue
        && (
            walletExpenseTransactionIsSupported(context)
            || walletIncomeTransactionIsSupported(context)
            || walletLossTransactionIsSupported(context)
            || containsAnyCue(lowerContext, ["received payment", "payment received", "has been paid", "was paid"])
        );
}
