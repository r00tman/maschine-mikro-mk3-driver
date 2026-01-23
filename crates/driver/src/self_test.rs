use hidapi::{HidDevice, HidResult};
use maschine_library::font::Font;
use maschine_library::lights::{Brightness, Lights, PadColors};
use maschine_library::screen::Screen;
use std::{thread, time};

pub(crate) fn self_test(
    device: &HidDevice,
    screen: &mut Screen,
    lights: &mut Lights,
) -> HidResult<()> {
    Font::write_str(screen, 0, 0, "LAVA", 4);
    screen.write(device)?;

    // Rainbow colors for funky cycling
    let rainbow = [
        PadColors::Red,
        PadColors::Orange,
        PadColors::Yellow,
        PadColors::Lime,
        PadColors::Green,
        PadColors::Cyan,
        PadColors::Blue,
        PadColors::Violet,
        PadColors::Purple,
        PadColors::Magenta,
        PadColors::Fuchsia,
    ];

    // Rainbow wave across pads (8 frames, ~50ms each = 400ms)
    for frame in 0..8 {
        for i in 0..16 {
            let color_idx = (i + frame * 2) % rainbow.len();
            lights.set_pad(i, rainbow[color_idx], Brightness::Bright);
        }
        lights.write(device)?;
        thread::sleep(time::Duration::from_millis(50));
    }

    // Spinning rainbow on pads (6 rotations, ~40ms each = 240ms)
    for rotation in 0..6 {
        for i in 0..16 {
            let color_idx = (i + rotation * 3) % rainbow.len();
            lights.set_pad(i, rainbow[color_idx], Brightness::Bright);
        }
        lights.write(device)?;
        thread::sleep(time::Duration::from_millis(40));
    }

    // Cascade buttons from left to right (39 buttons, ~15ms each = 585ms)
    for i in 0..39 {
        lights.set_button(num::FromPrimitive::from_u32(i).unwrap(), Brightness::Bright);
        lights.write(device)?;
        thread::sleep(time::Duration::from_millis(15));
    }

    // Slider chase effect (25 positions × 2 passes × 15ms = 750ms)
    for _ in 0..2 {
        for i in 0..25 {
            lights.set_slider(i, Brightness::Bright);
            if i > 0 {
                lights.set_slider(i - 1, Brightness::Dim);
            }
            lights.write(device)?;
            thread::sleep(time::Duration::from_millis(15));
        }
    }

    // Final flash - all pads white bright (200ms)
    for i in 0..16 {
        lights.set_pad(i, PadColors::White, Brightness::Bright);
    }
    lights.write(device)?;
    thread::sleep(time::Duration::from_millis(200));

    // Fade to off
    lights.reset();
    lights.write(device)?;

    Ok(())
}
