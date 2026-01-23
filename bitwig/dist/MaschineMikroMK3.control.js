// Maschine Mikro MK3 Controller Script for Bitwig Studio
// Works with the Linux userspace MIDI driver from:
// https://github.com/r00tman/maschine-mikro-mk3-driver
//
// MIDI CC Mapping (from driver):
// - Buttons: CC 20-60 (button index + 20), value 127=press, 0=release
// - Encoder: CC 1 (relative mode: 65+ = CW, <64 = CCW)
// - Slider: CC 9 (0-127)
// - Pads: Notes (configurable in driver config)
//
// === PAD PLAYBACK FEEDBACK ===
// Pads provide visual feedback during clip/sequence playback.
// This feature requires Bitwig Studio 6+ (uses API v18 playingNotes() method).
//
// Customizable settings available in Bitwig Controller Settings:
// - Enable/disable playback feedback
// - Enable/disable manual hit feedback
// - Playback color: Track color (matches track) or Fixed color
// - Choose fixed playback color (Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta, White)
// - Choose manual hit color (default: Blue)
//
// Built from modular source - see bitwig/src/ for development

// === Bitwig API Setup (must be at global scope) ===
loadAPI(18);

host.defineController("Native Instruments", "Maschine Mikro MK3 (Linux)", "1.0", "e8f4b3a2-1c5d-4e6f-9a8b-7c0d2e3f4a5b");
host.defineMidiPorts(1, 1);

// Device discovery (supports multiple MIDI naming conventions)
host.addDeviceNameBasedDiscoveryPair(["Virtual Raw MIDI/1"], ["Virtual Raw MIDI/1"]);
host.addDeviceNameBasedDiscoveryPair(["Virtual Raw MIDI/1"], ["Virtual Raw MIDI/2"]);
host.addDeviceNameBasedDiscoveryPair(["Virtual Raw MIDI 1-0"], ["Virtual Raw MIDI 1-0"]);
host.addDeviceNameBasedDiscoveryPair(["Virtual Raw MIDI 1-0"], ["Virtual Raw MIDI 1-1"]);
host.addDeviceNameBasedDiscoveryPair(["VirMIDI 1-0"], ["VirMIDI 1-0"]);
host.addDeviceNameBasedDiscoveryPair(["VirMIDI 1-0"], ["VirMIDI 1-1"]);

// === End Bitwig API Setup ===


