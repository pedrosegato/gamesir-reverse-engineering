import { Cyclone2 } from "../src/index.js";
import { findCyclone2, NodeHidTransport } from "../src/transport/node-hid.js";

export async function openFirstCyclone2(): Promise<Cyclone2> {
  const [info] = await findCyclone2();
  if (!info?.path) throw new Error("nenhum Cyclone 2 encontrado (interface 0xFFF0)");
  console.log(`conectado: PID 0x${info.productId.toString(16)} ${info.product ?? ""}`);
  const pad = new Cyclone2(await NodeHidTransport.open(info.path));
  await pad.start();
  return pad;
}
