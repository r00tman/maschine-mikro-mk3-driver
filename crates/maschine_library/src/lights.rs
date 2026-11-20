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

/// The low two bits of a Smart Strip palette byte. Their effect depends on the color.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StripIntensity {
    Code0 = 0,
    Code1 = 1,
    Code2 = 2,
    Code3 = 3,
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

    pub fn get_button(&self, id: Buttons) -> Brightness {
        num::FromPrimitive::from_u8(self.status[id as usize]).unwrap()
    }

    pub fn button_has_light(&self, id: Buttons) -> bool {
        !matches!(id, Buttons::EncoderTouch | Buttons::EncoderPress)
    }

    pub fn set_button(&mut self, id: Buttons, b: Brightness) {
        self.status[id as usize] = b as u8;
    }

    pub fn set_slider(&mut self, id: usize, b: Brightness) {
        self.status[55..][id] = b as u8;
    }

    /// Set one of the 25 strip segments (0 is leftmost). Off always writes zero.
    pub fn set_slider_color(&mut self, id: usize, color: PadColors, intensity: StripIntensity) {
        self.status[55..][id] = if color == PadColors::Off {
            0
        } else {
            ((color as u8) << 2) | intensity as u8
        };
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
mod strip_color_tests {
    use super::*;
    #[test]
    fn writes_only_the_selected_strip_byte() {
        let mut lights = Lights::new();
        lights.set_pad(15, PadColors::Blue, Brightness::Bright);
        for (id, color, code, byte) in [
            (0, PadColors::Red, StripIntensity::Code0, 4),
            (12, PadColors::Red, StripIntensity::Code1, 5),
            (12, PadColors::Red, StripIntensity::Code2, 6),
            (24, PadColors::White, StripIntensity::Code3, 71),
            (24, PadColors::Off, StripIntensity::Code3, 0),
        ] {
            let mut expected = lights.status;
            expected[55 + id] = byte;
            lights.set_slider_color(id, color, code);
            assert_eq!(lights.status, expected);
        }
        lights.set_slider(0, Brightness::Normal);
        assert_eq!(lights.status[55], 0x7e);
    }
}
