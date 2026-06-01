export const LOCATION_TRANSITION_CUES = [
    "move", "moves", "moved", "leads", "led", "follow", "follows", "followed",
    "travel", "travels", "traveled", "journey",
    "arrive", "arrives", "arrived",
    "enter", "enters", "entered",
    "leave", "leaves", "left",
    "combat", "battle", "teleport", "time skip", "scene transition",
    "meanwhile", "later", "afterward", "afterwards",
];

export const LOCATION_SCENE_ANCHOR_CUES = [
    "inside", "within", "interior", "indoors",
    "room", "hall", "chamber", "floor", "walls", "ceiling",
    "doorway", "threshold",
    "counter", "table", "booth", "stool",
    "bartender", "patron",
];

export const LOCATION_STOP_WORDS = new Set([
    "main", "sub", "location", "region", "kingdom", "empire", "city", "town",
    "village", "district", "street", "road", "path", "route", "current",
    "place", "active", "area", "detailed", "exact", "near", "nearby",
    "outside", "inside", "room",
]);
