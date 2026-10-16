# 04 · Protocolo HID

Todo o tráfego de configuração passa pela interface HID de **usage page `0xFFF0`** (vendor-defined) do Cyclone 2. Ver [03 · Dispositivo](03-dispositivo.md) para os PIDs.

## Formato do pacote

Os pacotes têm 64 bytes, nos dois sentidos:

```
byte 0     report ID   0x0F nos comandos e respostas, 0x12 no report de estado
byte 1     comando
byte 2..   argumentos; o resto é preenchido com 0x00
```

O app chama `hid.write([15, 13])` com arrays curtos. O driver completa até o tamanho do report. A lib monta sempre os 64 bytes.

No WebHID, o report ID vai separado: `sendReport(0x0F, bytes[1..])`, e o `inputreport` traz `reportId` à parte. O transporte da lib junta tudo no mesmo formato do node-hid.

## Comandos

Nas colunas de bytes, `n` é o número do perfil e `off` é o offset em big-endian (`offHi offLo`).

| Cmd | Nome no app | Enviado | Resposta | Uso no Cyclone 2 |
|---|---|---|---|---|
| `01` | EnterProfileConfig | `0F 01` | — | Não usado pelo proxy C2 |
| `02` | ExitProfileConfig | `0F 02 save` | — | Não usado pelo proxy C2 |
| `03` | WriteProfile | `0F 03 n offHi offLo len data[len]` | qualquer¹ | Grava até 58 bytes no perfil `n` |
| `04` | ReadProfile | `0F 04 n offHi offLo len` | `05` | Lê até 58 bytes |
| `06` | Ack | — | — | Confirmação genérica. `0F 06 01` = ocupado |
| `07` | SwitchProfile | `0F 07 n` | qualquer¹ | Ativa o perfil de jogo 1..4 ou 5 (Shift) |
| `08` | WriteProfileToEEPRom | — | — | Existe na tabela, mas nunca é enviado |
| `09` | ReadFirmwareVersion | `0F 09` | `0A` | Versão do firmware e do dongle |
| `0B` | ReadCurrentProfile | `0F 0B` | `0C` | Byte 2 da resposta = perfil ativo |
| `0D` | SetLightStatus / ReadRGB | `0F 0D playing frame` | — | Toca a animação ou pausa num frame (base 1). Ver abaixo |
| `0F` | ProfileChanged | — | do controle | `0F 0F n offHi offLo lenHi lenLo`: um trecho do perfil mudou |
| `10` | RefreshProfile | `0F 10 n offHi offLo len` | `11` | Igual a ReadProfile. Usado depois de um ProfileChanged |
| `16` | SetMacroStatus | `0F 16 key state` | — | Gravação de macro no controle. key 1 = L4, 2 = R4; state 0 cancela, 1 inicia, 2 para. O andamento aparece no byte 53 do report `0x12` |
| `17` | QuickUpdate | `0F 17 55 88` | — | ⚠️ Entra em atualização de firmware |
| `20` | Vibration | `0F 20 66 55 L R` | — | Motores esquerdo e direito |
| `F2` | HeartBeat | `0F F2 mode` | — | Mantém o report `0x12` chegando. mode 1 = modo de teste |
| `FC` | RequestToUpgrade | `0F FC` | — | ⚠️ Entra em modo DFU |
| `FD` | SetCalibrationState | `0F FD state` | — | Existe, mas a UI nunca envia, e a resposta de calibração nunca é reconhecida pelo app (código morto). Efeito e valores **desconhecidos** |

¹ O app não confere o tipo da resposta. Qualquer pacote `0x0F` que não seja notificação libera o próximo comando da fila. O tipo exato (provavelmente `06` Ack) ainda **não foi verificado** no hardware.

Opcodes que aparecem na tabela de respostas (`ks`), mas que o proxy do Cyclone 2 não envia: `12`/`13` WriteEEPRom, `14`/`15` ReadEEPRom, `F0`/`F1` Download e `F3`/`F4` ReadKeyStatus.

### Leitura e escrita de perfil

| Perfil `n` | Tamanho | Conteúdo |
|---|---|---|
| 1..4 | 680 bytes | Perfis de jogo. Ver [07 · Perfil de jogo](07-perfil-de-jogo.md) |
| 5 | 680 bytes | Perfil "Shift" (camada secundária) |
| 32 | 635 bytes | Perfil de luz. Ver [06 · Perfil de luz](06-perfil-de-luz.md) |
| 48 | — | Só aparece em `ProfileChanged`, e indica que o perfil **ativo** mudou |

Os perfis trafegam em blocos de **58 bytes** (`64 − 6` de cabeçalho). Um perfil de luz completo ocupa 11 pacotes: 10 × 58 + 55.

O app escreve sempre o **diff**: compara os bytes novos com a última cópia lida e envia só o intervalo entre o primeiro e o último byte diferentes. Não há comando de "salvar": o controle aplica cada `WriteProfile` na hora.

Resposta de leitura:

```
0F 05 n offHi offLo len data[len]
```

O app considera a leitura completa quando `offset + len` é igual ao tamanho do perfil.

### `0D`: SetLightStatus / ReadRGB

O app usa o mesmo opcode para duas coisas:

- `reqSetLightStatus {isPlaying, frameIndex}` → `0F 0D playing frame`. A tela de luzes usa isso para pré-visualizar: `0F 0D 01 01` toca a animação, e `0F 0D 00 n` pausa mostrando o frame `n`, **contado a partir de 1**.
- `reqGetRgbState` → `0F 0D`, que no fio é igual a `0F 0D 00 00`. Na versão 1.16.7, nada na interface dispara esse evento.

As cores acesas não chegam como resposta a esse comando. Elas vêm sempre no report `0x12`, nos bytes 38..52. O app repassa essas cores para o desenho do controle na tela a cada 6 reports.

### Vibração

```
0F 20 66 55 L R
```

`66 55` é uma constante fixa. `L` e `R` são a intensidade de cada motor, de 0 a 255. O app desliga com `L = R = 0` depois do tempo pedido. Na tela "Try Grip Vibration", ele manda o valor analógico de LT/RT como `L`/`R`, a cada 10 ms, com duração de 100 ms.

### Comandos que o app define mas nunca usa

| Bytes | O que parece ser | Observação |
|---|---|---|
| `0F 04 n 03 9D 07` | ler "device info" | É um ReadProfile no offset 925, **depois do fim** do perfil |
| `0F 03 n 03 9E 06 <6 ASCII>` | gravar um "device id" | WriteProfile no offset 926. ⚠️ Não testar sem um bom motivo |
| `0F 04 n 00 28 05` | ler áudio | Offset 40, tamanho 5. Não bate com o bloco de áudio do C2 (36–40) |
| `0F 01` / `0F 02 save` | entrar/sair do modo de configuração | O proxy C2 não usa |

## Fluxo típico

Respostas de escrita **não verificadas** no hardware.

```
→ 0F F2 00                      heartbeat (repetir a cada 1 s)
← 12 ...                        report de estado começa a chegar
→ 0F 04 20 00 00 3A             lê o perfil de luz, bloco 0
← 0F 05 20 00 00 3A <58 bytes>
  ... (11 blocos)
→ 0F 03 20 00 05 0F <15 bytes>  grava o frame 0 da animação 0 (offset 5)
← 0F ?? ...                     confirmação
```
