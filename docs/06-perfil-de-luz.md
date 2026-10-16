# 06 · Perfil de luz (perfil 32, 635 bytes)

Codec no main: `Ks` (`main.app.js:7923`). Editor no renderer: módulo 1997 (`renderer.js:135161`, rota `/C2/profileInfo/rgb`). Presets: módulo 72 (`renderer.js:28100`).

## Conceito

O Cyclone 2 não tem "modos de efeito" fixos. Ele guarda **5 animações por keyframes** e toca uma delas:

- **Animações 0–3:** os 4 slots que o app mostra ("Animations"). No controle, **M + analógico esquerdo para os lados** troca entre eles.
- **Animação 4:** "Charging Light Effect", o efeito de carregamento. O app do Cyclone 2 não mostra esse slot e nunca o edita.
- Cada animação tem até **8 frames**. Cada frame tem uma cor por zona de LED. O controle passa pelos frames na velocidade da animação.
- "Flow", "Rainbow" etc. são só **presets do app**: eles preenchem os frames de um slot. Não existe flag de "desligado". "Off" é um frame todo preto.

## Layout

| Offset | Tamanho | Campo | Valores |
|---|---|---|---|
| 0 | 1 | `ConfigIndex` | animação ativa, 0–3 (o app lê > 3 como 0) |
| 1 + 124·a | 124 | animação `a` (0–4) | ver abaixo |
| 621 | 1 | `AudioReactiveMode` | bit 0. "Audio Reactive Mode" |
| 622 | 1 | `UserEffectIndex` | o app não usa. **Desconhecido** |
| 623–625 | 3 | `ProfileLed` R,G,B | o app não usa. **Desconhecido** |
| 626 | 1 | `RaiseWakeUp` | bit 0. "Pick up to wake" |
| 627 | 1 | `StandbyTime` | minutos até dormir: 0 (nunca), 1, 5, 10, 20 |
| 628–634 | 7 | reservado | o app devolve como recebeu |

### Animação (124 bytes)

| Offset relativo | Campo | Valores |
|---|---|---|
| +0 | `KeyFrameCount` | frames tocados, 1–8 |
| +1 | `EffectCount` | o app nunca altera. Vale 5 (número de zonas) |
| +2 | velocidade | **byte = 20 − velocidade**. Na UI a velocidade vai de 0 a 20, e maior é mais rápido. No byte, 0 é o mais rápido |
| +3 | `Brightness` | 0–100 |
| +4 + 15·f | frame `f` (0–7) | 5 × RGB, na ordem abaixo |

### Ordem das zonas dentro do frame

⚠️ **A ordem do frame é diferente da ordem do report de estado** (`convertFrame`, `renderer.js:135365`).

| Slot no frame | Bytes | Nome no app | No Cyclone 2 | Nº na tela de luzes |
|---|---|---|---|---|
| 0 | +0..+2 | `LowerLeft` | lateral esquerda | 1 |
| 1 | +3..+5 | `LowerRight` | lateral direita | 3 |
| 2 | +6..+8 | `UpperLeft` | **sem LED** (o app não deixa editar) | — |
| 3 | +9..+11 | `Home` | botão Home | 2 |
| 4 | +12..+14 | `UpperRight` | luz 4 | 4 |

No report `0x12`, a ordem é `Home, LowerLeft, LowerRight, UpperLeft, UpperRight`.

A UI numera as luzes como 1, 2, 3, 4 = slots 0, 3, 1, 4 (`updateRGB`, `renderer.js:135400`). Isso confirma o que o `gamesir_rgb_battery.pyw` já tinha achado no hardware: **o slot 3 é o Home**. Sobre a luz 4: o espelho ao vivo do app desenha essa cor em 4 barrinhas que indicam o perfil ativo (1–4). A posição física dela ainda **precisa ser confirmada** no controle.

## Presets do app

Velocidade na escala da UI. O preset muda só velocidade, `KeyFrameCount` e frames do slot selecionado. Brilho e `EffectCount` ficam como estavam, e os frames depois do último são preenchidos com preto.

| Preset | Velocidade | Frames | Descrição |
|---|---|---|---|
| Flow | 17 | 5 | uma cor diferente por zona em cada frame. É o padrão do reset |
| Rainbow | 10 | 8 | todas as zonas iguais: vermelho → laranja → amarelo → verde → ciano → azul → magenta → vermelho |
| Pulse | 5 | 2 | roxo/rosa ↔ azul. O mais parecido com "respiração" |
| Standoff | 10 | 1 | estático: Home branco, laterais azul/vermelho |
| Alarm | 18 | 6 | vermelho, apagado, vermelho, apagado ×3: pisca rápido |
| Off | 10 | 1 | tudo preto |

As cores exatas estão em `lib/src/presets.ts`, copiadas do app.

## Pré-visualização (`0F 0D`)

Ao abrir a tela de luzes, o app envia `0F 0D 01 01` (tocando). Ao pausar ou selecionar um keyframe, envia `0F 0D 00 n`, onde **`n` é o frame + 1 (base 1)**. O controle fica parado mostrando aquele frame. Ao sair da tela, o app volta a tocar.

As edições não são "ao vivo": cada mudança regrava o perfil de luz (com debounce de 300 ms no app), e o controle mostra o resultado depois da escrita.

## Na lib

```ts
await pad.setStaticColor("#00aaff");                       // todas as zonas, no slot ativo
await pad.setStaticColor({ Home: "#ff0000" });              // só o Home
await pad.applyPreset("Rainbow");                           // preset no slot ativo
await pad.setAnimation(animation([{ Home: "#f00" }, { Home: "#00f" }], { speed: 15 }), { slot: 3 });
await pad.setActiveAnimation(1);                            // igual a M + analógico
await pad.setStandbyTime(5);
await pad.showFrame(0);                                     // pausa no frame 0
await pad.playLights();
```
