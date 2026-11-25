import { describe, expect, it } from 'vitest';
import { taoHangDoi, type MucUuTien } from './hangDoiApi';
import { mucUuTien } from '../services/authFetch';

const cho = () => new Promise<void>(r => setTimeout(r, 0));

/** Xin suất và ghi tên vào `thuTu` khi được phát */
const xinGhi = (h: ReturnType<typeof taoHangDoi>, muc: MucUuTien, ten: string, thuTu: string[]) => {
  void h.xin(muc).then(() => { thuTu.push(ten); });
};

describe('taoHangDoi', () => {
  it('không quá 4 suất cùng lúc; trả suất thì người chờ được phát', async () => {
    const h = taoHangDoi(4);
    const thuTu: string[] = [];
    for (let i = 1; i <= 6; i++) xinGhi(h, 2, `r${i}`, thuTu);
    await cho();
    expect(thuTu).toEqual(['r1', 'r2', 'r3', 'r4']);
    h.tra();
    await cho();
    expect(thuTu).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    h.tra();
    await cho();
    expect(thuTu).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  });

  it('còn suất thì được ngay, không kể mức', async () => {
    const h = taoHangDoi(4);
    const thuTu: string[] = [];
    xinGhi(h, 3, 'a', thuTu);
    xinGhi(h, 0, 'b', thuTu);
    await cho();
    expect(thuTu).toEqual(['a', 'b']);
  });

  it('suất trống phát theo mức 0 → 3, cùng mức thì ai xin trước được trước', async () => {
    const h = taoHangDoi(4);
    const thuTu: string[] = [];
    for (let i = 0; i < 4; i++) await h.xin(2); // lấp đầy 4 suất
    xinGhi(h, 3, 'm3a', thuTu);
    xinGhi(h, 2, 'm2a', thuTu);
    xinGhi(h, 1, 'm1a', thuTu);
    xinGhi(h, 3, 'm3b', thuTu);
    xinGhi(h, 1, 'm1b', thuTu);
    xinGhi(h, 0, 'm0', thuTu);
    await cho();
    expect(thuTu).toEqual([]);
    for (let i = 0; i < 6; i++) { h.tra(); await cho(); }
    expect(thuTu).toEqual(['m0', 'm1a', 'm1b', 'm2a', 'm3a', 'm3b']);
  });

  it('giuSuat(true): mức 1-3 chỉ dùng 3 suất, mức 0 lấy suất thứ 4 ngay', async () => {
    const h = taoHangDoi(4);
    h.giuSuat(true);
    const thuTu: string[] = [];
    for (let i = 1; i <= 5; i++) xinGhi(h, 1, `d${i}`, thuTu);
    await cho();
    expect(thuTu).toEqual(['d1', 'd2', 'd3']);
    xinGhi(h, 0, 'me', thuTu);
    await cho();
    expect(thuTu).toEqual(['d1', 'd2', 'd3', 'me']);
    // /auth/me đã có suất => tắt giữ; 4 suất đang đầy nên d4 vẫn chờ tới khi có người trả
    h.giuSuat(false);
    await cho();
    expect(thuTu).toEqual(['d1', 'd2', 'd3', 'me']);
    h.tra();
    await cho();
    expect(thuTu).toEqual(['d1', 'd2', 'd3', 'me', 'd4']);
  });

  it('tắt giữ suất khi mức 0 chưa tới (hết 2 giây): người đang chờ lấy luôn suất thứ 4', async () => {
    const h = taoHangDoi(4);
    h.giuSuat(true);
    const thuTu: string[] = [];
    for (let i = 1; i <= 5; i++) xinGhi(h, 2, `d${i}`, thuTu);
    await cho();
    expect(thuTu).toEqual(['d1', 'd2', 'd3']);
    h.giuSuat(false);
    await cho();
    expect(thuTu).toEqual(['d1', 'd2', 'd3', 'd4']);
  });

  it('đang giữ suất: trả 1 suất thường thì mức thấp vẫn được phát (chỉ suất cuối là để dành)', async () => {
    const h = taoHangDoi(4);
    h.giuSuat(true);
    const thuTu: string[] = [];
    for (let i = 1; i <= 4; i++) xinGhi(h, 3, `d${i}`, thuTu);
    await cho();
    expect(thuTu).toEqual(['d1', 'd2', 'd3']);
    h.tra(3);
    await cho();
    expect(thuTu).toEqual(['d1', 'd2', 'd3', 'd4']);
  });

  it('mức 3 không chiếm hết suất: chừa 1 suất cho số của trang', async () => {
    const h = taoHangDoi(4);
    const thuTu: string[] = [];
    for (let i = 1; i <= 4; i++) xinGhi(h, 3, `n${i}`, thuTu);
    await cho();
    expect(thuTu).toEqual(['n1', 'n2', 'n3']);
    xinGhi(h, 2, 'trang', thuTu);
    await cho();
    expect(thuTu).toEqual(['n1', 'n2', 'n3', 'trang']);
    h.tra(3);
    await cho();
    expect(thuTu).toEqual(['n1', 'n2', 'n3', 'trang', 'n4']);
  });
});

describe('mucUuTien', () => {
  it('mức 0 chỉ có /api/auth/me', () => {
    expect(mucUuTien('/api/auth/me')).toBe(0);
    expect(mucUuTien('/api/auth/login')).toBe(2);
  });
  it('mức 1: số màn đầu (so đúng tên, không so tiền tố)', () => {
    for (const p of ['/api/overview/summary', '/api/overview/tuy-chon-thoi-gian', '/api/trend', '/api/khsx-nam/plan-actual',
      '/api/khsx/ke-hoach-ngay', '/api/view-project-mapping', '/api/tong-quan/cong-trinh', '/api/cong-trinh/hang-muc',
      '/api/check-versions', '/api/vat-tu/v2/tong-quan', '/api/vuong-mac/all']) {
      expect(mucUuTien(p), p).toBe(1);
    }
  });
  it('mức 3: việc lùi được', () => {
    for (const p of ['/api/bot-cong-doan/quyen', '/api/bot-tong-hop/loi', '/api/data-update-log', '/api/stock/total-count',
      '/api/trend-by-congtrinh', '/api/trend-by-xuong', '/api/filters/xuong', '/api/filters/cong-trinh',
      '/api/khsx-nhapkho/summary', '/api/bop-m2/nhieu', '/api/bot-tong-hop', '/api/khnk-sheet', '/api/xuong/vi-tri-bop']) {
      expect(mucUuTien(p), p).toBe(3);
    }
  });
  it('mức 2: còn lại, kể cả đường dẫn con của mục mức 1 / mức 3', () => {
    for (const p of ['/api/bot-tong-hop/ngay-hex', '/api/bot-tong-hop/chi-tiet', '/api/all-data',
      '/api/stock/dates', '/api/revenue/2026', '/api/vuong-mac/by-project', '/api/view-project-mapping/luong-do',
      '/api/overview/by-group', '/api/trend-by-dvt', '/api/bot-cong-doan']) {
      expect(mucUuTien(p), p).toBe(2);
    }
  });
});
