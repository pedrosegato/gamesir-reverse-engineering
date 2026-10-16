# 08 · A lib `gamesir-hid`

A pasta `lib/` reimplementa em TypeScript tudo o que o GameSir Connect faz com o Cyclone 2. Ela roda no Node (via `node-hid`) e no navegador (via WebHID).

## Instalação

```bash
cd lib
npm install
npm run check     # typecheck + Biome + testes
```

Node 18+. No Linux, o usuário precisa de permissão no `hidraw` do controle (regra udev para `3537:*`).

Para usar a partir de outro projeto, rode `npm run build` e instale pelo caminho (`npm install ../gamesir-reverse-engineering/lib`). Os exemplos abaixo importam `gamesir-hid` desse jeito. Os de `lib/examples/` importam direto de `src/`.

## Uso no Node

```ts
import { Cyclone2, KeyCode, ReportRate } from "gamesir-hid";
import { findCyclone2, NodeHidTransport } from "gamesir-hid/node";

const [info] = await findCyclone2();               // interfaces 0xFFF0 de Cyclone 2
const pad = new Cyclone2(await NodeHidTransport.open(info.path!));
await pad.start();                                 // heartbeat, como o app

pad.onState((s) => console.log(s.batteryLevel, s.buttons.A, s.leds.Home));

await pad.setStaticColor("#ff00aa");
await pad.vibrate(200, 200, 300);
await pad.close();
```

## Uso no navegador (WebHID)

```ts
import { Cyclone2 } from "gamesir-hid";
import { requestCyclone2 } from "gamesir-hid/webhid";

button.onclick = async () => {
  const transport = await requestCyclone2();       // abre o seletor do Chrome/Edge
  if (!transport) return;
  const pad = new Cyclone2(transport);
  await pad.start();
  await pad.applyPreset("Rainbow");
};
```

## API da classe `Cyclone2`

| Grupo | Método | Equivalente no app |
|---|---|---|
| Sessão | `start({ heartbeatMs, testMode })`, `stopHeartbeat()`, `close()` | heartbeat de 1 s |
| Eventos | `onState(fn)`, `nextState()`, `onProfileChanged(fn)`, `onRaw(fn)` | report `0x12`, `ProfileChanged` |
| Info | `readFirmwareVersion()`, `readCurrentProfile()` | `0F 09`, `0F 0B` |
| Perfis | `switchProfile(1..4 \| "Shift")` | `reqSwitchProfile` |
| | `readGameProfile(n)`, `writeGameProfile(n, p)`, `updateGameProfile(n, fn)` | `saveProfile` |
| | `remapButton(n, botão, ...teclas)`, `setReportRate(n, taxa)` | `setKeyProfile`, `reportRate` |
| Luzes | `readLightProfile()`, `writeLightProfile(p)`, `updateLightProfile(fn)` | `setProfileByProperty("Light")` |
| | `setActiveAnimation(i)`, `setAnimation(anim, { slot })`, `applyPreset(nome, slot?)` | slots e presets da tela de luzes |
| | `setStaticColor(cor \| { Home, LowerLeft, ... })` | — |
| | `setStandbyTime(min)`, `setRaiseToWake(bool)`, `setAudioReactive(bool)` | opções da tela de luzes |
| | `playLights()`, `showFrame(i)` | `reqSetLightStatus` |
| Outros | `vibrate(esq, dir, ms)` | `vibrate` / "Try Grip Vibration" |
| | `setMacroRecording("FL1" \| "FR1", estado)` | `reqSetMacroRecordStatus` |
| Baixo nível | `send(pacote)`, `request(pacote, opções)`, `readProfile(n)`, `writeProfile(n, bytes, offset)` | fila `Ls` |

Toda escrita de perfil compara com a última cópia lida e envia **só o trecho alterado**, como o app.

Os builders de pacote, sem I/O, ficam em `protocol` (`import { protocol } from "gamesir-hid"`). Os codecs também podem ser usados sozinhos: `decodeLightProfile`, `encodeGameProfile` etc.

## Exemplos (`lib/examples/`)

```bash
npx tsx examples/monitor.ts              # estado ao vivo: botões, sticks, bateria, LEDs
npx tsx examples/lights.ts static "#00aaff"
npx tsx examples/lights.ts home "#ff0000"
npx tsx examples/lights.ts preset Rainbow
npx tsx examples/lights.ts slot 2
npx tsx examples/vibrate.ts
npx tsx examples/battery-led.ts           # Home muda de cor conforme a bateria (porte do script Python)
npx tsx examples/dump-profiles.ts         # salva todos os perfis em JSON
```

## Não implementado de propósito

- **Atualização de firmware.** Depende da DLL proprietária da JieLi. `protocol.quickUpdate()` e `protocol.enterUpgradeMode()` existem só como referência: eles deixam o controle em modo de gravação.
- **Gravar "device id"** (offset 926). O app define o comando, mas nunca usa.
