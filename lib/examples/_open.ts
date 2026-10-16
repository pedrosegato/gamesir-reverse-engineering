import { Cyclone2 } from "../src/index.js";
import { findControllers, NodeHidTransport } from "../src/transport/node-hid.js";

export async function openFirstCyclone2(): Promise<Cyclone2> {
  const [info] = await findControllers();
  if (!info) throw new Error("nenhum controle encontrado (interface 0xFFF0)");
  console.log(`conectado: ${info.model.name}, PID 0x${info.productId.toString(16)}`);
  const pad = new Cyclone2(await NodeHidTransport.open(info.path));
  await pad.start();
  return pad;
}
