mod self_test;
mod settings;

use crate::self_test::self_test;
use crate::settings::Settings;
use clap::Parser;
use config::Config;
use hidapi::{HidDevice, HidResult};
use maschine_library::controls::{Buttons, PadEventType};
use maschine_library::font::Font;
use maschine_library::lights::{Brightness, Lights, PadColors};
use maschine_library::screen::Screen;
use midir::os::unix::{VirtualInput, VirtualOutput};
use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use std::process::Command;
use std::{thread, time};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

// MIDI CC assignments for controls
// Buttons use CC 20-58 (button enum value + 20)
const BUTTON_CC_OFFSET: u8 = 20;
// Encoder rotation uses CC 1 (relative mode: 65 = CW, 63 = CCW)
const ENCODER_CC: u8 = 1;
// Slider uses CC 9
const SLIDER_CC: u8 = 9;

/// Tracks the state of all controls for change detection
struct ControlState {
    buttons: [bool; 41],
    slider_value: u8,
    encoder_pos: Option<u8>, // 4-bit absolute position (0..15)
}

impl ControlState {
    fn new() -> Self {
        Self {
            buttons: [false; 41],
            slider_value: 0,
            encoder_pos: None,
        }
    }
}

#[derive(Parser, Debug)]
#[clap(
    name = "Maschine Mikro MK3 Userspace MIDI driver",
    version = env!("CARGO_PKG_VERSION"),
    author = env!("CARGO_PKG_AUTHORS"),
)]
struct Args {
    #[clap(short, long, help = "Config file (see example_config.toml)")]
    config: Option<String>,
    
    #[clap(short, long, help = "Print text on screen (slides if > 4 chars)")]
    text: Option<String>,
}

fn parse_backlight_brightness(s: &str) -> Result<Brightness, String> {
    match s.trim().to_ascii_lowercase().as_str() {
        "dim" => Ok(Brightness::Dim),
        "normal" => Ok(Brightness::Normal),
        "bright" => Ok(Brightness::Bright),
        other => Err(format!(
            "invalid backlight_brightness={other:?} (expected: \"dim\", \"normal\", \"bright\")"
        )),
    }
}

/// Display text on screen, with sliding animation if longer than 4 characters
fn display_text(device: &HidDevice, screen: &mut Screen, text: &str) -> HidResult<()> {
    const SCREEN_WIDTH: usize = 128;
    const CHAR_WIDTH: usize = 8;
    const SCALE: usize = 1;
    const Y_POSITION: usize = 12; // Vertical center-ish
    
    if text.chars().count() <= 4 {
        // Short text: display statically
        screen.reset();
        let text_width = text.chars().count() * CHAR_WIDTH;
        let x_start = (SCREEN_WIDTH - text_width) / 2; // Center the text
        Font::write_str(screen, Y_POSITION, x_start, text, SCALE);
        screen.write(device)?;
        
        println!("Displaying text: {}", text);
        thread::sleep(Duration::from_secs(3));
    } else {
        // Long text: slide it across the screen
        let text_width = text.chars().count() * CHAR_WIDTH;
        let total_distance = SCREEN_WIDTH + text_width;
        
        println!("Sliding text: {}", text);
        
        // Slide from right to left
        for offset in 0..total_distance {
            screen.reset();
            let x_pos = SCREEN_WIDTH as i32 - offset as i32;
            
            // Render each character individually to handle partial visibility
            for (i, ch) in text.chars().enumerate() {
                let char_x = x_pos + (i * CHAR_WIDTH) as i32;
                
                // Only render characters that are at least partially on screen
                if char_x >= -(CHAR_WIDTH as i32) && char_x < SCREEN_WIDTH as i32 {
                    if char_x >= 0 {
                        Font::write_char(screen, Y_POSITION, char_x as usize, ch, SCALE);
                    }
                }
            }
            
            screen.write(device)?;
            thread::sleep(Duration::from_millis(30)); // ~33 fps
        }
    }
    
    Ok(())
}

