import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

// Hàng đợi mục Xưởng chạy trên code IndexedDB thật (fake-indexeddb) — quyết định R13.
// Không chứng minh: hành vi của Chrome Android thật (bộ nhớ, tự xoá) — kiểm bằng /qa theo Test Plan.

class BoNhoTam {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

type Q = typeof import('./xuongQueue');
let q: Q;

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', new BoNhoTam());
  vi.stubGlobal('sessionStorage', new BoNhoTam());
  localStorage.setItem('xuong_token', 'tok');
  localStorage.setItem('xuong_device_token', 'dev.sig');
  localStorage.setItem('xuong_lech_dong_ho', JSON.stringify({ lechMs: 1500, doLuc: Date.now() }));
  q = await import('./xuongQueue');
});

const them = (n: number) => Promise.all(Array.from({ length: n }, (_, i) =>
  q.themSuKien({ loai: 'bat_dau', hex: '250301895', congDoanId: 'CD1', toId: 1, soNguoi: i }, 7)));

const traLoi = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('themSuKien', () => {
  it('lưu trên máy kèm giờ bấm, lệch đồng hồ đo trước lúc bấm, người bấm', async () => {
    const ev = await q.themSuKien({ loai: 'nhan', hex: '250301895', congDoanId: 'CD1', toId: 1, soLuong: 5 }, 7);
    expect(ev.lechMs).toBe(1500);
    expect(ev.sauDoiGio).toBe(false);
    expect(ev.userId).toBe(7);
    expect(ev.id).toMatch(/^[0-9a-f-]{36}$/);
    const ds = await q.danhSachCho();
    expect(ds.map(e => e.id)).toEqual([ev.id]);
  });

  it('lệch quá 12 giờ coi như chưa đo', async () => {
    localStorage.setItem('xuong_lech_dong_ho', JSON.stringify({ lechMs: 1500, doLuc: Date.now() - 13 * 3_600_000 }));
    const ev = await q.themSuKien({ loai: 'quan_so', toId: 1 }, 7);
    expect(ev.lechMs).toBeNull();
  });

  it('không ghi được IndexedDB → ném LoiLuuMay, không giả vờ đã lưu', async () => {
    vi.resetModules();
    vi.stubGlobal('indexedDB', {
      open() {
        const req: { error?: unknown; onerror?: () => void } = {};
        setTimeout(() => { req.error = new Error('QuotaExceededError'); req.onerror?.(); });
        return req;
      },
    });
    const q2: Q = await import('./xuongQueue');
    await expect(q2.themSuKien({ loai: 'nhan' }, 7)).rejects.toBeInstanceOf(q2.LoiLuuMay);
  });
});

