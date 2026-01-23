import { state } from '../state.js';
import { setButtonLed } from '../led.js';
import { BTN, FIXED_VELOCITY_VALUE } from '../constants.js';

/**
 * Toggle fixed velocity mode
 */
export function toggleFixedVelocity() {
    state.fixedVelocityEnabled = !state.fixedVelocityEnabled;
    setButtonLed(BTN.FIXED_VEL, state.fixedVelocityEnabled ? 127 : 0);
    host.showPopupNotification(state.fixedVelocityEnabled ? "Fixed Velocity: ON" : "Fixed Velocity: OFF");
}

/**
 * Get the velocity to use based on fixed velocity state
 */
export function getVelocity(inputVelocity) {
    return state.fixedVelocityEnabled ? FIXED_VELOCITY_VALUE : inputVelocity;
}
