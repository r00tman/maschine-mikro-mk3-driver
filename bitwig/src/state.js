import { BTN_COUNT, MODES } from './constants.js';

// === Global state container ===
// All mutable state is stored here for easy access across modules

export const state = {
    // Bitwig API objects (initialized in init())
    transport: null,
    cursorTrack: null,
    cursorDevice: null,
    application: null,
    arranger: null,
    groove: null,
    midiOut: null,
    noteInput: null,
    cursorClip: null,
    sceneBank: null,
    trackBank: null,
    drumPadBank: null,

    // User preferences (initialized in init())
    preferences: null,
    enablePlaybackFeedback: null,
    enableManualFeedback: null,
    playbackColorMode: null,
    fixedPlaybackColor: null,
    manualHitColor: null,

    // Modifier state
    isShiftPressed: false,

    // Current mode
    currentMode: MODES.PLAY,

    // Fixed velocity
    fixedVelocityEnabled: false,

    // Note repeat
    noteRepeatEnabled: false,
    noteRepeatInterval: 100, // ms (1/16 note at 150 BPM approx)
    noteRepeatTaskId: 0,     // Increment to invalidate old tasks
    heldPadNotes: {},        // note -> { velocity, taskId }

    // Step sequencer
    stepSequencer: {
        steps: [],           // Array of step states (on/off)
        currentStep: 0,      // Playhead position
        stepCount: 16,       // Number of steps (matches 16 pads)
        selectedNote: 36,    // Default note for steps (kick drum)
        resolution: 0.25,    // Step resolution in beats (1/4 = quarter note grid)
        drumPadNames: {},    // Map of MIDI note -> drum pad name
        currentInstrumentName: "" // Current instrument/pad name for display
    },

    // LED state tracking
    desiredButtonLed: new Array(BTN_COUNT).fill(0),
    sentButtonLed: new Array(BTN_COUNT).fill(-1), // -1 forces send on first flush
    pendingPadLed: {}, // note -> velocity (0..127)

    // Encoder touch suppression
    encoderTouchSuppressUntilMs: 0,

    // Playback note tracking
    manualNoteHits: {},         // note -> timestamp of last manual hit
    manuallyHeldNotes: {},      // note -> true if currently manually held
    currentlyPlayingNotes: {},  // note -> true if currently playing from clip
    trackPlaybackColor: 4       // Default to red, updated based on track color
};

// Initialize step sequencer steps array
export function initializeState() {
    state.stepSequencer.steps = [];
    for (let i = 0; i < state.stepSequencer.stepCount; i++) {
        state.stepSequencer.steps[i] = false;
    }
}
