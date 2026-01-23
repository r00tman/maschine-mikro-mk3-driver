use crate::screen::Screen;

type Glyph = [&'static [u8; 8]; 8];

const DIGITS: [Glyph; 10] = [
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
    // 1
    [
        b"     xx ",
        b"     xx ",
        b"    x x ",
        b"  xx  x ",
        b"      x ",
        b"      x ",
        b"      x ",
        b"  xxxxxx",
    ],
    // 2
    [
        b"   xxxx ",
        b" x     x",
        b" x     x",
        b"      x ",
        b"    x   ",
        b"  x     ",
        b" x      ",
        b" xxxxxxx",
    ],
    // 3
    [
        b"  xxxxx ",
        b" x     x",
        b"      x ",
        b"   xxxx ",
        b"       x",
        b"       x",
        b" x    x ",
        b"  xxxx  ",
    ],
    // 4
    [
        b" x     x",
        b" x     x",
        b" x     x",
        b" x    xx",
        b"  xxxx x",
        b"       x",
        b"       x",
        b"       x",
    ],
    // 5
    [
        b" xxxxxxx",
        b" x      ",
        b" x      ",
        b" xxxxxx ",
        b"       x",
        b"       x",
        b"       x",
        b" xxxxxx ",
    ],
    // 6
    [
        b"  xxxxx ",
        b" x     x",
        b" x      ",
        b" x xxx  ",
        b" xx   xx",
        b" x     x",
        b" x     x",
        b"  xxxxx ",
    ],
    // 7
    [
        b" xxxxxxx",
        b"       x",
        b"       x",
        b"      x ",
        b"     x  ",
        b"    x   ",
        b"   x    ",
        b"  x     ",
    ],
    // 8
    [
        b"  xxxxx ",
        b" x     x",
        b" x     x",
        b"  xxxxx ",
        b" x     x",
        b" x     x",
        b" x     x",
        b"  xxxxx ",
    ],
    // 9
    [
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

const LETTERS: [Glyph; 26] = [
    // A
    [
        b"   xx   ",
        b"  x  x  ",
        b" x    x ",
        b" x    x ",
        b" xxxxxx ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
    ],
    // B
    [
        b" xxxxx  ",
        b" x    x ",
        b" x    x ",
        b" xxxxx  ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" xxxxx  ",
    ],
    // C
    [
        b"  xxxx  ",
        b" x    x ",
        b" x      ",
        b" x      ",
        b" x      ",
        b" x      ",
        b" x    x ",
        b"  xxxx  ",
    ],
    // D
    [
        b" xxxx   ",
        b" x   x  ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x   x  ",
        b" xxxx   ",
    ],
    // E
    [
        b" xxxxxx ",
        b" x      ",
        b" x      ",
        b" xxxxx  ",
        b" x      ",
        b" x      ",
        b" x      ",
        b" xxxxxx ",
    ],
    // F
    [
        b" xxxxxx ",
        b" x      ",
        b" x      ",
        b" xxxxx  ",
        b" x      ",
        b" x      ",
        b" x      ",
        b" x      ",
    ],
    // G
    [
        b"  xxxx  ",
        b" x    x ",
        b" x      ",
        b" x      ",
        b" x  xxx ",
        b" x    x ",
        b" x    x ",
        b"  xxxx  ",
    ],
    // H
    [
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" xxxxxx ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
    ],
    // I
    [
        b"  xxxxx ",
        b"    x   ",
        b"    x   ",
        b"    x   ",
        b"    x   ",
        b"    x   ",
        b"    x   ",
        b"  xxxxx ",
    ],
    // J
    [
        b"   xxxx ",
        b"     x  ",
        b"     x  ",
        b"     x  ",
        b"     x  ",
        b" x   x  ",
        b" x   x  ",
        b"  xxx   ",
    ],
    // K
    [
        b" x    x ",
        b" x   x  ",
        b" x  x   ",
        b" xxx    ",
        b" x  x   ",
        b" x   x  ",
        b" x    x ",
        b" x    x ",
    ],
    // L
    [
        b" x      ",
        b" x      ",
        b" x      ",
        b" x      ",
        b" x      ",
        b" x      ",
        b" x      ",
        b" xxxxxx ",
    ],
    // M
    [
        b" x    x ",
        b" xx  xx ",
        b" x xx x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
    ],
    // N
    [
        b" x    x ",
        b" xx   x ",
        b" x x  x ",
        b" x  x x ",
        b" x   xx ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
    ],
    // O
    [
        b"  xxxx  ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b"  xxxx  ",
    ],
    // P
    [
        b" xxxxx  ",
        b" x    x ",
        b" x    x ",
        b" xxxxx  ",
        b" x      ",
        b" x      ",
        b" x      ",
        b" x      ",
    ],
    // Q
    [
        b"  xxxx  ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x  x x ",
        b" x   x  ",
        b"  xxx x ",
    ],
    // R
    [
        b" xxxxx  ",
        b" x    x ",
        b" x    x ",
        b" xxxxx  ",
        b" x  x   ",
        b" x   x  ",
        b" x    x ",
        b" x    x ",
    ],
    // S
    [
        b"  xxxx  ",
        b" x    x ",
        b" x      ",
        b"  xxxx  ",
        b"      x ",
        b"      x ",
        b" x    x ",
        b"  xxxx  ",
    ],
    // T
    [
        b" xxxxxx ",
        b"   x    ",
        b"   x    ",
        b"   x    ",
        b"   x    ",
        b"   x    ",
        b"   x    ",
        b"   x    ",
    ],
    // U
    [
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b"  xxxx  ",
    ],
    // V
    [
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b"  x  x  ",
        b"  x  x  ",
        b"   xx   ",
    ],
    // W
    [
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x    x ",
        b" x xx x ",
        b" xx  xx ",
        b" x    x ",
    ],
    // X
    [
        b" x    x ",
        b" x    x ",
        b"  x  x  ",
        b"   xx   ",
        b"   xx   ",
        b"  x  x  ",
        b" x    x ",
        b" x    x ",
    ],
    // Y
    [
        b" x    x ",
        b" x    x ",
        b"  x  x  ",
        b"   xx   ",
        b"   x    ",
        b"   x    ",
        b"   x    ",
        b"   x    ",
    ],
    // Z
    [
        b" xxxxxx ",
        b"      x ",
        b"     x  ",
        b"    x   ",
        b"   x    ",
        b"  x     ",
        b" x      ",
        b" xxxxxx ",
    ],
];

pub struct Font {}

impl Font {
    fn write_glyph(s: &mut Screen, y: usize, x: usize, glyph: &Glyph, scale: usize) {
        for i in 0..(8 * scale) {
            for j in 0..(8 * scale) {
                let bit = glyph[i / scale][j / scale] != b' ';
                s.set(i + y, j + x, bit);
            }
        }
    }

    pub fn write_digit(s: &mut Screen, y: usize, x: usize, num: usize, scale: usize) {
        Self::write_glyph(s, y, x, &DIGITS[num], scale);
    }

    pub fn write_char(s: &mut Screen, y: usize, x: usize, ch: char, scale: usize) {
        let glyph = match ch {
            '0'..='9' => &DIGITS[(ch as usize) - ('0' as usize)],
            'A'..='Z' => &LETTERS[(ch as usize) - ('A' as usize)],
            'a'..='z' => &LETTERS[(ch as usize) - ('a' as usize)],
            _ => return, // unsupported character, skip
        };
        Self::write_glyph(s, y, x, glyph, scale);
    }

    pub fn write_str(s: &mut Screen, y: usize, x: usize, text: &str, scale: usize) {
        let char_width = 8 * scale;
        for (i, ch) in text.chars().enumerate() {
            Self::write_char(s, y, x + i * char_width, ch, scale);
        }
    }
}
