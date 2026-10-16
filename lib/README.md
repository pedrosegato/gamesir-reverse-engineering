# gamesir-hid

Control GameSir controllers over HID from Node.js, without the GameSir Connect app. Supports the **Cyclone 2** (wired and 2.4 GHz dongle): lights, game profiles, macros, vibration and live state.

```bash
npm install gamesir-hid node-hid   # node-hid is only needed on Node
```

```ts
import { Cyclone2, KeyCode } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";

const [device] = await findControllers();
const pad = new Cyclone2(await NodeHidTransport.open(device.path));
await pad.start();

await pad.setStaticColor({ Home: "#00aaff" });
await pad.remapButton(1, KeyCode.A, KeyCode.B);
pad.onState((s) => console.log(s.batteryLevel, s.buttons.A, s.imu.accel));
```

- [API reference](https://github.com/pedrosegato/gamesir-reverse-engineering/blob/main/docs/api.md) (Portuguese)
- [HID protocol](https://github.com/pedrosegato/gamesir-reverse-engineering/blob/main/docs/protocolo.md) (Portuguese)
- [Examples](https://github.com/pedrosegato/gamesir-reverse-engineering/tree/main/examples)

MIT. Not affiliated with or endorsed by GameSir.
