# Maschine Mikro MK3 Linux Driver
Native Instruments Maschine Mikro MK3 userspace MIDI driver for Linux.

Inspired by [maschine.rs](https://github.com/wrl/maschine.rs).

## Getting Started

```shell
$ git clone https://github.com/r00tman/maschine-mikro-mk3-driver.git; cd maschine-mikro-mk3-driver
$ sudo cp 98-maschine.rules /etc/udev/rules.d/
$ sudo udevadm control --reload && sudo udevadm trigger
$ cargo run --release
```

If your user is in `input` group, this will init the controller and create an alsaseq MIDI port called `Maschine Mikro Mk3 MIDI`.
Pads have been tested to work with Hydrogen, EZdrummer 2/3, Addictive Drums 2 as plugins via REAPER+LinVst and standalone via Wine.

[Important troubleshooting note from user `mikobuntu`](https://github.com/r00tman/maschine-mikro-mk3-driver/issues/5): If for some reason it doesn't load, try removing Jack support in Cargo.toml. This can be done by changing line 16 from
```
midir = { version = "0.10.1", features = ["default", "jack"] }
```
to
```
midir = { version = "0.10.1", features = ["default"] }
```
and rerunning/recompiling the app.

I'm currently looking into a more permanent solution that would support both ALSA and Jack coexisting somehow while not requiring jackd to be running, but I'm not sure when I would finish it. I'm super happy for any suggestions.

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
