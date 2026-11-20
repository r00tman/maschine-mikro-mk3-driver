use crate::controls::Buttons;
use hidapi::{HidDevice, HidResult};
use num_derive::FromPrimitive;

#[derive(FromPrimitive, Debug, Clone, Copy, PartialEq)]
pub enum Brightness {
    Off = 0x00,
    Dim = 0x7c,
    Normal = 0x7e,
    Bright = 0x7f,
}

#[derive(FromPrimitive, Debug, Clone, Copy, PartialEq)]
pub enum PadColors {
    Off = 0,
    Red = 1,
    Orange = 2,
    LightOrange = 3,
    WarmYellow = 4,
    Yellow = 5,
    Lime = 6,
    Green = 7,
    Mint = 8,
    Cyan = 9,
    Turquoise = 10,
    Blue = 11,
    Plum = 12,
    Violet = 13,
    Purple = 14,
    Magenta = 15,
    Fuchsia = 16,
    White = 17,
}

/// Button-only brightness codes. VeryDim is below Dim on PLAY and STOP.
#[derive(FromPrimitive, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ButtonBrightness {
    Off = 0,
    VeryDim = 0x7d,
    Dim = 0x7c,
    Normal = 0x7e,
    Bright = 0x7f,
}

pub struct Lights {
    status: [u8; 80],
}

impl Lights {
    #[allow(clippy::new_without_default, reason = "intentional")]
    pub fn new() -> Self {
        Self { status: [0; 80] }
    }

    pub fn reset(&mut self) {
        self.status.fill(0);
    }

    /// Legacy getter: VeryDim is reported as Dim. Use button_level for the exact code.
    pub fn get_button(&self, id: Buttons) -> Brightness {
        match self.button_level(id) {
            ButtonBrightness::VeryDim | ButtonBrightness::Dim => Brightness::Dim,
            ButtonBrightness::Normal => Brightness::Normal,
            ButtonBrightness::Bright => Brightness::Bright,
            ButtonBrightness::Off => Brightness::Off,
        }
    }

    pub fn button_has_light(&self, id: Buttons) -> bool {
        !matches!(id, Buttons::EncoderTouch | Buttons::EncoderPress)
    }

    pub fn set_button(&mut self, id: Buttons, b: Brightness) {
        if self.button_has_light(id) {
            self.status[id as usize] = b as u8;
        }
    }

    /// Read the exact button level. Controls without a lamp report Off.
    pub fn button_level(&self, id: Buttons) -> ButtonBrightness {
        if !self.button_has_light(id) {
            return ButtonBrightness::Off;
        }
        num::FromPrimitive::from_u8(self.status[id as usize]).unwrap()
    }

    pub fn set_button_level(&mut self, id: Buttons, level: ButtonBrightness) {
        if self.button_has_light(id) {
            self.status[id as usize] = level as u8;
        }
    }

    pub fn set_slider(&mut self, id: usize, b: Brightness) {
        self.status[55 + id] = b as u8;
    }

    pub fn set_pad(&mut self, id: usize, c: PadColors, b: Brightness) {
        let val = match b {
            Brightness::Off => 0,
            _ => {
                let c = c as u8;
                let b = b as u8;
                (c << 2) + (b & 0b11)
            }
        };
        self.status[39 + id] = val;
    }

    pub fn get_pad(&self, id: usize) -> (PadColors, Brightness) {
        let val = self.status[39 + id];
        let color: PadColors = num::FromPrimitive::from_u8(val >> 2).unwrap();
        let b = match val {
            0..=3 => Brightness::Off,
            _ => match val % 4 {
                0 => Brightness::Dim,
                1 => Brightness::Dim,
                2 => Brightness::Normal,
                3 => Brightness::Bright,
                _ => Brightness::Off,
            },
        };
        (color, b)
    }

    pub fn write(&self, h: &HidDevice) -> HidResult<()> {
        h.write(&[&[0x80u8] as &[u8], &self.status].concat())?;

        Ok(())
    }
}

#[cfg(test)]
mod button_tests {
    use super::*;
    #[test]
    fn exact_codes_and_legacy_readback() {
        for button in [Buttons::Play, Buttons::Stop] {
            let mut lights = Lights::new();
            for (level, byte, legacy) in [
                (ButtonBrightness::VeryDim, 0x7d, Brightness::Dim),
                (ButtonBrightness::Dim, 0x7c, Brightness::Dim),
                (ButtonBrightness::Normal, 0x7e, Brightness::Normal),
                (ButtonBrightness::Bright, 0x7f, Brightness::Bright),
                (ButtonBrightness::Off, 0, Brightness::Off),
            ] {
                lights.set_button_level(button, level);
                assert_eq!(lights.status[button as usize], byte);
                assert_eq!(lights.button_level(button), level);
                assert_eq!(lights.get_button(button), legacy);
            }
        }
    }
    #[test]
    fn encoder_controls_preserve_pad_bytes() {
        let mut lights = Lights::new();
        lights.set_pad(0, PadColors::Blue, Brightness::Bright);
        lights.set_pad(1, PadColors::Red, Brightness::Normal);
        let before = lights.status;
        for button in [Buttons::EncoderPress, Buttons::EncoderTouch] {
            lights.set_button(button, Brightness::Normal);
            lights.set_button_level(button, ButtonBrightness::VeryDim);
            assert_eq!(lights.get_button(button), Brightness::Off);
        }
        assert_eq!(lights.status, before);
    }
}
