# 09 · Validação no hardware

O que os docs 03–07 afirmam sobre o Cyclone 2 foi conferido no controle com os exemplos da lib. Este doc reúne o método, o que só o hardware mostrou e o que ficou de fora.

| | |
|---|---|
| Controle | Cyclone 2, firmware 3.4.6 |
| Conexões | dongle `0x100B` (firmware 1.2.1) e cabo `0x1053`, Windows |
| Ciclo | rodar um exemplo → colar a saída → comparar com o código do app → corrigir lib e docs |

## Ferramentas

Todas em `lib/examples/`, rodadas com `npx tsx`.

| Exemplo | Mede |
|---|---|
| `sniff.ts` | coleções HID do VID `0x3537` e respostas cruas a comandos básicos |
| `check.ts` | modo de conexão, firmware, reports `0x12` por segundo, bateria, leitura dos perfis, vibração, LED |
| `dump-profiles.ts` | todos os perfis; virou o fixture `lib/test/fixtures/dump-dongle-fw346.json` |
| `monitor.ts`, `imu.ts` | report de estado ao vivo; IMU a 10 linhas/s |
| `lights.ts`, `vibrate.ts` | escrita do perfil de luz; vibração |
| `game-profile.ts` | `rate`, `remap`, `macro`, `modes`, `record`: escrita do perfil de jogo e macros, sempre restaurando o perfil |
| `probe.ts` | respostas a WriteProfile/SwitchProfile, "device info", parar/cancelar gravação |

## Hipóteses que o hardware corrigiu

| Hipótese (a partir do código) | Medido | Evidência |
|---|---|---|
| Respostas voltam com report ID `0x0F` | voltam com **`0x10`**; o app não confere esse byte | `sniff.ts`: `10 0A …`, `10 0C 01` |
| IMU em 11–22 (6 × int16) | **contador** em 11, giroscópio em 13–18, acelerômetro em 19–24 | contador dá a volta em 255; \|a\| parado ≈ 1 g |
| Bytes 54–62 são uma "cópia crua" | são as **entradas físicas**; 1–9 saem já mapeadas | A → B: apertar A dá B em 1–9 e A no byte 58 |
| `delay` do passo = pausa depois de soltar | **início → início do próximo**; o hold fica dentro | A, B, X, Y a 200/300 ms: inícios a 294–306 ms |
| Taxa de report não muda o `0x12` | no **cabo** muda (250 → 251/s, 1000 → 1000/s); pelo dongle fica em ~200/s | `game-profile.ts rate` nas duas conexões |
| PID `0x0575` desconhecido | é o **dongle sem controle** conectado a ele | apareceu com o controle no cabo e o dongle plugado |

## O que só o hardware mostrou

| Achado | Detalhe | Doc |
|---|---|---|
| Versão de firmware | UTF-16LE: `"0346"` / `"0121"` → 3.4.6 / 1.2.1; no cabo, a parte do dongle vem zerada | [03](03-dispositivo.md) |
| Cabo | PID `0x1053` (linha de firmware 3.x "ADC"), mesmas coleções e protocolo do dongle, `chargeState` = 1 | [03](03-dispositivo.md) |
| Codecs dos perfis | os 6 perfis do dump decodificam e recodificam idênticos | [06](06-perfil-de-luz.md), [07](07-perfil-de-jogo.md) |
| Zonas de luz | luz 4 (`UpperRight`) é o LED do centro; cor nos 5 slots acende 4 LEDs | [06](06-perfil-de-luz.md) |
| Escrita | cada `03` vale na hora: luz, remapeamento, taxa de report | [04](04-protocolo-hid.md) |
| IMU | X = lateral direita, Y = sai da face, Z = para trás; giroscópio pela regra da mão direita; offset do acelerômetro em Z ≈ −0,16 g; escala do giroscópio estimada em ±2000 °/s | [05](05-report-de-estado.md#imu) |
| Macro | Single Press: toque inicia, outro interrompe. Long Press: toca enquanto segura e soltar corta na hora. Loop recomeça `loopMs` depois do fim do último passo | [07](07-perfil-de-jogo.md) |
| Gravação pelo controle | para sozinha em 30 passos; grava hold/delay com erro de poucos ms; 1 passo só vira mapeamento simples; avisa `10 0F 01 00 B0 00 9F` | [04](04-protocolo-hid.md#gravação-de-macro-16) |
| Desconexão | o `node-hid` emite `error` quando o controle some; sem listener o processo cai. A lib expõe `onDisconnect` | [08](08-lib.md) |

## Limites

| | Itens |
|---|---|
| Não mapeado | report `0x12`: bytes 10 (`0x20` pelo dongle, `0xE7` no cabo), 12 e 25–34 · perfil de luz: `UserEffectIndex` (622), `ProfileLed` (623–625) · perfil de jogo: áudio (37–40) |
| Não testado | PIDs `0x101D` e `0x102A` (sem hardware) · `0F FD` (calibração; risco de descalibrar) · gravação de "device id" (offset 926) · Long Press + loop soltando no meio de uma volta · macro no R4 (mesmo codec do L4) |
| Fora do escopo | atualização de firmware (DLL proprietária JieLi) · Bluetooth (o app não suporta) |
