# 02 · Arquitetura do app

## Processos

| Processo | Papel | Libs |
|---|---|---|
| main | detecção, HID, comandos, firmware | `node-hid`, `usb-detection`, `ffi-napi`, `worker_threads` |
| renderer | UI; altera o store e emite eventos, **nunca** acessa o HID | `vue`, `vuex`, `vuex-electron`, `electron-promise-ipc` |

- Store Vuex sincronizado entre processos.
- Eventos chegam ao proxy pelo `js-event-bus` (módulo 12) como `<evento>-<path HID>`. Nomes em `fs` (`main.app.js:7500`); sufixo via `V` (`main.app.js:702`).

## Tabela de dispositivos

48 produtos (G7 Pro, Nova, Tarantula, K2, T3…). Cada entrada: `Model`, `ProductName`, `PackedFirmware`, `Proxy` e `Modes`, um por conexão:

```js
{ Mode: "Wireless", ConfigModeVid: 13623, ConfigModePid: 4107, UsagePage: 65520, GamepadUsagePage: -1 }
```

Cyclone 2: `Model: "C2"` (`main.app.js:34212`), proxy `ou` (`main.app.js:8053`).

## Proxy `ou`

### Conexão (`loadProfile`, `main.app.js:8246`)

1. Abre a coleção `0xFFF0` e envia `0F F2 00`.
2. Lê perfis 1–4, 5 (Shift) e 32 (luz).
3. Lê firmware (`0F 09`) e perfil ativo (`0F 0B`). Perfil ativo 0 vira 1; > 4 ou Shift força troca para o 1.
4. A resposta de firmware marca o dispositivo como carregado e libera a UI.

### Eventos atendidos

| Evento (`fs.*`) | HID |
|---|---|
| `saveProfile {profile, profileIndex}` | `0F 03 …`, só o trecho alterado |
| `reqSetKeyProfile`, `resetProfile`, `reqSetProfileByProperty` | alteram o perfil → `saveProfile` |
| `reqSwitchProfile {profileIndex}` | `0F 07 n` |
| `reqBackToLastProfile` | `0F 07 último` |
| `reqSetLightStatus {isPlaying, frameIndex}` | `0F 0D p f` |
| `reqGetRgbState` | `0F 0D` — nada na UI 1.16.7 dispara |
| `vibrate {left, right, duration}` | `0F 20 66 55 L R`; `L=R=0` após `duration` (padrão 1 s) |
| `reqSetMacroRecordStatus {key, recordState}` | `0F 16 k s` |
| `reqQuickUpdate` | `0F 17 55 88` |
| `heartBeat` | `0F F2 00` num handle temporário |
| `reqDfu` | atualização via DLL |
| `reqToCalibrate` | **sem listener no C2**: a tela de calibração não faz nada |

### Recebidos

| Report | Tratamento |
|---|---|
| `0x12` | estado ([05](05-report-de-estado.md)) |
| `0F 0F` ProfileChanged | relê o trecho com `0F 10`; `n = 48` → relê o perfil ativo |
| outros `0F xx` | confirmam o comando pendente |

## Fila de envio (`Ls`, `main.app.js:7744`)

| Regra | Valor |
|---|---|
| Comandos em voo por dispositivo | 1 |
| Tick | 20 ms |
| Reenvio sem resposta | a cada 200 ms |
| Desiste após | 10 envios; 2 desistências durante o carregamento → `loadProfileFailed` |
| Não contam como confirmação | `0F 0E` ReadRGBAck, `0F 0F` ProfileChanged, `0F 06 01` busy |
| Fora da fila (`writeImmediately`) | vibração, LED, macro |

Qualquer resposta confirma o comando mais antigo: mandar dois de uma vez pode confirmar o errado. A classe `Cyclone2` reproduz essa fila.

## Heartbeat (`W`, `main.app.js:717`)

- `0F F2 m` para todos os dispositivos a cada 1 s, **só com a janela em foco**.
- `m = 1` quando o store está em `IsTestMode` (tela de teste de botões).
- Sem heartbeat o controle para de enviar o `0x12`.

## Firmware (fora do escopo da lib)

- `worker_thread` + DLL JieLi via `ffi-napi` (`dfu/JL_upgradeUtility_x86`, `jl_firmware_upgrade_x86`).
- Pacotes `.ufw`: `GS_C2_DEVICE_V123_Key.ufw`, `GS_C2_ADC_DEVICE_V356_Key.ufw`, `GS_C2_Dongle_V121_Key.ufw`.
- Modo pendrive: dispositivo reaparece como VID `0x4C4A` e é gravado pelo nome do produto.
