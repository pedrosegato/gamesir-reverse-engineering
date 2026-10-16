/**
 * Transporte para o navegador (Chrome/Edge) via WebHID.
 * `requestCyclone2()` precisa ser chamado a partir de um clique do usuário.
 */

import { CONFIG_USAGE_PAGE, CYCLONE2_PIDS, VENDOR_ID } from "../constants.js";
import type { HidTransport } from "./types.js";

export const CYCLONE2_FILTERS: HIDDeviceFilter[] = CYCLONE2_PIDS.map((productId) => ({
  vendorId: VENDOR_ID,
  productId,
  usagePage: CONFIG_USAGE_PAGE,
}));

/** Abre o seletor de dispositivos do navegador e devolve a interface 0xFFF0 escolhida. */
export async function requestCyclone2(): Promise<WebHidTransport | null> {
  const [device] = await navigator.hid.requestDevice({ filters: CYCLONE2_FILTERS });
  return device ? WebHidTransport.open(device) : null;
}

/** Dispositivos já autorizados nesta origem (não abre o seletor). */
export async function getAuthorizedCyclone2(): Promise<HIDDevice[]> {
  const devices = await navigator.hid.getDevices();
  return devices.filter(
    (d) =>
      d.vendorId === VENDOR_ID &&
      CYCLONE2_PIDS.includes(d.productId) &&
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
    // WebHID recebe o report ID separado do payload.
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

  async close(): Promise<void> {
    await this.dev.close();
  }
}
