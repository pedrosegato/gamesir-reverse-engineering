import { Cyclone2 } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";

const [device] = await findControllers();
if (!device) throw new Error("no controller found");
const pad = new Cyclone2(await NodeHidTransport.open(device.path));
await pad.start();
await pad.vibrate(255, 0, 400);
await pad.vibrate(0, 255, 400);
await pad.vibrate(128, 128, 600);
await pad.close();
