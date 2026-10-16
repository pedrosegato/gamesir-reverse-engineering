# 03 · Dispositivo: GameSir Cyclone 2

## Identificação USB

VID **`0x3537`** (GameSir). No app, o modelo é `"C2"`, `ProductName: "CYCLONE 2"` (`main.app.js:34212`).

| PID | Decimal | Modo no app | Firmware que o app compara | Pacote de firmware |
|---|---|---|---|---|
| `0x101D` | 4125 | Wired | controle `1.2.3` | `GS_C2_DEVICE_V123_Key.ufw` |
| `0x1053` | 4179 | Wired ("ADC") | controle `3.5.6` | `GS_C2_ADC_DEVICE_V356_Key.ufw` |
| `0x102A` | 4138 | Wireless | dongle `1.2.1` | `GS_C2_Dongle_V121_Key.ufw` |
| `0x100B` | 4107 | Wireless | dongle `1.2.1` | `GS_C2_Dongle_V121_Key.ufw` |

- O app identifica cabo ou sem fio **só pelo PID**. Não existe comando que pergunte o modo.
- A diferença entre `0x102A` e `0x100B`, e o que "ADC" quer dizer no `0x1053`, **não aparecem no código**. Os quatro usam o mesmo proxy e o mesmo protocolo. O `0x1053` tem linha de firmware própria (3.x), o que sugere outra revisão de hardware.
- O `0x100B` é o que os scripts de teste usaram com o dongle.

## Interface HID

O app abre **só a coleção de usage page `0xFFF0`** (vendor-defined). Não usa número de interface. Por ela passam:

- os comandos `0x0F` e as respostas;
- o report de estado `0x12` (entradas, bateria, cores dos LEDs).

O controle também expõe a interface de gamepad comum (XInput/HID), que o app ignora no Cyclone 2 (`GamepadUsagePage: -1`).

> Se o backend HID não informar a usage page, o app aceita qualquer interface com o PID. A lib e os scripts filtram explicitamente por `0xFFF0`.

## Formas de conexão

| Conexão | Configurável pelo app? | Como aparece |
|---|---|---|
| Cabo USB | Sim | PID `0x101D` ou `0x1053` |
| Dongle 2.4 GHz | Sim. O dongle repassa o protocolo ao controle | PID `0x100B` ou `0x102A` |
| Bluetooth | **Não** | — |

**Bluetooth:** o app não tem nenhuma referência a Bluetooth. Não há strings "bluetooth"/"BLE", modos BT nem PIDs BT, e a detecção só reage a eventos USB. Pelo Bluetooth o controle se apresenta em outro modo, com outro VID/PID (ex.: Switch), que o app filtra. Ainda **não se sabe** se o firmware responderia ao protocolo `0x0F` pelo Bluetooth. Dá pra testar listando as interfaces HID com o controle pareado (`example-scripts/scan_hid.py`).

## Dongle

- O dongle tem o próprio firmware (`1.2.1`). A resposta de versão (`0F 0A`) traz a versão do controle nos bytes 4–8 e a do dongle nos bytes 12–16.
- **Não há comando de pareamento** no protocolo. "Pair" só aparece nos textos da interface.
- Recuperação do dongle segundo o app: desconectar, segurar o botão de pareamento e conectar de novo por ~5 s. O dongle volta como pendrive JieLi (VID `0x4C4A`) para regravação.

## Versão de firmware

Resposta a `0F 09`:

| Bytes | Conteúdo |
|---|---|
| 1 | `0x0A` |
| 4–8 | versão do controle, 5 bytes ASCII |
| 12–16 | versão do dongle, 5 bytes ASCII (vazia no cabo) |
| 2–3, 9–11 | não interpretados pelo app |

Cada caractere vira um componente: `"123"` → `1.2.3` (`resolveFwVersion`, `main.app.js:7102`).

## Chip

A atualização de firmware usa uma DLL da **JieLi** (`JL_upgradeUtility_x86`), e o modo de recuperação aparece como pendrive JieLi (VID `0x4C4A`). Tudo indica que controle e dongle usam SoCs JieLi (família AC63xx/AC69xx, que aparecem na tabela como `AC632N_TRANS`/`AC695X_TRANS`).
