# gamesir-hid

Control GameSir controllers over HID from Node.js, without the GameSir Connect app. The protocol was reverse-engineered from GameSir Connect 1.16.7 and verified on a Cyclone 2.

| Controller | Support |
|---|---|
| Cyclone 2 | lights, game profiles (remapping, macros, triggers, sticks, gyro), vibration, live state (buttons, sticks, battery, LEDs, IMU) |
| Tarantula CE, G7 Pro 8K, K2 8K | same protocol family; not implemented (no model descriptors or profile codecs yet) |
| Tarantula Pro, Super Nova, Nova 2 Lite | not supported (the app drives them through closed DLLs) |

Wired and 2.4 GHz dongle connections. Bluetooth is not supported.

## Install

```bash
npm install gamesir-hid node-hid   # node-hid is only needed on Node
```

Node 18+. On Linux, grant access to `hidraw` (udev rule for vendor `3537`).

## Usage

```ts
import { Cyclone2, KeyCode } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";

const [device] = await findControllers();
const pad = new Cyclone2(await NodeHidTransport.open(device.path));
await pad.start();

await pad.setStaticColor({ Home: "#00aaff" });
await pad.applyPreset("Rainbow", 1);
await pad.remapButton(1, KeyCode.A, KeyCode.B);
await pad.setMacro(1, KeyCode.L4, [
  { key: KeyCode.A, holdMs: 50, delayMs: 100 },
  { key: KeyCode.B, holdMs: 50, delayMs: 0 },
]);
await pad.vibrate(200, 200, 300);

pad.onState((s) => console.log(s.batteryLevel, s.buttons.A, s.leftStick, s.imu.accel));
pad.onDisconnect(() => console.log("controller gone"));
```

| Area | Methods |
|---|---|
| Session | `start`, `close`, `onState`, `onProfileChanged`, `onDisconnect` |
| Device | `readFirmwareVersion`, `readCurrentProfile`, `switchProfile`, `vibrate` |
| Lights | `setStaticColor`, `setAnimation`, `applyPreset`, `setActiveAnimation`, `setStandbyTime`, `readLightProfile`, `writeLightProfile` |
| Game profiles | `remapButton`, `setMacro`, `setReportRate`, `setMacroRecording`, `readGameProfile`, `writeGameProfile` |
| Low level | `readProfile`, `writeProfile`, `request`, `protocol.*` packet builders |

Writes take effect immediately and only send the bytes that changed.

## Examples

| | |
|---|---|
| [`battery-led`](examples/battery-led) | battery level on the controller LEDs; also a Windows tray app on the [releases](https://github.com/pedrosegato/gamesir-reverse-engineering/releases) page |
| [`lights.ts`](examples/lights.ts) | static colors, presets and the active animation |
| [`vibrate.ts`](examples/vibrate.ts) | vibration |

## Docs

Written in Portuguese.

| | |
|---|---|
| [docs/api.md](docs/api.md) | API reference |
| [docs/protocolo.md](docs/protocolo.md) | HID protocol: packets, commands, state report, profile layouts |
| [docs/engenharia-reversa.md](docs/engenharia-reversa.md) | how the protocol was extracted from the app and verified on the device |

## License

MIT. Not affiliated with or endorsed by GameSir. No GameSir code is included in this repository.
