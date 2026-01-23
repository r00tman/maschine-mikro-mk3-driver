import { state } from '../state.js';
import { MODES } from '../constants.js';
import { handleStepEncoderTurn } from '../modes/step.js';
import { handleClipEncoderTurn } from '../modes/clip.js';

/**
 * Decode the relative encoder value
 * The driver sends encoder CC in "offset binary" relative mode:
 * value = 64 + delta, where delta is signed.
 * Examples: 65 => +1, 63 => -1, 59 => -5, 71 => +7.
 */
export function decodeRelativeEncoder(value) {
    if (value === 0 || value === 64) return 0;
    return value - 64;
}

/**
 * Navigate tracks (used by multiple modes)
 */
export function navigateTracks(delta) {
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
export function onEncoder(delta) {
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
