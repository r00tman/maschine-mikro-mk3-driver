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
        self.write_with(|report| h.write(report))
    }

    fn write_with(&self, mut write: impl FnMut(&[u8]) -> HidResult<usize>) -> HidResult<()> {
        crate::write_report(&[&HEADER_HI, &self.buffer[..256]].concat(), &mut write)?;
        crate::write_report(&[&HEADER_LO, &self.buffer[256..]].concat(), write)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_first_oled_write_returns_error_and_skips_second_half() {
        let mut writes = 0;
        let result = Screen::new().write_with(|report| {
            writes += 1;
            assert!(report.starts_with(&HEADER_HI));
            assert_eq!(report.len(), 265);
            Ok(264)
        });

        assert!(result.is_err());
        assert_eq!(writes, 1);
    }
}
