import type {AetherNovaMessageState, NormalizedWallet} from "../types";
import {DEFAULT_STATE} from "../constants";
import {parseWalletAmounts, formatWallet} from "./walletMath";
import {inferWalletFromContext} from "./detectWalletTransaction";
import {cleanLabeledValue} from "../utils/text";
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
