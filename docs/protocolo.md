# Protocolo HID do Cyclone 2

Protocolo de configuração usado pelo GameSir Connect 1.16.7. Valores em hexadecimal, offsets a partir de 0, inteiros de 16 bits em big-endian (exceto a IMU, little-endian).

## Dispositivo

VID `0x3537`.

| PID | Conexão |
|---|---|
| `0x100B` | dongle 2.4 GHz |
| `0x102A` | dongle 2.4 GHz (não verificado) |
| `0x1053` | cabo, firmware 3.x |
| `0x101D` | cabo, firmware 1.x (não verificado) |
| `0x0575` | dongle sem controle conectado; não responde a comandos |

Coleções HID, iguais no dongle e no cabo:

| Interface | Usage page / usage | Função |
|---|---|---|
| 0 | `0x0001` / `0x0005` | gamepad (XInput) |
| 1 | `0xFFF0` / `0x0040` | configuração: tudo deste documento |
| 1 | `0x0001` / `0x0006`, `0x0001` / `0x0002`, `0x000C` / `0x0001` | teclado, mouse e mídia, usados por mapeamentos |

O dispositivo se apresenta como "Xbox 360 Controller for Windows". O app não suporta Bluetooth.

## Pacotes

Todo report tem 64 bytes; o byte 0 é o report ID.

| Report ID | Sentido | Formato |
|---|---|---|
| `0x0F` | host → controle | `0F <cmd> <args…>`, resto zerado |
| `0x10` | controle → host | `10 <cmd> …`: resposta ou notificação |
| `0x12` | controle → host | estado, enviado continuamente enquanto houver heartbeat |

Sessão:

- Heartbeat `0F F2 00` a cada 1 s. Sem ele, o controle para de enviar `0x12`. `0F F2 01` ativa o modo de teste de botões.
- Um comando por vez. Sem resposta em 200 ms, reenviar; desistir após 10 envios.
- `10 06 01` = ocupado: reenviar.
- `10 0E` e `10 0F` são notificações, não respostas.
- `0D` (LED), `16` (gravação de macro) e `20` (vibração) não têm resposta.

## Comandos

`n` = perfil · `oH oL` = offset · `len` ≤ 58.

| Cmd | Envio | Resposta | Função |
|---|---|---|---|
| `03` | `0F 03 n oH oL len data…` | não verificado | grava `len` bytes no perfil `n` |
| `04` | `0F 04 n oH oL len` | `10 05 n oH oL len data…` | lê `len` bytes do perfil `n` |
| `07` | `0F 07 n` | não verificado | ativa o perfil de jogo `n` (1–4; 5 = Shift) |
| `09` | `0F 09` | `10 0A …` | versões de firmware |
| `0B` | `0F 0B` | `10 0C n` | perfil de jogo ativo |
| `0D` | `0F 0D p f` | — | luz: `p = 1` toca a animação; `p = 0` pausa no frame `f` (base 1) |
| `10` | `0F 10 n oH oL len` | `10 11 n oH oL len data…` | igual ao `04` |
| `16` | `0F 16 k s` | `10 0F` ao terminar | gravação de macro pelo controle: `k` 1 = L4, 2 = R4; `s` 0 cancela, 1 inicia, 2 para |
| `20` | `0F 20 66 55 L R` | — | vibração, `L` e `R` de 0 a 255 |
| `F2` | `0F F2 m` | — | heartbeat |
| `17` | `0F 17 55 88` | — | entra em atualização de firmware |
| `FC` | `0F FC` | — | entra em modo DFU |
| `FD` | `0F FD s` | — | calibração; o app nunca envia (não verificado) |

**Notificação `10 0F n oH oL lenH lenL`**: o controle alterou `len` bytes do perfil `n` a partir de `offset` (troca de animação pelo botão M, fim de gravação de macro). `n = 48` indica o perfil ativo.

Definidos no app e nunca enviados: `0F 04 n 03 9D 07` (ler "device info", offset 925), `0F 03 n 03 9E 06 <6 ASCII>` (gravar "device id"), `0F 01` e `0F 02 s` (entrar e sair de configuração).

### Versão de firmware

```
10 0A 30 00 33 00 34 00 36 00 30 00 31 00 32 00 31 00
      └───── "0346" ──────────┘ └───── "0121" ──────────┘   UTF-16LE
```

Bytes 2–9: controle. Bytes 10–17: dongle, zerados no cabo. A versão são os dígitos após o primeiro: `"0346"` → 3.4.6.

## Report de estado `0x12`

Frequência: no cabo, a taxa de report do perfil ativo (250, 500 ou 1000 Hz); pelo dongle, cerca de 200 por segundo.

