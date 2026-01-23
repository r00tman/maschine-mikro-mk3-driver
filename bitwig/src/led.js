import { state } from './state.js';
import { BTN_COUNT, CC_OFFSET } from './constants.js';

/**
 * Set the desired LED state for a button.
 * Value is interpreted by the driver as brightness:
 * 1-42 dim, 43-84 normal, 85-127 bright, 0 off
 */
export function setButtonLed(buttonIndex, value) {
    if (buttonIndex < 0 || buttonIndex >= BTN_COUNT) return;
    state.desiredButtonLed[buttonIndex] = value;
}

/**
 * Send button LED change immediately via MIDI CC
 */
export function sendButtonLedNow(buttonIndex, value) {
    const cc = CC_OFFSET + buttonIndex;
    state.midiOut.sendMidi(0xB0, cc, value);
}

/**
 * Queue a pad LED update (will be sent in flush)
 */
export function setPadLed(note, velocity) {
    state.pendingPadLed[note] = velocity;
}

/**
 * Send all pending pad LED updates
 */
export function flushPadLed() {
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
export function flushLeds() {
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
export function allLedsOff() {
    for (let i = 0; i < BTN_COUNT; i++) {
        sendButtonLedNow(i, 0);
    }
}
