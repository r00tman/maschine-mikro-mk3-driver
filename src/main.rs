extern crate hidapi;
extern crate num;
#[macro_use]
extern crate num_derive;
extern crate alsa;
mod controls;
mod font;
mod lights;
mod screen;
use crate::controls::{Buttons, PadEventType};
use crate::font::Font;
use crate::lights::{Brightness, Lights, PadColors};
use crate::screen::Screen;
use alsa::seq;
use hidapi::{HidDevice, HidResult};
use std::ffi::CString;
use std::{thread, time};

fn self_test(device: &HidDevice, screen: &mut Screen, lights: &mut Lights) -> HidResult<()> {
    Font::write_digit(screen, 0, 0, 1, 4);
    screen.write(&device)?;
    thread::sleep(time::Duration::from_millis(100));
    Font::write_digit(screen, 0, 32, 3, 4);
    screen.write(&device)?;
    thread::sleep(time::Duration::from_millis(100));
    Font::write_digit(screen, 0, 64, 3, 4);
    screen.write(&device)?;
    thread::sleep(time::Duration::from_millis(100));
    Font::write_digit(screen, 0, 96, 7, 4);
    screen.write(&device)?;

    for i in 0..39 {
        lights.set_button(num::FromPrimitive::from_u32(i).unwrap(), Brightness::Bright);
        lights.write(&device)?;
        lights.set_button(num::FromPrimitive::from_u32(i).unwrap(), Brightness::Normal);
        lights.write(&device)?;
        lights.set_button(num::FromPrimitive::from_u32(i).unwrap(), Brightness::Dim);
        lights.write(&device)?;
        // thread::sleep(time::Duration::from_millis(100));
    }
    for i in 0..16 {
        // let color: PadColors = PadColors::Blue;
        let color: PadColors = num::FromPrimitive::from_usize(i + 2).unwrap();
        lights.set_pad(i, color, Brightness::Bright);
        lights.write(&device)?;
        let color: PadColors = num::FromPrimitive::from_usize(i + 1).unwrap();
        lights.set_pad(i, color, Brightness::Normal);
        lights.write(&device)?;
        let color: PadColors = num::FromPrimitive::from_usize(i + 1).unwrap();
        lights.set_pad(i, color, Brightness::Dim);
        lights.write(&device)?;
        // thread::sleep(time::Duration::from_millis(1000));
    }
    for i in 0..25 {
        lights.set_slider(i, Brightness::Bright);
        lights.write(&device)?;
        lights.set_slider(i, Brightness::Normal);
        lights.write(&device)?;
        lights.set_slider(i, Brightness::Dim);
        lights.write(&device)?;
        // thread::sleep(time::Duration::from_millis(1000));
    }
    lights.reset();
    lights.write(&device)?;

    screen.reset();
    screen.write(&device)?;

    Ok(())
}

fn main() -> HidResult<()> {
    // let s = alsa::Seq::open(None, Some(alsa::Direction::Capture), true).unwrap();
    // let cstr = CString::new("rust_synth_example").unwrap();
    // s.set_client_name(&cstr).unwrap();

    // // Create a destination port we can read from
    // let mut dinfo = seq::PortInfo::empty().unwrap();
    // dinfo.set_capability(seq::PortCap::WRITE | seq::PortCap::SUBS_WRITE);
    // dinfo.set_type(seq::PortType::MIDI_GENERIC | seq::PortType::APPLICATION);
    // dinfo.set_name(&cstr);
    // s.create_port(&dinfo).unwrap();
    // let dport = dinfo.get_port();

    // let sq: alsa::Seq = alsa::Seq::open(Some(&CString::new("Maschine Mikro Mk3").unwrap()), Some(alsa::Direction::Playback), true).unwrap();
    let sequencer = alsa::Seq::open(None, Some(alsa::Direction::Playback), true).unwrap();
    sequencer
        .set_client_name(&CString::new("open-maschine").unwrap())
        .unwrap();

    let mut port_info = seq::PortInfo::empty().unwrap();
    port_info.set_name(&CString::new("Maschine Mikro Mk3 MIDI").unwrap());
    port_info.set_capability(seq::PortCap::READ | seq::PortCap::SUBS_READ);
    port_info.set_type(seq::PortType::MIDI_GENERIC);
    sequencer.create_port(&port_info).unwrap();
    let seq_port = port_info.get_port();

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
                if i > 1 && idx == 0 && evt as u8 == 0 && val == 0 {
                    break;
                }
                let evt: PadEventType = num::FromPrimitive::from_u8(evt).unwrap();
                // if evt != PadEventType::Aftertouch {
                println!("Pad {}: {:?} @ {}", idx, evt, val);
                // }
                let (_, prev_b) = lights.get_pad(idx as usize);
                let b = match evt {
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
                let notemaps = [
                    49, 27, 31, 57, 48, 47, 43, 59, 36, 38, 46, 51, 36, 38, 42, 44,
                ];
                let note = notemaps[idx as usize];
                let mut velocity = (val >> 5) as u8;
                if val > 0 && velocity == 0 {
                    velocity = 1;
                }
                let ev_note = seq::EvNote {
                    channel: 0,
                    note: note,
                    duration: 0,
                    velocity: velocity,
                    off_velocity: velocity,
                };

                let evt_type = match evt {
                    PadEventType::NoteOn | PadEventType::PressOn => seq::EventType::Noteon,
                    PadEventType::NoteOff | PadEventType::PressOff => seq::EventType::Noteoff,
                    PadEventType::Aftertouch => seq::EventType::Keypress,
                };

                if evt_type != seq::EventType::Keypress {
                    let mut event = seq::Event::new(evt_type, &ev_note);
                    println!("emitting {:?} vel {}", evt_type, velocity);
                    event.set_subs();
                    event.set_direct();
                    event.set_source(seq_port);
                    sequencer.event_output(&mut event).unwrap();
                    sequencer.drain_output().unwrap();
                }
            }
        }
        if changed_lights {
            lights.write(&device)?;
        }
        // println!("{} {:?}", size, buf);
    }
}
