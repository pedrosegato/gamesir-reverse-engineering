import type { Rgb } from "gamesir-hid";

export const ICON_SIZE = 32;
const OUTLINE: Rgb = { r: 40, g: 40, b: 40 };
const HEADER_SIZE = 40;
const ICO_HEADER_SIZE = 6;
const ICO_ENTRY_SIZE = 16;

export function circleRgba(color: Rgb, size = ICON_SIZE): Uint8Array {
  const center = size / 2;
  const radius = center - size / 32;
  const outline = size / 16;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      const alpha = Math.min(Math.max(radius - distance + 0.5, 0), 1);
      const { r, g, b } = distance < radius - outline ? color : OUTLINE;
      rgba.set([r, g, b, Math.round(alpha * 255)], (y * size + x) * 4);
    }
  }
  return rgba;
}

/**
 * Format accepted by `CreateIconFromResourceEx` and stored inside `.ico` files: BITMAPINFOHEADER with doubled
 * height (color + mask), bottom-up BGRA pixels and a 1-bit AND mask, left empty because alpha already cuts out
 * the circle.
 */
export function iconResource(color: Rgb, size = ICON_SIZE): Uint8Array {
  const rgba = circleRgba(color, size);
  const pixelBytes = size * size * 4;
  const maskBytes = Math.ceil(size / 32) * 4 * size;
  const out = new Uint8Array(HEADER_SIZE + pixelBytes + maskBytes);
  const header = new DataView(out.buffer);
  header.setUint32(0, HEADER_SIZE, true);
  header.setInt32(4, size, true);
  header.setInt32(8, size * 2, true);
  header.setUint16(12, 1, true);
  header.setUint16(14, 32, true);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = HEADER_SIZE + ((size - 1 - y) * size + x) * 4;
      out.set([rgba[from + 2], rgba[from + 1], rgba[from], rgba[from + 3]], to);
    }
  }
  return out;
}

export function icoFile(color: Rgb, sizes: readonly number[]): Uint8Array {
  const images = sizes.map((size) => iconResource(color, size));
  const directorySize = ICO_HEADER_SIZE + ICO_ENTRY_SIZE * images.length;
  const out = new Uint8Array(directorySize + images.reduce((total, image) => total + image.length, 0));
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);

  let offset = directorySize;
  images.forEach((image, i) => {
    const entry = ICO_HEADER_SIZE + i * ICO_ENTRY_SIZE;
    const side = sizes[i] >= 256 ? 0 : sizes[i];
    view.setUint8(entry, side);
    view.setUint8(entry + 1, side);
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, image.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(image, offset);
    offset += image.length;
  });
  return out;
}
