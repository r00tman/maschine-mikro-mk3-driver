mod controls;
mod font;
mod lights;
mod screen;
use crate::controls::{Buttons, PadEventType};
use crate::font::Font;
use crate::lights::{Brightness, Lights, PadColors};
use crate::screen::Screen;
use hidapi::{HidDevice, HidResult};
use midir::os::unix::VirtualOutput;
use midir::MidiOutput;
use midly::{live::LiveEvent, num::u7, MidiMessage};
use std::{thread, time};

fn self_test(device: &HidDevice, screen: &mut Screen, lights: &mut Lights) -> HidResult<()> {
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

fn main() -> HidResult<()> {
    let notemaps: [u7; 16] = [
        49.into(),
        27.into(),
        31.into(),
        57.into(),
        48.into(),
        47.into(),
        43.into(),
        59.into(),
        36.into(),
        38.into(),
        46.into(),
        51.into(),
        36.into(),
        38.into(),
        42.into(),
        44.into(),
    ];

    let output = MidiOutput::new("Maschine Mikro MK3").expect("Couldn't open MIDI output");
    let mut port = output
        .create_virtual("Maschine Mikro MK3 MIDI Out")
        .expect("Couldn't create virtual port");

    let api = hidapi::HidApi::new()?;
    #[allow(non_snake_case)]
    let (VID, PID) = (0x17cc, 0x1700);
    let device = api.open(VID, PID)?;

    device.set_blocking_mode(false)?;

    let mut screen = Screen::new();
    let mut lights = Lights::new();

    self_test(&device, &mut screen, &mut lights)?;

    let mut buf = [0u8; 64];
    loop {
        let size = device.read_timeout(&mut buf, 10)?;
        if size < 1 {
            continue;
        }

        let mut changed_lights = false;
        if buf[0] == 0x01 {
            // button mode
            for i in 0..6 {
                // bytes
                for j in 0..8 {
                    // bits
                    let idx = i * 8 + j;
                    let button: Option<Buttons> = num::FromPrimitive::from_usize(idx);
                    let button = match button {
                        Some(val) => val,
                        None => continue,
                    };
                    let status = buf[i + 1] & (1 << j);
                    let status = status > 0;
                    if status {
                        println!("{:?}", button);
                    }
                    if lights.button_has_light(button) {
                        let light_status = lights.get_button(button) != Brightness::Off;
                        if status != light_status {
                            lights.set_button(
                                button,
                                if status {
                                    Brightness::Normal
                                } else {
                                    Brightness::Off
                                },
                            );
                            changed_lights = true;
                        }
                    }
                }
            }
            let encoder_val = buf[7];
            println!("Encoder: {}", encoder_val);
            let slider_val = buf[10];
            if slider_val != 0 {
                println!("Slider: {}", slider_val);
                let cnt = (slider_val as i32 - 1 + 5) * 25 / 200 - 1;
                for i in 0..25 {
                    let b = match cnt - i {
                        0 => Brightness::Normal,
                        1..=25 => Brightness::Dim,
                        _ => Brightness::Off,
                    };
                    lights.set_slider(i as usize, b);
                }
                changed_lights = true;
            }
        } else if buf[0] == 0x02 {
            // pad mode
            for i in (1..buf.len()).step_by(3) {
                let idx = buf[i];
                let evt = buf[i + 1] & 0xf0;
                let val = ((buf[i + 1] as u16 & 0x0f) << 8) + buf[i + 2] as u16;
                if i > 1 && idx == 0 && evt == 0 && val == 0 {
                    break;
                }
                let pad_evt: PadEventType = num::FromPrimitive::from_u8(evt).unwrap();
                // if evt != PadEventType::Aftertouch {
                println!("Pad {}: {:?} @ {}", idx, pad_evt, val);
                // }
                let (_, prev_b) = lights.get_pad(idx as usize);
                let b = match pad_evt {
                    PadEventType::NoteOn | PadEventType::PressOn => Brightness::Normal,
                    PadEventType::NoteOff | PadEventType::PressOff => Brightness::Off,
                    PadEventType::Aftertouch => {
                        if val > 0 {
                            Brightness::Normal
                        } else {
                            Brightness::Off
                        }
                    }
                    #[allow(unreachable_patterns)]
                    _ => prev_b,
                };
                if prev_b != b {
                    lights.set_pad(idx as usize, PadColors::Blue, b);
                    changed_lights = true;
                }
                // let padids = [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4];
                // let note = padids[idx as usize]-1+36;

                let note = notemaps[idx as usize];
                let mut velocity = (val >> 5) as u8;
                if val > 0 && velocity == 0 {
                    velocity = 1;
                }

                let event = match pad_evt {
                    PadEventType::NoteOn | PadEventType::PressOn => Some(MidiMessage::NoteOn {
                        key: note,
                        vel: velocity.into(),
                    }),
                    PadEventType::NoteOff | PadEventType::PressOff => Some(MidiMessage::NoteOff {
                        key: note,
                        vel: velocity.into(),
                    }),
                    _ => None,
                };

                if let Some(evt) = event {
                    let l_ev = LiveEvent::Midi {
                        channel: 0.into(),
                        message: evt,
                    };
                    let mut buf = Vec::new();
                    l_ev.write(&mut buf).unwrap();
                    port.send(&buf[..]).unwrap()
                }
            }
        }
        if changed_lights {
            lights.write(&device)?;
        }
        // println!("{} {:?}", size, buf);
    }
}
