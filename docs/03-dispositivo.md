# 03 · Dispositivo

Fonte: tabela de dispositivos, entrada `Model: "C2"` / `ProductName: "CYCLONE 2"` (`main.app.js:34212`).

## USB

VID `0x3537`.

| PID | Dec | Modo | Firmware comparado | Pacote |
|---|---|---|---|---|
| `0x101D` | 4125 | cabo | controle 1.2.3 | `GS_C2_DEVICE_V123_Key.ufw` |
| `0x1053` | 4179 | cabo ("ADC") | controle 3.5.6 | `GS_C2_ADC_DEVICE_V356_Key.ufw` |
| `0x102A` | 4138 | sem fio | dongle 1.2.1 | `GS_C2_Dongle_V121_Key.ufw` |
| `0x100B` | 4107 | sem fio | dongle 1.2.1 | `GS_C2_Dongle_V121_Key.ufw` |

- Modo definido só pelo PID; não há comando que pergunte.
- Os 4 PIDs usam o mesmo proxy e protocolo.
- `0x1053` tem linha de firmware própria (3.x). Significado de "ADC" e diferença `0x102A`/`0x100B`: desconhecidos.
- `0x100B`: PID usado pelos scripts de teste com o dongle.
- Modelo `GS_C2_Dongle` não tem PID: só aparece no fluxo de gravação via pendrive.

## Interface

| | |
|---|---|
| Coleção usada | usage page `0xFFF0`; número de interface ignorado |
| Tráfego | comandos/respostas `0x0F` + estado `0x12` |
| Interface de gamepad | ignorada (`GamepadUsagePage: -1`) |

Se o backend HID não reportar usage page, o app aceita qualquer interface com o PID. A lib filtra por `0xFFF0`.

## Conexões

| | App configura? |
|---|---|
| Cabo | sim |
| Dongle 2.4 GHz | sim; o dongle repassa o protocolo |
| Bluetooth | **não** |

Bluetooth:
- Zero referências no app (strings, modos, PIDs). Detecção só por eventos USB.
- Via BT o controle usa outro VID/PID (ex.: Switch), que o app filtra.
- Se o firmware responde ao `0x0F` via BT: não testado (`example-scripts/scan_hid.py` com o controle pareado).

## Versão de firmware

`0F 09` → `0F 0A …` (`resolveFwVersion`, `main.app.js:7102`).

| Bytes | Conteúdo |
|---|---|
| 4–8 | controle, 5 B ASCII |
| 12–16 | dongle, 5 B ASCII (vazio no cabo) |
| 2–3, 9–11 | não interpretados |

Cada caractere vira um componente: `"123"` → `1.2.3`. No cabo o app compara a versão do controle; sem fio, a do dongle.

## Dongle

- Sem comando de pareamento no protocolo ("pair" só em textos da UI).
- Recuperação: desconectar, segurar o botão de pareamento e conectar (~5 s) → pendrive JieLi (VID `0x4C4A`), gravado como `GS_C2_Dongle`.

## Chip

JieLi: DLL de atualização `JL_upgradeUtility_x86`, bootloader `0x4C4A`. Outros produtos da tabela usam `AC632N_TRANS`/`AC695X_TRANS`.
