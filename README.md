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

This will init the controller and create an alsaseq MIDI port called `Maschine Mikro Mk3 MIDI Out`.
Pads have been tested to work with Hydrogen, EZdrummer 2/3, Addictive Drums 2 as plugins via REAPER+LinVst and standalone via Wine.

Note that you can use your custom config with own notemappings and other settings like this:
```shell
cargo run --release -- -c example_config.toml
```

**Important note about MIDI backends:** By default, ALSA backend is used to create virtual MIDI port. If you need Jack backend, please use this command instead:
```shell
cargo run --release --features jack
```
I tried to make a version that could do both, but due to 1) how `midir` handles backends during compile-time (no features = alsa, `["jack"]` features = jack) and 2) how rust handles dependencies with different feature flag sets ([feature unification](https://github.com/rust-lang/cargo/issues/10489)), it does not seem possible.

**Note:** In previous versions, 98-maschine.rules was granting access to Maschine only to users in `input` group. This is no longer needed, the new version of the udev rules file allows Maschine to be accessed by any user. This simplifies installation, e.g., for Ubuntu users, as by default there's no `input` group there.

## Progress

What works:
 - Pads,
 - Buttons,
 - Encoder,
 - Slider,
 - LEDs,
 - Screen.

So, basically everything, and even more than with the official driver.
For example, it is now possible to turn unpressed pad LEDs completely off in the layout.
Or it turns out that every button has 4 levels of brightness, not just Off/On as in the official MIDI Mode.

Although at the moment, only pads are exported via MIDI.
Pad MIDI notes can be changed through custom toml config (e.g., `-c example_config.toml`).

Would be cool to be able to export buttons and other functions via MIDI, OSC, etc too. GUI editor for the config file might be nice to have too.

Contributions are welcome!

## Goal

The current goal is to reimplement the official MIDI Mode: mappable pads, buttons, slider, encoder, changeable LED color schemes.
Advanced uses, like modal functions as in Maschine software (e.g., Scenes, Patterns, Shift+Pad actions) are not yet planned.
