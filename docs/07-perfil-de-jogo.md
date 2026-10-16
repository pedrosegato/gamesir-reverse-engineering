# 07 · Perfil de jogo (perfis 1–4 e Shift, 680 bytes)

Codec no main: `Uo` (`main.app.js:6965`), com os decoders por bloco no topo do módulo (`O`, `N`, `M`, `K`, linhas 366–635). O layout é o mesmo para os perfis 1–4 e para o Shift (5). O Shift é uma camada que fica ativa enquanto o botão mapeado como "Shift" estiver pressionado.

Na lib: `decodeGameProfile` / `encodeGameProfile` (`lib/src/game-profile.ts`).

## Mapa geral

| Offset | Tamanho | Bloco |
|---|---|---|
| 0 | 32 | nome (UTF-8, terminado em `00`) |
| 32 | 32 | Fun_Data: motores, áudio, opções, taxa de report |
| 64 | 16 × 7 | mapeamento dos 16 botões |
| 176 | 159 | L4 (FL1): mapeamento + macro |
| 335 | 159 | R4 (FR1): mapeamento + macro |
| 494 | 28 | LT |
| 522 | 28 | RT |
| 550 | 32 | analógico esquerdo |
| 582 | 32 | analógico direito |
| 614 | 33 | giroscópio "Aim" |
| 647 | 33 | giroscópio "Tilt" |

Booleanos: o app lê o bit 0 e grava 1/0. Valores de 16 bits são **big-endian**.

## Nome (0–31)

UTF-8 completado com `00`. O app corta nomes com mais de 32 bytes em 31 e, por um bug, a imagem inteira passa a ter 679 bytes. A lib recusa nomes com mais de 31 bytes.

## Fun_Data (32–63)

| Offset | Campo | Valores |
|---|---|---|
| 32–35 | motor esquerdo, direito, LT, RT | 0/25/50/75/100 (a UI mostra 0–4). O C2 só edita esquerdo e direito |
| 36 | áudio ligado | bit 0. Não aparece na UI do C2 |
| 37–40 | volume, mixer, mic mudo, sensibilidade do mic | **desconhecido** no C2 |
| 41–42 | shift ligado, valor | não aparece na UI do C2 |
| 43 | trava das diagonais do D-pad | bit 0 |
| 44 | trocar ABXY no XInput | bit 0 |
| 45 | trocar ABXY no Switch | bit 0 |
| **46** | **taxa de report** | **0 = 250 Hz, 1 = 500 Hz, 2 = 1000 Hz** |
| 47–63 | reservado | o app devolve como recebeu |

## Botões (64–175)

16 blocos de 7 bytes, nesta ordem:

`Up, Down, Left, Right, LB, RB, LS, RS, A, B, X, Y, Home, View, Menu, Capture`

| +0 | +1 | +2 | +3..+5 | +6 |
|---|---|---|---|---|
| turbo ligado | turbo (0–30 Hz) | mapeamento ligado | até 3 códigos de tecla (combo) | toggle |

Os códigos de tecla (`KeyCode` na lib) são: 1–20 botões do controle, 21–28 direções dos analógicos, 50–155 teclado, 200–206 mouse, 230 Mute, 231 Shift e 255 desativado. A tabela completa está em `lib/src/keycodes.ts`, gerada a partir do `ko` do app.

## L4 / R4 com macro (159 bytes)

| Relativo | Campo |
|---|---|
| +0..+6 | igual ao bloco de botão |
| +7 | flags: bit 0 macro ligada, bit 1 "segurar para executar", bit 2 loop |
| +8..+9 | intervalo do loop (ms, BE) |
| +10 | número de passos (0–30) |
| +11.. | passos 1–29: `tecla, hold(ms BE), delay(ms BE)`, 5 bytes cada |
| +156..+158 | passo 30: `tecla, hold(ms BE)`. **Não tem delay** |

## Gatilhos LT / RT (28 bytes)

| Relativo | Campo |
|---|---|
| +0..+1 | turbo ligado, velocidade |
| +2..+6 | deadzone: ligada, início, fim, anti-início, anti-fim (% 0–100) |
| +7..+10 | mapeamento ligado + 3 teclas |
| +11 | toggle |
| +12 | hair trigger: **bit 7 = ligado**, bits 0–1 = modo (1 "Rapid", 2 "Fix") |
| +13..+14 | faixa do hair trigger, início e fim (1–100) |
| +15..+27 | curva (ver abaixo) |

## Curva de resposta (13 bytes)

`ligada, tipo, curvatura, (x1,y1) … (x5,y5)`

- Tipo: 0 linear, 1 curva, 2 S, 3 personalizada. A curvatura (0–100) vale para os tipos 1 e 2.
- Os pontos vão de 0 a 255 **dentro da faixa da deadzone**. O primeiro é sempre (0,0) e o último (255,255). A UI mostra os pontos em % e converte com `x = início + px/255 × (fim − início)`.

## Analógicos (32 bytes)

| Relativo | Campo |
|---|---|
| +0 | ligado |
| +1 | modo do traçado: 0 radial, ≠0 "Raw" |
| +2..+6 | deadzone |
| +7..+19 | curva |
| +20..+31 | mapeamento de eixo (ver abaixo) |

## Giroscópio Aim / Tilt (33 bytes)

| Relativo | Campo |
|---|---|
| +0 | ativação: 0 desligado, 1 segurando botão, 2 alternando com botão, 3 sempre |
| +1 | código da tecla de ativação |
| +2 | eixos: bit 0 Roll, bit 1 Yaw |
| +3..+7 | deadzone |
| +8..+20 | curva |
| +21..+32 | mapeamento de eixo |

## Mapeamento de eixo (12 bytes)

`ligado, inverter X, inverter Y, proporção dos eixos (0–100), DPI do mouse (0–100), saída, cross, tecla ↑, ↓, ←, →, contorno`

Saída: 1 analógico esquerdo, 2 analógico direito, 3 teclas (usa as 4 direções), 4 mouse.

## Na lib

```ts
const p = await pad.readGameProfile(1);
p.fun.reportRate = ReportRate.Hz1000;
p.buttons.A.mapTo = [KeyCode.B, 0, 0];
p.buttons.A.mapEnabled = true;
p.L4.macro = { enabled: true, holdToTrigger: false, loop: false, loopMs: 0,
               steps: [{ key: KeyCode.A, holdMs: 50, delayMs: 50 }, { key: KeyCode.B, holdMs: 50, delayMs: 0 }] };
await pad.writeGameProfile(1, p);   // só o trecho alterado é enviado

await pad.remapButton(1, "X", KeyCode.Y);
await pad.setReportRate(1, ReportRate.Hz500);
```

**Ainda não validado no hardware:** a lib codifica e decodifica com ida e volta exata nos testes, mas falta comparar com um dump real do controle (`lib/examples/dump-profiles.ts`).
