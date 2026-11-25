import { describe, it, expect, vi, beforeEach } from 'vitest';

// Số lần nạp trước hiện ngay, bản đúng về sau thì báo trang
const than = (capNhat: string, them = {}) => ({ coBang: true, capNhat, soFile: 1, cot: [], dong: [['1', 0]], ...them });
describe('taiFileCongTrinh', () => {
  let goi: string[];
  let tra: (u: string) => unknown;
  beforeEach(() => {
    vi.resetModules();
    goi = [];
    vi.stubGlobal('fetch', async (u: string) => {
      goi.push(u);
      const d = tra(u);
      return d === null ? new Response('', { status: 500 }) : new Response(JSON.stringify(d));
    });
  });
  const cho = () => new Promise(r => setTimeout(r, 20));

  it('nhận bản trước rồi báo bản đúng', async () => {
    tra = u => (u.endsWith('?cu=1') ? than('A', { dangCapNhat: true }) : than('B'));
    const m = await import('./congTrinhFile');
    const bao: (string | null)[] = [];
    m.ngheFileCongTrinh(d => bao.push(d.capNhat));
    expect((await m.taiFileCongTrinh()).dangCapNhat).toBe(true);
    await cho();
    expect(bao).toEqual(['B']);
    expect(m.fileCongTrinhDaCo()?.capNhat).toBe('B');
    expect(m.fileCongTrinhDaCo()?.dangCapNhat).toBeUndefined();
    expect(goi.map(u => u.split('/').pop())).toEqual(['hang-muc?cu=1', 'hang-muc']);
  });
  it('bản đúng có sẵn: 1 lượt gọi, lần sau không xin bản trước nữa', async () => {
    tra = () => than('B');
    const m = await import('./congTrinhFile');
    await m.taiFileCongTrinh();
    await m.taiFileCongTrinh();
    expect(goi.map(u => u.split('/').pop())).toEqual(['hang-muc?cu=1', 'hang-muc']);
  });
  it('lấy bản đúng lỗi: giữ số cũ, báo lỗi, coi như cũ để lần sau lấy lại', async () => {
    tra = u => (u.endsWith('?cu=1') ? than('A', { dangCapNhat: true }) : null);
    const m = await import('./congTrinhFile');
    await m.taiFileCongTrinh();
    await cho();
    expect(m.fileCongTrinhDaCo()).toMatchObject({ capNhat: 'A', dangCapNhat: false, capNhatLoi: true });
    expect(m.fileCongTrinhCu()).toBe(true);
  });
});
