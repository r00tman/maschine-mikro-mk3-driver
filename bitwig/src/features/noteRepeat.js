import { state } from '../state.js';
import { setButtonLed } from '../led.js';
import { BTN, MODES } from '../constants.js';

/**
 * Toggle note repeat on/off
 */
export function toggleNoteRepeat() {
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
export function startNoteRepeat(note, velocity) {
    if (!state.noteRepeatEnabled) return;
    if (state.currentMode !== MODES.PLAY) return;
    
    // Store with current task ID to validate later
    state.heldPadNotes[note] = { velocity: velocity, taskId: state.noteRepeatTaskId };
    scheduleNoteRepeatTick(note, state.noteRepeatTaskId);
}

/**
 * Stop note repeat for a released note
 */
export function stopNoteRepeat(note) {
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
export function cycleNoteRepeatInterval() {
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
export function clearNoteRepeat() {
    state.heldPadNotes = {};
    state.noteRepeatTaskId++;
}
