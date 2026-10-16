# 03 · Dispositivo

Fonte: tabela de dispositivos, entrada `Model: "C2"` / `ProductName: "CYCLONE 2"` (`main.app.js:34212`).

## USB

VID `0x3537`.

| PID | Dec | Modo | Firmware comparado | Pacote |
|---|---|---|---|---|
| `0x101D` | 4125 | cabo | controle 1.2.3 | `GS_C2_DEVICE_V123_Key.ufw` |
| `0x1053` | 4179 | cabo ("ADC") | controle 3.5.6 | `GS_C2_ADC_DEVICE_V356_Key.ufw` ✅ testado (fw 3.4.6) |
| `0x102A` | 4138 | sem fio | dongle 1.2.1 | `GS_C2_Dongle_V121_Key.ufw` |
| `0x100B` | 4107 | sem fio | dongle 1.2.1 | `GS_C2_Dongle_V121_Key.ufw` ✅ testado |

- Modo definido só pelo PID; não há comando que pergunte.
- Os 4 PIDs usam o mesmo proxy e protocolo.
- `0x1053` tem linha de firmware própria (3.x). Significado de "ADC" e diferença `0x102A`/`0x100B`: desconhecidos.
- `0x100B`: PID usado pelos scripts de teste com o dongle.
- Modelo `GS_C2_Dongle` não tem PID: só aparece no fluxo de gravação via pendrive.
- `0x0575` = **dongle sem controle conectado a ele** (visto com o dongle plugado e o controle no cabo; lib: `DONGLE_IDLE_PID`). Não está na tabela do app. Coleções `0x000C/0x0001`, `0xFF32/0x0074` e `0xFFF0/0x0040`; não responde a comandos; report `0x12` zerado com último byte `0xCC`. Com o controle desligado: não testado.

## Interface

Coleções no Windows (`examples/sniff.ts`), iguais no dongle `0x100B` e no cabo `0x1053`:

| Interface | Usage page / usage | O que é |
|---|---|---|
| 0 | `0x0001` / `0x0005` | gamepad (reports de 14 B) |
| 1 | `0xFFF0` / `0x0040` | **configuração** — comandos `0x0F`, respostas `0x10`, estado `0x12` |
| 1 | `0x0001` / `0x0006` | teclado (mapeamento para teclas) |
| 1 | `0x0001` / `0x0002` | mouse (mapeamento para mouse) |
| 1 | `0x000C` / `0x0001` | consumer (teclas de mídia) |

- O app abre só a coleção `0xFFF0`; número de interface ignorado.
- Interface de gamepad ignorada pelo app (`GamepadUsagePage: -1`).
- O dongle se apresenta como "Xbox 360 Controller for Windows".

Se o backend HID não reportar usage page, o app aceita qualquer interface com o PID. A lib filtra por `0xFFF0`.

## Conexões

| | App configura? |
|---|---|
| Cabo | sim ✅ mesmo protocolo; `0x12` na taxa de report do perfil (250 ou 1000/s), `chargeState` = 1 |
| Dongle 2.4 GHz | sim; o dongle repassa o protocolo |
| Bluetooth | **não** |

Bluetooth:
- Zero referências no app (strings, modos, PIDs). Detecção só por eventos USB.
- Via BT o controle usa outro VID/PID (ex.: Switch), que o app filtra.
- Se o firmware responde ao `0x0F` via BT: não testado; fora do escopo.

## Versão de firmware

`0F 09` → `10 0A …` (`resolveFwVersion`, `main.app.js:7102`).

Resposta real (dongle `0x100B`):

```
10 0A 30 00 33 00 34 00 36 00 30 00 31 00 32 00 31 00
      └──── "0346" UTF-16LE ───┘ └──── "0121" UTF-16LE ───┘
```

| Bytes | Conteúdo |
|---|---|
| 2–9 | controle, 4 caracteres UTF-16LE |
| 10–17 | dongle, 4 caracteres UTF-16LE; zerados no cabo ✅ |

- O app lê os bytes 4–8 e 12–16, descarta os `00` e transforma cada caractere em um componente: `"346"` → `3.4.6`. O `0` inicial fica de fora.
- No cabo o app compara a versão do controle; sem fio, a do dongle.
- Controle testado: **3.4.6**, dongle **1.2.1**. Firmware 3.x é a linha do `GS_C2_ADC_DEVICE`: no cabo o controle aparece como `0x1053` ✅.

## Dongle

- Sem comando de pareamento no protocolo ("pair" só em textos da UI).
- Recuperação: desconectar, segurar o botão de pareamento e conectar (~5 s) → pendrive JieLi (VID `0x4C4A`), gravado como `GS_C2_Dongle`.

## Chip

JieLi: DLL de atualização `JL_upgradeUtility_x86`, bootloader `0x4C4A`. Outros produtos da tabela usam `AC632N_TRANS`/`AC695X_TRANS`.
