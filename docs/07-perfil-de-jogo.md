# 07 · Perfil de jogo (perfis 1–4 e Shift, 680 bytes)

Fontes: codec `Uo` (`main.app.js:6965`), decoders `O`/`N`/`M`/`K` (`main.app.js:366`–`635`). Lib: `decodeGameProfile` / `encodeGameProfile`.

Mesmo layout para 1–4 e Shift (5). Shift = camada ativa enquanto o botão mapeado como Shift (código 231) estiver pressionado.

Convenções: booleanos lidos pelo bit 0 e gravados como 1/0 · 16 bits em **big-endian** · `+n` = offset relativo ao bloco.

## Mapa

| Offset | Tam. | Bloco |
|---|---|---|
| 0 | 32 | nome |
| 32 | 32 | Fun_Data |
| 64 | 16 × 7 | botões |
| 176 | 159 | L4 (FL1) + macro |
| 335 | 159 | R4 (FR1) + macro |
| 494 | 28 | LT |
| 522 | 28 | RT |
| 550 | 32 | analógico esquerdo |
| 582 | 32 | analógico direito |
| 614 | 33 | giroscópio Aim |
| 647 | 33 | giroscópio Tilt |

## Nome (0–31)

UTF-8, completado com `00`. Bug do app: nome > 32 B é cortado em 31 e a imagem fica com 679 B. A lib recusa nomes > 31 B.

## Fun_Data (32–63)

| Offset | Campo | Valores |
|---|---|---|
| 32–35 | motor esquerdo, direito, LT, RT | 0/25/50/75/100 (UI: 0–4, padrão 3); C2 só edita esquerdo/direito |
| 36 | áudio ligado | bit 0; fora da UI do C2 |
| 37–40 | volume, mixer, mic mudo, sensibilidade do mic | desconhecido |
| 41–42 | shift ligado, valor | fora da UI do C2 |
| 43 | trava de diagonais do D-pad | bit 0 |
| 44 | troca ABXY no XInput | bit 0 |
| 45 | troca ABXY no Switch | bit 0 |
| **46** | **taxa de report** | **0 = 250 Hz, 1 = 500 Hz, 2 = 1000 Hz** |
| 47–63 | reservado | devolvido como lido |

## Botões (64–175)

16 blocos de 7 B, nesta ordem (`Fo`):

`Up, Down, Left, Right, LB, RB, LS, RS, A, B, X, Y, Home, View, Menu, Capture`

| +0 | +1 | +2 | +3..+5 | +6 |
|---|---|---|---|---|
| turbo ligado | turbo 0–30 Hz | mapeamento ligado | até 3 códigos de tecla (combo) | toggle |

A UI do C2 não permite remapear Home.

### Códigos de tecla

Tabela completa em `lib/src/keycodes.ts` (gerada do `ko`).

| Faixa | Conteúdo |
|---|---|
| 1–20 | Up, Down, Left, Right, LB, RB, LS, RS, A, B, X, Y, Home, View, Menu, Capture, L4, R4, LT, RT |
| 21–28 | direções dos analógicos |
| 50–155 | teclado |
| 200–206 | mouse (204 = botão 4, 203 = botão 5) |
| 230 / 231 / 255 | Mute / Shift / desativado |

## L4 / R4 (159 B)

| Offset | Campo |
|---|---|
| +0..+6 | igual a botão |
| +7 | bit 0 macro ligada · bit 1 "segurar para executar" · bit 2 loop |
| +8..+9 | intervalo do loop, ms |
| +10 | nº de passos, 0–30 |
| +11..+155 | passos 1–29: `tecla, hold ms (2 B), delay ms (2 B)` |
| +156..+158 | passo 30: `tecla, hold ms` — **sem delay** |

## Gatilhos LT / RT (28 B)

| Offset | Campo |
|---|---|
| +0..+1 | turbo ligado, velocidade |
| +2..+6 | deadzone |
| +7..+10 | mapeamento ligado + 3 teclas |
| +11 | toggle |
| +12 | hair trigger: **bit 7 ligado**, bits 0–1 modo (1 Rapid, 2 Fix) |
| +13..+14 | faixa do hair trigger, 1–100 |
| +15..+27 | curva |

Padrão de reset: deadzone 5–95, hair trigger desligado, modo 1, faixa 1–100.

## Deadzone (5 B)

`ligada, início, fim, anti-início, anti-fim` — % 0–100. Padrão sticks: 10/100/0/100.

## Curva (13 B)

`ligada, tipo, curvatura, x1,y1 … x5,y5`

| | |
|---|---|
| Tipo | 0 linear, 1 curva, 2 S, 3 personalizada |
| Curvatura | 0–100, tipos 1 e 2 |
| Pontos | 0–255 dentro da faixa da deadzone; (x1,y1) = (0,0), (x5,y5) = (255,255) |
| Conversão da UI (%) | `x = início + px/255 × (fim − início)`; y idem com a anti-deadzone |

## Analógicos (32 B)

| Offset | Campo |
|---|---|
| +0 | ligado |
| +1 | traçado: 0 radial, ≠0 "Raw" |
| +2..+6 | deadzone |
| +7..+19 | curva |
| +20..+31 | mapeamento de eixo |

## Giroscópio Aim / Tilt (33 B)

| Offset | Campo |
|---|---|
| +0 | ativação: 0 desligado, 1 segurar botão, 2 alternar com botão, 3 sempre |
| +1 | código da tecla de ativação |
| +2 | eixos: bit 0 Roll, bit 1 Yaw |
| +3..+7 | deadzone |
| +8..+20 | curva |
| +21..+32 | mapeamento de eixo |

## Mapeamento de eixo (12 B)

| +0 | +1 | +2 | +3 | +4 | +5 | +6 | +7..+10 | +11 |
|---|---|---|---|---|---|---|---|---|
| ligado | inverte X | inverte Y | proporção eixos 0–100 | DPI mouse 0–100 | saída | cross | teclas ↑ ↓ ← → | contorno |

Saída: 1 analógico esquerdo, 2 analógico direito, 3 teclas, 4 mouse.

## Lib

```ts
const p = await pad.readGameProfile(1);
p.fun.reportRate = ReportRate.Hz1000;
p.buttons.A = { ...p.buttons.A, mapEnabled: true, mapTo: [KeyCode.B, 0, 0] };
p.L4.macro = { enabled: true, holdToTrigger: false, loop: false, loopMs: 0,
               steps: [{ key: KeyCode.A, holdMs: 50, delayMs: 50 }, { key: KeyCode.B, holdMs: 50, delayMs: 0 }] };
await pad.writeGameProfile(1, p);                  // envia só o trecho alterado

await pad.remapButton(1, "X", KeyCode.Y);
await pad.setReportRate(1, ReportRate.Hz500);
```

Não verificado contra um dump real (`lib/examples/dump-profiles.ts`).
