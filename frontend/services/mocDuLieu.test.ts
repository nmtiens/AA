import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dangCanSoMoi, datLaiMoc, nenHoi, nhanMoc, nhomDoi, phangMoc, theoDoiMocBang } from './mocDuLieu';

beforeEach(() => { vi.useFakeTimers(); datLaiMoc(); });
afterEach(() => { vi.useRealTimers(); });

describe('mocDuLieu', () => {
  it('phẳng hoá _moc, bỏ khoá lạ', () => {
    expect(phangMoc({ inventory: 'a', la: 'x', _moc: { bot: '1', khac: '2' } })).toEqual({ inventory: 'a', bot: '1' });
    expect(phangMoc({ inventory: 'a' })).toEqual({ inventory: 'a' });
  });
  it('chỉ tính nhóm có ở cả hai lần', () => {
    expect(nhomDoi({ inventory: 'a' }, { inventory: 'b', bot: '1' })).toEqual(['inventory']);
    expect(nhomDoi({ inventory: 'a', bot: '1' }, { inventory: 'a' })).toEqual([]);
  });
  it('lần đầu chỉ ghi mốc; đổi thì báo 1 lần gộp các bảng', () => {
    const f = vi.fn(); theoDoiMocBang(f);
    nhanMoc({ inventory: 'a', export: 'a', _moc: { bot: '1' } });
    vi.advanceTimersByTime(5000); expect(f).not.toHaveBeenCalled(); expect(dangCanSoMoi()).toBe(false);
    nhanMoc({ inventory: 'b', export: 'a', _moc: { bot: '1' } });
    vi.advanceTimersByTime(1000);
    nhanMoc({ inventory: 'b', export: 'c', _moc: { bot: '1' } });
    vi.advanceTimersByTime(5000);
    expect(f).toHaveBeenCalledTimes(1);
    expect([...f.mock.calls[0][0]].sort()).toEqual(['export', 'inventory']);
    expect(dangCanSoMoi()).toBe(true);
  });
  it('máy chủ lỗi phần mốc rồi có lại: vẫn thấy thay đổi xảy ra trong lúc đó', () => {
    const f = vi.fn(); theoDoiMocBang(f);
    nhanMoc({ _moc: { bot: '1' } }); nhanMoc({ _moc: {} }); nhanMoc({ _moc: { bot: '2' } });
    vi.advanceTimersByTime(5000); expect(f).toHaveBeenCalledTimes(1);
  });
  it('bỏ nghe thì không được báo', () => {
    const f = vi.fn(); theoDoiMocBang(f)();
    nhanMoc({ stock: 'a' }); nhanMoc({ stock: 'b' }); vi.advanceTimersByTime(3000); expect(f).not.toHaveBeenCalled();
  });
  it('nhịp hỏi', () => {
    const x = { hien: true, tuLucThaoTac: 0, tuLucHoi: 60_000, gioVN: 23 };
    expect(nenHoi(x)).toBe(true);
    expect(nenHoi({ ...x, hien: false })).toBe(false);
    const ranh = { ...x, tuLucThaoTac: 20 * 60_000 };
    expect(nenHoi(ranh)).toBe(false);
    expect(nenHoi({ ...ranh, gioVN: 10 })).toBe(false);
    expect(nenHoi({ ...ranh, gioVN: 10, tuLucHoi: 180_000 })).toBe(true);
    expect(nenHoi({ ...ranh, gioVN: 2, tuLucHoi: 900_000 })).toBe(false);
  });
});
