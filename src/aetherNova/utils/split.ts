export function splitTopLevel(value: string, separator: string): string[] {
    const parts: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of value) {
        if (char === "(") {
            depth += 1;
        } else if (char === ")") {
            depth = Math.max(0, depth - 1);
        }

        if (char === separator && depth === 0) {
            parts.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    if (current.trim().length > 0) {
        parts.push(current.trim());
    }

    return parts;
}
