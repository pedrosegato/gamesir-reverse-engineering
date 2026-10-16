# battery-led

Cyclone 2 battery level on the Home LED, as a Windows tray app ([releases](https://github.com/pedrosegato/gamesir-reverse-engineering/releases)) or a terminal script (`npm run battery-led`). Uses animation slot 4 and restores the original light on exit.

| Battery | LED |
|---|---|
| charging | color cycle |
| full, on cable | white |
| 76–100 % | green |
| 51–75 % | light green |
| 26–50 % | amber |
| 10–25 % | red |
| below 10 % | blinking red |
