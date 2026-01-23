import { state } from '../state.js';
import { PAD_NOTES, MODES } from '../constants.js';
import { setPadLed } from '../led.js';
import { getPlaybackColor, getManualColor } from '../utils/colors.js';
import { getVelocity } from '../features/fixedVelocity.js';
import { startNoteRepeat, stopNoteRepeat } from '../features/noteRepeat.js';

/**
 * Update pad LEDs for Play mode
 */
export function updatePlayModeLeds() {
    // Clear all pads - they'll light on playback/hit
    for (let i = 0; i < PAD_NOTES.length; i++) {
        setPadLed(PAD_NOTES[i], 0);
    }
}

/**
 * Handle pad note on in Play mode
 */
export function handlePlayModeNoteOn(note, velocity, isPadNote) {
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
export function handlePlayModeNoteOff(note, isPadNote) {
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
export function setupPlaybackFeedback() {
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
