import { state } from '../state.js';
import { PAD_NOTES, PAD_COLORS, MODES } from '../constants.js';
import { setPadLed } from '../led.js';

/**
 * Setup clip launcher observers
 */
export function setupClipLauncherObservers() {
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
export function updateClipLauncherLeds() {
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
export function triggerClipAtPad(padIndex) {
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
export function handleClipModeNoteOn(note) {
    const padIndex = PAD_NOTES.indexOf(note);
    if (padIndex >= 0) {
        triggerClipAtPad(padIndex);
        // Feedback is handled by observers
    }
}

/**
 * Handle encoder turn in Clip mode (navigate scenes)
 */
export function handleClipEncoderTurn(delta) {
    const steps = Math.min(8, Math.abs(delta));
    for (let i = 0; i < steps; i++) {
        if (delta > 0) {
            state.sceneBank.scrollPageDown();
        } else {
            state.sceneBank.scrollPageUp();
        }
    }
}
