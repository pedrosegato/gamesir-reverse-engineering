# API da lib `gamesir-hid`

TypeScript para Node, sobre o `node-hid`. A lib tem duas camadas:

| Camada | Conteúdo |
|---|---|
| Núcleo | `GameSirController`: transporte, fila de comandos, heartbeat, eventos, leitura e escrita de perfis, firmware, troca de perfil, vibração. Vale para todo controle que usa o protocolo `0x0F` ([protocolo.md](protocolo.md)) |
| Modelos | descritor (PIDs, tamanhos dos perfis, leitura do report de estado), codecs dos perfis e métodos tipados. Disponível: `Cyclone2` |

## Instalação

```bash
npm install gamesir-hid node-hid   # node-hid só no Node
```

- Node 18 ou superior.
- Linux: dar acesso ao `hidraw`, por exemplo com a regra udev `KERNEL=="hidraw*", ATTRS{idVendor}=="3537", MODE="0666"`.

## Conexão

```ts
import { Cyclone2 } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";

const [device] = await findControllers();
const pad = new Cyclone2(await NodeHidTransport.open(device.path));
await pad.start();
```

| Função | Retorno |
|---|---|
| `findControllers(models = MODELS)` | coleções `0xFFF0` dos modelos conhecidos: `{ path, productId, product, model, … }[]` |
| `NodeHidTransport.open(path)` | transporte `node-hid` |
| `gamesir-hid/webhid` | `requestController`, `getAuthorizedControllers`, `WebHidTransport`: o mesmo, via WebHID (não testado) |

## `GameSirController`

Base de todos os modelos. `State` é o tipo do report de estado do modelo.

| Membro | Descrição |
|---|---|
| `start({ heartbeatMs = 1000, testMode = false })` | envia o heartbeat periodicamente; sem ele, o controle não envia estado |
| `stopHeartbeat()` · `close()` | para o heartbeat · fecha o transporte |
| `onState(fn)` · `nextState(timeoutMs)` · `lastState` | report de estado a cada envio · próximo report · último recebido |
| `onProfileChanged(fn)` | perfil alterado pelo próprio controle: `{ profileNum, offset, length }` |
| `onDisconnect(fn)` · `isConnected` | dispositivo removido ou escrita falhou; dispara uma vez |
| `onRaw(fn)` | todo report recebido, sem tratamento |
| `readFirmwareVersion()` | `{ firmware: "3.4.6", dongle: "1.2.1" \| "", raw }` |
| `readCurrentProfile()` | perfil de jogo ativo: 1–4, ou 5 com a camada Shift |
| `switchProfile(1 \| 2 \| 3 \| 4 \| "Shift")` | ativa um perfil de jogo |
| `readProfile(n)` | imagem crua do perfil `n` (`Uint8Array`) |
| `writeProfile(n, data, offset = 0)` | grava bytes a partir de `offset` |
| `writeProfileImage(n, image)` | grava a imagem inteira enviando só o trecho que mudou |
| `vibrate(left, right, durationMs = 1000)` | motores de 0 a 255; `durationMs = 0` não desliga sozinho |
| `send(packet)` | envia um pacote sem esperar resposta |
| `request(packet, { timeoutMs = 200, maxSends = 10, match })` | envia e espera resposta, reenviando; um pedido por vez |

## `Cyclone2`

`new Cyclone2(transport)`. Herda tudo de `GameSirController<Cyclone2State>`.

### Perfil de jogo

| Método | Descrição |
|---|---|
| `readGameProfile(n)` · `writeGameProfile(n, profile)` | lê/grava um `GameProfile` (perfis 1–5) |
| `updateGameProfile(n, fn)` | lê, aplica `fn` e grava |
| `remapButton(n, button, ...keys)` | mapeia um botão para até 3 `KeyCode`s; sem teclas, desfaz |
| `setReportRate(n, rate)` | `ReportRate.Hz250`, `Hz500` ou `Hz1000` |
| `setMacro(n, "L4" \| "R4", steps, { holdToTrigger, loop, loopMs })` | grava uma macro; sem passos, desliga |
| `setMacroRecording("L4" \| "R4", state)` | gravação pelo controle: `protocol.MacroRecordState.Start`, `Stop` ou `Cancel` |

