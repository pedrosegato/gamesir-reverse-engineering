# 01 · Metodologia

## Entrada

| | |
|---|---|
| App | GameSir Connect 1.16.7 (Electron), autor *Guangzhou Chicken Run Network Technology Co., Ltd* |
| Extração | `app.asar` → `decompiled/` |
| `dist/electron/main.js` | 944 KB, 1 linha, webpack 4 — toda a comunicação HID |
| `dist/electron/renderer.js` | 5,1 MB, 21 linhas, Vue 2 + Vuex — interface |
| Ferramentas | Node 22, Prettier 3.8.1, scripts Python de `example-scripts/` (validação no hardware) |

## Preparação

```bash
./tools/prepare-analysis.sh
```

| Saída (`analysis/`, fora do git) | Conteúdo |
|---|---|
| `main-modules/m<N>.js` + `INDEX.tsv` | 252 módulos do `main.js` |
| `main.app.js` | módulo 251 formatado (37,8 mil linhas) = código do app; os outros módulos são dependências |
| `renderer.js` | renderer formatado (177 mil linhas) |

- `tools/split-webpack.cjs` troca o `t(t.s=251)` do bootstrap por um `return` do array de módulos: nenhum módulo é executado.
- Prettier fixado: as referências `arquivo:linha` dos docs apontam para esses arquivos.

## Caminho até o protocolo

| Passo | Onde |
|---|---|
| Buscar VID `13623` (`0x3537`) e usage page `65520` (`0xFFF0`) | leva à tabela de dispositivos |
| Entrada `Model: "C2"` → `Proxy: new ou(...)` | `main.app.js:34212` |
| Proxy do C2: eventos da UI → pacotes | `main.app.js:8053` |
| Builder de comandos `ps` | `main.app.js:7409` |
| Parser de respostas `ks` | `main.app.js:7801` |
| Codec do perfil de luz `Ks` | `main.app.js:7923` |
| Codec do perfil de jogo `Uo` / conversor `Co` | `main.app.js:6965` |
| Tela de luzes / presets (nomes oficiais, semântica) | `renderer.js:135161` / `renderer.js:28100` |

## Validação

- Testes da lib (`lib/test/`) reproduzem byte a byte os pacotes dos scripts Python.
- O que não passou pelo controle está marcado como **não verificado**.
