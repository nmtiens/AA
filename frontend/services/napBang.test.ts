import { afterEach, describe, expect, it } from 'vitest';
import { dangKyNapBang, napBang } from './napBang';

describe('napBang', () => {
  afterEach(() => dangKyNapBang(null));

  it('chưa đăng ký: báo chưa có bảng', async () => {
    expect(await napBang(['order'])).toBe(false);
  });

  it('chuyển đúng danh sách bảng cho App và trả kết quả', async () => {
    const goi: string[][] = [];
    dangKyNapBang(async b => { goi.push(b); return b.length === 1; });
    expect(await napBang(['order'])).toBe(true);
    expect(await napBang(['order', 'stock'])).toBe(false);
    expect(goi).toEqual([['order'], ['order', 'stock']]);
  });
});