```ts
await pad.remapButton(1, "A", KeyCode.B);
await pad.setReportRate(1, ReportRate.Hz1000);
await pad.setMacro(1, "L4", [
  { key: KeyCode.A, holdMs: 50, delayMs: 100 },   // B começa 100 ms depois do A
  { key: KeyCode.B, holdMs: 50, delayMs: 0 },
], { loop: true, loopMs: 500 });
```

### Luz

| Método | Descrição |
|---|---|
| `readLightProfile()` · `writeLightProfile(p)` · `updateLightProfile(fn)` | perfil de luz completo (`LightProfile`) |
| `setStaticColor(color \| { Home, LowerLeft, … }, { slot, brightness })` | uma cor em todas as zonas, ou uma por zona |
| `setAnimation(animation, { slot, activate = true })` | grava uma animação num slot (0–3) |
| `applyPreset(name, slot?)` | `"Flow"`, `"Rainbow"`, `"Pulse"`, `"Standoff"`, `"Alarm"`, `"Off"` |
| `setActiveAnimation(index)` | slot ativo, 0–3 |
| `setStandbyTime(min)` · `setRaiseToWake(bool)` · `setAudioReactive(bool)` | opções gerais da luz |
| `playLights()` · `showFrame(i)` | toca a animação ativa · pausa no frame `i` (0–7) |

```ts
await pad.setStaticColor("#00aaff");
await pad.setStaticColor({ Home: "#ff0000" });
await pad.setAnimation(animation([{ Home: "#ff0000" }, { Home: "#0000ff" }], { speed: 15 }), { slot: 3 });
```

## Estado: `Cyclone2State`

```ts
pad.onState((s) => console.log(s.batteryLevel, s.buttons.A, s.physical.buttons.A, s.imu.accel));
```

