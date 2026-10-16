# 08 · Lib `gamesir-hid`

`lib/`: TypeScript, Node (`node-hid`) e navegador (WebHID).

## Setup

```bash
cd lib
npm install
npm run check     # typecheck + Biome + testes
npm run build     # dist/
```

- Node 18+.
- Linux: permissão no `hidraw` (regra udev para `3537:*`).
- Outro projeto: `npm install ../gamesir-reverse-engineering/lib` após o build. Os exemplos de `lib/examples/` importam direto de `src/`.

## Node

```ts
import { Cyclone2 } from "gamesir-hid";
import { findCyclone2, NodeHidTransport } from "gamesir-hid/node";

const [info] = await findCyclone2();              // coleções 0xFFF0 de Cyclone 2
const pad = new Cyclone2(await NodeHidTransport.open(info.path!));
await pad.start();                                // heartbeat
pad.onState((s) => console.log(s.batteryLevel, s.buttons.A, s.leds.Home));
await pad.setStaticColor("#ff00aa");
await pad.vibrate(200, 200, 300);
await pad.close();
```

## Navegador (Chrome/Edge)

```ts
import { Cyclone2 } from "gamesir-hid";
import { requestCyclone2 } from "gamesir-hid/webhid";

button.onclick = async () => {
  const transport = await requestCyclone2();      // seletor; exige gesto do usuário
  if (!transport) return;
  const pad = new Cyclone2(transport);
  await pad.start();
  await pad.applyPreset("Rainbow");
};
```

## `Cyclone2`

| Grupo | Método | Equivalente no app |
|---|---|---|
| Sessão | `start({ heartbeatMs, testMode })`, `stopHeartbeat()`, `close()` | heartbeat 1 s |
| Eventos | `onState`, `nextState`, `onProfileChanged`, `onRaw` | `0x12`, `0F 0F` |
| Info | `readFirmwareVersion()`, `readCurrentProfile()` | `0F 09`, `0F 0B` |
| Perfis de jogo | `switchProfile(1..4 \| "Shift")` | `reqSwitchProfile` |
| | `readGameProfile`, `writeGameProfile`, `updateGameProfile` | `saveProfile` |
| | `remapButton(n, botão, ...teclas)`, `setReportRate(n, taxa)` | `setKeyProfile`, `reportRate` |
| | `setMacro(n, "L4" \| "R4", passos, { holdToTrigger, loop, loopMs })` | editor de macro |
| Luz | `readLightProfile`, `writeLightProfile`, `updateLightProfile` | `setProfileByProperty("Light")` |
| | `setActiveAnimation`, `setAnimation(anim, { slot })`, `applyPreset(nome, slot?)` | slots, presets |
| | `setStaticColor(cor \| { Home, LowerLeft, … })` | — |
| | `setStandbyTime`, `setRaiseToWake`, `setAudioReactive` | opções da tela de luzes |
| | `playLights()`, `showFrame(i)` | `reqSetLightStatus` |
| Outros | `vibrate(esq, dir, ms)` | `vibrate` |
| | `setMacroRecording("FL1" \| "FR1", estado)` | `reqSetMacroRecordStatus` |
| Baixo nível | `send`, `request`, `readProfile`, `writeProfile`, `writeProfileImage` | fila `Ls` |

- `GamepadState`: `buttons`, sticks e gatilhos já mapeados pelo perfil; `physical` traz o botão físico; `imu` com `{ x, y, z }` ([05](05-report-de-estado.md)).
- Escritas de perfil enviam só o trecho alterado, como o app.
- `request` serializa comandos e reenvia a cada 200 ms (máx. 10).
- Builders sem I/O: `import { protocol } from "gamesir-hid"`. Codecs avulsos: `decodeLightProfile`, `encodeGameProfile` etc.

## Exemplos (`lib/examples/`)

| Comando | Faz |
|---|---|
| `npx tsx examples/check.ts` | diagnóstico: modo de conexão, firmware, ritmo do `0x12`, bateria, leitura dos perfis, vibração e LED (restaura a luz) |
| `npx tsx examples/probe.ts` | resposta a WriteProfile/SwitchProfile, leitura de "device info", parar e cancelar gravação de macro (restaura o perfil) |
| `npx tsx examples/monitor.ts` | estado ao vivo (imprime quando muda entrada, bateria ou LED) |
| `npx tsx examples/imu.ts` | giroscópio e acelerômetro, 10 linhas/s |
| `npx tsx examples/game-profile.ts rate` | troca a taxa de report do perfil ativo, confere lendo de volta e restaura |
| `npx tsx examples/game-profile.ts remap` | A → B por 15 s no perfil ativo (mostra mapeado × físico) e restaura |
| `npx tsx examples/game-profile.ts macro` | grava a macro A, B, X, Y no L4 por 15 s e restaura |
| `npx tsx examples/game-profile.ts modes [1-3]` | a mesma macro em Long Press, Single Press + loop e Long Press + loop, 15 s cada (ou só a rodada escolhida), e restaura |
| `npx tsx examples/game-profile.ts record` | gravação de macro pelo controle no L4 (`0F 16`), mostra o resultado, toca e restaura |
| `npx tsx examples/lights.ts static "#00aaff"` | cor fixa |
| `npx tsx examples/lights.ts home "#ff0000"` | só o Home |
| `npx tsx examples/lights.ts preset Rainbow` | preset |
| `npx tsx examples/lights.ts slot 2` | troca a animação ativa |
| `npx tsx examples/lights.ts show` | imprime o perfil de luz |
| `npx tsx examples/vibrate.ts` | sequência de vibração |
| `npx tsx examples/battery-led.ts` | Home muda de cor com a bateria (porte do script Python) |
| `npx tsx examples/dump-profiles.ts` | salva todos os perfis + firmware em JSON |

## Fora da lib

| | Motivo |
|---|---|
| Atualização de firmware | DLL proprietária JieLi; `protocol.quickUpdate()`/`enterUpgradeMode()` só como referência |
| Gravar "device id" (offset 926) | nunca usado pelo app |
