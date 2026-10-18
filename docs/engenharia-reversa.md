# Engenharia reversa

Como o protocolo foi extraído do GameSir Connect e verificado no hardware, e por que este projeto existe.

## Por que

Eu queria ver a bateria do meu Cyclone 2 sem abrir o GameSir Connect só para conferir a porcentagem. A ideia era simples: alguma cor de LED indicando o nível da bateria. Procurei no app uma opção assim e não existe.

Depois procurei uma lib ou um script que lesse a bateria do controle e mudasse os LEDs por código. Também não achei. O protocolo não é documentado, e o único programa que fala com o controle é o próprio app da GameSir.

Então decidi abrir o app. O GameSir Connect é feito em Electron, ou seja, por baixo é JavaScript, e dá para ler. Tirei de lá as funções que conversam com o controle e escrevi o script eu mesmo: o [`battery-led`](../examples/battery-led), que hoje também roda como app de bandeja no Windows. Com o script funcionando, ficou claro que o mesmo caminho servia para controlar o controle inteiro, e o script virou a lib.

## O processo

### 1. Abrir o app

Um app Electron empacota o código num arquivo `app.asar`, que é só um arquivo compactado. Extraído, ele mostra duas partes:

- **App**: GameSir Connect 1.16.7 (Electron)
- **Comunicação HID**: `dist/electron/main.js`, webpack 4, 944 KB em uma linha
- **Interface**: `dist/electron/renderer.js`, Vue 2, 5,1 MB

Toda a comunicação com o controle está no `main.js`. O problema é que ele vem minificado: 944 KB numa linha só, com os 252 módulos do webpack colados. O primeiro trabalho foi separar esses módulos sem executar nenhum e formatar o código, para dar para ler e para apontar linhas.

O repositório não inclui o app. Para reproduzir:

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

### 2. Achar o controle no código

O ponto de partida foram dois números que o Windows já mostra: o vendor ID da GameSir, `0x3537` (13623 em decimal), e a usage page da interface de configuração, `0xFFF0` (65520). Buscar esses valores leva à tabela de dispositivos do app (`main.app.js:34212`), que lista cada modelo com os PIDs dele e a classe que o controla. A entrada do Cyclone 2 aponta para a classe que traduz cada ação da interface em pacotes HID (`main.app.js:8053`).

Essa classe já revela como o app está organizado. Só o processo principal acessa o HID; a interface emite eventos que a classe do modelo traduz em pacotes. Ao conectar o Cyclone 2, a classe envia o heartbeat e lê os perfis 1–5 e 32, a versão de firmware e o perfil ativo. A atualização de firmware usa uma DLL da JieLi via `ffi` e fica fora deste projeto.

### 3. Ler a bateria

O primeiro objetivo era a bateria. Ela não vem de um comando: chega no report de estado `0x12`, que o controle manda sem parar, junto com botões, analógicos e LEDs. O código que lê esse report (`main.app.js:825`, `7986`, `8276`) mostrou onde estão a porcentagem e o indicador de carregamento.

### 4. Mudar a cor

O segundo objetivo era a cor. As luzes moram no perfil de luz (perfil 32), um bloco de 635 bytes que o app lê e grava em pedaços. O codec desse perfil (`main.app.js:7923`) mostrou o layout: quatro animações, cada uma com até 8 quadros de cores por zona. A tela de luzes do app (`renderer.js:135161`) e os presets (`renderer.js:28100`) deram os nomes oficiais das zonas e o que cada preset preenche.

### 5. Manter o estado chegando

Faltava manter o report de estado chegando. O controle não manda esse report por conta própria; ele precisa de sinal de vida, e esse sinal estava na fila de envio do app. O app manda um comando por vez e reenvia a cada 200 ms, até 10 tentativas (`main.app.js:7744`). E manda um heartbeat a cada 1 s, só com a janela em foco (`main.app.js:717`). Sem o heartbeat, o controle entende que ninguém está ouvindo e para de mandar o estado.

### 6. Conferir no controle

Ler o código não basta, porque o app às vezes não confere o que recebe e às vezes nem usa o que define. Cada comportamento foi exercitado no controle com a lib e comparado com o código do app. Quando o controle discordava do código, valia o controle, e a lib e as docs eram corrigidas.

Foi assim que apareceram as surpresas: as respostas chegam com report ID `0x10`, e não `0x0F`; os bytes 54–62 do estado são os botões físicos, antes do mapeamento; o `delay` das macros conta do início de um passo ao início do próximo. A lista completa está em [Verificação no hardware](#verificação-no-hardware).

O resto do perfil de jogo (botões, macros, gatilhos, analógicos e giroscópio) seguiu o mesmo caminho, a partir do codec do perfil de jogo.

## Apêndice

### Onde está cada parte

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

### Outros controles

A tabela de dispositivos mostra que a GameSir tem duas famílias de controle. Uma usa o mesmo protocolo do Cyclone 2. A outra fala com o app por DLLs fechadas, e o protocolo dela não aparece no JavaScript.

| Família | Modelos | Comunicação |
|---|---|---|
| `0x0F` | Cyclone 2, Tegenaria Lite, Tarantula CE (8K), G7 Pro 8K, G7 Pro S, K2 8K | o protocolo de [protocolo.md](protocolo.md). Cada modelo tem uma cópia do código de montagem de pacotes, e todas geram os mesmos bytes |
| DLL `sapjoyuniapis` | Tarantula Pro, Super Nova, Nova 2 Lite, Nova Vision, T3XS | DLLs x86 fechadas, chamadas via `ffi`; o protocolo não aparece no JavaScript |

Dentro da família `0x0F`, os comandos são os mesmos, mas o tamanho e o layout dos perfis mudam de modelo para modelo:

| | Cyclone 2 | Tarantula CE | G7 Pro 8K / S | K2 8K |
|---|---|---|---|---|
| Perfil de jogo / luz (bytes) | 680 / 635 | 1935 / 109 | 1070 / 169 | 1408 / 329 |
| Modelo de luz | keyframes RGB | modos HSV | modos HSV | modos HSV |
| Botões traseiros com macro | L4, R4 | 9 (FL1, FR1, Ext1–7) | 4 | 6 |
| Argumento da gravação de macro | índice do botão | código de tecla | código de tecla | código de tecla |
| Comandos extras | — | calibração `0F FE`, centro do analógico `0F E2` | calibração `0F FE`, `0F E2` | calibração `0F FE` |

O Tegenaria Lite não tem perfis no app: só vibração e teste de botões, com o estado chegando como `10 14`. A lib implementa só o Cyclone 2; o núcleo (`GameSirController`) serve à família inteira.

### Verificação no hardware

Cyclone 2 com firmware 3.4.6, pelo dongle `0x100B` (firmware 1.2.1) e pelo cabo `0x1053`, no Windows. Cada comportamento foi exercitado no controle com a lib e comparado com o código do app.

Os codecs dos perfis foram conferidos com um dump real (`lib/test/fixtures/dump-dongle-fw346.json`): decodificar e recodificar devolve os mesmos bytes.

O que o código do app não dizia, ou dizia errado:

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

### Limites

O que ficou de fora, ou ainda não foi confirmado no controle:

- **Sem significado conhecido**: report `0x12`: bytes 10, 12 e 25–34 · perfil de luz: `UserEffectIndex` · perfil de jogo: campos de áudio
- **Não verificado**: PIDs `0x101D` e `0x102A` · `0F 16 k 00` (cancelar gravação) · `0F FD` (calibração) · gravação de "device id"
- **Fora do escopo**: atualização de firmware · Bluetooth · controles da família DLL
