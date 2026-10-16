export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type ColorInput = Rgb | string | readonly [number, number, number];

/** Aceita "#ff8800", "ff8800", [255, 136, 0] ou { r, g, b }. */
export function toRgb(c: ColorInput): Rgb {
  if (typeof c === "string") {
    const hex = c.replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`cor inválida: ${c}`);
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

/** HSV (h 0..360, s/v 0..1) para RGB. Útil para arco-íris. */
export function hsv(h: number, s = 1, v = 1): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return { r: f(5), g: f(3), b: f(1) };
}
