import { describe, expect, it } from "vitest";
import { circleRgba, ICON_SIZE, icoFile, iconResource } from "./icon.js";

const color = { r: 1, g: 2, b: 3 };
const at = (x: number, y: number) => (y * ICON_SIZE + x) * 4;

describe("tray icon", () => {
  it("colored center and transparent corners", () => {
    const rgba = circleRgba(color);
    expect(rgba.length).toBe(ICON_SIZE * ICON_SIZE * 4);
    expect([...rgba.slice(at(16, 16), at(16, 16) + 4)]).toEqual([1, 2, 3, 255]);
    expect(rgba[at(0, 0) + 3]).toBe(0);
  });

  it("icon resource: header, bottom-up BGRA and mask", () => {
    const resource = iconResource(color);
    const view = new DataView(resource.buffer);
    expect(view.getUint32(0, true)).toBe(40);
    expect(view.getInt32(8, true)).toBe(ICON_SIZE * 2);
    expect(view.getUint16(14, true)).toBe(32);
    expect(resource.length).toBe(40 + ICON_SIZE * ICON_SIZE * 4 + 128);

    const rgba = circleRgba(color);
    const source = at(16, 2);
    const storedRow = ICON_SIZE - 1 - 2;
    const stored = 40 + (storedRow * ICON_SIZE + 16) * 4;
    expect([...resource.slice(stored, stored + 4)]).toEqual([
      rgba[source + 2],
      rgba[source + 1],
      rgba[source],
      rgba[source + 3],
    ]);
  });

  it(".ico with one image per size; 256 is stored as 0", () => {
    const sizes = [16, 48, 256];
    const ico = icoFile(color, sizes);
    const view = new DataView(ico.buffer);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(sizes.length);
    sizes.forEach((size, i) => {
      const entry = 6 + i * 16;
      expect(view.getUint8(entry)).toBe(size === 256 ? 0 : size);
      const length = view.getUint32(entry + 8, true);
      const offset = view.getUint32(entry + 12, true);
      expect(ico.slice(offset, offset + length)).toEqual(iconResource(color, size));
    });
  });
});