fn main() -> HidResult<()> {
    let args = Args::parse();

    // If --text is provided, just display the text and exit (no MIDI setup needed)
    if let Some(text) = args.text {
        let api = hidapi::HidApi::new()?;
        #[allow(non_snake_case)]
        let (VID, PID) = (0x17cc, 0x1700);
        let device = api.open(VID, PID)?;
        device.set_blocking_mode(false)?;
        
        let mut screen = Screen::new();
        display_text(&device, &mut screen, &text)?;
        
        // Clear screen before exit
        screen.reset();
        screen.write(&device)?;
        return Ok(());
    }

    let mut cfg = Config::builder();

    if let Some(config_fn) = args.config {
        cfg = cfg.add_source(config::File::with_name(config_fn.as_str()));
    }

    let cfg = cfg.build().expect("Can't create settings");
    let settings: Settings = cfg.try_deserialize().expect("Can't parse settings");

    settings.validate().unwrap();

    println!("Running with settings:");
    println!("{settings:?}");

    // Create MIDI output port
    let output = MidiOutput::new(&settings.client_name).expect("Couldn't open MIDI output");
    let mut port = output
        .create_virtual(&settings.port_name)
        .expect("Couldn't create virtual output port");

    // Shared state for lights (needed for MIDI input callback)
    let lights = Arc::new(Mutex::new(Lights::new()));
    let lights_dirty = Arc::new(AtomicBool::new(false));
    
    // Shared state for screen (needed for MIDI input callback - SysEx messages)
    let screen = Arc::new(Mutex::new(Screen::new()));
    let screen_dirty = Arc::new(AtomicBool::new(false));

    // Create MIDI input port
    let midi_input = MidiInput::new(&format!("{} In", settings.client_name))
        .expect("Couldn't open MIDI input");
    let _midi_input_connection = create_midi_input(
        midi_input,
        &settings,
        Arc::clone(&lights),
        Arc::clone(&lights_dirty),
        Arc::clone(&screen),
        Arc::clone(&screen_dirty),
    );

    // Now that the virtual MIDI ports exist, optionally wire them to virmidi (what Bitwig enumerates).
    if settings.autoconnect_virmidi {
        if let Err(e) = try_autoconnect_virmidi(&settings) {
            eprintln!("Auto-connect to virmidi failed (continuing): {e}");
        }
    }

    let api = hidapi::HidApi::new()?;
    #[allow(non_snake_case)]
    let (VID, PID) = (0x17cc, 0x1700);
    let device = api.open(VID, PID)?;

    device.set_blocking_mode(false)?;

    // Run self test with a temporary lock on lights and screen
    {
        let mut lights_guard = lights.lock().unwrap();
        let mut screen_guard = screen.lock().unwrap();
        self_test(&device, &mut screen_guard, &mut lights_guard)?;
    }

    main_loop(&device, lights, lights_dirty, screen, screen_dirty, &mut port, &settings)?;

    Ok(())
}

#[derive(Debug, Clone)]
struct SeqPort {
    client_id: u32,
    port_id: u32,
    client_name: String,
    port_name: String,
}

fn parse_aconnect_list(output: &str) -> Vec<SeqPort> {
    // aconnect -l format:
    // client 128: 'Name' [type=user,pid=...]
    //     0 'Port name'
    let mut ports = Vec::new();
    let mut cur_client_id: Option<u32> = None;
    let mut cur_client_name: Option<String> = None;

    for line in output.lines() {
        let line = line.trim_end();
        if let Some(rest) = line.strip_prefix("client ") {
            // Parse "128: 'Name' ..."
            let mut parts = rest.splitn(2, ':');
            let id_part = parts.next().unwrap_or("").trim();
            let tail = parts.next().unwrap_or("");
            let id = id_part.parse::<u32>().ok();

            // Find first quoted string for name.
            let name = tail
                .split('\'')
                .nth(1)
                .map(|s| s.to_string());

            cur_client_id = id;
            cur_client_name = name;
            continue;
        }

        // Port lines are indented and start with a number: "0 'Port name'"
        let l = line.trim_start();
        let first = l.split_whitespace().next().unwrap_or("");
        if first.chars().all(|c| c.is_ascii_digit()) && l.contains('\'') {
            let port_id = first.parse::<u32>().ok();
            let port_name = l.split('\'').nth(1).map(|s| s.to_string());

            if let (Some(client_id), Some(client_name), Some(port_id), Some(port_name)) = (
                cur_client_id,
                cur_client_name.clone(),
                port_id,
                port_name,
            ) {
                ports.push(SeqPort {
                    client_id,
                    port_id,
                    client_name,
                    port_name,
                });
            }
        }
    }

    ports
}

