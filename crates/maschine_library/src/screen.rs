use hidapi::{HidDevice, HidResult};

const HEADER_HI: [u8; 9] = [0xe0, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x02, 0x00];
const HEADER_LO: [u8; 9] = [0xe0, 0x00, 0x00, 0x02, 0x00, 0x80, 0x00, 0x02, 0x00];

pub struct Screen {
    buffer: [u8; 512],
}

impl Screen {
    #[allow(clippy::new_without_default, reason = "intentional")]
    pub fn new() -> Self {
        Self {
            buffer: [0xff; 512],
        }
    }

    pub fn reset(&mut self) {
        self.buffer.fill(0xff);
    }

    #[allow(dead_code)]
    pub fn get(&self, i: usize, j: usize) -> bool {
        let chunk = i / 8;
        let imod = i % 8;
        let idx = chunk * 128 + j;
        let val = self.buffer[idx] & (1 << imod);
        val == 0
    }

    pub fn set(&mut self, i: usize, j: usize, val: bool) {
        let chunk = i / 8;
        let imod: u8 = (i % 8) as u8;
        let idx = chunk * 128 + j;
        let mask: u8 = 1 << imod;
        if val {
            self.buffer[idx] &= !mask;
        } else {
            self.buffer[idx] |= mask;
        }
    }

    pub fn write(&self, h: &HidDevice) -> HidResult<()> {
        let mut buf = [0u8; 265];
        buf[..9].copy_from_slice(&HEADER_HI);
        buf[9..].copy_from_slice(&self.buffer[..256]);
        h.write(&buf)?;
        
        buf[..9].copy_from_slice(&HEADER_LO);
        buf[9..].copy_from_slice(&self.buffer[256..]);
        h.write(&buf)?;
        Ok(())
    }
}
