import { state } from '../state.js';
import { PAD_NOTES, PAD_COLORS } from '../constants.js';
import { setPadLed } from '../led.js';
import { sendScreenText } from '../screen.js';
import { getNoteNameFromMidi } from '../utils/notes.js';

/**
 * Update step sequencer LEDs
 */
export function updateStepSequencerLeds() {
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
export function toggleStep(padIndex) {
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
export function clearAllSteps() {
    for (let i = 0; i < state.stepSequencer.stepCount; i++) {
        state.stepSequencer.steps[i] = false;
        state.cursorClip.clearStep(i, 0); // y=0 (current note row)
    }
    updateStepSequencerLeds();
}

/**
 * Handle pad hit in Step mode
 */
export function handleStepModeNoteOn(note) {
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
export function handleStepEncoderTurn(delta) {
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
export function refreshStepDataForCurrentNote() {
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
export function enterStepMode() {
    // Refresh step data for current note
    refreshStepDataForCurrentNote();
    
    // Update display
    updateStepDisplay();
}

/**
 * Setup step sequencer observers
 */
export function setupStepSequencerObserver() {
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
