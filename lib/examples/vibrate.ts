import { openFirstCyclone2 } from "./_open.js";

const pad = await openFirstCyclone2();
await pad.vibrate(255, 0, 400);
await pad.vibrate(0, 255, 400);
await pad.vibrate(128, 128, 600);
await pad.close();
