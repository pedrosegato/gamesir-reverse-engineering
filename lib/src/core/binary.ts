export class ByteReader {
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {}

  get offset(): number {
    return this.pos;
  }

  u8(): number {
    if (this.pos >= this.buf.length) throw new RangeError("read past the end of the buffer");
    return this.buf[this.pos++];
  }

  flag(): boolean {
    return (this.u8() & 1) === 1;
  }

  u16be(): number {
    return (this.u8() << 8) | this.u8();
  }

  bytes(n: number): number[] {
    return Array.from({ length: n }, () => this.u8());
  }
}

export class ByteWriter {
  private readonly out: number[] = [];

  get offset(): number {
    return this.out.length;
  }

  u8(v: number): this {
    if (!Number.isInteger(v) || v < 0 || v > 0xff) throw new RangeError(`byte out of range: ${v}`);
    this.out.push(v);
    return this;
  }

  flag(v: boolean): this {
    return this.u8(v ? 1 : 0);
  }

  u16be(v: number): this {
    return this.u8((v >> 8) & 0xff).u8(v & 0xff);
  }

  bytes(values: readonly number[], length = values.length): this {
    for (let i = 0; i < length; i++) this.u8(values[i] ?? 0);
    return this;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}

export function diffRange(a: ArrayLike<number>, b: ArrayLike<number>): { start: number; end: number } | null {
  if (a.length !== b.length || a.length === 0) return { start: 0, end: b.length - 1 };
  let start = 0;
  while (start < a.length && a[start] === b[start]) start++;
  if (start === a.length) return null;
  let end = a.length - 1;
  while (a[end] === b[end]) end--;
  return { start, end };
}
