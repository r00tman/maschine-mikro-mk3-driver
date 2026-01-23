import { PAD_COLORS } from '../constants.js';
import { state } from '../state.js';

/**
 * Convert RGB (0.0-1.0) to closest pad color velocity
 */
export function rgbToPadColor(red, green, blue) {
    // Bitwig provides RGB as floats (0.0 to 1.0)
    // Map to closest pad color based on hue and saturation
    
    // Convert to 0-255 range
    const r = Math.round(red * 255);
    const g = Math.round(green * 255);
    const b = Math.round(blue * 255);
    
    // Calculate HSV to determine color
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    // Saturation
    const sat = (max === 0) ? 0 : diff / max;
    
    // Low saturation = white/gray
    if (sat < 0.2) {
        return PAD_COLORS.WHITE;
    }
    
    // Hue calculation
    let hue = 0;
    if (diff !== 0) {
        if (max === r) {
            hue = 60 * (((g - b) / diff) % 6);
        } else if (max === g) {
            hue = 60 * (((b - r) / diff) + 2);
        } else {
            hue = 60 * (((r - g) / diff) + 4);
        }
    }
    if (hue < 0) hue += 360;
    
    // Map hue to pad colors
    if (hue < 15 || hue >= 345) return PAD_COLORS.RED;
    if (hue < 30) return PAD_COLORS.ORANGE;
    if (hue < 45) return PAD_COLORS.WARM_YELLOW;
    if (hue < 70) return PAD_COLORS.YELLOW;
    if (hue < 90) return PAD_COLORS.LIME;
    if (hue < 150) return PAD_COLORS.GREEN;
    if (hue < 165) return PAD_COLORS.MINT;
    if (hue < 180) return PAD_COLORS.CYAN;
    if (hue < 195) return PAD_COLORS.TURQUOISE;
    if (hue < 240) return PAD_COLORS.BLUE;
    if (hue < 270) return PAD_COLORS.VIOLET;
    if (hue < 300) return PAD_COLORS.PURPLE;
    if (hue < 320) return PAD_COLORS.MAGENTA;
    return PAD_COLORS.FUCHSIA;
}

/**
 * Convert color name from preferences to pad color velocity
 */
export function getColorFromName(colorName) {
    switch (colorName) {
        case "Red": return PAD_COLORS.RED;
        case "Orange": return PAD_COLORS.ORANGE;
        case "Yellow": return PAD_COLORS.YELLOW;
        case "Green": return PAD_COLORS.GREEN;
        case "Cyan": return PAD_COLORS.CYAN;
        case "Blue": return PAD_COLORS.BLUE;
        case "Purple": return PAD_COLORS.PURPLE;
        case "Magenta": return PAD_COLORS.MAGENTA;
        case "White": return PAD_COLORS.WHITE;
        default: return PAD_COLORS.RED;
    }
}

/**
 * Get playback color based on user preferences
 */
export function getPlaybackColor() {
    if (state.playbackColorMode.get() === "Fixed Color") {
        return getColorFromName(state.fixedPlaybackColor.get());
    } else {
        return state.trackPlaybackColor; // Track color
    }
}

/**
 * Get manual hit color based on user preferences
 */
export function getManualColor() {
    return getColorFromName(state.manualHitColor.get());
}
