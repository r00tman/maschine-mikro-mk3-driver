import { state } from '../state.js';
import { CC_OFFSET, CC_ENCODER, CC_SLIDER, PAD_NOTES, MODES } from '../constants.js';
import { setPadLed } from '../led.js';
import { onButton } from './buttons.js';
import { onEncoder, decodeRelativeEncoder } from './encoder.js';
import { onSlider } from './slider.js';
import { handlePlayModeNoteOn, handlePlayModeNoteOff } from '../modes/play.js';
import { handleStepModeNoteOn } from '../modes/step.js';
import { handleClipModeNoteOn } from '../modes/clip.js';
import { handleMixerModeNoteOn } from '../modes/mixer.js';
import { updatePadLedsForMode } from '../modes/index.js';
import { stopNoteRepeat } from '../features/noteRepeat.js';

/**
 * Main MIDI callback handler
 */
export function onMidi(status, data1, data2) {
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
        onButton(buttonIndex, isPressed, value);
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
            
        case MODES.STEP:
            // Nothing needed - LEDs are managed by step state
            break;
    }
}
