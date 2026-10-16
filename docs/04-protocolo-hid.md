# 04 · Protocolo HID

Coleção HID usage page `0xFFF0` ([03](03-dispositivo.md)). Fontes: builder `ps` (`main.app.js:7409`), parser `ks` (`main.app.js:7801`).

## Pacote

64 bytes nos dois sentidos.

```
[0]   report ID   0x0F comandos · 0x10 respostas · 0x12 estado
[1]   comando
[2…]  argumentos, resto 00
```

- Respostas chegam com report ID `0x10` (confirmado no hardware). O app não confere esse byte: trata como resposta tudo que não for `0x12`.

- O app escreve arrays curtos (`hid.write([15, 13])`); o driver completa. A lib sempre monta 64 bytes.
- WebHID: report ID separado (`sendReport(0x0F, bytes[1..])`, `inputreport.reportId`). O transporte da lib normaliza para o formato do node-hid.

## Comandos

`n` = perfil · `offH offL` = offset big-endian.

| Cmd | Nome no app | Enviado | Resposta | Função |
|---|---|---|---|---|
| `03` | WriteProfile | `0F 03 n offH offL len data…` | ¹ | grava até 58 B no perfil `n` |
| `04` | ReadProfile | `0F 04 n offH offL len` | `10 05 n offH offL len data…` | lê até 58 B ✅ |
| `06` | Ack | — | | confirmação; `10 06 01` = ocupado (app reenvia) |
| `07` | SwitchProfile | `0F 07 n` | ¹ | perfil ativo: 1–4, 5 = Shift |
| `09` | ReadFirmwareVersion | `0F 09` | `10 0A …` | versões controle/dongle ([03](03-dispositivo.md)) ✅ |
| `0B` | ReadCurrentProfile | `0F 0B` | `10 0C n` | perfil ativo ✅ |
| `0D` | SetLightStatus / ReadRGB | `0F 0D p f` | — | LED: ver abaixo |
| `0F` | ProfileChanged | — | `10 0F n offH offL lenH lenL` | controle avisa que um trecho mudou |
| `10` | RefreshProfile | `0F 10 n offH offL len` | `10 11 n offH offL len data…` | igual ao `04`; usado após `10 0F` |
| `16` | SetMacroStatus | `0F 16 k s` | `10 0F` ao terminar | gravação de macro no controle; `k` 1 = L4, 2 = R4; `s` 0 cancela, 1 inicia, 2 para ([abaixo](#gravação-de-macro-16)) ✅ |
| `20` | Vibration | `0F 20 66 55 L R` | — | motores, `L`/`R` 0–255; `66 55` fixo ✅ |
| `F2` | HeartBeat | `0F F2 m` | — | mantém o `0x12` chegando; `m` 1 = modo teste ✅ |
| `17` | QuickUpdate | `0F 17 55 88` | — | ⚠️ entra em atualização de firmware |
| `FC` | RequestToUpgrade | `0F FC` | — | ⚠️ entra em DFU |
| `FD` | SetCalibrationState | `0F FD s` | — | UI nunca envia; resposta nunca reconhecida (código morto); efeito desconhecido |

¹ O app aceita qualquer resposta que não seja notificação. Tipo exato (provável `06`) não verificado.

Na tabela `ks`, sem uso pelo C2: `01`/`02` Enter/ExitProfileConfig, `08` WriteProfileToEEPRom, `12`–`15` EEPROM, `F0`/`F1` Download, `F3`/`F4` ReadKeyStatus.

## Perfis

| `n` | Tamanho | Conteúdo |
|---|---|---|
| 1–4 | 680 | jogo ([07](07-perfil-de-jogo.md)) |
| 5 | 680 | Shift (camada secundária) |
| 32 | 635 | luz ([06](06-perfil-de-luz.md)) |
| 48 | — | só em `10 0F`: perfil ativo mudou |

- Blocos de 58 B (64 − 6 de cabeçalho). Luz = 11 pacotes (10 × 58 + 55).
- Leitura completa quando `offset + len` = tamanho do perfil.
- O app escreve só o intervalo entre o primeiro e o último byte alterados. Não existe "salvar": cada `03` vale na hora ✅ (remapeamento muda a saída sem reconectar).

## `0D`: LED

| Origem no app | Bytes | Efeito |
|---|---|---|
| `reqSetLightStatus` | `0F 0D 01 01` | toca a animação |
| | `0F 0D 00 f` | pausa no frame `f` (**base 1**) |
| `reqGetRgbState` | `0F 0D` = `0F 0D 00 00` | nada na UI 1.16.7 dispara |

Cores acesas vêm sempre no `0x12` (bytes 38–52); o app atualiza o desenho do controle a cada 6 reports.

## Gravação de macro (`16`)

Testado com `0F 16 01 01` (L4), perfil 1:

| | |
|---|---|
| Durante | byte 53 do `0x12` com bits 0 (gravando) e 4 (L4); os botões continuam saindo normalmente |
| O que grava | cada aperto vira um passo `tecla, hold, delay`, com erro de poucos ms; mexer o analógico grava direções (códigos 21–28) |
| Fim | o controle para sozinho ao chegar em **30 passos**; com um único aperto, parou ~1,9 s depois (provável fim por inatividade) |
| Depois | grava o bloco do L4 no perfil e avisa `10 0F 01 00 B0 00 9F` (perfil 1, offset 176, 159 B) |
| 1 passo só | vira **mapeamento simples** (L4 → A), macro desligada |

`0F 16 01 02` (parar) não foi exercitado: nos dois testes o controle já tinha encerrado sozinho.

## Vibração

- O app desliga com `0F 20 66 55 00 00` após `duration` (padrão 1 s).
- "Try Grip Vibration": envia LT/RT analógicos como `L`/`R` a cada 10 ms, `duration` 100 ms.

## Definidos e nunca usados

| Bytes | Provável função | Obs. |
|---|---|---|
| `0F 04 n 03 9D 07` | ler "device info" | offset 925, depois do fim do perfil |
| `0F 03 n 03 9E 06 <6 ASCII>` | gravar "device id" | offset 926 ⚠️ |
| `0F 04 n 00 28 05` | ler áudio | offset 40; não bate com o áudio do C2 (36–40) |
| `0F 01` / `0F 02 save` | entrar/sair de configuração | |

## Sequência

```
→ 0F F2 00                      heartbeat, a cada 1 s
← 12 …                          estado
→ 0F 04 20 00 00 3A             lê luz, bloco 0
← 10 05 20 00 00 3A <58 B>
  … 11 blocos
→ 0F 03 20 00 05 0F <15 B>      grava frame 0 da animação 0 (offset 5)
← 10 ?? …                       confirmação (não verificado)
```
