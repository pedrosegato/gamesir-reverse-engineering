# battery-led

Cyclone 2 battery level on the Home LED. Uses animation slot 4 and puts your original light back on exit.

| Battery | LED |
|---|---|
| charging | color cycle |
| full, on cable | white |
| 76–100 % | green |
| 51–75 % | light green |
| 26–50 % | amber |
| 10–25 % | red |
| below 10 % | blinking red |

```bash
npm run battery-led          # terminal
npm run battery-tray         # Windows tray, from source
npm run build:battery-tray   # tray/dist/cyclone2-battery.exe
```

The tray app is also on the [releases](https://github.com/pedrosegato/gamesir-reverse-engineering/releases) page.
