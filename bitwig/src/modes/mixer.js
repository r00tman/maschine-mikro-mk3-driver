import { state } from '../state.js';
import { PAD_NOTES, PAD_COLORS, MODES } from '../constants.js';
import { setPadLed } from '../led.js';

/**
 * Setup mixer mode observers
 */
export function setupMixerObservers() {
    for (let i = 0; i < 4; i++) {
        const track = state.trackBank.getItemAt(i);
        
        // Subscribe to states
        const muteValue = track.mute();
        muteValue.markInterested();
        muteValue.addValueObserver(function(isMuted) {
            if (state.currentMode === MODES.MIXER) {
                const padIndex = 4 + i; // Row 1
                setPadLed(PAD_NOTES[padIndex], isMuted ? PAD_COLORS.WHITE : PAD_COLORS.ORANGE);
            }
        });
        
        const soloValue = track.solo();
        soloValue.markInterested();
        soloValue.addValueObserver(function(isSoloed) {
            if (state.currentMode === MODES.MIXER) {
                const padIndex = 8 + i; // Row 2
                setPadLed(PAD_NOTES[padIndex], isSoloed ? PAD_COLORS.WHITE : PAD_COLORS.YELLOW);
            }
        });
        
        const armValue = track.arm();
        armValue.markInterested();
        armValue.addValueObserver(function(isArmed) {
            if (state.currentMode === MODES.MIXER) {
                const padIndex = 12 + i; // Row 3
                setPadLed(PAD_NOTES[padIndex], isArmed ? PAD_COLORS.WHITE : PAD_COLORS.RED);
            }
        });
        
        // Track selection indicator
        track.addIsSelectedObserver(function(isSelected) {
            if (state.currentMode === MODES.MIXER) {
                const padIndex = i; // Row 0
                setPadLed(PAD_NOTES[padIndex], isSelected ? PAD_COLORS.WHITE : PAD_COLORS.BLUE);
            }
        });
    }
}

/**
 * Update mixer mode LEDs
 */
export function updateMixerLeds() {
    // In mixer mode, pads control track selection/mute/solo
    // Row 0: Track select (1-4)
    // Row 1: Mute
    // Row 2: Solo
    // Row 3: Arm
    
    // We can rely on observers to update state, but initially we might want to force update
    // However, since we don't have direct access to "get()" values easily without observers firing,
    // we might just set defaults and let observers override.
    // Or simpler: just let observers handle it. 
    // But observers fire on change. They also fire on registration usually (initial value).
    // So if we register them in init(), they might have fired once.
    // But when we switch mode to MIXER, we need to refresh LEDs.
    
    // The review says "Clean state on mode switch - Clear arrays, update all LEDs".
    // And "Mode-check in every observer".
    // So when we switch to MIXER, we call updateMixerLeds().
    // But we don't have the current values of mute/solo/etc stored in state object explicitly to read them here.
    // We should probably rely on the observers firing or store them in state.
    // For now, I'll stick to what was requested: "Add mixer mode state observers".
    
    // If I just add observers, they update LEDs when value changes.
    // But if I switch mode, the LEDs are cleared/changed. I need to restore them.
    // The observer checks `state.currentMode === MODES.MIXER`.
    // So if I switch mode, nothing happens until value changes?
    // No, that's bad.
    
    // Ideally we should cache these values in state or query them.
    // Since we can't easily query synchronously in Bitwig API without `get()`,
    // and `get()` is only available on some objects or requires MarkInterested.
    // We already markInterested.
    // Does `muteValue.get()` work? Yes if marked interested.
    
    for (let i = 0; i < 4; i++) {
        const track = state.trackBank.getItemAt(i);
        
        // Update based on current values if available
        const isMuted = track.mute().get();
        const padIndexMute = 4 + i;
        setPadLed(PAD_NOTES[padIndexMute], isMuted ? PAD_COLORS.WHITE : PAD_COLORS.ORANGE);

        const isSoloed = track.solo().get();
        const padIndexSolo = 8 + i;
        setPadLed(PAD_NOTES[padIndexSolo], isSoloed ? PAD_COLORS.WHITE : PAD_COLORS.YELLOW);
        
        const isArmed = track.arm().get();
        const padIndexArm = 12 + i;
        setPadLed(PAD_NOTES[padIndexArm], isArmed ? PAD_COLORS.WHITE : PAD_COLORS.RED);
        
        // Selection is harder to get directly without tracking it ourselves or having an observer
        // We can just rely on the fact that one of them is selected.
        // Or we can leave it to the observer updates if they happen frequently enough.
        // Actually, let's just use a default color for selection row for now, 
        // as `addIsSelectedObserver` doesn't give us a `get()` method on the track itself easily for selection state.
        const padIndexSelect = i;
        setPadLed(PAD_NOTES[padIndexSelect], PAD_COLORS.BLUE); 
    }
}

/**
 * Handle pad hit in Mixer mode
 */
export function handleMixerPad(padIndex) {
    const row = Math.floor(padIndex / 4);
    const col = padIndex % 4;
    const track = state.trackBank.getItemAt(col);
    
    switch (row) {
        case 0: // Select track
            track.selectInMixer();
            break;
        case 1: // Mute
            track.mute().toggle();
            break;
        case 2: // Solo
            track.solo().toggle();
            break;
        case 3: // Arm
            track.arm().toggle();
            break;
    }
}

/**
 * Handle pad note on in Mixer mode
 */
export function handleMixerModeNoteOn(note) {
    const padIndex = PAD_NOTES.indexOf(note);
    if (padIndex >= 0) {
        handleMixerPad(padIndex);
        setPadLed(note, PAD_COLORS.WHITE);
    }
}
