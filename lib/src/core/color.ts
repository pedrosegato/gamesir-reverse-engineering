export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type ColorInput = Rgb | string | readonly [number, number, number];

export function toRgb(c: ColorInput): Rgb {
  if (typeof c === "string") {
    const hex = c.replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`invalid color: ${c}`);
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  if (Array.isArray(c)) return { r: c[0], g: c[1], b: c[2] };
  return c as Rgb;
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export const BLACK: Rgb = { r: 0, g: 0, b: 0 };

export function hsv(hueDegrees: number, saturation = 1, value = 1): Rgb {
  const channel = (n: number) => {
    const k = (n + hueDegrees / 60) % 6;
    return Math.round(255 * (value - value * saturation * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return { r: channel(5), g: channel(3), b: channel(1) };
}
