/** Nas duas direções o byte 0 de `report` é o report ID, como no node-hid. */
export interface HidTransport {
  write(report: Uint8Array): Promise<void>;
  onReport(listener: (report: Uint8Array) => void): () => void;
  /** Dispositivo removido ou com erro de leitura. Opcional para transportes próprios. */
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
