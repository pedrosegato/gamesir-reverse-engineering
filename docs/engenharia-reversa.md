# Engenharia reversa

O protocolo foi extraído do código do GameSir Connect 1.16.7 e conferido num Cyclone 2. Esta página resume o método e aponta onde está cada parte no código do app.

## Método

### 1. Extrair o código

O GameSir Connect é um app Electron. O código fica num arquivo `app.asar`, que é possível decompilar usando a própria lib do electron, em dois bundles:

| Bundle | Conteúdo |
|---|---|
| `dist/electron/main.js` | comunicação HID; webpack 4, 944 KB em uma linha, 252 módulos |
| `dist/electron/renderer.js` | interface; Vue 2, 5,1 MB |

O repositório não inclui o app. Para gerar os arquivos de análise:

```bash
npx --yes @electron/asar extract "<instalação>/resources/app.asar" decompiled
docs/scripts/prepare-analysis.sh decompiled
```

| Saída em `analysis/` | Conteúdo |
|---|---|
| `main.app.js` | módulo 251 do `main.js`, formatado: o código do app |
| `renderer.js` | interface, formatada |
| `main-modules/` | os 252 módulos do `main.js`, separados sem executar nenhum |

As referências `arquivo:linha` desta página apontam para esses arquivos.

### 2. Achar o controle

Buscar o vendor ID da GameSir, `0x3537` (13623), e a usage page de configuração, `0xFFF0` (65520), leva à tabela de dispositivos (`main.app.js:34212`). Ela liga cada modelo aos PIDs dele e à classe que o controla. A classe do Cyclone 2 (`main.app.js:8053`) traduz os eventos da interface em pacotes HID.

Só o processo principal acessa o HID. Ao conectar, a classe manda o heartbeat e lê os perfis 1–5 e 32, a versão de firmware e o perfil ativo. A atualização de firmware passa por uma DLL da JieLi via `ffi` e fica fora deste projeto.

### 3. Ler os codecs

