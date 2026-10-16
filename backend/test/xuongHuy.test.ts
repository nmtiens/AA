import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toTruongHuyDuoc } from '../src/routes/xuong.js';
import { kiemTraSuKienTram, ngayCaKeTiep } from '../src/routes/xuongTram.js';
import type { SuKienVao } from '../src/routes/xuong.js';

// Trạm quét (docs/designs/xuong-tram-quet.md): quyền huỷ mở rộng cho tổ trưởng, kiểm sự kiện trạm, ngày hiệu lực chế độ

const NOW = Date.parse('2026-10-16T10:00:00+07:00');
const NGAY = 86_400_000;

describe('toTruongHuyDuoc — tổ trưởng huỷ sự kiện trạm của tổ mình trong 7 ngày', () => {
  const toMinh = new Set([3]);
  const sk = (p: Record<string, unknown>) => ({ to_id: 3, co: ['tram'], server_ts: new Date(NOW - NGAY).toISOString(), ...p });
  it('sự kiện trạm / ghi hộ của tổ mình trong 7 ngày: được', () => {
    assert.equal(toTruongHuyDuoc(sk({}), toMinh, NOW), true);
    assert.equal(toTruongHuyDuoc(sk({ co: ['to_truong_ghi_ho'] }), toMinh, NOW), true);
    assert.equal(toTruongHuyDuoc(sk({ server_ts: new Date(NOW - 7 * NGAY + 60_000).toISOString() }), toMinh, NOW), true);
  });
  it('quá 7 ngày, tổ khác, hoặc sự kiện bấm tay của người khác: không', () => {
    assert.equal(toTruongHuyDuoc(sk({ server_ts: new Date(NOW - 8 * NGAY).toISOString() }), toMinh, NOW), false);
    assert.equal(toTruongHuyDuoc(sk({ to_id: 4 }), toMinh, NOW), false);
    assert.equal(toTruongHuyDuoc(sk({ co: [] }), toMinh, NOW), false);
    assert.equal(toTruongHuyDuoc(sk({ co: null }), toMinh, NOW), false);
    assert.equal(toTruongHuyDuoc(sk({ to_id: null }), toMinh, NOW), false);
  });
});

describe('kiemTraSuKienTram — trạm chỉ ghi sổ trạm của tổ mình', () => {
  const ctx = { congNhan: new Set(['NV1']), cdCuaTo: new Set(['CD1']), lamDuoc: new Set(['250301895|CD1']) };
  const e = (p: Partial<SuKienVao>): SuKienVao => ({
    id: '00000000-0000-4000-8000-000000000001', loai: 'nguoi_vao', hex: '250301895', congDoanId: 'CD1', toId: 3,
    duLieu: { mnv: 'NV1', tram: true }, deviceTs: NOW, ...p,
  } as SuKienVao);
  it('hợp lệ', () => assert.equal(kiemTraSuKienTram(e({}), ctx), null));
  it('thẻ lạ / nghỉ việc: từ chối, báo tổ trưởng', () =>
    assert.match(kiemTraSuKienTram(e({ duLieu: { mnv: 'NV9', tram: true } }), ctx)!, /báo tổ trưởng/));
  it('công đoạn tổ khác, hạng mục chưa nhận / đã xong hết: từ chối', () => {
    assert.match(kiemTraSuKienTram(e({ congDoanId: 'CD2' }), ctx)!, /Công đoạn/);
    assert.match(kiemTraSuKienTram(e({ hex: '250301896' }), ctx)!, /chưa nhận/);
  });
  it('trạm chỉ Nhận đủ / Xong hết (số lượng máy chủ tự tính), không huỷ', () => {
    assert.equal(kiemTraSuKienTram(e({ loai: 'nhan', soLuong: 1, duLieu: { mnv: 'NV1', tram: true, nhanDu: true } }), ctx), null);
    assert.equal(kiemTraSuKienTram(e({ loai: 'hoan_thanh', soLuong: 1, duLieu: { mnv: 'NV1', tram: true, xongHet: true } }), ctx), null);
    assert.match(kiemTraSuKienTram(e({ loai: 'nhan', soLuong: 1 }), ctx)!, /Nhận đủ/);
    assert.match(kiemTraSuKienTram(e({ loai: 'hoan_thanh', soLuong: 1 }), ctx)!, /Xong hết/);
    assert.match(kiemTraSuKienTram(e({ loai: 'nhan', congDoanId: 'CD2', duLieu: { mnv: 'NV1', nhanDu: true } }), ctx)!, /Công đoạn/);
    assert.match(kiemTraSuKienTram(e({ loai: 'huy' }), ctx)!, /Trạm chỉ ghi/);
    assert.match(kiemTraSuKienTram(e({ loai: 'giao' }), ctx)!, /Trạm chỉ ghi/);
  });
  it('ra hàng không cần hạng mục', () => assert.equal(kiemTraSuKienTram(e({ loai: 'nguoi_ra', hex: null, congDoanId: null }), ctx), null));
});

describe('ngayCaKeTiep — đổi chế độ có hiệu lực từ ngày ca sau', () => {
  it('ban ngày → ngày mai; 1h sáng (vẫn ca 4 hôm trước) → hôm nay', () => {
    assert.equal(ngayCaKeTiep(NOW), '2026-10-17');
    assert.equal(ngayCaKeTiep(Date.parse('2026-10-17T01:00:00+07:00')), '2026-10-17');
  });
});
