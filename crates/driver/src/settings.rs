use serde::Deserialize;

#[derive(Deserialize, Debug)]
#[serde(default)]
pub(crate) struct Settings {
    pub notemaps: Vec<u8>,
    pub client_name: String,
    pub port_name: String,
    pub port_name_in: String,
    /// If true, treat "LED Off" for buttons as a low backlight instead.
    /// Useful as a "night mode" so you can see buttons in the dark.
    pub backlight_buttons: bool,
    /// Backlight level for buttons when `backlight_buttons = true`.
    /// Valid values: "dim", "normal", "bright".
    pub backlight_brightness: String,
    /// If true, try to connect the driver's ALSA sequencer ports to a kernel rawmidi
    /// device exposed via snd-virmidi (what Bitwig enumerates as "Virtual Raw MIDI ...").
    pub autoconnect_virmidi: bool,
    /// ALSA sequencer client name for the rawmidi bridge, e.g. "Virtual Raw MIDI 1-0".
    /// If empty, the first client starting with "Virtual Raw MIDI" will be used.
    pub virmidi_client_name: String,
    /// Port number on the virmidi client (usually 0).
    pub virmidi_port: usize,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            // Default: Standard chromatic drum machine layout (C1-D#2)
            // Matches typical drum pad controllers and drum machines
            // Indexed by logical pad position [0-15], not physical pad labels [1-16]
            notemaps: vec![
                48, 49, 50, 51,  // Logical 0-3  (physical bottom row 13-16): C2, C#2, D2, D#2
                44, 45, 46, 47,  // Logical 4-7  (physical row 9-12): G#1, A1, A#1, B1
                40, 41, 42, 43,  // Logical 8-11 (physical row 5-8): E1, F1, F#1, G1
                36, 37, 38, 39,  // Logical 12-15 (physical top row 1-4): C1, C#1, D1, D#1
            ],
            client_name: "Maschine Mikro MK3".to_string(),
            port_name: "Maschine Mikro MK3 MIDI Out".to_string(),
            port_name_in: "Maschine Mikro MK3 MIDI In".to_string(),
            backlight_buttons: false,
            backlight_brightness: "dim".to_string(),
            autoconnect_virmidi: true,
            virmidi_client_name: "".to_string(),
            virmidi_port: 0,
        }
    }
}

impl Settings {
    pub(crate) fn validate(&self) -> Result<(), String> {
        // todo: is there a better way to do it that doesn't bring too many new useless dependencies?

        let padcnt = self.notemaps.len();
        if padcnt != 16 {
            return Err(format!("The should be 16 pads exactly (found {padcnt})"));
        }

        if self.notemaps.iter().any(|x| *x >= 128) {
            return Err("MIDI notes should be 0 to 127".to_string());
        }

        if self.client_name.is_empty() {
            return Err("Client name must not be empty".to_string());
        }

        if self.port_name.is_empty() {
            return Err("Port name must not be empty".to_string());
        }

        if self.port_name_in.is_empty() {
            return Err("Input port name must not be empty".to_string());
        }

        let bb = self.backlight_brightness.trim().to_ascii_lowercase();
        let bb_ok = matches!(bb.as_str(), "dim" | "normal" | "bright");
        if !bb_ok {
            return Err(
                "backlight_brightness must be one of: \"dim\", \"normal\", \"bright\"".to_string(),
            );
        }

        Ok(())
    }
}
