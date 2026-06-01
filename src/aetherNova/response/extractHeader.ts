import type {ExtractedHeader, HeaderBlock} from "../types";
import {normalizeLineEndings, cleanHeaderText} from "../utils/text";
import {CLOCK_PATTERN, TIME_OF_DAYS, HEADER_DIVIDER} from "../constants";

function looksLikeLocationTimeLine(value: string): boolean {
    const lower = value.toLowerCase();
    return value.includes("|")
        && (CLOCK_PATTERN.test(value) || TIME_OF_DAYS.some((timeOfDay) => lower.includes(timeOfDay.toLowerCase())));
}

function isHeaderDivider(value: string): boolean {
    const clean = value.trim();
    return clean === HEADER_DIVIDER || /^_{3,}$/.test(clean);
}

function readHeaderBlock(lines: string[], start: number): HeaderBlock | null {
    let locationLine: string | null = null;
    let youLine: string | null = null;
    let npcLine: string | null = null;
    let threadLine: string | null = null;
    let walletLine: string | null = null;
    let score = 0;
    let end = start;
    let sawDivider = false;
    let blankLinesInsideHeader = 0;

    const scanEnd = Math.min(lines.length, start + 16);
    for (let index = start; index < scanEnd; index += 1) {
        const line = lines[index].trim();

        if (line.length === 0) {
            if (score === 0) {
                return null;
            }

            blankLinesInsideHeader += 1;
            if (blankLinesInsideHeader > 4) {
                break;
            }

            end = index + 1;
            continue;
        }

        blankLinesInsideHeader = 0;

        if (isHeaderDivider(line)) {
            if (score === 0) {
                return null;
            }
            sawDivider = true;
            score += 1;
            end = index + 1;
            break;
        }

        const clean = cleanHeaderText(line);
        const lower = clean.toLowerCase();

        if (!locationLine && looksLikeLocationTimeLine(clean)) {
            locationLine = clean;
            score += 2;
            end = index + 1;
            continue;
        }

        if (lower.startsWith("you:")) {
            if (youLine != null) {
                break;
            }
            youLine = clean;
            score += 1;
            end = index + 1;
            continue;
        }

        if (lower.startsWith("npc:")) {
            if (npcLine != null) {
                break;
            }
            npcLine = clean;
            score += 1;
            end = index + 1;
            continue;
        }

        if (lower.startsWith("thread:")) {
            if (threadLine != null) {
                break;
            }
            threadLine = clean;
            score += 1;
            end = index + 1;
            continue;
        }

        if (lower.startsWith("wallet:")) {
            if (walletLine != null) {
                break;
            }
            walletLine = clean;
            score += 1;
            end = index + 1;
            continue;
        }

        break;
    }

    const hasHeaderShape = locationLine != null && (youLine != null || npcLine != null || threadLine != null || sawDivider);
    const hasEnoughHeaderLines = score >= 4 || (score >= 3 && locationLine != null);

    if (!hasHeaderShape && !hasEnoughHeaderLines) {
        return null;
    }

    return {
        start,
        end,
        locationLine,
        youLine,
        npcLine,
        threadLine,
        walletLine,
    };
}

export function extractHeader(content: string): ExtractedHeader {
    const normalized = normalizeLineEndings(content);
    const lines = normalized.split("\n");
    const firstContentLine = lines.findIndex((line) => line.trim().length > 0);

    if (firstContentLine < 0) {
        return {
            locationLine: null,
            youLine: null,
            npcLine: null,
            threadLine: null,
            walletLine: null,
            narrative: "",
        };
    }

    const scanEnd = Math.min(lines.length, firstContentLine + 40);
    for (let index = firstContentLine; index < scanEnd; index += 1) {
        const block = readHeaderBlock(lines, index);

        if (block == null) {
            continue;
        }

        const beforeHeader = lines.slice(firstContentLine, block.start).join("\n").trim();
        const afterHeader = lines.slice(block.end).join("\n").trimStart();
        const narrative = [beforeHeader, afterHeader].filter((part) => part.length > 0).join("\n\n");

        return {
            locationLine: block.locationLine,
            youLine: block.youLine,
            npcLine: block.npcLine,
            threadLine: block.threadLine,
            walletLine: block.walletLine,
            narrative,
        };
    }

    return {
        locationLine: null,
        youLine: null,
        npcLine: null,
        threadLine: null,
        walletLine: null,
        narrative: normalized.trimStart(),
    };
}
