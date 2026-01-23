// Button CC offset (CC = offset + button index)
export const CC_OFFSET = 20;

// Button indices matching the driver's Buttons enum
export const BTN = {
    MASCHINE: 0,
    STAR: 1,
    BROWSE: 2,
    VOLUME: 3,
    SWING: 4,
    TEMPO: 5,
    PLUGIN: 6,
    SAMPLING: 7,
    LEFT: 8,
    RIGHT: 9,
    PITCH: 10,
    MOD: 11,
    PERFORM: 12,
    NOTES: 13,
    GROUP: 14,
    AUTO: 15,
    LOCK: 16,
    NOTE_REPEAT: 17,
    RESTART: 18,
    ERASE: 19,
    TAP: 20,
    FOLLOW: 21,
    PLAY: 22,
    REC: 23,
    STOP: 24,
    SHIFT: 25,
    FIXED_VEL: 26,
    PAD_MODE: 27,
    KEYBOARD: 28,
    CHORDS: 29,
    STEP: 30,
    SCENE: 31,
    PATTERN: 32,
    EVENTS: 33,
    VARIATION: 34,
    DUPLICATE: 35,
    SELECT: 36,
    SOLO: 37,
    MUTE: 38,
    ENCODER_PRESS: 39,
    ENCODER_TOUCH: 40
};

// Total number of buttons
export const BTN_COUNT = 41;

// CC numbers for other controls
export const CC_ENCODER = 1;
export const CC_SLIDER = 9;

// Mode definitions
export const MODES = {
    PLAY: 0,
    STEP: 1,
    CLIP: 2,
    MIXER: 3
};

export const MODE_NAMES = ["Play", "Step", "Clip", "Mixer"];

// Pad note mapping (from driver default config)
// Layout: bottom-left to top-right, bottom row first
export const PAD_NOTES = [48, 49, 50, 51, 44, 45, 46, 47, 40, 41, 42, 43, 36, 37, 38, 39];

// Pad color mapping (velocity ranges from driver)
export const PAD_COLORS = {
    RED: 4,           // 1-7
    ORANGE: 11,       // 8-14
    LIGHT_ORANGE: 18, // 15-21
    WARM_YELLOW: 25,  // 22-28
    YELLOW: 32,       // 29-35
    LIME: 39,         // 36-42
    GREEN: 46,        // 43-49
    MINT: 53,         // 50-56
    CYAN: 60,         // 57-63
    TURQUOISE: 67,    // 64-70
    BLUE: 74,         // 71-77
    PLUM: 81,         // 78-84
    VIOLET: 88,       // 85-91
    PURPLE: 95,       // 92-98
    MAGENTA: 102,     // 99-105
    FUCHSIA: 109,     // 106-112
    WHITE: 120        // 113-127
};

// Fixed velocity value when enabled
export const FIXED_VELOCITY_VALUE = 100;
