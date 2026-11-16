import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authXuong, donXuongKhiDoiNguoi, idTuToken, idNguoiDangDung } from '../services/xuongClock';
import { tachTheoNguoi, type SuKienCho } from '../services/xuongQueue';

// Token Xưởng trên máy dùng chung: người sau đăng nhập không được gửi dưới tên người trước (S42, S43).

class BoNhoTam {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

/** JWT giả (chữ ký không kiểm ở máy) */
const jwt = (id: number) =>
  `h.${btoa(JSON.stringify({ id, username: `u${id}` })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.sig`;

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', new BoNhoTam());
  vi.stubGlobal('sessionStorage', new BoNhoTam());
});

describe('donXuongKhiDoiNguoi', () => {
  const ganPhien = (id: number) => {
    localStorage.setItem('xuong_token', jwt(id));
    localStorage.setItem('xuong_phien', JSON.stringify({ user: { id, fullName: 'A', username: 'a' }, to: [] }));
    localStorage.setItem('xuong_to_cuoi', '5');
    localStorage.setItem('xuong_device_token', 'dev.sig');
  };

  it('đăng nhập người khác: xoá token, phiên, tổ đang chọn; giữ mã máy', () => {
    ganPhien(7);
    expect(donXuongKhiDoiNguoi('9')).toBe(true);
    expect(localStorage.getItem('xuong_token')).toBeNull();
    expect(localStorage.getItem('xuong_phien')).toBeNull();
    expect(localStorage.getItem('xuong_to_cuoi')).toBeNull();
    expect(localStorage.getItem('xuong_device_token')).toBe('dev.sig');
  });

  it('cùng người đăng nhập lại: giữ token Xưởng', () => {
    ganPhien(7);
    expect(donXuongKhiDoiNguoi('7')).toBe(false);
    expect(localStorage.getItem('xuong_token')).toBe(jwt(7));
    expect(localStorage.getItem('xuong_to_cuoi')).toBe('5');
  });

  it('phiên hỏng: coi như người khác', () => {
    localStorage.setItem('xuong_token', jwt(7));
    localStorage.setItem('xuong_phien', '{hỏng');
    expect(donXuongKhiDoiNguoi(7)).toBe(true);
    expect(localStorage.getItem('xuong_token')).toBeNull();
  });
});

describe('authXuong', () => {
  it('token Xưởng và token app khác người: dùng token app', () => {
    localStorage.setItem('xuong_token', jwt(7));
    sessionStorage.setItem('app_token', jwt(9));
    expect(authXuong()).toEqual({ Authorization: `Bearer ${jwt(9)}` });
    expect(idNguoiDangDung()).toBe(9);
  });

  it('cùng người: dùng token Xưởng (30 ngày); chỉ còn token Xưởng vẫn dùng', () => {
    localStorage.setItem('xuong_token', jwt(7));
    localStorage.setItem('app_token', jwt(7));
    expect(authXuong()).toEqual({ Authorization: `Bearer ${jwt(7)}` });
    localStorage.removeItem('app_token');
    expect(authXuong()).toEqual({ Authorization: `Bearer ${jwt(7)}` });
  });

  it('idTuToken: token không phải JWT → null', () => {
    expect(idTuToken('tok')).toBeNull();
    expect(idTuToken(null)).toBeNull();
    expect(idTuToken(jwt(12))).toBe(12);
  });
});

describe('tachTheoNguoi', () => {
  const ev = (id: string, userId: number | null) => ({ id, userId, loai: 'nhan', deviceTs: 0, lechMs: null, sauDoiGio: false, queuedAt: 0 }) as SuKienCho;

  it('chỉ phần của người đang đăng nhập được gửi; người khác / chưa rõ người đếm riêng', () => {
    localStorage.setItem('xuong_ten_nguoi', JSON.stringify({ 9: 'Trần B' }));
    const { cuaToi, cuaNguoiKhac } = tachTheoNguoi([ev('a', 7), ev('b', 9), ev('c', 9), ev('d', null)], 7);
    expect(cuaToi.map(e => e.id)).toEqual(['a']);
    expect(cuaNguoiKhac).toEqual([{ userId: 9, ten: 'Trần B', so: 2 }, { userId: null, ten: 'người chưa rõ', so: 1 }]);
  });

  it('chưa rõ người đang đăng nhập: gửi cả hàng', () => {
    expect(tachTheoNguoi([ev('a', 7), ev('b', null)], null).cuaToi).toHaveLength(2);
  });
});
