import HID from "node-hid";
import { CONFIG_USAGE_PAGE, CYCLONE2_PIDS, VENDOR_ID } from "../constants.js";
import type { DeviceInfo, HidTransport } from "./types.js";

export async function findCyclone2(): Promise<DeviceInfo[]> {
  const all = await HID.devicesAsync();
  return all
    .filter(
      (d) =>
        d.vendorId === VENDOR_ID && CYCLONE2_PIDS.includes(d.productId) && d.usagePage === CONFIG_USAGE_PAGE && d.path,
    )
    .map((d) => ({
      vendorId: d.vendorId,
      productId: d.productId,
      path: d.path,
      product: d.product,
      usagePage: d.usagePage,
      interface: d.interface,
    }));
}

export class NodeHidTransport implements HidTransport {
  private constructor(private readonly dev: HID.HIDAsync) {}

  static async open(path: string): Promise<NodeHidTransport> {
    return new NodeHidTransport(await HID.HIDAsync.open(path));
  }

  async write(report: Uint8Array): Promise<void> {
    await this.dev.write(Buffer.from(report));
  }

  onReport(listener: (report: Uint8Array) => void): () => void {
    const handler = (data: Buffer) => listener(new Uint8Array(data));
    this.dev.on("data", handler);
    return () => this.dev.off("data", handler);
  }

  async close(): Promise<void> {
    this.dev.removeAllListeners("data");
    await this.dev.close();
  }
}
