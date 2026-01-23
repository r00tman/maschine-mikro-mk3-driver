import { state } from '../state.js';
import { MODES } from '../constants.js';

/**
 * Handle slider movement
 */
export function onSlider(value) {
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
