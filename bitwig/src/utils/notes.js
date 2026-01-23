const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Convert MIDI note number to note name (e.g., 60 -> "C3")
 * Uses Bitwig/MIDI standard: C3 = 60, C1 = 36
 */
export function getNoteNameFromMidi(midiNote) {
    const octave = Math.floor(midiNote / 12) - 2;  // Bitwig standard: C3=60
    const noteName = NOTE_NAMES[midiNote % 12];
    return noteName + octave;
}
