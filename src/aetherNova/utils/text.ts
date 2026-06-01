export function cleanFragment(value: string): string {
    return value
        .replace(/\s+/g, " ")
        .replace(/\s+([,.)])/g, "$1")
        .replace(/([(])\s+/g, "$1")
        .replace(/[.;,\s]+$/g, "")
        .trim();
}

export function cleanHeaderText(value: string): string {
    return value
        .trim()
        .replace(/^\*\*/, "")
        .replace(/\*\*$/, "")
        .replace(/\*\*/g, "")
        .trim();
}

export function cleanLabeledValue(rawLine: string, label: string): string {
    return cleanHeaderText(rawLine).replace(new RegExp(`^${label}\\s*:\\s*`, "i"), "").trim();
}

export function isPlaceholder(value: string): boolean {
    const clean = cleanFragment(value);
    const lower = clean.toLowerCase();

    return clean.length === 0
        || lower === "none"
        || lower === "n/a"
        || lower === "unknown"
        || lower === "null"
        || lower === "current scene"
        || lower === "current topic"
        || lower === "current event"
        || lower.includes("current mission / pending event")
        || lower.includes("position; clothing; relevant status")
        || lower.includes("body position; one clothing type");
}

export function isNoNpcValue(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();
    return lower === "none"
        || lower === "no npc"
        || lower === "no npcs"
        || lower === "no npcs present"
        || lower === "no npc present"
        || lower === "none present";
}

export function isNoThreadValue(value: string): boolean {
    const lower = cleanFragment(value).toLowerCase();
    return lower === "none"
        || lower === "no thread"
        || lower === "no active thread"
        || lower === "no major thread";
}

export function limitWords(value: string, maxWords: number): string {
    const words = cleanFragment(value).split(" ").filter(Boolean);

    if (words.length <= maxWords) {
        return cleanFragment(value);
    }

    return words.slice(0, maxWords).join(" ");
}

export function sameText(left: string, right: string): boolean {
    return cleanFragment(left).toLowerCase() === cleanFragment(right).toLowerCase();
}

export function normalizeLineEndings(value: string): string {
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
