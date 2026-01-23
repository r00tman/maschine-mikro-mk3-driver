import { state } from './state.js';

// Screen state for debouncing
let lastScreenText = "";
let screenUpdatePending = false;
let pendingScreenText = "";

/**
 * Send text to the Maschine screen (debounced)
 * SysEx format: F0 00 21 09 <cmd> <data...> F7
 * Commands: 01 = Screen Text, 02 = Screen Clear
 */
export function sendScreenText(text) {
    // Debounce: if same text, skip
    if (text === lastScreenText) return;
    
    pendingScreenText = text;
    
    // Debounce rapid updates
    if (!screenUpdatePending) {
        screenUpdatePending = true;
        host.scheduleTask(function() {
            doSendScreenText(pendingScreenText);
            screenUpdatePending = false;
        }, 50); // 50ms debounce
    }
}

/**
 * Actually send the screen text via SysEx
 */
function doSendScreenText(text) {
    if (text === lastScreenText) return;
    lastScreenText = text;
    
    // Limit text to 16 characters (screen width)
    const truncated = text.substring(0, 16);
    let sysexData = "F0 00 21 09 01";
    for (let i = 0; i < truncated.length; i++) {
        const charCode = truncated.charCodeAt(i) & 0x7F; // Keep 7-bit ASCII
        sysexData += " " + ("0" + charCode.toString(16)).slice(-2).toUpperCase();
    }
    sysexData += " F7";
    state.midiOut.sendSysex(sysexData);
}

/**
 * Clear the screen
 */
export function sendScreenClear() {
    lastScreenText = "";
    state.midiOut.sendSysex("F0 00 21 09 02 F7");
}
