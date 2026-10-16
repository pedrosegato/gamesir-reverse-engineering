import HID from "node-hid";
import { CONFIG_USAGE_PAGE, VENDOR_ID } from "../core/constants.js";
import { type ControllerModel, modelForPid } from "../core/model.js";
import { MODELS } from "../models/index.js";
import type { DeviceInfo, HidTransport } from "./types.js";

export interface FoundController extends DeviceInfo {
  path: string;
  model: ControllerModel;
}

export async function findControllers(models: readonly ControllerModel[] = MODELS): Promise<FoundController[]> {
  const found: FoundController[] = [];
  for (const d of await HID.devicesAsync()) {
    if (d.vendorId !== VENDOR_ID || d.usagePage !== CONFIG_USAGE_PAGE || !d.path) continue;
    const model = modelForPid(d.productId, models);
    if (!model) continue;
    const { vendorId, productId, path, product, usagePage, interface: iface } = d;
    found.push({ vendorId, productId, path, product, usagePage, interface: iface, model });
  }
  return found;
}

export class NodeHidTransport implements HidTransport {
  private disconnectListeners = new Set<(error?: Error) => void>();

  /** Without an `error` listener, node-hid crashes the process when the controller is unplugged. */
  private constructor(private readonly dev: HID.HIDAsync) {
    dev.on("error", (error: Error) => {
      for (const l of this.disconnectListeners) l(error);
    });
  }

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

  onDisconnect(listener: (error?: Error) => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  async close(): Promise<void> {
    this.dev.removeAllListeners("data");
    this.disconnectListeners.clear();
    await this.dev.close().catch(() => undefined);
  }
}