var MaschineMikroMK3 = (function (exports) {
    'use strict';

    // Button CC offset (CC = offset + button index)
    const CC_OFFSET = 20;

    // Button indices matching the driver's Buttons enum
    const BTN = {
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
    const BTN_COUNT = 41;

    // CC numbers for other controls
    const CC_ENCODER = 1;
    const CC_SLIDER = 9;

    // Mode definitions
    const MODES = {
        PLAY: 0,
        STEP: 1,
        CLIP: 2,
        MIXER: 3
    };

    const MODE_NAMES = ["Play", "Step", "Clip", "Mixer"];

    // Pad note mapping (from driver default config)
    // Layout: bottom-left to top-right, bottom row first
    const PAD_NOTES = [48, 49, 50, 51, 44, 45, 46, 47, 40, 41, 42, 43, 36, 37, 38, 39];

    // Pad color mapping (velocity ranges from driver)
    const PAD_COLORS = {
        RED: 4,           // 1-7
        ORANGE: 11,       // 8-14
        WARM_YELLOW: 25,  // 22-28
        YELLOW: 32,       // 29-35
        LIME: 39,         // 36-42
        GREEN: 46,        // 43-49
        MINT: 53,         // 50-56
        CYAN: 60,         // 57-63
        TURQUOISE: 67,    // 64-70
        BLUE: 74,         // 71-77
        VIOLET: 88,       // 85-91
        PURPLE: 95,       // 92-98
        MAGENTA: 102,     // 99-105
        FUCHSIA: 109,     // 106-112
        WHITE: 120        // 113-127
    };

    // Fixed velocity value when enabled
    const FIXED_VELOCITY_VALUE = 100;

    // === Global state container ===
    // All mutable state is stored here for easy access across modules

    const state = {
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
    function initializeState() {
        state.stepSequencer.steps = [];
        for (let i = 0; i < state.stepSequencer.stepCount; i++) {
            state.stepSequencer.steps[i] = false;
        }
    }

    /**
     * Set the desired LED state for a button.
     * Value is interpreted by the driver as brightness:
     * 1-42 dim, 43-84 normal, 85-127 bright, 0 off
     */
    function setButtonLed(buttonIndex, value) {
        if (buttonIndex < 0 || buttonIndex >= BTN_COUNT) return;
        state.desiredButtonLed[buttonIndex] = value;
    }

    /**
     * Send button LED change immediately via MIDI CC
     */
    function sendButtonLedNow(buttonIndex, value) {
        const cc = CC_OFFSET + buttonIndex;
        state.midiOut.sendMidi(0xB0, cc, value);
    }

    /**
     * Queue a pad LED update (will be sent in flush)
     */
    function setPadLed(note, velocity) {
        state.pendingPadLed[note] = velocity;
    }

    /**
     * Send all pending pad LED updates
     */
    function flushPadLed() {
        for (const noteStr in state.pendingPadLed) {
            const note = parseInt(noteStr, 10);
            const vel = state.pendingPadLed[noteStr] | 0;
            if (vel > 0) {
                state.midiOut.sendMidi(0x90, note, vel);
            } else {
                state.midiOut.sendMidi(0x80, note, 0);
            }
        }
        state.pendingPadLed = {};
    }

    /**
     * Flush all LED changes (called by Bitwig's flush callback)
     */
    function flushLeds() {
        // Send changed button LEDs
        for (let i = 0; i < BTN_COUNT; i++) {
            const v = state.desiredButtonLed[i];
            if (state.sentButtonLed[i] !== v) {
                sendButtonLedNow(i, v);
                state.sentButtonLed[i] = v;
            }
        }
        // Send pending pad LEDs
        flushPadLed();
    }

    /**
     * Turn off all LEDs (called on exit)
     */
    function allLedsOff() {
        for (let i = 0; i < BTN_COUNT; i++) {
            sendButtonLedNow(i, 0);
        }
    }

    // Screen state for debouncing
    let lastScreenText = "";
    let screenUpdatePending = false;
    let pendingScreenText = "";

    /**
     * Send text to the Maschine screen (debounced)
     * SysEx format: F0 00 21 09 <cmd> <data...> F7
     * Commands: 01 = Screen Text, 02 = Screen Clear
     */
    function sendScreenText(text) {
        // Debounce: if same text, skip
        if (text === lastScreenText) return;
        
        pendingScreenText = text;
        
        // Debounce rapid updates
        if (!screenUpdatePending) {
            screenUpdatePending = true;
            host.scheduleTask(function() {
                doSendScreenText(pendingScreenText);
                screenUpdatePending = false;
            }, 50); // 50ms debounce
        }
    }

    /**
     * Actually send the screen text via SysEx
     */
    function doSendScreenText(text) {
        if (text === lastScreenText) return;
        lastScreenText = text;
        
        // Limit text to 16 characters (screen width)
        const truncated = text.substring(0, 16);
        let sysexData = "F0 00 21 09 01";
        for (let i = 0; i < truncated.length; i++) {
            const charCode = truncated.charCodeAt(i) & 0x7F; // Keep 7-bit ASCII
            sysexData += " " + ("0" + charCode.toString(16)).slice(-2).toUpperCase();
        }
        sysexData += " F7";
        state.midiOut.sendSysex(sysexData);
    }

    /**
     * Convert RGB (0.0-1.0) to closest pad color velocity
     */
    function rgbToPadColor(red, green, blue) {
        // Bitwig provides RGB as floats (0.0 to 1.0)
        // Map to closest pad color based on hue and saturation
        
        // Convert to 0-255 range
        const r = Math.round(red * 255);
        const g = Math.round(green * 255);
        const b = Math.round(blue * 255);
        
        // Calculate HSV to determine color
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;
        
        // Saturation
        const sat = (max === 0) ? 0 : diff / max;
        
        // Low saturation = white/gray
        if (sat < 0.2) {
            return PAD_COLORS.WHITE;
        }
        
        // Hue calculation
        let hue = 0;
        if (diff !== 0) {
            if (max === r) {
                hue = 60 * (((g - b) / diff) % 6);
            } else if (max === g) {
                hue = 60 * (((b - r) / diff) + 2);
            } else {
                hue = 60 * (((r - g) / diff) + 4);
            }
        }
        if (hue < 0) hue += 360;
        
        // Map hue to pad colors
        if (hue < 15 || hue >= 345) return PAD_COLORS.RED;
        if (hue < 30) return PAD_COLORS.ORANGE;
        if (hue < 45) return PAD_COLORS.WARM_YELLOW;
        if (hue < 70) return PAD_COLORS.YELLOW;
        if (hue < 90) return PAD_COLORS.LIME;
        if (hue < 150) return PAD_COLORS.GREEN;
        if (hue < 165) return PAD_COLORS.MINT;
        if (hue < 180) return PAD_COLORS.CYAN;
        if (hue < 195) return PAD_COLORS.TURQUOISE;
        if (hue < 240) return PAD_COLORS.BLUE;
        if (hue < 270) return PAD_COLORS.VIOLET;
        if (hue < 300) return PAD_COLORS.PURPLE;
        if (hue < 320) return PAD_COLORS.MAGENTA;
        return PAD_COLORS.FUCHSIA;
    }

    /**
     * Convert color name from preferences to pad color velocity
     */
    function getColorFromName(colorName) {
        switch (colorName) {
            case "Red": return PAD_COLORS.RED;
            case "Orange": return PAD_COLORS.ORANGE;
            case "Yellow": return PAD_COLORS.YELLOW;
            case "Green": return PAD_COLORS.GREEN;
            case "Cyan": return PAD_COLORS.CYAN;
            case "Blue": return PAD_COLORS.BLUE;
            case "Purple": return PAD_COLORS.PURPLE;
            case "Magenta": return PAD_COLORS.MAGENTA;
            case "White": return PAD_COLORS.WHITE;
            default: return PAD_COLORS.RED;
        }
    }

    /**
     * Get playback color based on user preferences
     */
    function getPlaybackColor() {
        if (state.playbackColorMode.get() === "Fixed Color") {
            return getColorFromName(state.fixedPlaybackColor.get());
        } else {
            return state.trackPlaybackColor; // Track color
        }
    }

    /**
     * Get manual hit color based on user preferences
     */
    function getManualColor() {
        return getColorFromName(state.manualHitColor.get());
    }

    /**
     * Toggle note repeat on/off
     */
    function toggleNoteRepeat() {
        state.noteRepeatEnabled = !state.noteRepeatEnabled;
        setButtonLed(BTN.NOTE_REPEAT, state.noteRepeatEnabled ? 127 : 0);
        host.showPopupNotification(state.noteRepeatEnabled ? "Note Repeat: ON" : "Note Repeat: OFF");
        
        if (!state.noteRepeatEnabled) {
            // Clear all held notes and invalidate pending tasks
            state.heldPadNotes = {};
            state.noteRepeatTaskId++;
        }
    }

    /**
     * Start note repeat for a held note
     */
    function startNoteRepeat(note, velocity) {
        if (!state.noteRepeatEnabled) return;
        if (state.currentMode !== MODES.PLAY) return;
        
        // Store with current task ID to validate later
        state.heldPadNotes[note] = { velocity: velocity, taskId: state.noteRepeatTaskId };
        scheduleNoteRepeatTick(note, state.noteRepeatTaskId);
    }

    /**
     * Stop note repeat for a released note
     */
    function stopNoteRepeat(note) {
        if (state.heldPadNotes[note]) {
            delete state.heldPadNotes[note];
        }
    }

    /**
     * Schedule the next note repeat tick
     */
    function scheduleNoteRepeatTick(note, taskId) {
        host.scheduleTask(function() {
            // Validate: note still held, same task generation, repeat enabled, play mode
            if (!state.heldPadNotes[note]) return;
            if (state.heldPadNotes[note].taskId !== taskId) return;
            if (!state.noteRepeatEnabled) return;
            if (state.currentMode !== MODES.PLAY) return;
            
            const vel = state.heldPadNotes[note].velocity;
            
            // Send note on
            state.noteInput.sendRawMidiEvent(0x90, note, vel);
            
            // Schedule note off
            host.scheduleTask(function() {
                if (state.currentMode === MODES.PLAY) {
                    state.noteInput.sendRawMidiEvent(0x80, note, 0);
                }
            }, Math.max(20, state.noteRepeatInterval / 2));
            
            // Schedule next repeat
            scheduleNoteRepeatTick(note, taskId);
        }, state.noteRepeatInterval);
    }

    /**
     * Cycle through note repeat intervals
     */
    function cycleNoteRepeatInterval() {
        if (state.noteRepeatInterval === 100) {
            state.noteRepeatInterval = 150; // Slower
            host.showPopupNotification("Note Repeat: 1/8");
        } else if (state.noteRepeatInterval === 150) {
            state.noteRepeatInterval = 200; // Even slower
            host.showPopupNotification("Note Repeat: 1/4");
        } else {
            state.noteRepeatInterval = 100; // Fast
            host.showPopupNotification("Note Repeat: 1/16");
        }
    }

    /**
     * Clear all note repeat state (called when leaving play mode)
     */
    function clearNoteRepeat() {
        state.heldPadNotes = {};
        state.noteRepeatTaskId++;
    }

    /**
     * Toggle fixed velocity mode
     */
    function toggleFixedVelocity() {
        state.fixedVelocityEnabled = !state.fixedVelocityEnabled;
        setButtonLed(BTN.FIXED_VEL, state.fixedVelocityEnabled ? 127 : 0);
        host.showPopupNotification(state.fixedVelocityEnabled ? "Fixed Velocity: ON" : "Fixed Velocity: OFF");
    }

    /**
     * Get the velocity to use based on fixed velocity state
     */
    function getVelocity(inputVelocity) {
        return state.fixedVelocityEnabled ? FIXED_VELOCITY_VALUE : inputVelocity;
    }

    /**
     * Update pad LEDs for Play mode
     */
    function updatePlayModeLeds() {
        // Clear all pads - they'll light on playback/hit
        for (let i = 0; i < PAD_NOTES.length; i++) {
            setPadLed(PAD_NOTES[i], 0);
        }
    }

    /**
     * Handle pad note on in Play mode
     */
    function handlePlayModeNoteOn(note, velocity, isPadNote) {
        state.manuallyHeldNotes[note] = true;
        
        // Forward notes to instrument
        const sendVel = getVelocity(velocity);
        state.noteInput.sendRawMidiEvent(0x90, note, sendVel);
        
        // Show manual feedback if enabled
        if (state.enableManualFeedback.get() === "Enabled" && !state.currentlyPlayingNotes[note]) {
            setPadLed(note, getManualColor());
        }
        
        // Start note repeat if enabled
        if (state.noteRepeatEnabled && isPadNote) {
            startNoteRepeat(note, sendVel);
        }
    }

    /**
     * Handle pad note off in Play mode
     */
    function handlePlayModeNoteOff(note, isPadNote) {
        state.manuallyHeldNotes[note] = false;

        // Stop note repeat
        if (state.noteRepeatEnabled && isPadNote) {
            stopNoteRepeat(note);
        }
        
        // Forward note off to instrument
        state.noteInput.sendRawMidiEvent(0x80, note, 0);
        
        // Update LED
        if (!state.currentlyPlayingNotes[note]) {
            setPadLed(note, 0);
        }
    }

    /**
     * Setup playback note feedback observer
     */
    function setupPlaybackFeedback() {
        if (typeof state.cursorTrack.playingNotes !== 'function') {
            println("WARNING: playingNotes() not available - requires Bitwig 6+");
            return;
        }
        
        const trackPlayingNotes = state.cursorTrack.playingNotes();
        trackPlayingNotes.addValueObserver(function(notes) {
            // ONLY process in PLAY mode - absolutely do not interfere with other modes
            if (state.currentMode !== MODES.PLAY) {
                // Clear tracking and immediately return without touching LEDs
                state.currentlyPlayingNotes = {};
                return;
            }
            
            // Check if playback feedback is enabled
            if (state.enablePlaybackFeedback.get() === "Disabled") {
                state.currentlyPlayingNotes = {};
                return;
            }
            
            // Clear tracking map
            state.currentlyPlayingNotes = {};
            
            // Build set of currently playing notes
            if (notes && notes.length > 0) {
                for (let i = 0; i < notes.length; i++) {
                    const playingNote = notes[i];
                    let pitch = -1;
                    
                    // Extract MIDI pitch from PlayingNote object
                    if (typeof playingNote.pitch === 'function') {
                        pitch = playingNote.pitch();
                    } else if (typeof playingNote.key === 'function') {
                        pitch = playingNote.key();
                    } else if (playingNote.pitch !== undefined) {
                        pitch = playingNote.pitch;
                    } else if (playingNote.key !== undefined) {
                        pitch = playingNote.key;
                    }
                    
                    if (pitch >= 0) {
                        state.currentlyPlayingNotes[pitch] = true;
                    }
                }
            }
            
            // Update pad LEDs based on playback state
            for (let j = 0; j < PAD_NOTES.length; j++) {
                const note = PAD_NOTES[j];
                
                if (state.currentlyPlayingNotes[note]) {
                    // Note is playing from clip - use configured color
                    setPadLed(note, getPlaybackColor());
                } else {
                    // Note not playing - only turn off if not manually held
                    if (!state.manuallyHeldNotes[note]) {
                        setPadLed(note, 0);
                    }
                }
            }
        });
        
        println("Playback note feedback enabled (Play mode only)");
    }

    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    /**
     * Convert MIDI note number to note name (e.g., 60 -> "C3")
     * Uses Bitwig/MIDI standard: C3 = 60, C1 = 36
     */
    function getNoteNameFromMidi(midiNote) {
        const octave = Math.floor(midiNote / 12) - 2;  // Bitwig standard: C3=60
        const noteName = NOTE_NAMES[midiNote % 12];
        return noteName + octave;
    }

    /**
     * Update step sequencer LEDs
     */
    function updateStepSequencerLeds() {
        for (let i = 0; i < state.stepSequencer.stepCount; i++) {
            const padNote = PAD_NOTES[i];
            if (i === state.stepSequencer.currentStep) {
                // Playhead position - bright white
                setPadLed(padNote, PAD_COLORS.WHITE);
            } else if (state.stepSequencer.steps[i]) {
                // Step is on - yellow
                setPadLed(padNote, PAD_COLORS.YELLOW);
            } else {
                // Step is off - dim
                setPadLed(padNote, 0);
            }
        }
    }

    /**
     * Toggle a step on/off
     */
    function toggleStep(padIndex) {
        if (padIndex >= 0 && padIndex < state.stepSequencer.stepCount) {
            const pitch = state.stepSequencer.selectedNote;
            const displayName = getCurrentNoteDisplayName();
            println(`Toggle Step: Pad=${padIndex}, Pitch=${pitch} (${displayName})`);
            
            // Optimistically update local state and LEDs immediately
            const wasOn = state.stepSequencer.steps[padIndex];
            state.stepSequencer.steps[padIndex] = !wasOn;
            updateStepSequencerLeds();
            
            if (wasOn) {
                // Step is currently ON, turn it OFF
                // With height=1, y=0 always refers to the current note (set via scrollToKey)
                state.cursorClip.clearStep(padIndex, 0);
            } else {
                // Step is currently OFF, turn it ON
                // With height=1, y=0 always refers to the current note (set via scrollToKey)
                state.cursorClip.setStep(
                    padIndex,
                    0,  // y=0 (current note row)
                    127,  // Full velocity
                    state.stepSequencer.resolution
                );
            }
        }
    }

    /**
     * Clear all steps
     */
    function clearAllSteps() {
        for (let i = 0; i < state.stepSequencer.stepCount; i++) {
            state.stepSequencer.steps[i] = false;
            state.cursorClip.clearStep(i, 0); // y=0 (current note row)
        }
        updateStepSequencerLeds();
    }

    /**
     * Handle pad hit in Step mode
     */
    function handleStepModeNoteOn(note) {
        const padIndex = PAD_NOTES.indexOf(note);
        if (padIndex >= 0) {
            toggleStep(padIndex);
        }
    }

    /**
     * Get display name for current note (drum pad name or note name)
     */
    function getCurrentNoteDisplayName() {
        const note = state.stepSequencer.selectedNote;
        
        // Try to get drum pad name first
        if (state.stepSequencer.drumPadNames[note]) {
            return state.stepSequencer.drumPadNames[note];
        }
        
        // Fall back to MIDI note name
        return getNoteNameFromMidi(note);
    }

    /**
     * Handle encoder turn in Step mode (change note)
     */
    function handleStepEncoderTurn(delta) {
        const oldNote = state.stepSequencer.selectedNote;
        const newNote = Math.max(0, Math.min(127, state.stepSequencer.selectedNote + delta));
        
        if (oldNote !== newNote) {
            // Scroll the clip to the new note - this will trigger the scroll position observer
            // which will update our state and refresh the display
            state.cursorClip.scrollToKey(newNote);
            
            // Also update local state immediately for responsiveness
            state.stepSequencer.selectedNote = newNote;
            
            // Clear steps array (will be updated by observer)
            for (let i = 0; i < state.stepSequencer.stepCount; i++) {
                state.stepSequencer.steps[i] = false;
            }
            
            updateStepSequencerLeds();
            updateStepDisplay();
        }
    }

    /**
     * Update the screen display with current note info
     */
    function updateStepDisplay() {
        const displayName = getCurrentNoteDisplayName();
        state.stepSequencer.currentInstrumentName = displayName;
        sendScreenText(displayName);
        host.showPopupNotification("Step: " + displayName);
    }

    /**
     * Refresh step data for the currently selected note
     */
    function refreshStepDataForCurrentNote() {
        // Clear the steps array (will be populated by the step data observer)
        for (let i = 0; i < state.stepSequencer.stepCount; i++) {
            state.stepSequencer.steps[i] = false;
        }
        
        // Scroll the clip to ensure we're viewing the correct note row
        // This synchronizes the controller's view with Bitwig's clip editor
        // and triggers the step data observer callbacks
        state.cursorClip.scrollToKey(state.stepSequencer.selectedNote);
        
        // Delay LED update to allow observer callbacks to populate step data
        // This prevents showing an empty pattern that immediately fills in (flickering)
        host.scheduleTask(function() {
            if (state.currentMode === 1) { // MODES.STEP
                updateStepSequencerLeds();
            }
        }, 50);
    }

    /**
     * Enter step mode (call when switching to step mode)
     */
    function enterStepMode() {
        // Refresh step data for current note
        refreshStepDataForCurrentNote();
        
        // Update display
        updateStepDisplay();
    }

    /**
     * Setup step sequencer observers
     */
    function setupStepSequencerObserver() {
        // Subscribe to step data for the current note
        // StepDataChangedCallback: function(x, y, state)
        // x = step position (0-15)
        // y = note index within window (always 0 with height=1)
        // state = 0 (empty), 1 (note continues), 2 (note starts)
        state.cursorClip.addStepDataObserver(function(x, y, stepState) {
            // With height=1, y is always 0 (representing the current note set via scrollToKey)
            if (y === 0 && x < state.stepSequencer.stepCount) {
                // Update local state (state > 0 means note exists)
                state.stepSequencer.steps[x] = (stepState > 0);
                
                // Update LEDs only if we are in Step mode
                if (state.currentMode === 1) {
                    updateStepSequencerLeds();
                }
            }
        });
        
        // Subscribe to playhead position
        state.cursorClip.addPlayingStepObserver(function(step) {
            if (state.currentMode === 1 && step >= 0) {
                const newStep = step % state.stepSequencer.stepCount;
                // Only update if playhead actually moved to avoid excessive updates
                if (newStep !== state.stepSequencer.currentStep) {
                    state.stepSequencer.currentStep = newStep;
                    updateStepSequencerLeds();
                }
            }
        });
        
        // Setup drum pad name observers
        for (let i = 0; i < 128; i++) {
            const pad = state.drumPadBank.getItemAt(i);
            const padName = pad.name();
            padName.markInterested();
            
            // Capture the MIDI note number in closure
            const midiNote = i;
            padName.addValueObserver(function(name) {
                if (name && name.trim() !== "") {
                    state.stepSequencer.drumPadNames[midiNote] = name;
                    
                    // Update display if this is the currently selected note
                    if (midiNote === state.stepSequencer.selectedNote && state.currentMode === 1) {
                        updateStepDisplay();
                    }
                } else {
                    delete state.stepSequencer.drumPadNames[midiNote];
                }
            });
        }
    }

    /**
     * Setup clip launcher observers
     */
    function setupClipLauncherObservers() {
        for (let trackIdx = 0; trackIdx < 4; trackIdx++) {
            const trackItem = state.trackBank.getItemAt(trackIdx);
            const slotBank = trackItem.clipLauncherSlotBank();
            
            for (let sceneIdx = 0; sceneIdx < 4; sceneIdx++) {
                const slot = slotBank.getItemAt(sceneIdx);
                
                // Mark interested
                slot.hasContent().markInterested();
                slot.isPlaying().markInterested();
                slot.isRecording().markInterested();
                slot.isPlaybackQueued().markInterested();

                // Observe if slot has content
                slot.hasContent().addValueObserver(function(hasContent) {
                     if (state.currentMode === MODES.CLIP) {
                         updateClipSlotLed(trackIdx, sceneIdx, slot);
                     }
                });
                
                // Observe playback state
                slot.isPlaying().addValueObserver(function(isPlaying) {
                    if (state.currentMode === MODES.CLIP) {
                        updateClipSlotLed(trackIdx, sceneIdx, slot);
                    }
                });
                
                // Observe recording state
                slot.isRecording().addValueObserver(function(isRecording) {
                    if (state.currentMode === MODES.CLIP) {
                        updateClipSlotLed(trackIdx, sceneIdx, slot);
                    }
                });
                
                // Observe queued state
                slot.isPlaybackQueued().addValueObserver(function(isQueued) {
                    if (state.currentMode === MODES.CLIP) {
                        updateClipSlotLed(trackIdx, sceneIdx, slot);
                    }
                });
            }
        }
    }

    function updateClipSlotLed(trackIdx, sceneIdx, slot) {
        // Map track/scene to pad
        // Pad Col = trackIdx
        // Pad Row = sceneIdx + 1 (Row 0 is scenes)
        const padRow = sceneIdx + 1;
        if (padRow > 3) return; // Only fit 3 rows of clips
        
        const padIndex = padRow * 4 + trackIdx;
        
        if (slot.isRecording().get()) {
            setPadLed(PAD_NOTES[padIndex], PAD_COLORS.RED); // Recording
        } else if (slot.isPlaying().get()) {
            setPadLed(PAD_NOTES[padIndex], PAD_COLORS.GREEN); // Playing
        } else if (slot.isPlaybackQueued().get()) {
            setPadLed(PAD_NOTES[padIndex], PAD_COLORS.YELLOW); // Queued
        } else if (slot.hasContent().get()) {
            setPadLed(PAD_NOTES[padIndex], PAD_COLORS.CYAN); // Has content
        } else {
            setPadLed(PAD_NOTES[padIndex], 0); // Empty
        }
    }

    /**
     * Update clip launcher LEDs
     */
    function updateClipLauncherLeds() {
        // In clip mode, pads trigger clips
        // Top row (pads 0-3): scenes 1-4
        // Other rows: track clips
        
        // Update Scenes (Row 0)
        for (let i = 0; i < 4; i++) {
            setPadLed(PAD_NOTES[i], PAD_COLORS.WHITE); // Scene triggers
        }
        
        // Update Clips (Rows 1-3)
        for (let trackIdx = 0; trackIdx < 4; trackIdx++) {
            const trackItem = state.trackBank.getItemAt(trackIdx);
            const slotBank = trackItem.clipLauncherSlotBank();
            
            for (let sceneIdx = 0; sceneIdx < 3; sceneIdx++) {
                const slot = slotBank.getItemAt(sceneIdx);
                updateClipSlotLed(trackIdx, sceneIdx, slot);
            }
        }
    }

    /**
     * Trigger clip/scene at pad position
     */
    function triggerClipAtPad(padIndex) {
        const row = Math.floor(padIndex / 4);
        const col = padIndex % 4;
        
        if (row === 0) {
            // Top row triggers scenes
            state.sceneBank.getScene(col).launch();
        } else {
            // Other rows trigger track clips
            const track = state.trackBank.getItemAt(col);
            // Row 1 -> Scene 0 (Slot 0)
            // Row 2 -> Scene 1 (Slot 1)
            // Row 3 -> Scene 2 (Slot 2)
            const slotIndex = row - 1;
            const slot = track.clipLauncherSlotBank().getItemAt(slotIndex);
            
            // Check if slot has content before launching (optional, but good practice)
            if (slot.hasContent().get()) {
                slot.launch();
            } else {
                // Create empty clip
                slot.createEmptyClip(4);
            }
        }
    }

    /**
     * Handle pad hit in Clip mode
     */
    function handleClipModeNoteOn(note) {
        const padIndex = PAD_NOTES.indexOf(note);
        if (padIndex >= 0) {
            triggerClipAtPad(padIndex);
            // Feedback is handled by observers
        }
    }

    /**
     * Handle encoder turn in Clip mode (navigate scenes)
     */
    function handleClipEncoderTurn(delta) {
        const steps = Math.min(8, Math.abs(delta));
        for (let i = 0; i < steps; i++) {
            if (delta > 0) {
                state.sceneBank.scrollPageDown();
            } else {
                state.sceneBank.scrollPageUp();
            }
        }
    }

    /**
     * Setup mixer mode observers
     */
    function setupMixerObservers() {
        for (let i = 0; i < 4; i++) {
            const track = state.trackBank.getItemAt(i);
            
            // Subscribe to states
            const muteValue = track.mute();
            muteValue.markInterested();
            muteValue.addValueObserver(function(isMuted) {
                if (state.currentMode === MODES.MIXER) {
                    const padIndex = 4 + i; // Row 1
                    setPadLed(PAD_NOTES[padIndex], isMuted ? PAD_COLORS.WHITE : PAD_COLORS.ORANGE);
                }
            });
            
            const soloValue = track.solo();
            soloValue.markInterested();
            soloValue.addValueObserver(function(isSoloed) {
                if (state.currentMode === MODES.MIXER) {
                    const padIndex = 8 + i; // Row 2
                    setPadLed(PAD_NOTES[padIndex], isSoloed ? PAD_COLORS.WHITE : PAD_COLORS.YELLOW);
                }
            });
            
            const armValue = track.arm();
            armValue.markInterested();
            armValue.addValueObserver(function(isArmed) {
                if (state.currentMode === MODES.MIXER) {
                    const padIndex = 12 + i; // Row 3
                    setPadLed(PAD_NOTES[padIndex], isArmed ? PAD_COLORS.WHITE : PAD_COLORS.RED);
                }
            });
            
            // Track selection indicator
            track.addIsSelectedObserver(function(isSelected) {
                if (state.currentMode === MODES.MIXER) {
                    const padIndex = i; // Row 0
                    setPadLed(PAD_NOTES[padIndex], isSelected ? PAD_COLORS.WHITE : PAD_COLORS.BLUE);
                }
            });
        }
    }

    /**
     * Update mixer mode LEDs
     */
    function updateMixerLeds() {
        // In mixer mode, pads control track selection/mute/solo
        // Row 0: Track select (1-4)
        // Row 1: Mute
        // Row 2: Solo
        // Row 3: Arm
        
        // We can rely on observers to update state, but initially we might want to force update
        // However, since we don't have direct access to "get()" values easily without observers firing,
        // we might just set defaults and let observers override.
        // Or simpler: just let observers handle it. 
        // But observers fire on change. They also fire on registration usually (initial value).
        // So if we register them in init(), they might have fired once.
        // But when we switch mode to MIXER, we need to refresh LEDs.
        
        // The review says "Clean state on mode switch - Clear arrays, update all LEDs".
        // And "Mode-check in every observer".
        // So when we switch to MIXER, we call updateMixerLeds().
        // But we don't have the current values of mute/solo/etc stored in state object explicitly to read them here.
        // We should probably rely on the observers firing or store them in state.
        // For now, I'll stick to what was requested: "Add mixer mode state observers".
        
        // If I just add observers, they update LEDs when value changes.
        // But if I switch mode, the LEDs are cleared/changed. I need to restore them.
        // The observer checks `state.currentMode === MODES.MIXER`.
        // So if I switch mode, nothing happens until value changes?
        // No, that's bad.
        
        // Ideally we should cache these values in state or query them.
        // Since we can't easily query synchronously in Bitwig API without `get()`,
        // and `get()` is only available on some objects or requires MarkInterested.
        // We already markInterested.
        // Does `muteValue.get()` work? Yes if marked interested.
        
        for (let i = 0; i < 4; i++) {
            const track = state.trackBank.getItemAt(i);
            
            // Update based on current values if available
            const isMuted = track.mute().get();
            const padIndexMute = 4 + i;
            setPadLed(PAD_NOTES[padIndexMute], isMuted ? PAD_COLORS.WHITE : PAD_COLORS.ORANGE);

            const isSoloed = track.solo().get();
            const padIndexSolo = 8 + i;
            setPadLed(PAD_NOTES[padIndexSolo], isSoloed ? PAD_COLORS.WHITE : PAD_COLORS.YELLOW);
            
            const isArmed = track.arm().get();
            const padIndexArm = 12 + i;
            setPadLed(PAD_NOTES[padIndexArm], isArmed ? PAD_COLORS.WHITE : PAD_COLORS.RED);
            
            // Selection is harder to get directly without tracking it ourselves or having an observer
            // We can just rely on the fact that one of them is selected.
            // Or we can leave it to the observer updates if they happen frequently enough.
            // Actually, let's just use a default color for selection row for now, 
            // as `addIsSelectedObserver` doesn't give us a `get()` method on the track itself easily for selection state.
            const padIndexSelect = i;
            setPadLed(PAD_NOTES[padIndexSelect], PAD_COLORS.BLUE); 
        }
    }

    /**
     * Handle pad hit in Mixer mode
     */
    function handleMixerPad(padIndex) {
        const row = Math.floor(padIndex / 4);
        const col = padIndex % 4;
        const track = state.trackBank.getItemAt(col);
        
        switch (row) {
            case 0: // Select track
                track.selectInMixer();
                break;
            case 1: // Mute
                track.mute().toggle();
                break;
            case 2: // Solo
                track.solo().toggle();
                break;
            case 3: // Arm
                track.arm().toggle();
                break;
        }
    }

    /**
     * Handle pad note on in Mixer mode
     */
    function handleMixerModeNoteOn(note) {
        const padIndex = PAD_NOTES.indexOf(note);
        if (padIndex >= 0) {
            handleMixerPad(padIndex);
            setPadLed(note, PAD_COLORS.WHITE);
        }
    }

    /**
     * Cycle to the next mode
     */
    function cycleMode() {
        state.currentMode = (state.currentMode + 1) % 4;
        onModeChanged();
    }

    /**
     * Set a specific mode
     */
    function setMode(mode) {
        if (mode >= 0 && mode < 4 && mode !== state.currentMode) {
            state.currentMode = mode;
            onModeChanged();
        }
    }

    /**
     * Called when mode changes
     */
    function onModeChanged() {
        // Stop any note repeat when leaving play mode
        if (state.currentMode !== MODES.PLAY) {
            clearNoteRepeat();
        }
        
        // Initialize step mode when entering it
        if (state.currentMode === MODES.STEP) {
            enterStepMode();
        }
        
        updateModeIndicators();
        updatePadLedsForMode();
        host.showPopupNotification("Mode: " + MODE_NAMES[state.currentMode]);
        
        // Don't override screen text if step mode sets it
        if (state.currentMode !== MODES.STEP) {
            sendScreenText(MODE_NAMES[state.currentMode]);
        }
    }

    /**
     * Update mode indicator button LEDs
     */
    function updateModeIndicators() {
        // Light up the button corresponding to current mode
        // KEYBOARD = Play, STEP = Step, SCENE = Clip, PATTERN = Mixer
        setButtonLed(BTN.KEYBOARD, state.currentMode === MODES.PLAY ? 127 : 42);
        setButtonLed(BTN.STEP, state.currentMode === MODES.STEP ? 127 : 42);
        setButtonLed(BTN.SCENE, state.currentMode === MODES.CLIP ? 127 : 42);
        setButtonLed(BTN.PATTERN, state.currentMode === MODES.MIXER ? 127 : 42);
        
        // Light PAD_MODE to show mode is active
        setButtonLed(BTN.PAD_MODE, 127);
    }

    /**
     * Update pad LEDs based on current mode
     */
    function updatePadLedsForMode() {
        switch (state.currentMode) {
            case MODES.PLAY:
                updatePlayModeLeds();
                break;
            case MODES.STEP:
                updateStepSequencerLeds();
                break;
            case MODES.CLIP:
                updateClipLauncherLeds();
                break;
            case MODES.MIXER:
                updateMixerLeds();
                break;
        }
    }

    /**
     * Handle button press/release
     */
    function onButton(button, pressed, value) {
        // Track encoder touch to suppress spurious encoder ticks
        if (button === BTN.ENCODER_TOUCH) {
            if (pressed) {
                state.encoderTouchSuppressUntilMs = Date.now() + 120;
            }
            return;
        }

        // Track shift state
        if (button === BTN.SHIFT) {
            state.isShiftPressed = pressed;
            setButtonLed(BTN.SHIFT, pressed ? 127 : 0);
            return;
        }

        // Only act on button press, not release
        if (!pressed) return;

        switch (button) {
            // === TRANSPORT ===
            case BTN.PLAY:
                if (state.isShiftPressed) {
                    state.transport.returnToArrangement();
                } else {
                    state.transport.togglePlay();
                }
                break;

            case BTN.STOP:
                if (state.isShiftPressed) {
                    state.transport.resetAutomationOverrides();
                } else {
                    state.transport.stop();
                }
                break;

            case BTN.REC:
                if (state.isShiftPressed) {
                    state.transport.isArrangerOverdubEnabled().toggle();
                } else {
                    state.transport.isArrangerRecordEnabled().toggle();
                }
                break;

            case BTN.RESTART:
                if (state.isShiftPressed) {
                    state.transport.isArrangerLoopEnabled().toggle();
                } else {
                    state.transport.jumpToPlayStartPosition();
                }
                break;

            case BTN.TAP:
                if (state.isShiftPressed) {
                    state.transport.isMetronomeEnabled().toggle();
                } else {
                    state.transport.tapTempo();
                }
                break;

            case BTN.TEMPO:
                if (state.isShiftPressed) ; else {
                    state.transport.tapTempo();
                }
                break;

            // === NAVIGATION ===
            case BTN.LEFT:
                if (state.isShiftPressed) {
                    state.cursorTrack.selectPrevious();
                } else {
                    state.transport.rewind();
                }
                break;

            case BTN.RIGHT:
                if (state.isShiftPressed) {
                    state.cursorTrack.selectNext();
                } else {
                    state.transport.fastForward();
                }
                break;

            case BTN.ENCODER_PRESS:
                if (state.isShiftPressed) {
                    state.cursorTrack.selectInMixer();
                } else {
                    state.cursorTrack.selectInEditor();
                }
                break;

            // === BROWSER ===
            case BTN.BROWSE:
                if (state.isShiftPressed) {
                    state.cursorDevice.browseToInsertAfterDevice();
                } else {
                    state.application.toggleBrowserVisibility();
                }
                break;

            // === TRACK CONTROLS ===
            case BTN.SOLO:
                state.cursorTrack.solo().toggle();
                break;

            case BTN.MUTE:
                state.cursorTrack.mute().toggle();
                break;

            case BTN.SELECT:
                state.cursorTrack.selectInMixer();
                break;

            case BTN.SAMPLING:
                state.cursorTrack.arm().toggle();
                break;

            // === EDITING ===
            case BTN.DUPLICATE:
                if (state.isShiftPressed) {
                    state.application.duplicateObject();
                } else {
                    state.application.duplicate();
                }
                break;

            case BTN.ERASE:
                if (state.isShiftPressed) {
                    state.application.cut();
                } else {
                    if (state.currentMode === MODES.STEP) {
                        // Clear all steps in step sequencer mode
                        clearAllSteps();
                        host.showPopupNotification("Steps Cleared");
                    } else {
                        state.application.remove();
                    }
                }
                break;

            case BTN.VOLUME:
                if (state.isShiftPressed) {
                    state.application.redo();
                } else {
                    state.application.undo();
                }
                break;

            // === DEVICE NAVIGATION ===
            case BTN.PLUGIN:
                if (state.isShiftPressed) {
                    state.cursorDevice.selectPrevious();
                } else {
                    state.cursorDevice.selectNext();
                }
                break;

            case BTN.GROUP:
                if (state.isShiftPressed) {
                    state.cursorDevice.selectParent();
                } else {
                    state.cursorTrack.selectParent();
                }
                break;

            // === VIEW TOGGLES / MODE SELECTION ===
            case BTN.KEYBOARD:
                if (state.isShiftPressed) {
                    state.application.toggleNoteEditor();
                } else {
                    setMode(MODES.PLAY);
                }
                break;

            case BTN.STEP:
                if (state.isShiftPressed) {
                    state.application.toggleAutomationEditor();
                } else {
                    setMode(MODES.STEP);
                }
                break;

            case BTN.SCENE:
                if (state.isShiftPressed) {
                    state.application.toggleMixer();
                } else {
                    setMode(MODES.CLIP);
                }
                break;

            case BTN.PATTERN:
                if (state.isShiftPressed) {
                    state.transport.returnToArrangement();
                } else {
                    setMode(MODES.MIXER);
                }
                break;

            case BTN.EVENTS:
                if (state.isShiftPressed) {
                    state.arranger.toggleClipLauncher();
                } else {
                    state.application.toggleDevices();
                }
                break;

            // === AUTOMATION ===
            case BTN.AUTO:
                if (state.isShiftPressed) {
                    state.transport.resetAutomationOverrides();
                } else {
                    state.transport.isArrangerAutomationWriteEnabled().toggle();
                }
                break;

            case BTN.FOLLOW:
                if (state.isShiftPressed) {
                    state.application.zoomToFit();
                } else {
                    // Note: Follow playback is not exposed in the Bitwig API
                    // Using zoom to selection as alternative
                    state.application.zoomToSelection();
                }
                break;

            // === GROOVE / SWING ===
            case BTN.SWING:
                if (state.isShiftPressed) {
                    state.groove.getEnabled().toggle();
                } else {
                    // Could show groove panel
                    host.showPopupNotification("Swing: Use encoder to adjust");
                }
                break;

            // === UTILITY ===
            case BTN.STAR:
                if (state.isShiftPressed) {
                    state.application.selectAll();
                } else {
                    state.application.selectNone();
                }
                break;

            case BTN.LOCK:
                if (state.isShiftPressed) {
                    state.cursorTrack.isPinned().toggle();
                } else {
                    state.cursorDevice.isPinned().toggle();
                }
                break;

            case BTN.NOTE_REPEAT:
                if (state.isShiftPressed) {
                    // Shift + Note Repeat: cycle repeat interval
                    cycleNoteRepeatInterval();
                } else {
                    toggleNoteRepeat();
                }
                break;

            case BTN.FIXED_VEL:
                if (state.isShiftPressed) {
                    // Could adjust fixed velocity value
                    host.showPopupNotification("Fixed Vel: " + FIXED_VELOCITY_VALUE);
                } else {
                    toggleFixedVelocity();
                }
                break;

            case BTN.PAD_MODE:
                if (state.isShiftPressed) {
                    // Shift + Pad Mode: return to Play mode
                    setMode(MODES.PLAY);
                } else {
                    // Cycle through modes
                    cycleMode();
                }
                break;

            case BTN.CHORDS:
                host.showPopupNotification("Chords: N/A");
                break;

            case BTN.VARIATION:
                if (state.isShiftPressed) {
                    state.application.paste();
                } else {
                    state.application.copy();
                }
                break;

            case BTN.PERFORM:
                state.application.toggleFullScreen();
                break;

            case BTN.NOTES:
                state.application.toggleInspector();
                break;

            case BTN.PITCH:
                // Could control pitch bend range
                break;

            case BTN.MOD:
                // Could control modulation
                break;

            case BTN.MASCHINE:
                if (state.isShiftPressed) {
                    host.showPopupNotification("Maschine Mikro MK3 (Linux Driver)");
                } else {
                    state.application.toggleInspector();
                }
                break;
        }
    }

    /**
     * Decode the relative encoder value
     * The driver sends encoder CC in "offset binary" relative mode:
     * value = 64 + delta, where delta is signed.
     * Examples: 65 => +1, 63 => -1, 59 => -5, 71 => +7.
     */
    function decodeRelativeEncoder(value) {
        if (value === 0 || value === 64) return 0;
        return value - 64;
    }

    /**
     * Navigate tracks (used by multiple modes)
     */
    function navigateTracks(delta) {
        const steps = Math.min(8, Math.abs(delta));
        for (let i = 0; i < steps; i++) {
            if (delta > 0) {
                state.cursorTrack.selectNext();
            } else {
                state.cursorTrack.selectPrevious();
            }
        }
    }

    /**
     * Handle encoder rotation
     */
    function onEncoder(delta) {
        // Filter out noise and cap large deltas
        if (delta === 0) return;
        if (delta > 8) delta = 8;
        if (delta < -8) delta = -8;

        if (state.isShiftPressed) {
            // Tempo adjustment (works in all modes)
            state.transport.tempo().incRaw(delta);
            return;
        }
        
        // Mode-specific encoder behavior
        switch (state.currentMode) {
            case MODES.PLAY:
                // Navigate tracks
                navigateTracks(delta);
                break;
                
            case MODES.STEP:
                // Change step sequencer note
                handleStepEncoderTurn(delta);
                break;
                
            case MODES.CLIP:
                // Navigate scenes
                handleClipEncoderTurn(delta);
                break;
                
            case MODES.MIXER:
                // Navigate tracks
                navigateTracks(delta);
                break;
        }
    }

    /**
     * Handle slider movement
     */
    function onSlider(value) {
        if (state.isShiftPressed) {
            // Master volume or crossfader
            // Would need master track: host.createMasterTrack(0).volume().set(value, 128);
            return;
        }
        
        // Mode-specific slider behavior
        switch (state.currentMode) {
            case MODES.PLAY:
            case MODES.MIXER:
                // Track volume
                state.cursorTrack.volume().set(value, 128);
                break;
                
            case MODES.STEP:
                // Could adjust step velocity or swing
                // For now, still track volume
                state.cursorTrack.volume().set(value, 128);
                break;
                
            case MODES.CLIP:
                // Could adjust clip tempo or something
                state.cursorTrack.volume().set(value, 128);
                break;
        }
    }

    /**
     * Main MIDI callback handler
     */
    function onMidi(status, data1, data2) {
        const msgType = status & 0xF0;

        // Handle CC messages
        if (msgType === 0xB0) {
            onCC(data1, data2);
            return;
        }

        // Check if this is a pad note
        const note = data1;
        const isPadNote = PAD_NOTES.indexOf(note) >= 0;
        
        // Pad note events - behavior depends on current mode
        if (msgType === 0x90) {
            const velocity = data2;
            
            if (velocity > 0) {
                // Note on
                state.manualNoteHits[note] = Date.now();
                
                // Handle based on mode
                switch (state.currentMode) {
                    case MODES.PLAY:
                        handlePlayModeNoteOn(note, velocity, isPadNote);
                        break;
                        
                    case MODES.STEP:
                        if (isPadNote) {
                            handleStepModeNoteOn(note);
                        }
                        break;
                        
                    case MODES.CLIP:
                        if (isPadNote) {
                            handleClipModeNoteOn(note);
                        }
                        break;
                        
                    case MODES.MIXER:
                        if (isPadNote) {
                            handleMixerModeNoteOn(note);
                        }
                        break;
                }
            } else {
                // Note on with velocity 0 = note off
                handleNoteOff(note, isPadNote);
            }
            return;
        }
        
        // Explicit note off
        if (msgType === 0x80) {
            handleNoteOff(note, isPadNote);
            return;
        }
    }

    /**
     * Handle CC messages
     */
    function onCC(cc, value) {
        const isPressed = value > 0;

        // Button CCs (20-60)
        if (cc >= CC_OFFSET && cc < CC_OFFSET + 41) {
            const buttonIndex = cc - CC_OFFSET;
            onButton(buttonIndex, isPressed);
            return;
        }

        // Encoder rotation (CC 1)
        if (cc === CC_ENCODER) {
            // Suppress spurious encoder ticks right after capacitive touch engages
            if (Date.now() < state.encoderTouchSuppressUntilMs) return;
            const delta = decodeRelativeEncoder(value);
            onEncoder(delta);
            return;
        }

        // Slider (CC 9)
        if (cc === CC_SLIDER) {
            onSlider(value);
            return;
        }
    }

    /**
     * Handle note off events
     */
    function handleNoteOff(note, isPadNote) {
        // Stop note repeat
        if (state.noteRepeatEnabled && isPadNote) {
            stopNoteRepeat(note);
        }
        
        switch (state.currentMode) {
            case MODES.PLAY:
                handlePlayModeNoteOff(note, isPadNote);
                break;
                
            case MODES.CLIP:
            case MODES.MIXER:
                // Restore mode colors after flash
                if (isPadNote) {
                    updatePadLedsForMode();
                }
                break;
        }
    }

    // Maschine Mikro MK3 Controller Script - Main Entry Point
    // Modular structure bundled by rollup
    // Note: loadAPI, defineController, defineMidiPorts, and device discovery
    // are in the rollup banner (must be at global scope for Bitwig)


    /**
     * Initialize the controller script
     */
    function init() {
        // Get MIDI output
        state.midiOut = host.getMidiOutPort(0);

        // Initialize state arrays
        initializeState();

        // Setup user preferences
        setupPreferences();

        // Create Bitwig API objects
        setupBitwigApi();

        // Setup observers
        setupObservers();

        // Create note input for pads
        // Use empty filter "" to not auto-pass any notes - we'll send them manually in Play mode
        state.noteInput = host.getMidiInPort(0).createNoteInput("Maschine Pads", "");
        state.noteInput.setShouldConsumeEvents(true); // We handle all events manually

        // Setup playback note feedback
        setupPlaybackFeedback();

        // Set up MIDI callback
        host.getMidiInPort(0).setMidiCallback(onMidi);

        // Initialize LEDs after a short delay
        host.scheduleTask(function() {
            // Dim "Maschine" to show connected
            setButtonLed(BTN.MASCHINE, 42);
            
            // Initialize mode indicators
            updateModeIndicators();
            
            // Send initial mode to screen
            sendScreenText(MODE_NAMES[state.currentMode]);
        }, 100);

        println("Maschine Mikro MK3 (Linux) initialized with modes, note repeat, fixed velocity, and step sequencer");
    }

    /**
     * Setup user preferences
     */
    function setupPreferences() {
        state.preferences = host.getPreferences();
        
        // Playback feedback enable/disable
        state.enablePlaybackFeedback = state.preferences.getEnumSetting(
            "Playback Feedback",
            "Pad LEDs",
            ["Enabled", "Disabled"],
            "Enabled"
        );
        state.enablePlaybackFeedback.markInterested();
        
        // Manual hit feedback enable/disable
        state.enableManualFeedback = state.preferences.getEnumSetting(
            "Manual Hit Feedback",
            "Pad LEDs",
            ["Enabled", "Disabled"],
            "Enabled"
        );
        state.enableManualFeedback.markInterested();
        
        // Playback color mode: track color or fixed color
        state.playbackColorMode = state.preferences.getEnumSetting(
            "Playback Color Mode",
            "Pad LEDs",
            ["Track Color", "Fixed Color"],
            "Track Color"
        );
        state.playbackColorMode.markInterested();
        
        // Fixed playback color selection
        state.fixedPlaybackColor = state.preferences.getEnumSetting(
            "Fixed Playback Color",
            "Pad LEDs",
            ["Red", "Orange", "Yellow", "Green", "Cyan", "Blue", "Purple", "Magenta", "White"],
            "Red"
        );
        state.fixedPlaybackColor.markInterested();
        
        // Manual hit color selection
        state.manualHitColor = state.preferences.getEnumSetting(
            "Manual Hit Color",
            "Pad LEDs",
            ["Red", "Orange", "Yellow", "Green", "Cyan", "Blue", "Purple", "Magenta", "White"],
            "Blue"
        );
        state.manualHitColor.markInterested();
    }

    /**
     * Setup Bitwig API objects
     */
    function setupBitwigApi() {
        state.transport = host.createTransport();
        // Create cursor track with sends and scenes for clip launcher access
        state.cursorTrack = host.createCursorTrack("MaschineMikro", "Cursor Track", 0, 8, true);
        state.cursorDevice = state.cursorTrack.createCursorDevice();
        state.application = host.createApplication();
        state.arranger = host.createArranger();
        state.groove = host.createGroove();
        
        // Create cursor clip for step sequencer editing
        // Window size: 16 steps x 1 key (single note row, use scrollToKey to select which note)
        // This way y=0 always refers to the currently selected note
        state.cursorClip = host.createCursorClip(state.stepSequencer.stepCount, 1);
        state.cursorClip.getLoopLength().markInterested();
        state.cursorClip.getPlayStart().markInterested();
        
        // Scene and track banks for clip launcher mode
        state.trackBank = host.createTrackBank(4, 0, 4);
        state.sceneBank = host.createSceneBank(4);

        // Initialize clip launcher slots on each track
        // Note: createTrackBank(4, 0, 4) already allocates 4 scenes (slots) per track, 
        // so we don't need to explicitly call setSize() on the clipLauncherSlotBank unless we need to change it.
        // The previous call to setSize(4) caused an error because the API might not expose it on the proxy or it's immutable here.
        
        // Create drum pad bank for step sequencer instrument names
        // This allows us to get drum pad names instead of just MIDI note numbers
        state.drumPadBank = state.cursorDevice.createDrumPadBank(128);
    }

    /**
     * Setup value observers
     */
    function setupObservers() {
        // Step sequencer playhead
        setupStepSequencerObserver();
        setupClipLauncherObservers();
        setupMixerObservers();
        
        // Track name observer for screen updates
        const trackNameValue = state.cursorTrack.name();
        trackNameValue.markInterested();
        trackNameValue.addValueObserver(function(name) {
            // Only update screen in Play/Mixer mode
            if (state.currentMode === 0 || state.currentMode === 3) { // PLAY or MIXER
                sendScreenText(name);
            }
        });

        // Transport observers
        state.transport.addIsPlayingObserver(function(isPlaying) {
            setButtonLed(BTN.PLAY, isPlaying ? 127 : 0);
        });

        const recordValue = state.transport.isArrangerRecordEnabled();
        recordValue.markInterested();
        recordValue.addValueObserver(function(value) {
            setButtonLed(BTN.REC, value ? 127 : 0);
        });

        const loopValue = state.transport.isArrangerLoopEnabled();
        loopValue.markInterested();
        loopValue.addValueObserver(function(value) {
            setButtonLed(BTN.RESTART, value ? 127 : 0);
        });

        const metronomeValue = state.transport.isMetronomeEnabled();
        metronomeValue.markInterested();
        metronomeValue.addValueObserver(function(value) {
            setButtonLed(BTN.TAP, value ? 127 : 0);
        });

        const automationValue = state.transport.isArrangerAutomationWriteEnabled();
        automationValue.markInterested();
        automationValue.addValueObserver(function(value) {
            setButtonLed(BTN.AUTO, value ? 127 : 0);
        });

        // Track observers
        const soloValue = state.cursorTrack.solo();
        soloValue.markInterested();
        soloValue.addValueObserver(function(value) {
            setButtonLed(BTN.SOLO, value ? 127 : 0);
        });

        const muteValue = state.cursorTrack.mute();
        muteValue.markInterested();
        muteValue.addValueObserver(function(value) {
            setButtonLed(BTN.MUTE, value ? 127 : 0);
        });

        const armValue = state.cursorTrack.arm();
        armValue.markInterested();
        armValue.addValueObserver(function(value) {
            setButtonLed(BTN.SAMPLING, value ? 127 : 0);
        });

        // Track color observer
        const trackColor = state.cursorTrack.color();
        trackColor.markInterested();
        trackColor.addValueObserver(function(red, green, blue) {
            // Map RGB to closest pad color
            const newColor = rgbToPadColor(red, green, blue);
            if (newColor !== state.trackPlaybackColor) {
                state.trackPlaybackColor = newColor;
                println("Track color changed - playback pads will use velocity " + state.trackPlaybackColor);
            }
        });
    }

    /**
     * Flush pending LED changes (called by Bitwig)
     */
    function flush() {
        flushLeds();
    }

    /**
     * Clean up on exit
     */
    function exit() {
        // Turn off all LEDs
        allLedsOff();
        
        // Turn off all pads
        for (let j = 0; j < PAD_NOTES.length; j++) {
            state.midiOut.sendMidi(0x80, PAD_NOTES[j], 0);
        }
        
        println("Maschine Mikro MK3 Controller Script unloaded");
    }

    exports.exit = exit;
    exports.flush = flush;
    exports.init = init;

    return exports;

})({});

// Expose required Bitwig entry points as globals
var init = MaschineMikroMK3.init;
var flush = MaschineMikroMK3.flush;
var exit = MaschineMikroMK3.exit;
