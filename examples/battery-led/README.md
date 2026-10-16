# battery-led

Shows the Cyclone 2 battery level on the controller's Home LED, using `gamesir-hid`. Runs as a terminal script on any OS, or as a Windows tray app (`cyclone2-battery.exe`) built from the same code.

| Battery | Home LED | Tray icon |
|---|---|---|
| charging | color cycle | blue |
| charged (on cable) | white | white |
| 76–100 % | green | green |
| 51–75 % | light green | light green |
| 26–50 % | amber | amber |
| 10–25 % | red | red |
| below 10 % | blinking red | red |

- Writes the indicator to animation slot 4 of the light profile and makes it active; the other slots are untouched. The original slot comes back on pause and on exit.
- Samples the battery every 5 s. Between samples the heartbeat stops, so the controller doesn't stream its state all the time.
- Reconnects on its own, including when switching between the dongle and the cable.

## Terminal

```bash
npm install
npm run battery-led                 # Ctrl+C restores the light
npm run battery-led -- --slot 2 --zone UpperRight
```

## Windows tray app

Download `cyclone2-battery.exe` from the [releases](https://github.com/pedrosegato/gamesir-reverse-engineering/releases) and run it. Tray menu: pause (restores your lights), start with Windows, quit (restores your lights). A log of the last run is kept in `%LOCALAPPDATA%\cyclone2-battery\log.txt`.

The tray is plain TypeScript calling the Windows API through [koffi](https://koffi.dev): a hidden window, `Shell_NotifyIconW` for the icon and `TrackPopupMenu` for the menu (`tray/`). The executable is a [Node.js single executable application](https://nodejs.org/api/single-executable-applications.html) carrying the bundled code, with the `node-hid` and `koffi` native modules as assets.

```bash
npm run battery-tray                # run from source (Windows)
npm run build:battery-tray          # tray/dist/cyclone2-battery.exe
```

| File | |
|---|---|
| `status.ts` | battery levels with hysteresis |
| `indicators.ts` | LED animation and tray color per level |
| `monitor.ts` | connection, sampling, light writes, pause and restore |
| `index.ts` | terminal front-end |
| `tray/` | Windows front-end and the `.exe` build |
