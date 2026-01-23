# Maschine Mikro MK3 Linux Driver
Native Instruments Maschine Mikro MK3 userspace MIDI driver for Linux.

Inspired by [maschine.rs](https://github.com/wrl/maschine.rs).

## Getting Started

Let's install dependencies first:
- Debian/Ubuntu:
  ```
  sudo apt install build-essential pkg-config libasound2-dev libjack-dev libusb-1.0-0-dev libudev-dev
  ```
- Fedora/RHEL:
  ```
  sudo dnf install @development-tools alsa-lib-devel jack-audio-connection-kit-devel libusb-devel systemd-devel
  ```
- Arch Linux:
  ```
  sudo pacman -S base-devel alsa-lib pipewire-jack libusb systemd-libs  # (or `jack2` instead of `pipewire-jack`)
  ``` 

Then we can proceed with the repo:

```shell
git clone https://github.com/r00tman/maschine-mikro-mk3-driver.git; cd maschine-mikro-mk3-driver
sudo cp 98-maschine.rules /etc/udev/rules.d/
sudo udevadm control --reload && sudo udevadm trigger
cargo run --release
```

This will init the controller and create two MIDI ports:
- `Maschine Mikro MK3 MIDI Out` - receives pad notes from the controller
- `Maschine Mikro MK3 MIDI In` - send notes here to control pad LEDs (for DAW integration)

Pads have been tested to work with Hydrogen, EZdrummer 2/3, Addictive Drums 2 as plugins via REAPER+LinVst and standalone via Wine.

Note that you can use your custom config with own notemappings and other settings like this:
```shell
cargo run --release -- -c example_config.toml
```

## Backlight / Night mode (dimly lit buttons)

Maschine Mikro MK3 buttons support multiple brightness levels. You can enable a "backlight" mode so that buttons stay faintly illuminated even when they would normally be Off.

In your config:

```toml
backlight_buttons = true
backlight_brightness = "dim" # "dim" | "normal" | "bright"
```

When enabled, any incoming "Off" state for **button LEDs** (including from your DAW over MIDI) is treated as the configured backlight level. Brighter states still work normally.

**Important note about MIDI backends:** By default, ALSA backend is used to create virtual MIDI port. If you need Jack backend, please use this command instead:
```shell
cargo run --release --features jack
```
I tried to make a version that could do both, but due to 1) how `midir` handles backends during compile-time (no features = alsa, `["jack"]` features = jack) and 2) how rust handles dependencies with different feature flag sets ([feature unification](https://github.com/rust-lang/cargo/issues/10489)), it does not seem possible.

**Note:** In previous versions, 98-maschine.rules was granting access to Maschine only to users in `input` group. This is no longer needed, the new version of the udev rules file allows Maschine to be accessed by any user. This simplifies installation, e.g., for Ubuntu users, as by default there's no `input` group there.

## Progress

What works:
 - Pads (MIDI Notes)
 - All 39 Buttons (MIDI CC)
 - Encoder (MIDI CC, relative mode)
 - Slider/Touch Strip (MIDI CC)
 - All LEDs (controllable via MIDI input)
 - Screen (with DAW integration via SysEx)
 - Mode System (Play, Step, Clip, Mixer)
 - Note Repeat
 - Fixed Velocity
 - Step Sequencer
 - Clip Launcher
 - Mixer Controls

So, basically everything, and even more than with the official driver.
For example, it is now possible to turn unpressed pad LEDs completely off in the layout.
Or it turns out that every button has 4 levels of brightness, not just Off/On as in the official MIDI Mode.

### Screen Integration

The OLED screen displays contextual information based on the current mode:
- **Mode name** when switching modes
- **Track name** in Play and Mixer modes
- **Note name** when changing step sequencer note
- **Feature status** when toggling Note Repeat or Fixed Velocity

The screen is controlled via SysEx messages from the Bitwig controller script, allowing for real-time feedback without additional configuration.

## MIDI Mapping

### Pads (MIDI Notes)
Pads send Note On/Off messages. Notes are configurable via `notemaps` in config.

### Buttons (MIDI CC 20-60)
All buttons send CC messages on press (value 127) and release (value 0):

| Button | CC | Button | CC | Button | CC |
|--------|----:|--------|----:|--------|----:|
| Maschine | 20 | Swing | 24 | Left | 28 |
| Star | 21 | Tempo | 25 | Right | 29 |
| Browse | 22 | Plugin | 26 | Pitch | 30 |
| Volume | 23 | Sampling | 27 | Mod | 31 |
| Perform | 32 | Lock | 36 | Tap | 40 |
| Notes | 33 | Note Repeat | 37 | Follow | 41 |
| Group | 34 | Restart | 38 | Play | 42 |
| Auto | 35 | Erase | 39 | Rec | 43 |
| Stop | 44 | Keyboard | 48 | Pattern | 52 |
| Shift | 45 | Chords | 49 | Events | 53 |
| Fixed Vel | 46 | Step | 50 | Variation | 54 |
| Pad Mode | 47 | Scene | 51 | Duplicate | 55 |
| Select | 56 | Encoder Press | 59 | | |
| Solo | 57 | Encoder Touch | 60 | | |
| Mute | 58 | | | | |

### Encoder (CC 1)
Encoder sends relative values: 65+ for clockwise, <64 for counter-clockwise.

### Slider/Touch Strip (CC 9)
Slider sends absolute position (0-127).

## Controlling LEDs via MIDI Input

### Pad LEDs (Note On/Off)
Send Note On/Off to the same notes configured in `notemaps`. Velocity determines color:

| Velocity | Color | Velocity | Color |
|----------|-------|----------|-------|
| 1-7 | Red | 64-70 | Turquoise |
| 8-14 | Orange | 71-77 | Blue |
| 15-21 | Light Orange | 78-84 | Plum |
| 22-28 | Warm Yellow | 85-91 | Violet |
| 29-35 | Yellow | 92-98 | Purple |
| 36-42 | Lime | 99-105 | Magenta |
| 43-49 | Green | 106-112 | Fuchsia |
| 50-56 | Mint | 113-127 | White |
| 57-63 | Cyan | 0 | Off |

### Button LEDs (CC 20-60)
Send CC to control button brightness:
- 0: Off
- 1-42: Dim
- 43-84: Normal
- 85-127: Bright

## Bitwig Studio Integration

A controller script is included for full Bitwig integration. Copy it to your Bitwig controller scripts folder:

```shell
mkdir -p ~/Bitwig\ Studio/Controller\ Scripts/MaschineMikroMK3
cp bitwig/MaschineMikroMK3.control.js ~/Bitwig\ Studio/Controller\ Scripts/MaschineMikroMK3/
```

### Connecting to Bitwig (PipeWire/ALSA)

Since Bitwig uses ALSA **Raw MIDI** devices directly (not ALSA sequencer), you need to route through Virtual Raw MIDI.
The driver will now try to auto-connect to virmidi on startup (enabled by default).

```shell
# Start the driver
cargo run --release
```

Then in Bitwig:
1. Go to **Settings → Controllers → Add Controller**
2. Select **Native Instruments → Maschine Mikro MK3 (Linux)**
3. Set Input to **Virtual Raw MIDI/1**
4. Set Output to **Virtual Raw MIDI/2**
5. (Optional) Click on the controller name to customize pad LED feedback settings

#### Optional: rename "Virtual Raw MIDI" to "Maschine Mikro MK3"

The `snd-virmidi` kernel module supports renaming via the `id=` parameter. Example:

```shell
sudo modprobe -r snd_virmidi snd_seq_virmidi
sudo modprobe snd-virmidi midi_devs=2 id="Maschine Mikro MK3"
```

### Mode System

The controller supports four operational modes, each providing different functionality for the pads and other controls. The current mode is displayed on the OLED screen.

| Mode | Button | Pad Function | Encoder Function |
|------|--------|--------------|------------------|
| **Play** | Keyboard | Play notes (normal) | Navigate tracks |
| **Step** | Step | Toggle sequencer steps | Change step note |
| **Clip** | Scene | Launch clips/scenes | Navigate scenes |
| **Mixer** | Pattern | Track controls (select/mute/solo/arm) | Navigate tracks |

**Switching Modes:**
- Press **Pad Mode** to cycle through modes
- Press **Keyboard**, **Step**, **Scene**, or **Pattern** to jump directly to that mode
- Press **Shift + Pad Mode** to return to Play mode
- Hold **Shift** + mode button for the original view toggle function

### Note Repeat

Press **Note Repeat** to enable auto-retriggering of held pad notes. While enabled, holding a pad will continuously retrigger that note at the selected interval.

| Action | Function |
|--------|----------|
| Note Repeat | Toggle note repeat on/off |
| Shift + Note Repeat | Cycle repeat rate (1/16 → 1/8 → 1/4) |

### Fixed Velocity

Press **Fixed Vel** to force all pad hits to use a fixed velocity (100 by default). This is useful for consistent drum programming or when you want uniform note levels.

| Action | Function |
|--------|----------|
| Fixed Vel | Toggle fixed velocity on/off |
| Shift + Fixed Vel | Show current fixed velocity value |

### Step Sequencer Mode

In Step mode, the 16 pads represent 16 steps in a drum sequencer pattern:

- **Press a pad** to toggle that step on/off
- **Rotate encoder** to change the note being sequenced (C1 to G9)
- **Press Erase** to clear all steps
- **Yellow pads** = steps with notes
- **White pad** = current playhead position
- **Off pads** = empty steps

The step sequencer edits the cursor clip in your current track.

### Mixer Mode

In Mixer mode, pads control the first 4 tracks in a grid layout:

| Row | Function | Colors |
|-----|----------|--------|
| Top (1-4) | Select track | Blue |
| Row 2 (5-8) | Toggle mute | Orange |
| Row 3 (9-12) | Toggle solo | Yellow |
| Bottom (13-16) | Toggle arm | Red |

### Clip Launcher Mode

In Clip mode, pads trigger clips and scenes:

| Row | Function |
|-----|----------|
| Top row (1-4) | Launch scenes 1-4 |
| Other rows | Launch track clips |

### Button Functions in Bitwig

| Button | Function | Shift + Button |
|--------|----------|----------------|
| Play | Play/Pause | Return to arrangement |
| Stop | Stop | Reset automation |
| Rec | Toggle record | Toggle overdub |
| Restart | Jump to start | Toggle loop |
| Tap | Tap tempo | Toggle metronome |
| Left | Rewind | Previous track |
| Right | Fast forward | Next track |
| Browse | Open/close browser | Insert device after |
| Encoder | Mode-specific (see above) | Navigate tempo |
| Encoder Press | Select in editor | Select in mixer |
| Solo | Toggle solo | - |
| Mute | Toggle mute | - |
| Sampling | Toggle arm | - |
| Volume | Undo | Redo |
| Follow | Zoom to selection | Zoom to fit |
| Duplicate | Duplicate | Duplicate object |
| Erase | Delete (or clear steps in Step mode) | Cut |
| Plugin | Next device | Previous device |
| Slider | Track volume | - |
| Note Repeat | Toggle note repeat | Cycle repeat rate |
| Fixed Vel | Toggle fixed velocity | Show velocity value |
| Pad Mode | Cycle modes | Return to Play mode |
| Keyboard | Play mode | Toggle note editor |
| Step | Step mode | Toggle automation editor |
| Scene | Clip mode | Toggle mixer |
| Pattern | Mixer mode | Return to arrangement |

### Pad Playback Feedback (Bitwig 6+)

The controller script includes visual feedback on pads during clip/sequence playback. This feature uses the `playingNotes()` API introduced in Bitwig Studio 6 beta. The script will work on older versions but without playback feedback.

**Example use case:** When you have a drum loop playing in a clip, you'll see the pads light up in sync with the beat, showing exactly which drums are being triggered. This helps you visualize the rhythm and jam along with live pads.

#### Customizable Settings

Go to **Settings → Controllers → Maschine Mikro MK3 (Linux)** to customize:

| Setting | Options | Description |
|---------|---------|-------------|
| **Playback Feedback** | Enabled / Disabled | Show visual feedback for notes playing from clips |
| **Manual Hit Feedback** | Enabled / Disabled | Show visual feedback when you press pads manually |
| **Playback Color Mode** | Track Color / Fixed Color | Use track color or a fixed color for playback |
| **Fixed Playback Color** | Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta, White | Color to use when Fixed Color mode is selected |
| **Manual Hit Color** | Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta, White | Color for manually pressed pads (default: Blue) |

**Track Color Mode:** Each track has its own color in Bitwig, making it easy to identify which track/drums are active.

**Fixed Color Mode:** All playback uses the same color regardless of track - useful if you prefer consistency.

## Goal

This project provides a complete MIDI implementation for the Maschine Mikro MK3 on Linux, including:
- Full hardware support (pads, buttons, encoder, slider, LEDs, screen)
- Advanced DAW integration with Bitwig Studio
- Performance features like Note Repeat and Fixed Velocity
- Multiple operational modes (Play, Step Sequencer, Clip Launcher, Mixer)

The driver works at the HID level without requiring Native Instruments' proprietary software, making it a truly open-source alternative that works natively on Linux.

Contributions are welcome!
