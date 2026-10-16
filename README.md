# GameSir Cyclone 2: engenharia reversa do protocolo HID

Estudo de caso: abrir o **GameSir Connect** (app oficial, Electron) para entender como ele conversa com o **GameSir Cyclone 2** e controlar o controle por código, com LEDs, perfis, mapeamentos, macros, vibração e leitura de estado, sem o app.

O resultado tem duas partes:

1. **Documentação** do protocolo (`docs/`), com cada afirmação ligada à linha do código do app de onde veio.
2. **Uma lib em TypeScript** (`lib/`) que reimplementa as funções do app para o Cyclone 2, no Node e no navegador (WebHID).

## Descobertas principais

- Toda a configuração passa por uma interface HID vendor-defined (**usage page `0xFFF0`**) com pacotes de 64 bytes. Cada comando começa com `0x0F` e tem o opcode no byte 1.
- O controle guarda **perfis em memória endereçável**: 4 perfis de jogo + Shift (680 bytes cada) e um perfil de luz (635 bytes). O app só lê e escreve trechos de até 58 bytes. Não existe comando de "aplicar": a escrita vale na hora.
- Com **heartbeat** (`0F F2 00`), o controle manda um report `0x12` com botões, analógicos, gatilhos, **bateria**, e **as cores acesas em cada LED** naquele momento.
- Os LEDs não têm "modos": são **5 animações de até 8 keyframes**. "Rainbow", "Flow" etc. são só presets do app que preenchem os frames.
- **A ordem das zonas no frame é diferente da ordem do report de estado.** O botão Home é o slot 3 do frame, mas a primeira cor do report.
- A vibração é um comando direto: `0F 20 66 55 L R`.
- O app **não configura o controle pelo Bluetooth**. Funciona só por cabo e pelo dongle.

## Estrutura

```
decompiled/          app.asar extraído do GameSir Connect 1.16.7
docs/                documentação (comece pelo 01)
lib/                 lib TypeScript (gamesir-hid)
example-scripts/     scripts Python originais, usados para validar no hardware
tools/               preparação da análise (formata e separa os bundles)
analysis/            gerado por tools/prepare-analysis.sh (fora do git)
```

## Documentação

1. [Metodologia](docs/01-metodologia.md): como o app foi aberto e lido
2. [Arquitetura do app](docs/02-arquitetura-do-app.md): processos, proxy do C2, fila de comandos
3. [Dispositivo](docs/03-dispositivo.md): PIDs, interfaces, dongle, Bluetooth, firmware
4. [Protocolo HID](docs/04-protocolo-hid.md): formato dos pacotes e tabela de comandos
5. [Report de estado `0x12`](docs/05-report-de-estado.md): entradas, bateria, LEDs
6. [Perfil de luz](docs/06-perfil-de-luz.md): animações, zonas, presets
7. [Perfil de jogo](docs/07-perfil-de-jogo.md): mapeamentos, macros, gatilhos, analógicos, giroscópio
8. [A lib](docs/08-lib.md): API e exemplos

## Começo rápido

```bash
cd lib && npm install
npx tsx examples/monitor.ts                  # estado ao vivo
npx tsx examples/lights.ts preset Rainbow    # aplica um preset
npx tsx examples/lights.ts home "#ff0000"    # só o Home em vermelho
```

## Validação no hardware

✅ confirmado · 🟡 indicado pelos scripts Python, falta confirmar · ⏳ pendente · ❓ em aberto

| Item | Status |
|---|---|
| Interface `0xFFF0`, VID `0x3537`, PID `0x100B` (dongle) | 🟡 |
| Heartbeat liga o report `0x12`; bateria no byte 36, carregando no 35 | 🟡 |
| Escrita do perfil de luz em blocos de 58 bytes muda os LEDs | 🟡 |
| Slot 3 do frame = Home | 🟡 + confirmado no código do app |
| Lib TypeScript no controle real | ⏳ pendente |
| Layout do perfil de jogo contra um dump real | ⏳ pendente (`examples/dump-profiles.ts`) |
| Posição física da "luz 4" (`UpperRight`) | ⏳ pendente |
| Tipo exato das respostas a `WriteProfile` / `SwitchProfile` | ⏳ pendente |
| Protocolo pelo Bluetooth | ❓ o app não suporta; não testado |

## Aviso

Projeto de interoperabilidade com um controle próprio. Não tem afiliação com a GameSir. O código em `decompiled/` pertence à GameSir e está aqui só para estudo, já que o repositório é privado. Antes de tornar o repositório público, remova a pasta `decompiled/`. A lib não implementa atualização de firmware.
