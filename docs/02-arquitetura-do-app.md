# 02 · Arquitetura do GameSir Connect

## Processos

| Processo | Papel | Bibliotecas relevantes |
|---|---|---|
| **main** (`main.js`) | Detecta dispositivos, abre o HID, monta e envia comandos, lê respostas, atualiza firmware | `node-hid`, `usb-detection`, `ffi-napi` (DLL de firmware), `worker_threads` |
| **renderer** (`renderer.js`) | Interface Vue 2. Edita perfis num store Vuex e dispara eventos | `vue`, `vuex`, `vuex-electron`, `electron-promise-ipc` |

O renderer **nunca fala com o HID**. Ele altera o estado (Vuex sincronizado entre os processos) e emite eventos. Um barramento de eventos no main (`js-event-bus`, módulo webpack 12) leva esses eventos até o proxy do dispositivo. Os nomes dos eventos estão no objeto `fs` (`main.app.js:7500`). Cada um é emitido com o sufixo `-<path do HID>` para chegar no proxy certo (função `V`, `main.app.js:702`).

## Tabela de dispositivos

O app suporta 48 produtos (G7 Pro, Nova, Tarantula, K2, T3…). Cada entrada tem `Model`, `ProductName` e `PackedFirmware`, e uma lista de `Modes`, um por forma de conexão:

```js
{ Mode: "Wireless", ConfigModeVid: 13623, ConfigModePid: 4107, UsagePage: 65520, GamepadUsagePage: -1 }
```

Também tem um `Proxy`, que é a classe que implementa o protocolo daquele modelo. Para o Cyclone 2 (`Model: "C2"`, `main.app.js:34212`) a classe é `ou` (`main.app.js:8053`).

## O proxy do Cyclone 2 (`ou`)

### Ao conectar (`loadProfile`, `main.app.js:8246`)

1. Abre o HID na interface de usage page `0xFFF0` e manda um heartbeat `[0F F2 00]`.
2. Lê os perfis 1, 2, 3 e 4, o Shift (5) e o de luz (32), em blocos de 58 bytes.
3. Lê a versão de firmware `[0F 09]` e o perfil ativo `[0F 0B]`.
4. Quando a versão de firmware chega, marca o dispositivo como carregado e a interface libera a edição.

### Eventos que ele atende

| Evento (`fs.*`) | O que faz no HID |
|---|---|
| `saveProfile {profile, profileIndex}` | Converte o perfil em bytes, compara com a última cópia e escreve **só o trecho alterado** |
| `reqSwitchProfile {profileIndex}` | `[0F 07 n]` |
| `reqBackToLastProfile` | `[0F 07 último]` |
| `reqSetKeyProfile`, `resetProfile`, `reqSetProfileByProperty` | Alteram o perfil e chamam `saveProfile` |
| `reqSetLightStatus {isPlaying, frameIndex}` | `[0F 0D playing frame]` |
| `reqGetRgbState` | `[0F 0D]`. Nada na interface 1.16.7 dispara esse evento |
| `vibrate {left, right, duration}` | `[0F 20 66 55 L R]`, depois `[0F 20 66 55 00 00]` ao fim de `duration` (padrão 1 s) |
| `reqSetMacroRecordStatus {key, recordState}` | `[0F 16 key state]` |
| `reqQuickUpdate` | `[0F 17 55 88]` |
| `heartBeat` | `[0F F2 00]` num handle temporário |
| `reqToCalibrate` | **sem listener no proxy C2**: a tela de calibração não faz nada neste controle |
| `reqDfu` | Atualização de firmware pela DLL (ver abaixo) |

### O que ele escuta do controle

- **Report `0x12`**: estado do gamepad, bateria e cores atuais dos LEDs. Ver [05 · Report de estado](05-report-de-estado.md).
- **Respostas `0x0F`**: confirmações, dados de perfil e versão de firmware.
- **`ProfileChanged` (`0x0F 0x0F`)**: o controle avisa que um trecho de perfil mudou sozinho, por exemplo quando o modo de luz é trocado por atalho no próprio controle. O app relê só aquele trecho com `RefreshProfile` (`0x10`).

## Fila de envio (`Ls`, `main.app.js:7744`)

O app nunca manda dois comandos ao mesmo tempo para o mesmo dispositivo:

- Um timer de 20 ms processa a fila de cada dispositivo.
- Um comando com confirmação fica pendente até chegar **qualquer** resposta `0x0F`, exceto `ReadRGBAck` (`0x0E`), `ProfileChanged` (`0x0F`) e `Ack` com byte 2 = 1 (*busy*).
- Sem resposta em 200 ms, ele reenvia. Depois de 10 envios, desiste. Se isso acontecer duas vezes durante o carregamento, emite `loadProfileFailed`.
- `writeImmediately` passa direto, sem fila. É usado pra vibração, LED e macro.

A classe `Cyclone2` da lib (`lib/src/cyclone2.ts`) reproduz essa fila.

## Heartbeat

`W()` (`main.app.js:717`) manda `[0F F2 mode]` para todos os dispositivos **a cada 1 s, só com a janela em foco**. `mode` vale 1 no modo de teste da interface. Sem heartbeat o controle para de mandar o report `0x12`, o que bate com o que os scripts de teste observaram.

## Firmware (fora do escopo da lib)

A atualização roda num `worker_thread` que carrega uma DLL JieLi (`dfu/JL_upgradeUtility_x86`, `jl_firmware_upgrade_x86`) via `ffi-napi` e grava pacotes `.ufw` (`GS_C2_DEVICE_V123_Key.ufw`, `GS_C2_Dongle_V121_Key.ufw`…). Isso indica que o Cyclone 2 e o dongle usam um SoC JieLi. A lib **não** implementa atualização de firmware. `quickUpdate`/`enterUpgradeMode` existem só como referência, porque deixam o controle em modo de gravação.
