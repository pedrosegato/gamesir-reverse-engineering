# cyclone2-battery

Windows tray app that shows the GameSir Cyclone 2 battery level on the controller's Home LED and in the system tray. A single 0.5 MB `.exe`, no runtime, no console window.

| Battery | Home LED | Tray icon |
|---|---|---|
| charging | color cycle | blue |
| charged (on cable) | white | white |
| 76–100 % | green | green |
| 51–75 % | light green | light green |
| 26–50 % | amber | amber |
| 10–25 % | red | red |
| below 10 % | blinking red | red |

Tray menu: pause (restores your lights), start with Windows, quit (restores your lights).

- Uses animation slot 4 of the light profile and makes it active; the other slots are untouched. The original slot comes back on pause and on quit.
- Samples the battery every 5 s. Between samples it stops the heartbeat, so the controller doesn't stream its state all the time.
- Reconnects on its own, including when switching between the dongle and the cable.

## Download

The `.exe` is built by GitHub Actions on every change: grab it from the latest [release](https://github.com/pedrosegato/gamesir-reverse-engineering/releases) or from the workflow run artifacts.

## Build

```bash
cargo build --release   # target/release/cyclone2-battery.exe
```

The protocol subset it uses is documented in [docs/protocolo.md](../../docs/protocolo.md).