| Byte | Bits | Campo |
|---|---|---|
| 1, 2 | | analógico esquerdo X, Y: 0–255, centro 128, Y cresce para baixo |
| 3, 4 | | analógico direito X, Y |
| 5 | 0–3 | D-pad: 0 ↑, 1 ↗, 2 →, 3 ↘, 4 ↓, 5 ↙, 6 ←, 7 ↖, `F` solto |
| 5 | 4, 5, 6, 7 | X, A, B, Y |
| 6 | 0–7 | LB, RB, LT, RT (digitais), View, Menu, LS, RS |
| 7 | 0, 1 | Home, Capture |
| 8, 9 | | LT, RT analógicos, 0–255 |
| 11 | | contador da IMU, 8 bits |
| 13–18 | | giroscópio X, Y, Z (int16 LE) |
| 19–24 | | acelerômetro X, Y, Z (int16 LE) |
| 35 | | 1 = carregando |
| 36 | | bateria, % |
| 37 | | animação de luz ativa, 0–3 |
| 38–52 | | cor exibida em cada LED, RGB, nesta ordem: Home, LowerLeft, LowerRight, UpperLeft, UpperRight |
| 53 | 0, 1 | gravando macro |
| 53 | 4, 5 | gravação no L4, no R4 |
| 54–62 | | entradas físicas, no mesmo layout dos bytes 1–9 |
| 60 | 3, 4, 5 | L4, R4, M |

- Bytes 1–9 já saem com o mapeamento do perfil: com A remapeado para B, apertar A aparece como B. Os bytes 54–62 trazem o botão físico.
- As cores de 38–52 são as do instante, com animação e brilho aplicados.
- Sem significado conhecido: bytes 10, 12 e 25–34.

### IMU

Valores crus, sem calibração. Eixos com o controle deitado, botões para cima:

| Eixo | Aponta para | Giroscópio positivo quando |
|---|---|---|
| X | a lateral direita | a frente sobe |
| Y | fora da face | o controle gira no sentido anti-horário, visto de cima |
| Z | trás (quem segura) | a lateral direita sobe |

| | |
|---|---|
| Acelerômetro | 8192 LSB/g (±4 g). Offset: X +0,09 g, Y +0,02 g, Z −0,16 g |
| Giroscópio | cerca de 16,4 LSB por °/s (±2000 °/s, estimado). Em repouso: ≈ (8, 1, 6) |
| Contador | cerca de 780 por segundo; dá a volta em 255 |

## Perfis

| `n` | Tamanho | Conteúdo |
|---|---|---|
| 1–4 | 680 | perfil de jogo |
| 5 | 680 | camada Shift: ativa enquanto o botão mapeado como Shift estiver pressionado |
| 32 | 635 | perfil de luz |

- Leitura e escrita em blocos de até 58 bytes (64 menos 6 de cabeçalho).
- Cada `03` vale na hora. Não existe comando de salvar.
- O app grava só o intervalo entre o primeiro e o último byte alterado.

### Perfil de luz (32)

| Offset | Tam. | Campo |
|---|---|---|
| 0 | 1 | animação ativa, 0–3 |
| 1 + 124·a | 124 | animação `a`: 0–3 são do usuário, 4 é o efeito de carregamento |
| 621 | 1 | bit 0: reage ao áudio |
| 622 | 1 | `UserEffectIndex`, sem uso conhecido |
| 623–625 | 3 | `ProfileLed` RGB, sem uso conhecido |
| 626 | 1 | bit 0: acorda ao levantar |
| 627 | 1 | minutos até dormir: 0 (nunca), 1, 5, 10 ou 20 |
| 628–634 | 7 | reservado |

Animação, 124 bytes:

| Offset | Campo |
|---|---|
| +0 | número de frames, 1–8 |
| +1 | sempre 5 |
| +2 | 20 − velocidade (velocidade 0–20, maior = mais rápido) |
| +3 | brilho, 0–100 |
| +4 + 15·f | frame `f` (0–7): 5 cores RGB |

Cores dentro do frame, em ordem diferente da do report `0x12`:

| Posição | Bytes | Zona | LED |
|---|---|---|---|
| 0 | +0..+2 | LowerLeft | lateral esquerda |
| 1 | +3..+5 | LowerRight | lateral direita |
| 2 | +6..+8 | UpperLeft | sem LED |
| 3 | +9..+11 | Home | botão Home |
| 4 | +12..+14 | UpperRight | centro, junto ao botão M |

![Tela de luzes do app: ① LowerLeft, ② Home, ③ LowerRight, ④ UpperRight](img/c2-luzes-app.png)

- No controle, M + analógico esquerdo ←/→ troca a animação ativa; o controle notifica com `10 0F`.
- Para apagar, use um frame preto; não existe flag de desligar.
- Os presets do app (Flow, Rainbow, Pulse, Standoff, Alarm, Off) só preenchem frames e velocidade de uma animação. As cores estão em `lib/src/presets.ts`.

### Perfil de jogo (1–5)

Booleanos usam o bit 0. `+n` é relativo ao início do bloco.

