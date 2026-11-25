import { describe, it, expect } from 'vitest';
import { nenBang, giaiBangCot, laBangCot } from './bangCot';

describe('bangCot', () => {
  const rows = Array.from({ length: 70000 }, (_, i) => ({ hex: i, a: i % 3 ? 'x' : null, b: String(i % 7), c: i % 2 ? i / 3 : '', d: i % 5 === 0 ? undefined : true }));
  it('nén rồi giải ra y hệt, kể cả null / undefined / 1 và "1" / cột > 65536 giá trị', async () => {
    const b = nenBang(rows)!;
    expect(laBangCot(b)).toBe(true);
    expect(b.cs[0]).toBeInstanceOf(Uint32Array);
    expect(b.cs[2]).toBeInstanceOf(Uint16Array);
    expect(await giaiBangCot(structuredClone(b))).toStrictEqual(rows);
    const tron = [{ a: 1 }, { a: '1' }, { a: null }, { a: 0 }, { a: '' }, { a: false }];
    expect(await giaiBangCot(nenBang(tron)!)).toStrictEqual(tron);
  });
  it('dòng khác bộ cột, khác thứ tự cột hoặc ô là object => null (lưu như cũ)', () => {
    expect(nenBang([{ a: 1 }, { a: 1, b: 2 }])).toBeNull();
    expect(nenBang([{ a: 1, b: 2 }, { a: 1 }])).toBeNull();
    expect(nenBang([{ a: 1, b: 2 }, { b: 2, a: 1 }])).toBeNull();
    expect(nenBang([{ a: [1] as unknown as string }])).toBeNull();
    expect(nenBang([])).toBeNull();
  });
});
