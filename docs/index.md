---
title: Visão geral
---

`gamesir-hid` é uma lib em TypeScript que controla os controles GameSir por HID, sem o GameSir Connect aberto. Com ela, um programa seu muda as luzes, remapeia botões, grava macros, vibra o controle e lê o estado ao vivo: botões, analógicos, bateria e sensores de movimento.

O GameSir Connect não documenta o protocolo. Ele foi extraído do código do próprio app, na versão 1.16.7, e conferido num Cyclone 2 de verdade. A [engenharia reversa](engenharia-reversa.md) conta como isso foi feito e por quê.

## Controles suportados

Vários controles da GameSir falam o mesmo protocolo, mas cada modelo tem o próprio layout de perfil. Por enquanto, só o Cyclone 2 tem esse layout mapeado.

| Controle | Suporte |
|---|---|
| Cyclone 2 | luzes, perfis de jogo (remapeamento, macros, gatilhos, analógicos, giroscópio), vibração, estado ao vivo (botões, analógicos, bateria, LEDs, IMU) |
| Tarantula CE, G7 Pro 8K, K2 8K | mesma família de protocolo; não implementados (faltam o descritor do modelo e os codecs dos perfis) |
| Tarantula Pro, Super Nova, Nova 2 Lite | não suportados (o app controla esses por DLLs fechadas) |

Funciona por cabo e pelo dongle 2.4 GHz. Bluetooth não é suportado.

## Instalação

```bash
npm install gamesir-hid node-hid   # node-hid só é necessário no Node
```

Node 18 ou superior. No Linux, o usuário precisa de acesso ao `hidraw`, com uma regra udev para o vendor `3537`. No navegador, a lib usa WebHID e dispensa o `node-hid`.

## Uso

O fluxo é sempre o mesmo: achar o controle, abrir a conexão e chamar `start()`. O `start()` liga o heartbeat, que mantém o controle mandando o estado. Depois disso, cada método grava direto no controle.

```ts
import { Cyclone2, KeyCode } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";

const [device] = await findControllers();
const pad = new Cyclone2(await NodeHidTransport.open(device.path));
await pad.start();

await pad.setStaticColor({ Home: "#00aaff" });
await pad.applyPreset("Rainbow", 1);
await pad.remapButton(1, KeyCode.A, KeyCode.B);
await pad.setMacro(1, KeyCode.L4, [
  { key: KeyCode.A, holdMs: 50, delayMs: 100 },
  { key: KeyCode.B, holdMs: 50, delayMs: 0 },
]);
await pad.vibrate(200, 200, 300);

pad.onState((s) => console.log(s.batteryLevel, s.buttons.A, s.leftStick, s.imu.accel));
pad.onDisconnect(() => console.log("controle desconectado"));
```

As gravações valem na hora e não existe "salvar". A lib envia só os bytes que mudaram.

| Área | Métodos |
|---|---|
| Sessão | `start`, `close`, `onState`, `onProfileChanged`, `onDisconnect` |
| Dispositivo | `readFirmwareVersion`, `readCurrentProfile`, `switchProfile`, `vibrate` |
| Luzes | `setStaticColor`, `setAnimation`, `applyPreset`, `setActiveAnimation`, `setStandbyTime`, `readLightProfile`, `writeLightProfile` |
| Perfis de jogo | `remapButton`, `setMacro`, `setReportRate`, `setMacroRecording`, `readGameProfile`, `writeGameProfile` |
| Baixo nível | `readProfile`, `writeProfile`, `request`, montadores de pacote em `protocol.*` |

## Exemplos

No repositório, em [`examples/`](../examples):

- [`battery-led`](../examples/battery-led): mostra o nível da bateria nos LEDs do controle. Foi o script que deu origem à lib. Também existe como app de bandeja para Windows, na página de [releases](https://github.com/pedrosegato/gamesir-reverse-engineering/releases).
- [`lights.ts`](../examples/lights.ts): cores estáticas, presets e a animação ativa
- [`vibrate.ts`](../examples/vibrate.ts): vibração

## Páginas

- [API](api.mdx): cada método explicado, com botões para testar no seu controle
- [Protocolo](protocolo.md): os bytes, ou seja, pacotes, comandos, report de estado e o layout dos perfis
- [Engenharia reversa](engenharia-reversa.md): como o protocolo foi extraído do app e conferido no controle
- [Testar no navegador](testar.mdx): luzes, vibração e botões de um Cyclone 2 ao vivo

## Licença

MIT. Sem afiliação com a GameSir e sem endosso dela. O repositório não inclui nenhum código da GameSir.
