use crate::font::Font;
use crate::lights::{Brightness, Lights, PadColors};
use crate::screen::Screen;
use hidapi::{HidDevice, HidResult};
use std::{thread, time};

pub(crate) fn self_test(device: &HidDevice, screen: &mut Screen, lights: &mut Lights) -> HidResult<()> {
    Font::write_digit(screen, 0, 0, 1, 4);
    screen.write(device)?;
    thread::sleep(time::Duration::from_millis(100));
    Font::write_digit(screen, 0, 32, 3, 4);
    screen.write(device)?;
    thread::sleep(time::Duration::from_millis(100));
    Font::write_digit(screen, 0, 64, 3, 4);
    screen.write(device)?;
    thread::sleep(time::Duration::from_millis(100));
    Font::write_digit(screen, 0, 96, 7, 4);
    screen.write(device)?;

    for i in 0..39 {
        lights.set_button(num::FromPrimitive::from_u32(i).unwrap(), Brightness::Bright);
        lights.write(device)?;
        lights.set_button(num::FromPrimitive::from_u32(i).unwrap(), Brightness::Normal);
        lights.write(device)?;
        lights.set_button(num::FromPrimitive::from_u32(i).unwrap(), Brightness::Dim);
        lights.write(device)?;
        // thread::sleep(time::Duration::from_millis(100));
    }
    for i in 0..16 {
        // let color: PadColors = PadColors::Blue;
        let color: PadColors = num::FromPrimitive::from_usize(i + 2).unwrap();
        lights.set_pad(i, color, Brightness::Bright);
        lights.write(device)?;
        let color: PadColors = num::FromPrimitive::from_usize(i + 1).unwrap();
        lights.set_pad(i, color, Brightness::Normal);
        lights.write(device)?;
        let color: PadColors = num::FromPrimitive::from_usize(i + 1).unwrap();
        lights.set_pad(i, color, Brightness::Dim);
        lights.write(device)?;
        // thread::sleep(time::Duration::from_millis(1000));
    }
    for i in 0..25 {
        lights.set_slider(i, Brightness::Bright);
        lights.write(device)?;
        lights.set_slider(i, Brightness::Normal);
        lights.write(device)?;
        lights.set_slider(i, Brightness::Dim);
        lights.write(device)?;
        // thread::sleep(time::Duration::from_millis(1000));
    }
    lights.reset();
    lights.write(device)?;

    screen.reset();
    screen.write(device)?;

    Ok(())
}
