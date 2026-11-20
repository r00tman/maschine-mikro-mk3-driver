use crate::screen::Screen;

const FONT: [[&[u8; 8]; 8]; 10] = [
    // 0
    [
        b"   xxx  ",
        b"  x   x ",
        b" x     x",
        b" x     x",
        b" x     x",
        b" x     x",
        b"  x   x ",
        b"   xxx  ",
    ],
    [
        // 1
        b"     xx ",
        b"     xx ",
        b"    x x ",
        b"  xx  x ",
        b"      x ",
        b"      x ",
        b"      x ",
        b"  xxxxxx",
    ],
    [
        // 2
        b"   xxxx ",
        b" x     x",
        b" x     x",
        b"      x ",
        b"    x   ",
        b"  x     ",
        b" x      ",
        b" xxxxxxx",
    ],
    [
        // 3
        b"  xxxxx ",
        b" x     x",
        b"      x ",
        b"   xxxx ",
        b"       x",
        b"       x",
        b" x    x ",
        b"  xxxx  ",
    ],
    [
        // 4
        b" x     x",
        b" x     x",
        b" x     x",
        b" x    xx",
        b"  xxxx x",
        b"       x",
        b"       x",
        b"       x",
    ],
    [
        // 5
        b" xxxxxxx",
        b" x      ",
        b" x      ",
        b" xxxxxx ",
        b"       x",
        b"       x",
        b"       x",
        b" xxxxxx ",
    ],
    [
        // 6
        b"  xxxxx ",
        b" x     x",
        b" x      ",
        b" x xxx  ",
        b" xx   xx",
        b" x     x",
        b" x     x",
        b"  xxxxx ",
    ],
    [
        // 7
        b" xxxxxxx",
        b"       x",
        b"       x",
        b"      x ",
        b"     x  ",
        b"    x   ",
        b"   x    ",
        b"  x     ",
    ],
    [
        // 8
        b"  xxxxx ",
        b" x     x",
        b" x     x",
        b"  xxxxx ",
        b" x     x",
        b" x     x",
        b" x     x",
        b"  xxxxx ",
    ],
    [
        // 9
        b"  xxxxx ",
        b" x     x",
        b" x     x",
        b" x     x",
        b"  xxxxxx",
        b"       x",
        b" x     x",
        b"  xxxxx ",
    ],
];

pub struct Font {}

impl Font {
    /// Draws a decimal digit, clipping it at the display edges.
    /// A zero scale or a digit outside `0..=9` leaves the display unchanged.
    pub fn write_digit(s: &mut Screen, y: usize, x: usize, num: usize, scale: usize) {
        if x >= 128 || y >= 32 || scale == 0 {
            return;
        }
        let Some(sym) = FONT.get(num) else {
            return;
        };
        let side = scale.saturating_mul(8);
        for i in 0..side.min(32 - y) {
            for j in 0..side.min(128 - x) {
                let bit = sym[i / scale][j / scale] != b' ';
                s.set(i + y, j + x, bit);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clipped_digit_matches_visible_part_of_full_digit() {
        let mut full = Screen::new();
        let mut clipped = Screen::new();
        Font::write_digit(&mut full, 0, 0, 8, 2);
        Font::write_digit(&mut clipped, 23, 119, 8, 2);
        for i in 0..32 {
            for j in 0..128 {
                assert_eq!(
                    clipped.get(i, j),
                    i >= 23 && j >= 119 && full.get(i - 23, j - 119)
                );
            }
        }
    }
    #[test]
    fn invalid_digits_and_origins_leave_display_clear() {
        let mut screen = Screen::new();
        for (y, x, n, scale) in [(0, 0, 10, 1), (32, 0, 8, 1), (0, 128, 8, 1), (0, 0, 8, 0)] {
            Font::write_digit(&mut screen, y, x, n, scale);
        }
        for i in 0..32 {
            for j in 0..128 {
                assert!(!screen.get(i, j));
            }
        }
        Font::write_digit(&mut screen, 31, 127, 8, usize::MAX);
    }
}
