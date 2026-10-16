/** In both directions byte 0 of `report` is the report ID, as in node-hid. */
export interface HidTransport {
  write(report: Uint8Array): Promise<void>;
  onReport(listener: (report: Uint8Array) => void): () => void;
  onDisconnect?(listener: (error?: Error) => void): () => void;
  close(): Promise<void>;
}

export interface DeviceInfo {
  vendorId: number;
  productId: number;
  path?: string;
  product?: string;
  usagePage?: number;
  interface?: number;
}
