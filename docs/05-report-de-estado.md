# 05 · Report de estado `0x12`

64 bytes pela coleção `0xFFF0`, enquanto houver heartbeat. Fontes: `ie` (`main.app.js:825`), `Us.push` (`main.app.js:7986`), `parseGamepadState` (`main.app.js:8276`). Byte 0 = report ID, como no node-hid.

| Byte | Bits | Campo | Nome no app |
|---|---|---|---|
| 1, 2 | | LX, LY: 0–255, centro 128, Y cresce para baixo | |
| 3, 4 | | RX, RY | |
| 5 | 0–3 | hat: 0 ↑, 1 ↗, 2 →, 3 ↘, 4 ↓, 5 ↙, 6 ←, 7 ↖, 8+ solto | |
| 5 | 4 / 5 / 6 / 7 | X / A / B / Y | SQU / CRO / CIR / TRI |
| 6 | 0 / 1 | LB / RB | L1 / R1 |
| 6 | 2 / 3 | LT / RT digitais | L2 / R2 |
| 6 | 4 / 5 | View / Menu | Sel / Sta |
| 6 | 6 / 7 | LS / RS (clique) | L3 / R3 |
| 7 | 0 / 1 | Home / Capture | PS / Camera |
| 8, 9 | | LT, RT analógicos 0–255 | |
| 10–34 | | não mapeado (provável IMU) | |
| 35 | | carregando = 1 | `chargeState` |
| 36 | | bateria % | `batteryLevel` |
| 37 | | animação de luz ativa | `ConfigIndex` |
| 38–40 | | cor Home | |
| 41–43 | | cor LowerLeft | |
| 44–46 | | cor LowerRight | |
| 47–49 | | cor UpperLeft | |
| 50–52 | | cor UpperRight | |
| 53 | 0, 1 | gravando macro | |
| 53 | 4 / 5 | macro em L4 / R4 | FL1 / FR1 |
| 54–59 | | não mapeado | |
| 60 | 3 / 4 / 5 | L4 / R4 / M | o app lê daqui, não do byte 7 |

- Ordem das cores: array `au` (`main.app.js:8052`). **Difere da ordem do frame** no perfil de luz ([06](06-perfil-de-luz.md)).
- As cores são as renderizadas no momento (animação + brilho).
- Bytes não mapeados: investigar com `pad.onRaw()` movendo o controle.

```ts
await pad.start();
pad.onState((s) => console.log(s.batteryLevel, s.chargeState, s.buttons.A, s.leftStick, s.leds.Home));
```
