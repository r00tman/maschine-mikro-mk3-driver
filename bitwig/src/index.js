// Maschine Mikro MK3 Controller Script - Main Entry Point
// Modular structure bundled by rollup
// Note: loadAPI, defineController, defineMidiPorts, and device discovery
// are in the rollup banner (must be at global scope for Bitwig)

import { state, initializeState } from './state.js';
import { BTN, MODE_NAMES, PAD_NOTES } from './constants.js';
import { setButtonLed, flushLeds, allLedsOff } from './led.js';
import { sendScreenText } from './screen.js';
import { rgbToPadColor } from './utils/colors.js';
import { onMidi } from './handlers/midi.js';
import { updateModeIndicators, updatePadLedsForMode } from './modes/index.js';
import { setupPlaybackFeedback } from './modes/play.js';
import { setupStepSequencerObserver } from './modes/step.js';
import { setupClipLauncherObservers } from './modes/clip.js';
import { setupMixerObservers } from './modes/mixer.js';

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

// Export entry points for Bitwig
export { init, flush, exit };
