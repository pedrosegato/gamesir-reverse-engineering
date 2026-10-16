# battery-led

Cyclone 2 battery level on the controller's LEDs, as a Windows tray app ([releases](https://github.com/pedrosegato/gamesir-reverse-engineering/releases)) or in the terminal:

```bash
npm run battery-led
```

Reads the battery once a minute on battery and every 5 s on cable. Uses animation slot 4 and puts the original light back on exit.

## Indicators

| Battery | LED | Name |
|---|---|---|
| charging | color cycle on Home | `charging` |
| full, on cable | white turn signal | `charged` |
| 76–100 % | dark green Home | `high` |
| 51–75 % | yellow-green Home | `good` |
| 26–50 % | yellow Home | `medium` |
| 10–25 % | red Home | `low` |
| below 10 % | red turn signal | `critical` |

Turn signal: Home and the left LED, then the right LED, three times at 500 ms; then Home stays lit for 12 s.

## Preview

Shows one indicator on the controller until Ctrl+C, then puts the original light back:

```bash
npm run battery-led preview critical
```
