# gamesir-reverse-engineering

Protocolo HID do **GameSir Cyclone 2**, extraído do GameSir Connect 1.16.7, e uma lib TypeScript para controlar o controle sem o app.

## Uso

```bash
cd lib && npm install
npx tsx examples/monitor.ts                 # estado ao vivo
npx tsx examples/lights.ts home "#ff0000"   # Home vermelho
npx tsx examples/lights.ts preset Rainbow
npx tsx examples/vibrate.ts
```

```ts
import { Cyclone2 } from "gamesir-hid";
import { findCyclone2, NodeHidTransport } from "gamesir-hid/node";

const [info] = await findCyclone2();
const pad = new Cyclone2(await NodeHidTransport.open(info.path!));
await pad.start();
await pad.setStaticColor("#00aaff");
```

API completa: [docs/08-lib.md](docs/08-lib.md).

## Protocolo

| | |
|---|---|
| Interface | VID `0x3537`, usage page `0xFFF0` |
| PIDs | `0x101D`, `0x1053` (cabo) · `0x100B`, `0x102A` (dongle) |
| Pacote | 64 bytes: `0F <cmd> <args>` → resposta `10 <cmd> …` |
| Estado | report `0x12` enquanto houver heartbeat `0F F2 00` a cada 1 s |
| Perfis | 1–4 e Shift: 680 B · luz (32): 635 B · lidos/escritos em blocos de 58 B |
| Vibração | `0F 20 66 55 L R` |
| Bluetooth | não suportado pelo app |

## Docs

| | |
|---|---|
| [01 Metodologia](docs/01-metodologia.md) | como o app foi aberto |
| [02 Arquitetura do app](docs/02-arquitetura-do-app.md) | proxy, fila, heartbeat |
| [03 Dispositivo](docs/03-dispositivo.md) | PIDs, dongle, firmware |
| [04 Protocolo HID](docs/04-protocolo-hid.md) | comandos |
| [05 Report de estado](docs/05-report-de-estado.md) | botões, bateria, LEDs |
| [06 Perfil de luz](docs/06-perfil-de-luz.md) | animações, zonas, presets |
| [07 Perfil de jogo](docs/07-perfil-de-jogo.md) | mapeamento, macros, analógicos, gyro |
| [08 Lib](docs/08-lib.md) | API |

## Estrutura

```
decompiled/        app extraído (GameSir Connect 1.16.7)
docs/              documentação
lib/               lib TypeScript
example-scripts/   scripts Python originais
tools/             prepare-analysis.sh → analysis/ (fora do git)
```

## Validação no hardware

Dongle `0x100B`, Windows, firmware 3.4.6 / dongle 1.2.1.

| | |
|---|---|
| Heartbeat liga o report `0x12` | ✅ |
| Report `0x12`: bateria, analógico esquerdo, ABXY, cor do Home | ✅ |
| Respostas chegam com report ID `0x10` | ✅ |
| Versão de firmware, perfil ativo, leitura de todos os perfis | ✅ |
| Layout do perfil de jogo e de luz vs dump real (ida e volta idêntica) | ✅ |
| Vibração | ✅ |
| Escrita do perfil de luz: cor fixa, só Home, preset, troca de animação | ✅ |
| Luz 4 = LED do centro | ✅ |
| IMU: contador (11), giroscópio (13–18), acelerômetro (19–24), eixos | ✅ · sinal do gyro Z inferido |
| Escrita do perfil de jogo (remapeamento, taxa de report, macro) | pendente |
| Gravação de macro pelo controle (`0F 16`) | pendente |
| Cabo, Bluetooth | pendente |

---

Projeto de interoperabilidade, sem afiliação com a GameSir. `decompiled/` é código da GameSir: remover antes de tornar o repo público.
