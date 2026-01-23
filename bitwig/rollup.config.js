import terser from '@rollup/plugin-terser';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/MaschineMikroMK3.control.js',
    format: 'iife', // Immediately Invoked Function Expression - wraps in closure
    name: 'MaschineMikroMK3', // Not used but required for IIFE
    banner: `// Maschine Mikro MK3 Controller Script for Bitwig Studio
// Works with the Linux userspace MIDI driver from:
// https://github.com/r00tman/maschine-mikro-mk3-driver
//
// MIDI CC Mapping (from driver):
// - Buttons: CC 20-60 (button index + 20), value 127=press, 0=release
// - Encoder: CC 1 (relative mode: 65+ = CW, <64 = CCW)
// - Slider: CC 9 (0-127)
// - Pads: Notes (configurable in driver config)
//
// === PAD PLAYBACK FEEDBACK ===
// Pads provide visual feedback during clip/sequence playback.
// This feature requires Bitwig Studio 6+ (uses API v18 playingNotes() method).
//
// Customizable settings available in Bitwig Controller Settings:
// - Enable/disable playback feedback
// - Enable/disable manual hit feedback
// - Playback color: Track color (matches track) or Fixed color
// - Choose fixed playback color (Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta, White)
// - Choose manual hit color (default: Blue)
//
// Built from modular source - see bitwig/src/ for development

// === Bitwig API Setup (must be at global scope) ===
loadAPI(18);

host.defineController("Native Instruments", "Maschine Mikro MK3 (Linux)", "1.0", "e8f4b3a2-1c5d-4e6f-9a8b-7c0d2e3f4a5b");
host.defineMidiPorts(1, 1);

// Device discovery (supports multiple MIDI naming conventions)
host.addDeviceNameBasedDiscoveryPair(["Virtual Raw MIDI/1"], ["Virtual Raw MIDI/1"]);
host.addDeviceNameBasedDiscoveryPair(["Virtual Raw MIDI/1"], ["Virtual Raw MIDI/2"]);
host.addDeviceNameBasedDiscoveryPair(["Virtual Raw MIDI 1-0"], ["Virtual Raw MIDI 1-0"]);
host.addDeviceNameBasedDiscoveryPair(["Virtual Raw MIDI 1-0"], ["Virtual Raw MIDI 1-1"]);
host.addDeviceNameBasedDiscoveryPair(["VirMIDI 1-0"], ["VirMIDI 1-0"]);
host.addDeviceNameBasedDiscoveryPair(["VirMIDI 1-0"], ["VirMIDI 1-1"]);

// === End Bitwig API Setup ===

`,
    // Bitwig needs global functions, so we expose them via footer
    footer: `
// Expose required Bitwig entry points as globals
var init = MaschineMikroMK3.init;
var flush = MaschineMikroMK3.flush;
var exit = MaschineMikroMK3.exit;
`
  },
  plugins: [
    // Minify in production (optional - comment out for debugging)
    // production && terser()
  ]
};