| Offset | Tam. | Bloco |
|---|---|---|
| 0 | 32 | nome, UTF-8 terminado em `00` (até 31 bytes) |
| 32 | 32 | configurações gerais |
| 64 | 16 × 7 | botões |
| 176 | 159 | L4 e macro |
| 335 | 159 | R4 e macro |
| 494 | 28 | LT |
| 522 | 28 | RT |
| 550 | 32 | analógico esquerdo |
| 582 | 32 | analógico direito |
| 614 | 33 | giroscópio "Aim" |
| 647 | 33 | giroscópio "Tilt" |

#### Configurações gerais (32–63)

| Offset | Campo |
|---|---|
| 32–35 | vibração dos motores esquerdo, direito, LT e RT: 0, 25, 50, 75 ou 100 |
| 36–40 | áudio: ligado, volume, mixer, mic mudo, sensibilidade (sem efeito conhecido) |
| 41–42 | shift: ligado, valor |
| 43 | trava de diagonais do D-pad |
| 44 | troca ABXY no modo XInput |
| 45 | troca ABXY no modo Switch |
| 46 | taxa de report: 0 = 250 Hz, 1 = 500 Hz, 2 = 1000 Hz |
| 47–63 | reservado |

#### Botões (64–175)

16 blocos de 7 bytes, na ordem `Up, Down, Left, Right, LB, RB, LS, RS, A, B, X, Y, Home, View, Menu, Capture`.

| +0 | +1 | +2 | +3..+5 | +6 |
|---|---|---|---|---|
| turbo ligado | turbo, Hz (0–30) | mapeamento ligado | até 3 códigos de tecla, pressionados juntos | toggle |

Códigos de tecla (tabela completa em `lib/src/keycodes.ts`): 1–20 botões do controle (incluindo L4, R4, LT, RT), 21–28 direções dos analógicos, 50–155 teclado, 200–206 mouse, 230 Mute, 231 Shift, 255 desativado.

#### L4 e R4 (159 bytes cada)

| Offset | Campo |
|---|---|
| +0..+6 | igual a um botão |
| +7 | bit 0 macro ligada · bit 1 Long Press · bit 2 loop |
| +8..+9 | intervalo do loop, ms |
| +10 | número de passos, 0–30 |
| +11..+155 | passos 1–29: `tecla, hold (2 B), delay (2 B)`, em ms |
| +156..+158 | passo 30: `tecla, hold` (sem delay) |

Execução:

| | |
|---|---|
| `delay` | do início do passo ao início do próximo; se for menor que o `hold`, os passos se sobrepõem |
| Loop | recomeça `intervalo` ms depois do fim do último passo |
| Single Press (bit 1 = 0) | um toque executa a sequência inteira; outro toque interrompe; com loop, repete até o próximo toque |
| Long Press (bit 1 = 1) | executa enquanto o botão estiver pressionado; soltar interrompe na hora; com loop, repete enquanto pressionado |

O app grava macros com o mapeamento do botão desligado (`+2` = 0).

**Gravação pelo controle (`0F 16`)**: o byte 53 do `0x12` indica a gravação em curso. Cada aperto vira um passo, com hold e delay medidos; direções de analógico também entram. A gravação para sozinha em 30 passos. Ao terminar, o controle grava o bloco do botão e notifica (`10 0F 01 00 B0 00 9F` para o L4 no perfil 1). Uma gravação de um passo só vira mapeamento simples.

#### Gatilhos LT e RT (28 bytes cada)

| Offset | Campo |
|---|---|
| +0..+1 | turbo ligado, velocidade |
| +2..+6 | deadzone |
| +7..+10 | mapeamento ligado, 3 teclas |
| +11 | toggle |
| +12 | hair trigger: bit 7 ligado; bits 0–1 modo (1 Rapid, 2 Fix) |
| +13..+14 | faixa do hair trigger, 1–100 |
| +15..+27 | curva |

#### Analógicos e giroscópio

| Bloco | Layout |
|---|---|
| Analógico (32 B) | +0 ligado · +1 traçado (0 radial, outro valor "Raw") · +2..+6 deadzone · +7..+19 curva · +20..+31 mapeamento de eixo |
| Giroscópio (33 B) | +0 ativação (0 desligado, 1 segurar botão, 2 alternar, 3 sempre) · +1 tecla de ativação · +2 eixos (bit 0 Roll, bit 1 Yaw) · +3..+7 deadzone · +8..+20 curva · +21..+32 mapeamento de eixo |

#### Sub-blocos

| Sub-bloco | Bytes |
|---|---|
| Deadzone (5 B) | ligada, início, fim, anti-início, anti-fim, em % (0–100) |
| Curva (13 B) | ligada, tipo (0 linear, 1 curva, 2 S, 3 personalizada), curvatura (0–100), 5 pontos (x, y) de 0–255 dentro da deadzone |
| Mapeamento de eixo (12 B) | ligado, inverte X, inverte Y, proporção dos eixos (0–100), DPI do mouse (0–100), saída (1 analógico esquerdo, 2 analógico direito, 3 teclas, 4 mouse), cross, teclas ↑ ↓ ← →, contorno |
