export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsAnyCue(value: string, cues: string[]): boolean {
    const lowerValue = value.toLowerCase();
    return cues.some((cue) => {
        const lowerCue = cue.toLowerCase();

        if (lowerCue.includes(" ")) {
            return lowerValue.includes(lowerCue);
        }

        return new RegExp(`\\b${escapeRegExp(lowerCue)}\\b`).test(lowerValue);
    });
}
