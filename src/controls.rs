use num_derive::FromPrimitive;

#[derive(FromPrimitive, Debug, Clone, Copy, PartialEq)]
pub enum Buttons {
    Maschine = 0,
    Star = 1,
    Browse = 2,
    Volume = 3,

    Swing = 4,
    Tempo = 5,
    Plugin = 6,
    Sampling = 7,

    Left = 8,
    Right = 9,
    Pitch = 10,
    Mod = 11,

    Perform = 12,
    Notes = 13,
    Group = 14,
    Auto = 15,

    Lock = 16,
    NoteRepeat = 17,
    Restart = 18,
    Erase = 19,

    Tap = 20,
    Follow = 21,
    Play = 22,
    Rec = 23,

    Stop = 24,
    Shift = 25,
    FixedVol = 26,
    PadMode = 27,

    Keyboard = 28,
    Chords = 29,
    Step = 30,
    Scene = 31,

    Pattern = 32,
    Events = 33,
    Variation = 34,
    Duplicate = 35,

    Select = 36,
    Solo = 37,
    Mute = 38,

    EncoderPress = 39,
    EncoderTouch = 40,
}

#[derive(FromPrimitive, Debug, Clone, Copy, PartialEq)]
pub enum PadEventType {
    NoteOn = 0x10,
    NoteOff = 0x30,
    Aftertouch = 0x40,
    PressOff = 0x20,
    PressOn = 0x00,
}