fn run_aconnect(from: &SeqPort, to: &SeqPort) -> Result<(), String> {
    let status = Command::new("aconnect")
        .arg(format!("{}:{}", from.client_id, from.port_id))
        .arg(format!("{}:{}", to.client_id, to.port_id))
        .status()
        .map_err(|e| format!("failed to execute aconnect: {e}"))?;
    if !status.success() {
        return Err(format!("aconnect exited with {status}"));
    }
    Ok(())
}

fn try_autoconnect_virmidi(settings: &Settings) -> Result<(), String> {
    // Creating the virtual MIDI ports and having them appear in `aconnect -l` can be slightly racy.
    // Retry a few times before giving up.
    let mut last_err: Option<String> = None;
    for _attempt in 0..20 {
        let output = Command::new("aconnect")
            .arg("-l")
            .output()
            .map_err(|e| format!("failed to run `aconnect -l`: {e}"))?;
        if !output.status.success() {
            last_err = Some(format!("`aconnect -l` failed with {}", output.status));
            thread::sleep(time::Duration::from_millis(50));
            continue;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let ports = parse_aconnect_list(&text);

        let driver_out = match ports
            .iter()
            .find(|p| p.client_name == settings.client_name && p.port_name == settings.port_name)
            .cloned()
        {
            Some(p) => p,
            None => {
                last_err = Some(format!(
                    "could not find driver output port \"{}\" / \"{}\" in `aconnect -l`",
                    settings.client_name, settings.port_name
                ));
                thread::sleep(time::Duration::from_millis(50));
                continue;
            }
        };

        let driver_in_client = format!("{} In", settings.client_name);
        let driver_in = match ports
            .iter()
            .find(|p| p.client_name == driver_in_client && p.port_name == settings.port_name_in)
            .cloned()
        {
            Some(p) => p,
            None => {
                last_err = Some(format!(
                    "could not find driver input port \"{}\" / \"{}\" in `aconnect -l`",
                    driver_in_client, settings.port_name_in
                ));
                thread::sleep(time::Duration::from_millis(50));
                continue;
            }
        };

        let virmidi_candidates: Vec<SeqPort> = if settings.virmidi_client_name.trim().is_empty() {
            ports.iter()
                .filter(|p| p.client_name.starts_with("Virtual Raw MIDI"))
                .cloned()
                .collect()
        } else {
            ports.iter()
                .filter(|p| p.client_name == settings.virmidi_client_name)
                .cloned()
                .collect()
        };

        if virmidi_candidates.is_empty() {
            last_err = Some(
                "no virmidi ALSA sequencer ports found (is snd-virmidi loaded? did Bitwig open it once?)"
                    .to_string(),
            );
            thread::sleep(time::Duration::from_millis(50));
            continue;
        }

        let virmidi_port = match virmidi_candidates
            .into_iter()
            .find(|p| p.port_id as usize == settings.virmidi_port)
        {
            Some(p) => p,
            None => {
                last_err = Some(format!(
                    "virmidi client found, but no port {} exists",
                    settings.virmidi_port
                ));
                thread::sleep(time::Duration::from_millis(50));
                continue;
            }
        };

        // Driver -> Bitwig (via virmidi rawmidi)
        run_aconnect(&driver_out, &virmidi_port)?;
        // Bitwig -> Driver (LEDs), also via virmidi rawmidi
        run_aconnect(&virmidi_port, &driver_in)?;

        eprintln!(
            "Auto-connected: {}:{} -> {}:{} and back -> {}:{}",
            driver_out.client_id,
            driver_out.port_id,
            virmidi_port.client_id,
            virmidi_port.port_id,
            driver_in.client_id,
            driver_in.port_id
        );

        return Ok(());
    }

    Err(last_err.unwrap_or_else(|| "auto-connect failed".to_string()))
}

/// Sends a MIDI CC message
fn send_cc(port: &mut MidiOutputConnection, cc: u8, value: u8) {
    // MIDI CC: 0xB0 (CC on channel 0), controller, value
    let buf = [0xB0, cc, value];
    port.send(&buf).unwrap();
}

/// Sends a MIDI Note message
fn send_note(port: &mut MidiOutputConnection, note: u8, velocity: u8, on: bool) {
    // MIDI Note: 0x90 (Note On) or 0x80 (Note Off) on channel 0
    let status = if on && velocity > 0 { 0x90 } else { 0x80 };
    let buf = [status, note, velocity];
    port.send(&buf).unwrap();
}

/// Maps a MIDI velocity (0-127) to a pad color
fn velocity_to_color(velocity: u8) -> PadColors {
    match velocity {
        0 => PadColors::Off,
        1..=7 => PadColors::Red,
        8..=14 => PadColors::Orange,
        15..=21 => PadColors::LightOrange,
        22..=28 => PadColors::WarmYellow,
        29..=35 => PadColors::Yellow,
        36..=42 => PadColors::Lime,
        43..=49 => PadColors::Green,
        50..=56 => PadColors::Mint,
        57..=63 => PadColors::Cyan,
        64..=70 => PadColors::Turquoise,
        71..=77 => PadColors::Blue,
        78..=84 => PadColors::Plum,
        85..=91 => PadColors::Violet,
        92..=98 => PadColors::Purple,
        99..=105 => PadColors::Magenta,
        106..=112 => PadColors::Fuchsia,
        113..=127 => PadColors::White,
        _ => PadColors::White,
    }
}

// SysEx protocol constants
// Format: F0 00 21 09 <cmd> <data...> F7
// Commands: 01 = Screen Text, 02 = Screen Clear
const SYSEX_MANUFACTURER: [u8; 3] = [0x00, 0x21, 0x09];
const SYSEX_CMD_TEXT: u8 = 0x01;
const SYSEX_CMD_CLEAR: u8 = 0x02;

/// Creates the MIDI input port with a callback that processes incoming MIDI messages
fn create_midi_input(
    midi_input: MidiInput,
    settings: &Settings,
    lights: Arc<Mutex<Lights>>,
    lights_dirty: Arc<AtomicBool>,
    screen: Arc<Mutex<Screen>>,
    screen_dirty: Arc<AtomicBool>,
) -> MidiInputConnection<Vec<u8>> {
    // Clone notemaps for the callback (it needs to be 'static)
    let notemaps = settings.notemaps.clone();
    let backlight_enabled = settings.backlight_buttons;
    let backlight_brightness = parse_backlight_brightness(&settings.backlight_brightness)
        .expect("Invalid backlight_brightness (see README.md)");

    midi_input
        .create_virtual(
            &settings.port_name_in,
            move |_timestamp, message, _data| {
                // Handle SysEx messages (variable length, starts with 0xF0)
                if !message.is_empty() && message[0] == 0xF0 {
                    handle_sysex(message, &screen, &screen_dirty);
                    return;
                }
                
                // Parse incoming MIDI message (regular 3-byte messages)
                if message.len() < 3 {
                    return;
                }

                let status = message[0] & 0xF0;
                let channel = message[0] & 0x0F;
                let data1 = message[1];
                let data2 = message[2];

                // Only process channel 0 (can be extended later)
                if channel != 0 {
                    return;
                }

                let mut lights_guard = lights.lock().unwrap();

                match status {
                    0x90 => {
                        // Note On - control pad LEDs
                        let pad_idx = notemaps.iter().position(|&n| n == data1);
                        if let Some(idx) = pad_idx {
                            if data2 > 0 {
                                let color = velocity_to_color(data2);
                                lights_guard.set_pad(idx, color, Brightness::Normal);
                            } else {
                                lights_guard.set_pad(idx, PadColors::Off, Brightness::Off);
                            }
                            lights_dirty.store(true, Ordering::SeqCst);
                        }
                    }
                    0x80 => {
                        // Note Off - turn off pad LED
                        let pad_idx = notemaps.iter().position(|&n| n == data1);
                        if let Some(idx) = pad_idx {
                            lights_guard.set_pad(idx, PadColors::Off, Brightness::Off);
                            lights_dirty.store(true, Ordering::SeqCst);
                        }
                    }
                    0xB0 => {
                        // Control Change - control button LEDs
                        let cc = data1;
                        let value = data2;

                        // Check if this CC corresponds to a button (CC 20-60)
                        if cc >= BUTTON_CC_OFFSET && cc < BUTTON_CC_OFFSET + 41 {
                            let button_idx = (cc - BUTTON_CC_OFFSET) as usize;
                            let button: Option<Buttons> = num::FromPrimitive::from_usize(button_idx);
                            if let Some(btn) = button {
                                if lights_guard.button_has_light(btn) {
                                    let mut brightness = if value > 0 {
                                        // Map velocity to brightness
                                        match value {
                                            1..=42 => Brightness::Dim,
                                            43..=84 => Brightness::Normal,
                                            85..=127 => Brightness::Bright,
                                            _ => Brightness::Off,
                                        }
                                    } else {
                                        Brightness::Off
                                    };
                                    if backlight_enabled && brightness == Brightness::Off {
                                        brightness = backlight_brightness;
                                    }
                                    lights_guard.set_button(btn, brightness);
                                    lights_dirty.store(true, Ordering::SeqCst);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            },
            Vec::new(),
        )
        .expect("Couldn't create virtual input port")
}

/// Handle incoming SysEx messages for screen control
fn handle_sysex(message: &[u8], screen: &Arc<Mutex<Screen>>, screen_dirty: &Arc<AtomicBool>) {
    // Minimum SysEx: F0 <3 bytes mfr> <cmd> F7 = 6 bytes
    if message.len() < 6 {
        return;
    }
    
    // Check manufacturer ID
    if message[1..4] != SYSEX_MANUFACTURER {
        return;
    }
    
    let cmd = message[4];
    
    match cmd {
        SYSEX_CMD_TEXT => {
            // Screen text update: F0 00 21 09 01 <text bytes> F7
            // Extract text bytes (skip header, exclude F7 at end)
            let text_bytes = &message[5..message.len().saturating_sub(1)];
            let text = String::from_utf8_lossy(text_bytes);
            
            let mut screen_guard = screen.lock().unwrap();
            render_screen_text(&mut screen_guard, &text);
            screen_dirty.store(true, Ordering::SeqCst);
            
            println!("Screen: {}", text);
        }
        SYSEX_CMD_CLEAR => {
            // Screen clear: F0 00 21 09 02 F7
            let mut screen_guard = screen.lock().unwrap();
            screen_guard.reset();
            screen_dirty.store(true, Ordering::SeqCst);
            
            println!("Screen: cleared");
        }
        _ => {
            // Unknown command
        }
    }
}

/// Render text to the screen buffer (centered)
fn render_screen_text(screen: &mut Screen, text: &str) {
    const SCREEN_WIDTH: usize = 128;
    const CHAR_WIDTH: usize = 8;
    const Y_POSITION: usize = 12;
    const SCALE: usize = 1;
    
    screen.reset();
    
    let text_width = text.chars().count() * CHAR_WIDTH * SCALE;
    let x_start = if text_width < SCREEN_WIDTH {
        (SCREEN_WIDTH - text_width) / 2
    } else {
        0
    };
    
    Font::write_str(screen, Y_POSITION, x_start, text, SCALE);
}

fn main_loop(
    device: &HidDevice,
    lights: Arc<Mutex<Lights>>,
    lights_dirty: Arc<AtomicBool>,
    screen: Arc<Mutex<Screen>>,
    screen_dirty: Arc<AtomicBool>,
    port: &mut MidiOutputConnection,
    settings: &Settings,
) -> HidResult<()> {
    let mut buf = [0u8; 64];
    let mut state = ControlState::new();
    let backlight_enabled = settings.backlight_buttons;
    let backlight_brightness = parse_backlight_brightness(&settings.backlight_brightness)
        .expect("Invalid backlight_brightness (see README.md)");

    println!("MIDI CC Mapping:");
    println!("  Buttons: CC {}-{} (value 127=press, 0=release)", BUTTON_CC_OFFSET, BUTTON_CC_OFFSET + 40);
    println!("  Encoder: CC {} (relative: 65+=CW, 63-=CCW)", ENCODER_CC);
    println!("  Slider:  CC {} (0-127)", SLIDER_CC);
    println!("");

    // Optional "night mode": keep all button LEDs faintly lit, unless explicitly set brighter.
    if backlight_enabled {
        let mut lights_guard = lights.lock().unwrap();
        let mut changed = false;
        for idx in 0..41 {
            let button: Option<Buttons> = num::FromPrimitive::from_usize(idx);
            let Some(button) = button else { continue };
            if !lights_guard.button_has_light(button) {
                continue;
            }
            if lights_guard.get_button(button) == Brightness::Off {
                lights_guard.set_button(button, backlight_brightness);
                changed = true;
            }
        }
        if changed {
            lights_guard.write(device)?;
        }
    }

    // Capacitive encoder touch produces a small, spurious delta on this device.
    // Suppress encoder deltas briefly after EncoderTouch is pressed.
    let mut suppress_encoder_until: Option<Instant> = None;

    loop {
        let size = device.read_timeout(&mut buf, 1)?;

        // Check if MIDI input callback flagged lights or screen as dirty
        let lights_changed = lights_dirty.swap(false, Ordering::SeqCst);
        let screen_changed = screen_dirty.swap(false, Ordering::SeqCst);

        if size < 1 {
            // No HID data, but still write lights/screen if MIDI input changed them
            if lights_changed {
                let lights_guard = lights.lock().unwrap();
                lights_guard.write(device)?;
            }
            if screen_changed {
                let screen_guard = screen.lock().unwrap();
                screen_guard.write(device)?;
            }
            continue;
        }

        let mut changed_lights = false;
        let mut lights_guard = lights.lock().unwrap();

        if buf[0] == 0x01 {
            // Button/encoder/slider mode
            let mut encoder_touch_just_pressed = false;
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
                    let is_pressed = (buf[i + 1] & (1 << j)) > 0;
                    let was_pressed = state.buttons[idx];

                    // Detect state change
                    if is_pressed != was_pressed {
                        state.buttons[idx] = is_pressed;

                        // Send MIDI CC for button
                        let cc = BUTTON_CC_OFFSET + idx as u8;
                        let value = if is_pressed { 127 } else { 0 };
                        send_cc(port, cc, value);

                        if is_pressed {
                            println!("Button {:?} pressed -> CC {} = 127", button, cc);
                        }

                        // Encoder touch can produce a spurious encoder delta in the same HID packet.
                        // If touch just transitioned to pressed, ignore encoder delta for this packet.
                        if idx == Buttons::EncoderTouch as usize && is_pressed {
                            encoder_touch_just_pressed = true;
                        }

                        // Note: LED state is controlled via MIDI input from DAW/controller script
                        // Don't update LEDs here based on button press/release
                    }
                }
            }

            if encoder_touch_just_pressed {
                suppress_encoder_until = Some(Instant::now() + Duration::from_millis(120));
            }

            // Encoder
            //
            // IMPORTANT: `buf[7] & 0x0f` is an absolute 4-bit position (0..15), not a delta.
            // We compute delta with wrap-around, mapping to [-8..+7].
            let encoder_raw = buf[7];
            let suppressed = suppress_encoder_until
                .map(|until| Instant::now() < until)
                .unwrap_or(false);
            let cur_pos = encoder_raw & 0x0f;

            // If touch just engaged or we're in the suppression window, just resync position
            // and do not emit CC movement.
            if encoder_touch_just_pressed || suppressed {
                state.encoder_pos = Some(cur_pos);
            } else if let Some(prev_pos) = state.encoder_pos {
                let diff = cur_pos.wrapping_sub(prev_pos) & 0x0f; // 0..15
                // Map 0..15 to signed -8..+7
                let delta: i8 = if diff < 8 { diff as i8 } else { (diff as i8) - 16 };
                if delta != 0 {
                    // Convert to relative MIDI CC: 64 + delta (centered at 64)
                    let cc_value = (64i16 + delta as i16).clamp(0, 127) as u8;
                    send_cc(port, ENCODER_CC, cc_value);
                    println!("Encoder turn {} -> CC {} = {}", delta, ENCODER_CC, cc_value);
                }
                state.encoder_pos = Some(cur_pos);
            } else {
                // First observation; just initialize.
                state.encoder_pos = Some(cur_pos);
            }

            // Slider - absolute position
            let slider_raw = buf[10];
            if slider_raw != 0 && slider_raw != state.slider_value {
                state.slider_value = slider_raw;
                // Scale from 1-201 range to 0-127
                let cc_value = ((slider_raw as u16 - 1) * 127 / 200).min(127) as u8;
                send_cc(port, SLIDER_CC, cc_value);
                println!("Slider {} -> CC {} = {}", slider_raw, SLIDER_CC, cc_value);

                // Update slider LEDs
                let cnt = (slider_raw as i32 - 1 + 5) * 25 / 200 - 1;
                for i in 0..25 {
                    let b = match cnt - i {
                        0 => Brightness::Normal,
                        1..=25 => Brightness::Dim,
                        _ => Brightness::Off,
                    };
                    lights_guard.set_slider(i as usize, b);
                }
                changed_lights = true;
            }
        } else if buf[0] == 0x02 {
            // Pad mode
            for i in (1..buf.len()).step_by(3) {
                let idx = buf[i];
                let evt = buf[i + 1] & 0xf0;
                let val = ((buf[i + 1] as u16 & 0x0f) << 8) + buf[i + 2] as u16;
                if i > 1 && idx == 0 && evt == 0 && val == 0 {
                    break;
                }
                let pad_evt: PadEventType = num::FromPrimitive::from_u8(evt).unwrap();

                // REMOVED: Automatic blue LED feedback on pad touch
                // This was conflicting with MIDI-based LED control from Bitwig
                // Now LEDs are controlled exclusively via MIDI Note On/Off messages
                // from the controller script, allowing proper step sequencer LED states

                let note = settings.notemaps[idx as usize];
                let mut velocity = (val >> 5) as u8;
                if val > 0 && velocity == 0 {
                    velocity = 1;
                }

                match pad_evt {
                    PadEventType::NoteOn | PadEventType::PressOn => {
                        send_note(port, note, velocity, true);
                        println!("Pad {} Note On {} vel {}", idx, note, velocity);
                    }
                    PadEventType::NoteOff | PadEventType::PressOff => {
                        send_note(port, note, velocity, false);
                    }
                    _ => {}
                }
            }
        }
        if changed_lights || lights_changed {
            lights_guard.write(device)?;
        }
        
        // Write screen if changed by MIDI callback
        if screen_changed {
            let screen_guard = screen.lock().unwrap();
            screen_guard.write(device)?;
        }
    }
}
