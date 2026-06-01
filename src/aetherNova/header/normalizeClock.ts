import type {TimeOfDay} from "../types";
import {CLOCK_PATTERN, DEFAULT_STATE} from "../constants";

export function normalizeClock(rawValue: string, fallbackClock: string): string {
    const match = rawValue.match(CLOCK_PATTERN) ?? fallbackClock.match(CLOCK_PATTERN);

    if (match == null) {
        return DEFAULT_STATE.clock;
    }

    const hour = String(Number(match[1])).padStart(2, "0");
    return `${hour}:${match[2]}`;
}

export function timeOfDayForClock(clock: string): TimeOfDay {
    const hour = Number(clock.slice(0, 2));

    if (hour >= 5 && hour <= 11) {
        return "Morning";
    }

    if (hour >= 12 && hour <= 16) {
        return "Afternoon";
    }

    if (hour >= 17 && hour <= 20) {
        return "Evening";
    }

    return "Night";
}

export function asTimeOfDay(value: string): TimeOfDay | null {
    const lower = value.trim().toLowerCase();
    const TIME_OF_DAYS: TimeOfDay[] = ["Morning", "Afternoon", "Evening", "Night"];
    return TIME_OF_DAYS.find((timeOfDay) => timeOfDay.toLowerCase() === lower) ?? null;
}
