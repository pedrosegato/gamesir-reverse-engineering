# battery-led

Cyclone 2 battery level on the controller's LEDs, as a Windows tray app ([releases](https://github.com/pedrosegato/gamesir-reverse-engineering/releases)) or a terminal script (`npm run battery-led`; `-- --preview <level>` shows one indicator). Reads the battery once a minute on battery and every 5 s on cable. Uses animation slot 4 and restores the original light on exit.

| Battery | LED |
|---|---|
| charging | color cycle on Home |
| full, on cable | white turn signal |
| 76–100 % | dark green Home |
| 51–75 % | yellow-green Home |
| 26–50 % | yellow Home |
| 10–25 % | red Home |
| below 10 % | red turn signal |

Turn signal: Home and the left LED, then the right LED, three times at 500 ms; then Home stays lit for 12 s.
