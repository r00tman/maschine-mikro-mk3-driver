# Maschine Mikro MK3 Linux Driver
Native Instruments Maschine Mikro MK3 userspace MIDI driver for Linux.

Inspired by [maschine.rs](https://github.com/wrl/maschine.rs).

## Getting Started

Let's install dependencies first:
- Debian/Ubuntu:
  ```
  sudo apt install build-essential pkg-config libasound2-dev libjack-dev libusb-1.0-0-dev
  ```
- Fedora/RHEL:
  ```
  sudo dnf install @development-tools alsa-lib-devel jack-audio-connection-kit-devel libusb-devel
  ```
- Arch Linux:
  ```
  sudo pacman -S base-devel alsa-lib pipewire-jack libusb  # (or `jack2` instead of `pipewire-jack`)
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

[Important troubleshooting note from user `mikobuntu`](https://github.com/r00tman/maschine-mikro-mk3-driver/issues/5) (now in reverse after the update): If for some reason the driver doesn't load, try adding Jack support in Cargo.toml. This can be done by changing line 16 from
```
midir = { version = "0.10.1", features = ["default"] }
```
to
```
midir = { version = "0.10.1", features = ["default", "jack"] }
```
and rerunning/recompiling the app.

I'm currently looking into a more permanent solution that would support both ALSA and Jack coexisting somehow while not requiring jackd to be running, but I'm not sure when I would finish it. I'm super happy for any suggestions.

Note: In previous versions, 98-maschine.rules was granting access to Maschine only to users in `input` group. This is no longer needed, the new version of the udev rules file allows Maschine to be accessed by any user. This simplifies installation, e.g., for Ubuntu users, as by default there's no `input` group there.

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
Pad MIDI notes are hardcoded and can be changed in `src/main.rs:L201`.

A better solution would be to make a config file and a GUI configurator which would allow to map all functions freely.
Once this dynamic mapping is implemented, it would be much easier to export buttons and other functions via MIDI, OSC, etc.

Contributions are welcome!

## Goal

The current goal is to reimplement the official MIDI Mode: mappable pads, buttons, slider, encoder, changeable LED color schemes.
Advanced uses, like modal functions as in Maschine software (e.g., Scenes, Patterns, Shift+Pad actions) are not yet planned.