| Campo | Tipo | Conteúdo |
|---|---|---|
| `leftStick`, `rightStick` | `{ x, y }` | −1..1, Y positivo para baixo |
| `leftTrigger`, `rightTrigger` | `number` | 0–255 |
| `hat` | `"Up" \| "UpRight" \| … \| null` | D-pad |
| `buttons` | `Buttons` | A, B, X, Y, LB, RB, LT, RT, View, Menu, LS, RS, Home, Capture, L4, R4, M |
| `physical` | `Inputs` | sticks, gatilhos, D-pad e botões físicos, antes do mapeamento do perfil |
| `imu` | `{ counter, gyro, accel }` | `gyro` e `accel` são `{ x, y, z }` crus (8192 LSB/g; eixos em [protocolo.md](protocolo.md#imu)) |
| `batteryLevel` · `chargeState` | `number` | % · 1 = carregando |
| `lightConfigIndex` | `number` | animação de luz ativa |
| `leds` | `Record<LedZone, Rgb>` | cor exibida em cada LED |
| `macroRecording` · `macroRecordKey` | `boolean` · `"L4" \| "R4" \| null` | gravação de macro em curso |
| `raw` | `Uint8Array` | report cru |

`buttons`, sticks e gatilhos do topo já passaram pelo mapeamento do perfil ativo.

## Tipos e funções do Cyclone 2

### Luz

| Exportação | Descrição |
|---|---|
| `animation(frames, { speed = 10, brightness = 100 })` | monta uma `Animation`; `frames`: 1–8 objetos `{ zona: cor }` |
| `frame(colors)` · `solidFrame(color)` | um frame por zona · a mesma cor em todas |
| `applyPreset(animation, name)` · `PRESETS` | aplica um preset do app a uma animação |
| `encodeLightProfile(p)` · `decodeLightProfile(bytes)` | codec dos 635 bytes |
| `LightProfile` | `activeAnimation`, `animations` (5), `audioReactiveMode`, `raiseWakeUp`, `standbyTime`, `userEffectIndex`, `profileLed`, `reserved` |
| `Animation` | `keyFrameCount`, `speed` (0–20), `brightness` (0–100), `frames` (8 × `Frame`), `effectCount` |
| `LedZone` | `"Home"`, `"LowerLeft"`, `"LowerRight"`, `"UpperLeft"`, `"UpperRight"` |

Cores (`ColorInput`): `"#rrggbb"`, `[r, g, b]` ou `{ r, g, b }`. `hsv(h, s, v)` converte de HSV.

### Perfil de jogo

| Exportação | Descrição |
|---|---|
| `encodeGameProfile(p)` · `decodeGameProfile(bytes)` | codec dos 680 bytes |
| `GameProfile` | `name`, `fun`, `buttons` (16), `L4`, `R4`, `LT`, `RT`, `leftStick`, `rightStick`, `gyroAim`, `gyroTilt` |
| `KeyMapping` | `turboEnabled`, `turboSpeed`, `mapEnabled`, `mapTo` (3 `KeyCode`s), `toggle` |
| `Macro` · `MacroStep` | `enabled`, `holdToTrigger`, `loop`, `loopMs`, `steps` · `key`, `holdMs`, `delayMs` |
| `Trigger` · `Stick` · `Motion` | gatilho (deadzone, hair trigger, curva) · analógico · giroscópio |
| `MAPPED_BUTTONS` | ordem dos 16 botões mapeáveis |
| `ReportRate`, `StickOutput`, `CurveType`, `MotionActivation`, `HairTriggerMode`, `MOTOR_LEVELS` | valores aceitos nos campos |
| `KeyCode` · `keyName(code)` | códigos de tecla e nome reverso |

### Constantes

| Exportação | Valor |
|---|---|
| `Cyclone2Pid` | `{ Wired: 0x101D, WiredAdc: 0x1053, Wireless: 0x102A, WirelessDongle: 0x100B }` |
| `DONGLE_IDLE_PID` | `0x0575`, dongle sem controle (não responde) |
| `GAME_PROFILE_SIZE` · `LIGHT_PROFILE_SIZE` | 680 · 635 |
| `cyclone2` | descritor do modelo (`ControllerModel<Cyclone2State>`) |

## Baixo nível

| Exportação | Descrição |
|---|---|
| `protocol.*` | montagem e leitura de pacotes, sem I/O: `heartbeat`, `readProfile(n, size)`, `writeProfile`, `vibrate`, `setMacroRecord`, `parseResponse`, `parseFirmwareVersion`… |
| `Cmd`, `Profile`, `VENDOR_ID`, `CONFIG_USAGE_PAGE`, `*_REPORT_ID` | constantes do protocolo |
| `diffRange(a, b)` | primeiro e último byte diferentes entre duas imagens |
| `HidTransport` | interface do transporte: `write(report)`, `onReport(fn)`, `onDisconnect?(fn)`, `close()`. O byte 0 é sempre o report ID |
| `ControllerModel` · `MODELS` · `modelForPid(pid, models)` | descritor de modelo · modelos conhecidos · busca por PID |

Um modelo novo do mesmo protocolo precisa de um `ControllerModel` (PIDs, tamanhos dos perfis, `parseState`) e, para métodos tipados, de uma subclasse de `GameSirController` com os codecs dos perfis dele.

## Exemplos

Em `examples/`, rodados da raiz do repositório depois de `npm install`:

| Comando | Faz |
|---|---|
| `npm run battery-led -- [--slot 1-4] [--zone Home]` | indicador de bateria num LED, com reconexão automática |
| `npx tsx examples/lights.ts static\|home\|preset\|slot\|show` | luz |
| `npx tsx examples/vibrate.ts` | vibração |

Os scripts usados na validação do protocolo ficam em `tools/hardware/` ([engenharia-reversa.md](engenharia-reversa.md#verificação-no-hardware)).