O resto do protocolo saiu destes trechos, listados em [Onde está cada parte](#onde-está-cada-parte):

- **Report de estado `0x12`**: bateria, botões, analógicos e LEDs. O controle só manda enquanto recebe heartbeat, que o app envia a cada 1 s com a janela em foco.
- **Fila de comandos**: um comando por vez, reenvio a cada 200 ms, até 10 tentativas.
- **Perfil de luz (32)**: 635 bytes, quatro animações do usuário e uma de carregamento, cada uma com até 8 quadros de cor por zona. Os nomes das zonas e dos presets vêm da tela de luzes.
- **Perfil de jogo (1–5)**: botões, macros, gatilhos, analógicos e giroscópio.

O layout de cada um está em [Protocolo](protocolo.md).

### 4. Conferir no controle

O app nem sempre confere o que recebe, e às vezes define campos que não usa. Por isso cada comportamento foi testado no controle, e quando os dois discordavam o controle era usado como fonte de verdade. As diferenças estão em [Verificação no hardware](#verificação-no-hardware).

## Onde está cada parte

| Parte | Local |
|---|---|
| Tabela de dispositivos: VID, PIDs e classe de cada modelo | `main.app.js:34212` |
| Classe do Cyclone 2: eventos da interface → pacotes HID | `main.app.js:8053` |
| Montagem dos comandos | `main.app.js:7409` |
| Leitura das respostas | `main.app.js:7801` |
| Fila de envio: um comando por vez, reenvio a cada 200 ms, 10 tentativas | `main.app.js:7744` |
| Heartbeat: a cada 1 s, só com a janela em foco | `main.app.js:717` |
| Codec do perfil de luz | `main.app.js:7923` |
| Codec do perfil de jogo | `main.app.js:6965`; decoders em 366–635 |
| Report de estado | `main.app.js:825`, `7986`, `8276` |
| Versão de firmware | `main.app.js:7102` |
| Tela de luzes e presets | `renderer.js:135161`, `28100` |
| Tela de macro: Single Press, Long Press, loop | `renderer.js:13521`, `14910` |

## Outros controles

A tabela de dispositivos divide os controles em duas famílias, e só uma delas dá para seguir pelo JavaScript.

| Família | Modelos | Comunicação |
|---|---|---|
| `0x0F` | Cyclone 2, Tegenaria Lite, Tarantula CE (8K), G7 Pro 8K, G7 Pro S, K2 8K | o protocolo de [protocolo.md](protocolo.md). Cada modelo tem uma cópia do código de montagem de pacotes, e todas geram os mesmos bytes |
| DLL `sapjoyuniapis` | Tarantula Pro, Super Nova, Nova 2 Lite, Nova Vision, T3XS | DLLs x86 fechadas, chamadas via `ffi`; o protocolo não aparece no JavaScript |

Dentro da família `0x0F`, o que muda de um modelo para outro é sobretudo o perfil:

| | Cyclone 2 | Tarantula CE | G7 Pro 8K / S | K2 8K |
|---|---|---|---|---|
| Perfil de jogo / luz (bytes) | 680 / 635 | 1935 / 109 | 1070 / 169 | 1408 / 329 |
| Modelo de luz | keyframes RGB | modos HSV | modos HSV | modos HSV |
| Botões traseiros com macro | L4, R4 | 9 (FL1, FR1, Ext1–7) | 4 | 6 |
| Argumento da gravação de macro | índice do botão | código de tecla | código de tecla | código de tecla |
| Comandos extras | — | calibração `0F FE`, centro do analógico `0F E2` | calibração `0F FE`, `0F E2` | calibração `0F FE` |

O Tegenaria Lite não tem perfis no app: só vibração e teste de botões, com o estado chegando como `10 14`. A lib implementa só o Cyclone 2; o núcleo (`GameSirController`) serve à família inteira.

## Verificação no hardware

Cyclone 2 com firmware 3.4.6, pelo dongle `0x100B` (firmware 1.2.1) e pelo cabo `0x1053`, no Windows. Cada comportamento foi exercitado no controle com a lib e comparado com o código do app.

Os codecs dos perfis foram conferidos com um dump real (`lib/test/fixtures/dump-dongle-fw346.json`): decodificar e recodificar devolve os mesmos bytes.

O que o código do app divergia:

| Ponto | Medido |
|---|---|
| Report ID das respostas | `0x10`; o app não confere esse byte |
| Resposta a `03` e `07` | `10 06 00` |
| Bytes 54–62 do report de estado | entradas físicas; os bytes 1–9 saem com o mapeamento do perfil |
| IMU | contador no byte 11, giroscópio em 13–18, acelerômetro em 19–24; eixos e escalas em [protocolo.md](protocolo.md#imu) |
| Ritmo do report de estado | no cabo, segue a taxa de report do perfil (250 → 251/s, 1000 → 1000/s); pelo dongle, ~200/s |
| `delay` dos passos de macro | conta do início de um passo ao início do próximo |
| Loop de macro | recomeça depois do fim do último passo |
| Long Press | soltar o botão interrompe a macro na hora |
| Gravação pelo controle | termina com `0F 16 k 02` ou ao chegar em 30 passos; um passo só vira mapeamento simples |
| LEDs | `UpperRight` é a coluna de 4 LEDs entre os analógicos: a cor vem da zona, a quantidade acesa é o perfil de jogo ativo (1 = só o de cima); `UpperLeft` não tem LED; `ProfileLed` não muda nenhum LED |
| PID `0x0575` | dongle sem controle conectado |
| Desconexão | o `node-hid` emite `error` quando o controle some; sem listener, o processo Node termina |

## Limites

- **Sem significado conhecido**: report `0x12`: bytes 10, 12 e 25–34 · perfil de luz: `UserEffectIndex` · perfil de jogo: campos de áudio
- **Não verificado**: PIDs `0x101D` e `0x102A` · `0F 16 k 00` (cancelar gravação) · `0F FD` (calibração) · gravação de "device id"
- **Fora do escopo**: atualização de firmware · Bluetooth · controles da família DLL
