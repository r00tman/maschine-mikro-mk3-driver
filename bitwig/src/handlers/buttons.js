import { state } from '../state.js';
import { BTN, MODES, FIXED_VELOCITY_VALUE } from '../constants.js';
import { setButtonLed } from '../led.js';
import { toggleNoteRepeat, cycleNoteRepeatInterval } from '../features/noteRepeat.js';
import { toggleFixedVelocity } from '../features/fixedVelocity.js';
import { setMode, cycleMode, clearAllSteps } from '../modes/index.js';

/**
 * Handle button press/release
 */
export function onButton(button, pressed, value) {
    // Track encoder touch to suppress spurious encoder ticks
    if (button === BTN.ENCODER_TOUCH) {
        if (pressed) {
            state.encoderTouchSuppressUntilMs = Date.now() + 120;
        }
        return;
    }

    // Track shift state
    if (button === BTN.SHIFT) {
        state.isShiftPressed = pressed;
        setButtonLed(BTN.SHIFT, pressed ? 127 : 0);
        return;
    }

    // Only act on button press, not release
    if (!pressed) return;

    switch (button) {
        // === TRANSPORT ===
        case BTN.PLAY:
            if (state.isShiftPressed) {
                state.transport.returnToArrangement();
            } else {
                state.transport.togglePlay();
            }
            break;

        case BTN.STOP:
            if (state.isShiftPressed) {
                state.transport.resetAutomationOverrides();
            } else {
                state.transport.stop();
            }
            break;

        case BTN.REC:
            if (state.isShiftPressed) {
                state.transport.isArrangerOverdubEnabled().toggle();
            } else {
                state.transport.isArrangerRecordEnabled().toggle();
            }
            break;

        case BTN.RESTART:
            if (state.isShiftPressed) {
                state.transport.isArrangerLoopEnabled().toggle();
            } else {
                state.transport.jumpToPlayStartPosition();
            }
            break;

        case BTN.TAP:
            if (state.isShiftPressed) {
                state.transport.isMetronomeEnabled().toggle();
            } else {
                state.transport.tapTempo();
            }
            break;

        case BTN.TEMPO:
            if (state.isShiftPressed) {
                // Could open tempo panel
            } else {
                state.transport.tapTempo();
            }
            break;

        // === NAVIGATION ===
        case BTN.LEFT:
            if (state.isShiftPressed) {
                state.cursorTrack.selectPrevious();
            } else {
                state.transport.rewind();
            }
            break;

        case BTN.RIGHT:
            if (state.isShiftPressed) {
                state.cursorTrack.selectNext();
            } else {
                state.transport.fastForward();
            }
            break;

        case BTN.ENCODER_PRESS:
            if (state.isShiftPressed) {
                state.cursorTrack.selectInMixer();
            } else {
                state.cursorTrack.selectInEditor();
            }
            break;

        // === BROWSER ===
        case BTN.BROWSE:
            if (state.isShiftPressed) {
                state.cursorDevice.browseToInsertAfterDevice();
            } else {
                state.application.toggleBrowserVisibility();
            }
            break;

        // === TRACK CONTROLS ===
        case BTN.SOLO:
            state.cursorTrack.solo().toggle();
            break;

        case BTN.MUTE:
            state.cursorTrack.mute().toggle();
            break;

        case BTN.SELECT:
            state.cursorTrack.selectInMixer();
            break;

        case BTN.SAMPLING:
            state.cursorTrack.arm().toggle();
            break;

        // === EDITING ===
        case BTN.DUPLICATE:
            if (state.isShiftPressed) {
                state.application.duplicateObject();
            } else {
                state.application.duplicate();
            }
            break;

        case BTN.ERASE:
            if (state.isShiftPressed) {
                state.application.cut();
            } else {
                if (state.currentMode === MODES.STEP) {
                    // Clear all steps in step sequencer mode
                    clearAllSteps();
                    host.showPopupNotification("Steps Cleared");
                } else {
                    state.application.remove();
                }
            }
            break;

        case BTN.VOLUME:
            if (state.isShiftPressed) {
                state.application.redo();
            } else {
                state.application.undo();
            }
            break;

        // === DEVICE NAVIGATION ===
        case BTN.PLUGIN:
            if (state.isShiftPressed) {
                state.cursorDevice.selectPrevious();
            } else {
                state.cursorDevice.selectNext();
            }
            break;

        case BTN.GROUP:
            if (state.isShiftPressed) {
                state.cursorDevice.selectParent();
            } else {
                state.cursorTrack.selectParent();
            }
            break;

        // === VIEW TOGGLES / MODE SELECTION ===
        case BTN.KEYBOARD:
            if (state.isShiftPressed) {
                state.application.toggleNoteEditor();
            } else {
                setMode(MODES.PLAY);
            }
            break;

        case BTN.STEP:
            if (state.isShiftPressed) {
                state.application.toggleAutomationEditor();
            } else {
                setMode(MODES.STEP);
            }
            break;

        case BTN.SCENE:
            if (state.isShiftPressed) {
                state.application.toggleMixer();
            } else {
                setMode(MODES.CLIP);
            }
            break;

        case BTN.PATTERN:
            if (state.isShiftPressed) {
                state.transport.returnToArrangement();
            } else {
                setMode(MODES.MIXER);
            }
            break;

        case BTN.EVENTS:
            if (state.isShiftPressed) {
                state.arranger.toggleClipLauncher();
            } else {
                state.application.toggleDevices();
            }
            break;

        // === AUTOMATION ===
        case BTN.AUTO:
            if (state.isShiftPressed) {
                state.transport.resetAutomationOverrides();
            } else {
                state.transport.isArrangerAutomationWriteEnabled().toggle();
            }
            break;

        case BTN.FOLLOW:
            if (state.isShiftPressed) {
                state.application.zoomToFit();
            } else {
                // Note: Follow playback is not exposed in the Bitwig API
                // Using zoom to selection as alternative
                state.application.zoomToSelection();
            }
            break;

        // === GROOVE / SWING ===
        case BTN.SWING:
            if (state.isShiftPressed) {
                state.groove.getEnabled().toggle();
            } else {
                // Could show groove panel
                host.showPopupNotification("Swing: Use encoder to adjust");
            }
            break;

        // === UTILITY ===
        case BTN.STAR:
            if (state.isShiftPressed) {
                state.application.selectAll();
            } else {
                state.application.selectNone();
            }
            break;

        case BTN.LOCK:
            if (state.isShiftPressed) {
                state.cursorTrack.isPinned().toggle();
            } else {
                state.cursorDevice.isPinned().toggle();
            }
            break;

        case BTN.NOTE_REPEAT:
            if (state.isShiftPressed) {
                // Shift + Note Repeat: cycle repeat interval
                cycleNoteRepeatInterval();
            } else {
                toggleNoteRepeat();
            }
            break;

        case BTN.FIXED_VEL:
            if (state.isShiftPressed) {
                // Could adjust fixed velocity value
                host.showPopupNotification("Fixed Vel: " + FIXED_VELOCITY_VALUE);
            } else {
                toggleFixedVelocity();
            }
            break;

        case BTN.PAD_MODE:
            if (state.isShiftPressed) {
                // Shift + Pad Mode: return to Play mode
                setMode(MODES.PLAY);
            } else {
                // Cycle through modes
                cycleMode();
            }
            break;

        case BTN.CHORDS:
            host.showPopupNotification("Chords: N/A");
            break;

        case BTN.VARIATION:
            if (state.isShiftPressed) {
                state.application.paste();
            } else {
                state.application.copy();
            }
            break;

        case BTN.PERFORM:
            state.application.toggleFullScreen();
            break;

        case BTN.NOTES:
            state.application.toggleInspector();
            break;

        case BTN.PITCH:
            // Could control pitch bend range
            break;

        case BTN.MOD:
            // Could control modulation
            break;

        case BTN.MASCHINE:
            if (state.isShiftPressed) {
                host.showPopupNotification("Maschine Mikro MK3 (Linux Driver)");
            } else {
                state.application.toggleInspector();
            }
            break;
    }
}
