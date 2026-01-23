import { state } from '../state.js';
import { BTN, MODES, MODE_NAMES, PAD_NOTES } from '../constants.js';
import { setButtonLed, setPadLed } from '../led.js';
import { sendScreenText } from '../screen.js';
import { clearNoteRepeat } from '../features/noteRepeat.js';
import { updatePlayModeLeds } from './play.js';
import { updateStepSequencerLeds, enterStepMode } from './step.js';
import { updateClipLauncherLeds } from './clip.js';
import { updateMixerLeds } from './mixer.js';

/**
 * Cycle to the next mode
 */
export function cycleMode() {
    state.currentMode = (state.currentMode + 1) % 4;
    onModeChanged();
}

/**
 * Set a specific mode
 */
export function setMode(mode) {
    if (mode >= 0 && mode < 4 && mode !== state.currentMode) {
        state.currentMode = mode;
        onModeChanged();
    }
}

/**
 * Called when mode changes
 */
export function onModeChanged() {
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
export function updateModeIndicators() {
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
export function updatePadLedsForMode() {
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

// Re-export mode-specific functions for convenience
export { updatePlayModeLeds } from './play.js';
export { updateStepSequencerLeds, toggleStep, clearAllSteps, handleStepModeNoteOn, handleStepEncoderTurn, refreshStepDataForCurrentNote, enterStepMode } from './step.js';
export { updateClipLauncherLeds, triggerClipAtPad, handleClipModeNoteOn, handleClipEncoderTurn } from './clip.js';
export { updateMixerLeds, handleMixerPad, handleMixerModeNoteOn } from './mixer.js';