describe('guiHangDoi', () => {
  it('gửi theo lô 200 + phần dư, xoá đúng id server trả, không gửi queuedAt', async () => {
    await them(250);
    const kichThuoc: number[] = [];
    const f = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      kichThuoc.push(body.events.length);
      expect(body.deviceToken).toBe('dev.sig');
      expect(body.events[0].queuedAt).toBeUndefined();
      expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return traLoi(200, { success: true, saved: body.events.map((e: { id: string }) => e.id), rejected: [] });
    });
    const kq = await q.guiHangDoi(f as unknown as typeof fetch);
    expect(kichThuoc).toEqual([200, 50]);
    expect(kq).toMatchObject({ daGui: 250, conLai: 0, loi: null });
    expect(await q.danhSachCho()).toHaveLength(0);
  });

  it('server chỉ nhận một phần: giữ phần chưa nhận, trả lại sự kiện bị từ chối', async () => {
    const [a, b, c] = await them(3);
    let lan = 0;
    const f = vi.fn(async () => {
      lan++;
      return lan === 1
        ? traLoi(200, { success: true, saved: [a.id], rejected: [{ id: b.id, reason: 'Tạm ngưng phải chọn lý do' }] })
        : traLoi(500, { success: false });
    });
    const kq = await q.guiHangDoi(f as unknown as typeof fetch, () => 0.5);
    expect(kq.daGui).toBe(1);
    expect(kq.tuChoi).toEqual([expect.objectContaining({ id: b.id, reason: 'Tạm ngưng phải chọn lý do' })]);
    expect((await q.danhSachCho()).map(e => e.id)).toEqual([c.id]);
    expect(kq.loi).toBe('loi_server');
  });

  it('429: giữ nguyên, chờ lại có jitter; gọi ngay lần nữa thì chưa gửi', async () => {
    await them(2);
    const f = vi.fn(async () => traLoi(429, { success: false }));
    const kq = await q.guiHangDoi(f as unknown as typeof fetch, () => 0.5);
    expect(kq).toMatchObject({ loi: 'qua_tai', conLai: 2, thuLaiSau: 1000 });
    const lai = await q.guiHangDoi(f as unknown as typeof fetch);
    expect(lai.loi).toBe('cho_lai');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('mất mạng: không mất sự kiện', async () => {
    await them(3);
    const kq = await q.guiHangDoi((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch);
    expect(kq).toMatchObject({ loi: 'mat_mang', conLai: 3 });
  });

  it('401 (token hết hạn / bị thu hồi): dừng, GIỮ hàng đợi, báo đăng nhập lại', async () => {
    await them(2);
    const kq = await q.guiHangDoi((async () => traLoi(401, { success: false })) as unknown as typeof fetch);
    expect(kq).toMatchObject({ loi: 'dang_nhap_lai', conLai: 2 });
    expect(await q.danhSachCho()).toHaveLength(2);
  });

  it('server chưa bật mục Xưởng (available:false): giữ hàng đợi', async () => {
    await them(1);
    const kq = await q.guiHangDoi((async () => traLoi(200, { success: true, available: false })) as unknown as typeof fetch);
    expect(kq.conLai).toBe(1);
  });
});

describe('ảnh tiến độ (D24 Postgres, R11)', () => {
  const anh = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });

  it('gửi ảnh trước (id ảnh máy sinh), sự kiện gửi kèm id ảnh, ảnh xoá khỏi máy', async () => {
    const idAnh = await q.themAnh(anh(), 'image/webp', '250301895');
    expect(await q.soAnhCho()).toBe(1);
    await q.themSuKien({ loai: 'tien_do', hex: '250301895', congDoanId: 'CD1', toId: 1, tienDo: 50, duLieu: { tienDo: 50, anhCho: [idAnh] } }, 7);
    const goi: string[] = [];
    let guiDi: unknown = null;
    const f = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u);
      goi.push(`${init?.method} ${url.split('?')[0]}`);
      if (url.startsWith('/api/xuong/anh?')) {
        expect(url).toBe(`/api/xuong/anh?id=${idAnh}&hex=250301895`);
        expect((init!.headers as Record<string, string>)['Content-Type']).toBe('image/webp');
        return traLoi(200, { success: true, bat: true, khoa: idAnh });
      }
      const body = JSON.parse(String(init!.body));
      guiDi = body.events[0].duLieu;
      return traLoi(200, { success: true, saved: body.events.map((e: { id: string }) => e.id), rejected: [] });
    });
    const kq = await q.guiHangDoi(f as unknown as typeof fetch);
    expect(goi).toEqual(['POST /api/xuong/anh', 'POST /api/xuong/events']);
    expect(guiDi).toEqual({ tienDo: 50, anh: [idAnh] });
    expect(kq.loi).toBeNull();
    expect(await q.soAnhCho()).toBe(0);
  });

  it('mất mạng khi tải ảnh: giữ cả sự kiện lẫn ảnh, chưa gửi sự kiện', async () => {
    const idAnh = await q.themAnh(anh(), 'image/webp', '250301895');
    await q.themSuKien({ loai: 'tien_do', hex: '250301895', congDoanId: 'CD1', toId: 1, duLieu: { anhCho: [idAnh] } }, 7);
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const kq = await q.guiHangDoi(f as unknown as typeof fetch);
    expect(kq.loi).toBe('mat_mang');
    expect(await q.soAnhCho()).toBe(1);
    expect(await q.danhSachCho()).toHaveLength(1);
  });

  it('máy chủ chưa bật ảnh (chưa chạy SQL ảnh): bỏ ảnh, vẫn gửi sự kiện', async () => {
    const idAnh = await q.themAnh(anh(), 'image/webp', '250301895');
    await q.themSuKien({ loai: 'tien_do', hex: '250301895', congDoanId: 'CD1', toId: 1, duLieu: { tienDo: 25, anhCho: [idAnh] } }, 7);
    let guiDi: unknown = null;
    const f = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      if (String(u).startsWith('/api/xuong/anh?')) return traLoi(200, { success: true, bat: false });
      const body = JSON.parse(String(init!.body));
      guiDi = body.events[0].duLieu;
      return traLoi(200, { success: true, saved: body.events.map((e: { id: string }) => e.id), rejected: [] });
    });
    await q.guiHangDoi(f as unknown as typeof fetch);
    expect(guiDi).toEqual({ tienDo: 25 });
    expect(await q.soAnhCho()).toBe(0);
  });

  it('tối đa 20 ảnh chờ: ảnh thứ 21 bị chặn', async () => {
    for (let i = 0; i < q.ANH_CHO_TOI_DA; i++) await q.themAnh(anh(), 'image/webp', '250301895');
    await expect(q.themAnh(anh(), 'image/webp', '250301895')).rejects.toBeInstanceOf(q.LoiQuaNhieuAnh);
  });
});

describe('tiện ích', () => {
  it('thoiGianChoLai: 1s, 2s, 4s … tối đa 60s, nhân jitter 0,5–1,5', () => {
    expect(q.thoiGianChoLai(0, 0.5)).toBe(1000);
    expect(q.thoiGianChoLai(3, 0.5)).toBe(8000);
    expect(q.thoiGianChoLai(20, 0.5)).toBe(60_000);
    expect(q.thoiGianChoLai(0, 0)).toBe(500);
    expect(q.thoiGianChoLai(0, 1)).toBe(1500);
  });
  it('tinhTrangHangDoi: cảnh báo đỏ khi sự kiện cũ nhất chờ quá 4 giờ', async () => {
    await them(1);
    expect((await q.tinhTrangHangDoi()).canhBao).toBe(false);
    expect((await q.tinhTrangHangDoi(Date.now() + 4 * 3_600_000 + 1)).canhBao).toBe(true);
  });
  it('xinLuuBen: trình duyệt không hỗ trợ → null', async () => {
    vi.stubGlobal('navigator', {});
    expect(await q.xinLuuBen()).toBeNull();
  });
});
