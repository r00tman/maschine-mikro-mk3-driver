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

pub struct Lights {
    status: [u8; 80],
}

impl Lights {
    pub fn new() -> Lights {
        Lights { status: [0; 80] }
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
