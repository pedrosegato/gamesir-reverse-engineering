/**
 * Transporte HID mínimo. Nas duas direções o byte 0 é o report ID, como no
 * node-hid. O adaptador WebHID converte para esse formato.
 */
export interface HidTransport {
  write(report: Uint8Array): Promise<void>;
  /** Registra um callback para cada input report. Retorna a função de cancelamento. */
  onReport(listener: (report: Uint8Array) => void): () => void;
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
