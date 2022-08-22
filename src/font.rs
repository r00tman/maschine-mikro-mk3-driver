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
    pub fn write_digit(s: &mut Screen, y: usize, x: usize, num: usize, scale: usize) {
        let sym = FONT[num];
        for i in 0..(8 * scale) {
            for j in 0..(8 * scale) {
                let bit = sym[i / scale][j / scale] != b' ';
                s.set(i + y, j + x, bit);
            }
        }
    }
}
