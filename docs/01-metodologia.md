# 01 · Metodologia

Como o GameSir Connect foi aberto e lido, de um jeito que dê pra repetir.

## Ponto de partida

- **App:** GameSir Connect `1.16.7` (`decompiled/package.json`), Electron. O autor declarado é *Guangzhou Chicken Run Network Technology Co., Ltd*.
- **Controle:** GameSir Cyclone 2, ligado por cabo, dongle 2.4 GHz ou Bluetooth.
- **Ferramentas:** Node 22, Prettier 3.8.1 e os scripts Python de `example-scripts/`, que serviram pra validar as hipóteses no hardware.

O `app.asar` do app instalado foi extraído para `decompiled/`. O código está em dois bundles webpack 4 minificados:

| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `decompiled/dist/electron/main.js` | 944 KB, 1 linha | Processo principal: toda a comunicação HID |
| `decompiled/dist/electron/renderer.js` | 5,1 MB, 21 linhas | Interface (Vue 2 + Vuex) |

## Preparação

```bash
./tools/prepare-analysis.sh
```

O script gera `analysis/`, que fica fora do git:

- `analysis/main-modules/m<N>.js`: cada um dos 252 módulos do `main.js`, extraídos por `tools/split-webpack.cjs` **sem executar nenhum módulo**. O script troca o `t(t.s=251)` do bootstrap por um `return` do array de módulos.
- `analysis/main.app.js`: o módulo 251 formatado (37,8 mil linhas). É o código do próprio app. Os outros módulos são dependências (`node-hid`, `electron-log`, `vuex`…).
- `analysis/renderer.js`: o renderer formatado (177 mil linhas).

As referências `main.app.js:LINHA` nesta documentação apontam para esses arquivos. A versão do Prettier está fixada no script pra numeração ser sempre a mesma.

## Como o protocolo foi encontrado

1. **Âncoras numéricas.** O VID `0x3537` aparece no código como `13623`, e a usage page `0xFFF0` como `65520`. Buscar esses números leva direto à tabela de dispositivos.
2. **Tabela de dispositivos.** A entrada `Model: "C2"` (`main.app.js:34212`) lista os PIDs de cada modo de conexão e aponta para a classe que conversa com o controle: `Proxy: (e, t, r) => new ou(e, t, r)`.
3. **Proxy `ou`** (`main.app.js:8053`). Mostra os eventos que a interface dispara (`saveProfile`, `vibrate`, `reqSetLightStatus`…) e quais pacotes cada um envia.
4. **Montador de comandos `ps`** (`main.app.js:7409`). Cada método devolve os bytes de um comando.
5. **Classificador de respostas `ks`** (`main.app.js:7801`). Traduz o byte 1 de cada resposta num tipo (`Ack`, `ReadProfileAck`, `ProfileChanged`…).
6. **Codecs.** `Ks` é o perfil de luz (`main.app.js:7923`) e `Uo`/`Co` são o perfil de jogo (`main.app.js:6965`). Eles mostram o layout byte a byte dos perfis.
7. **Renderer.** Mostra como a interface monta efeitos e o nome oficial de cada campo.

## Validação

- **Testes da lib** (`lib/test/`). Os codecs precisam reproduzir byte a byte os pacotes que os scripts Python, já testados no controle, montam.
- **Hardware.** Toda afirmação que ainda não passou pelo controle está marcada como **não verificada** na documentação.
