# 05 · Report de estado `0x12`

64 bytes pela coleção `0xFFF0`, enquanto houver heartbeat. Fontes: `ie` (`main.app.js:825`), `Us.push` (`main.app.js:7986`), `parseGamepadState` (`main.app.js:8276`). Byte 0 = report ID, como no node-hid.

| Byte | Bits | Campo | Nome no app |
|---|---|---|---|
| 1, 2 | | LX, LY: 0–255, centro 128, Y cresce para baixo | |
| 3, 4 | | RX, RY | |
| 5 | 0–3 | hat: 0 ↑, 1 ↗, 2 →, 3 ↘, 4 ↓, 5 ↙, 6 ←, 7 ↖, `0xF` solto | |
| 5 | 4 / 5 / 6 / 7 | X / A / B / Y | SQU / CRO / CIR / TRI |
| 6 | 0 / 1 | LB / RB | L1 / R1 |
| 6 | 2 / 3 | LT / RT digitais | L2 / R2 |
| 6 | 4 / 5 | View / Menu | Sel / Sta |
| 6 | 6 / 7 | LS / RS (clique) | L3 / R3 |
| 7 | 0 / 1 | Home / Capture | PS / Camera |
| 8, 9 | | LT, RT analógicos 0–255 | |
| 10 | | não mapeado (`0x20` nas capturas) | |
| 11 | | contador da IMU, 8 bits; ~780/s (≈ 3 por report), dá a volta em 255 | |
| 12 | | não mapeado (sempre `0`) | |
| 13–18 | | **giroscópio** X, Y, Z: int16 LE ([IMU](#imu)) | |
| 19–24 | | **acelerômetro** X, Y, Z: int16 LE ([IMU](#imu)) | |
| 25–34 | | não mapeado | |
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
| 54–62 | | **cópia crua das entradas**, mesmo layout dos bytes 1–9 (54–57 analógicos, 58 hat/face, 59 ombros, 60 sistema, 61–62 gatilhos). Os analógicos aparecem fora do centro (`7d 7a 86 80`): provável leitura antes da deadzone | |
| 60 | 3 / 4 / 5 | L4 / R4 / M | o app lê daqui, não do byte 7 |

- Ordem das cores: array `au` (`main.app.js:8052`). **Difere da ordem do frame** no perfil de luz ([06](06-perfil-de-luz.md)).
- As cores são as renderizadas no momento (animação + brilho).
- Bytes não mapeados: investigar com `pad.onRaw()` movendo o controle.
- Confirmado no hardware: bateria (36), cor do Home (38–40), analógico esquerdo, ABXY, hat solto = `0xF`, animação ativa (37), IMU.

```ts
await pad.start();
pad.onState((s) => console.log(s.batteryLevel, s.chargeState, s.buttons.A, s.leftStick, s.leds.Home, s.imu.accel.y));
```

## IMU

Nenhum parser do app (`ie`, `parseGamepadState`) lê os bytes 10–34: tudo abaixo vem do hardware (`examples/imu.ts`).

Eixos com o controle deitado, botões para cima, gatilhos para a frente:

| Eixo | Acelerômetro: +1 g quando o eixo aponta para cima | Giroscópio: positivo quando |
|---|---|---|
| X | lateral direita | a frente (gatilhos) sobe |
| Y | sai da face dos botões | gira no sentido anti-horário, visto de cima |
| Z | para trás, em direção a quem segura | a lateral direita sobe |

Sinais do giroscópio conferidos contra o acelerômetro: com gyro X positivo a frente sobe e Z vai a −1 g; com a face virada para quem segura e gyro Y positivo, a lateral direita sobe e X vai a +1 g; deitado, com gyro Z positivo a lateral direita sobe e X vai a +0,9 g. Regra da mão direita nos três eixos.

| | |
|---|---|
| Valores | crus, sem calibração |
| Acelerômetro | 8192 LSB/g (±4 g). Offset estimado por ajuste de esfera em 6 posições paradas: X +0,09 g, Y +0,02 g, **Z −0,16 g** (resíduo < 0,3 %). Sem descontar, \|a\| parado varia de 0,83 a 1,15 g |
| Giroscópio | parado ≈ `8, 1, 6`. Escala estimada em 16–20 LSB por °/s (4 giros de ~90° à mão): provável ±2000 °/s (16,4 LSB por °/s) |
