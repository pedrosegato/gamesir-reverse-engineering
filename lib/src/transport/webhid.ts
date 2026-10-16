import { CONFIG_USAGE_PAGE, VENDOR_ID } from "../core/constants.js";
import { type ControllerModel, modelForPid } from "../core/model.js";
import { MODELS } from "../models/index.js";
import type { HidTransport } from "./types.js";

export interface OpenedController {
  transport: WebHidTransport;
  model: ControllerModel;
}

export const hidFilters = (models: readonly ControllerModel[] = MODELS): HIDDeviceFilter[] =>
  models.flatMap((m) =>
    Object.values(m.pids).map((productId) => ({ vendorId: VENDOR_ID, productId, usagePage: CONFIG_USAGE_PAGE })),
  );

/** Precisa ser chamado a partir de um gesto do usuário (clique, tecla). */
export async function requestController(models: readonly ControllerModel[] = MODELS): Promise<OpenedController | null> {
  const [device] = await navigator.hid.requestDevice({ filters: hidFilters(models) });
  const model = device && modelForPid(device.productId, models);
  return device && model ? { transport: await WebHidTransport.open(device), model } : null;
}

export async function getAuthorizedControllers(models: readonly ControllerModel[] = MODELS): Promise<HIDDevice[]> {
  const devices = await navigator.hid.getDevices();
  return devices.filter(
    (d) =>
      d.vendorId === VENDOR_ID &&
      modelForPid(d.productId, models) !== undefined &&
      d.collections.some((c) => c.usagePage === CONFIG_USAGE_PAGE),
  );
}

export class WebHidTransport implements HidTransport {
  private constructor(private readonly dev: HIDDevice) {}

  static async open(dev: HIDDevice): Promise<WebHidTransport> {
    if (!dev.opened) await dev.open();
    return new WebHidTransport(dev);
  }

  async write(report: Uint8Array): Promise<void> {
    await this.dev.sendReport(report[0], report.slice(1));
  }

  onReport(listener: (report: Uint8Array) => void): () => void {
    const handler = (e: HIDInputReportEvent) => {
      const payload = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
      const report = new Uint8Array(payload.length + 1);
      report[0] = e.reportId;
      report.set(payload, 1);
      listener(report);
    };
    this.dev.addEventListener("inputreport", handler);
    return () => this.dev.removeEventListener("inputreport", handler);
  }

  onDisconnect(listener: (error?: Error) => void): () => void {
    const handler = (e: HIDConnectionEvent) => {
      if (e.device === this.dev) listener();
    };
    navigator.hid.addEventListener("disconnect", handler);
    return () => navigator.hid.removeEventListener("disconnect", handler);
  }

  async close(): Promise<void> {
    await this.dev.close();
  }
}
