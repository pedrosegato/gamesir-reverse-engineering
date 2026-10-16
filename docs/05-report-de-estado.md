# 05 · Report de estado `0x12`

Enquanto recebe heartbeats (`0F F2 00`), o controle manda pela interface `0xFFF0` um report de 64 bytes com o report ID `0x12` (18). Ele traz entradas, bateria e as cores que estão acesas nos LEDs.

Fontes: `ie()` (`main.app.js:825`), `Us.push()` (`main.app.js:7986`) e `ou.parseGamepadState()` (`main.app.js:8276`). Índices contados com o report ID como byte 0, igual ao node-hid.

| Byte | Bits | Campo | Observação |
|---|---|---|---|
| 0 | | `0x12` | report ID |
| 1 | | LX | 0..255, centro 128 |
| 2 | | LY | 0..255, centro 128 (cresce para baixo) |
| 3 | | RX | |
| 4 | | RY | |
| 5 | 0–3 | D-pad (hat) | 0 = cima, 1 = cima-direita … 7 = cima-esquerda; 8+ = solto |
| 5 | 4 | X (SQU) | |
| 5 | 5 | A (CRO) | |
| 5 | 6 | B (CIR) | |
| 5 | 7 | Y (TRI) | |
| 6 | 0 / 1 | LB / RB | |
| 6 | 2 / 3 | LT / RT digitais | |
| 6 | 4 / 5 | View / Menu | `Sel`/`Sta` no app |
| 6 | 6 / 7 | LS / RS (clique) | |
| 7 | 0 | Home | |
| 7 | 1 | Capture | |
| 8 | | LT analógico | 0..255 |
| 9 | | RT analógico | 0..255 |
| 35 | | `chargeState` | 1 = carregando |
| 36 | | `batteryLevel` | % |
| 37 | | `ConfigIndex` | modo de luz ativo |
| 38–40 | | RGB **Home** | |
| 41–43 | | RGB **LowerLeft** | |
| 44–46 | | RGB **LowerRight** | |
| 47–49 | | RGB **UpperLeft** | |
| 50–52 | | RGB **UpperRight** | |
| 53 | 0 / 1 | gravando macro | |
| 53 | 4 / 5 | tecla da macro | 4 = L4 (FL1), 5 = R4 (FR1) |
| 60 | 3 / 4 / 5 | L4 / R4 / M | o app lê os botões traseiros deste byte |

Os nomes das zonas vêm do array `au` do proxy (`main.app.js:8052`). Os bytes 38–52 trazem a cor **renderizada no momento**, já com animação e brilho aplicados. Isso permite ler o que o controle está mostrando sem ler o perfil de luz.

Bytes 10–34 e 54–59: **não mapeados**. Provavelmente giroscópio/acelerômetro e dados brutos. Pra investigar, use `cyclone.onRaw()` e mova o controle.

## Na lib

```ts
await pad.start(); // heartbeat
pad.onState((s) => {
  console.log(s.batteryLevel, s.chargeState, s.buttons.A, s.leftStick, s.leds.Home);
});
```
