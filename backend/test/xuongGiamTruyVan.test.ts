import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { banLuuDungDuoc } from '../src/server/xuong/gioCongLuu.js';
import { sqlTrongKyVN } from '../src/server/xuong/canXem.js';
import { diemDanhTayChuaHuy } from '../src/server/xuong/tram.js';
import { phamViTheoQuyen } from '../src/server/xuong/phamVi.js';

// Phần thuần của đợt giảm truy vấn mục Xưởng (không kết nối DB)

describe('banLuuDungDuoc — bản lưu giờ công (tổ, ngày) dùng thay tính lại', () => {
  const goc = { ngay: '2026-11-10', homNay: '2026-11-13', v: '7', luu: { v: '7', bam: 'abc123' }, bamHienTai: 'abc123' };

  it('đủ 3 điều kiện: ngày đã qua, đúng phiên bản sổ, đúng dấu lịch ca', () => {
    assert.equal(banLuuDungDuoc(goc), true);
  });
  it('phiên bản sổ kiểu số / chuỗi (bigint của pg) vẫn khớp', () => {
    assert.equal(banLuuDungDuoc({ ...goc, v: 7, luu: { v: '7', bam: 'abc123' } }), true);
    assert.equal(banLuuDungDuoc({ ...goc, v: '7', luu: { v: 7, bam: 'abc123' } }), true);
  });
  it('hôm nay và ngày sau hôm nay: luôn tính lại', () => {
    assert.equal(banLuuDungDuoc({ ...goc, ngay: '2026-11-13' }), false);
    assert.equal(banLuuDungDuoc({ ...goc, ngay: '2026-11-14' }), false);
  });
  it('phiên bản sổ đã tăng (có sự kiện mới / huỷ): tính lại', () => {
    assert.equal(banLuuDungDuoc({ ...goc, v: '8' }), false);
  });
  it('lịch ca / cách tính đổi (dấu khác): tính lại', () => {
    assert.equal(banLuuDungDuoc({ ...goc, bamHienTai: 'khac' }), false);
    assert.equal(banLuuDungDuoc({ ...goc, luu: { v: '7', bam: null } }), false);
    assert.equal(banLuuDungDuoc({ ...goc, luu: { v: '7' } }), false);
  });
  it('chưa có dòng phiên bản hoặc chưa có bản lưu: tính lại', () => {
    assert.equal(banLuuDungDuoc({ ...goc, v: null }), false);
    assert.equal(banLuuDungDuoc({ ...goc, v: undefined }), false);
    assert.equal(banLuuDungDuoc({ ...goc, luu: undefined }), false);
    assert.equal(banLuuDungDuoc({ ...goc, luu: null }), false);
    assert.equal(banLuuDungDuoc({ ...goc, luu: { bam: 'abc123' } }), false);
  });
  it('phiên bản 0 vẫn là phiên bản hợp lệ', () => {
    assert.equal(banLuuDungDuoc({ ...goc, v: 0, luu: { v: '0', bam: 'abc123' } }), true);
  });
});

describe('sqlTrongKyVN — khoảng ngày giờ VN trên cột gốc', () => {
  it('khoảng nửa mở: từ 00:00 ngày đầu tới trước 00:00 ngày sau ngày cuối', () => {
    assert.equal(
      sqlTrongKyVN('e.device_ts_hieu_chinh', '$2', '$3'),
      "(e.device_ts_hieu_chinh >= ($2::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'"
      + " AND e.device_ts_hieu_chinh < ($3::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')");
  });
  it('bọc ngoặc để ghép AND / OR không đổi nghĩa; không bọc hàm quanh cột', () => {
    const s = sqlTrongKyVN('device_ts_hieu_chinh', '$2', '$3');
    assert.ok(s.startsWith('(') && s.endsWith(')'));
    assert.ok(!/\(device_ts_hieu_chinh AT TIME ZONE/.test(s));
  });
  it('chỉ nhận tham số $n và tên cột — không ghép chuỗi lạ vào SQL', () => {
    assert.throws(() => sqlTrongKyVN('ts', "'2026-01-01'", '$3'));
    assert.throws(() => sqlTrongKyVN('ts', '$2', '$3; DROP TABLE x'));
    assert.throws(() => sqlTrongKyVN('ts); --', '$2', '$3'));
  });
  // Cùng ranh giới với cách cũ ((cột AT TIME ZONE VN)::date BETWEEN tu AND den) — kiểm bằng số học giờ VN (UTC+7 cố định)
  it('ranh giới ngày giờ VN khớp cách tính ngày cũ', () => {
    const ngayVN = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
    const tu = '2026-11-01', den = '2026-11-03';
    const dau = Date.parse(`${tu}T00:00:00+07:00`);
    const cuoi = Date.parse(`${den}T00:00:00+07:00`) + 86_400_000;
    for (const ms of [dau - 1, dau, dau + 1, cuoi - 1, cuoi, cuoi + 1, Date.parse('2026-11-02T23:59:59.999+07:00'), Date.parse('2026-10-31T17:00:00Z')]) {
      const cu = ngayVN(ms) >= tu && ngayVN(ms) <= den;
      const moi = ms >= dau && ms < cuoi;
      assert.equal(moi, cu, new Date(ms).toISOString());
    }
  });
});

describe('diemDanhTayChuaHuy — điểm danh tay lấy từ sổ của tổ đã đọc', () => {
  const e = (id: string, loai: string, duLieu: Record<string, unknown> | null = null) => ({ id, loai, duLieu }) as never as { id: string; loai: 'vao_ca'; duLieu: Record<string, unknown> | null };

  it('chỉ giữ vao_ca / ra_ca không thuộc sổ trạm', () => {
    const ds = [
      e('1', 'vao_ca', { nguoi: ['A1'] }),            // tổ trưởng điểm danh tay
      e('2', 'vao_ca', { tram: true, mnv: 'A2' }),    // quét ở trạm
      e('3', 'ra_ca', { nguoi: ['A1'] }),
      e('4', 'nguoi_vao', { mnv: 'A1' }),             // sổ trạm
      e('5', 'nguoi_ra', { mnv: 'A1' }),
    ];
    assert.deepEqual(diemDanhTayChuaHuy(ds, []).map(x => x.id), ['1', '3']);
  });
  it('bỏ dòng có sự kiện huy trỏ tới (như NOT EXISTS huy trong SQL cũ)', () => {
    const ds = [e('1', 'vao_ca', {}), e('3', 'ra_ca', {})];
    assert.deepEqual(diemDanhTayChuaHuy(ds, ['3']).map(x => x.id), ['1']);
    assert.deepEqual(diemDanhTayChuaHuy(ds, ['1', '3', 'khac']).map(x => x.id), []);
  });
  it('du_lieu.tram phải đúng true mới là sổ trạm', () => {
    assert.deepEqual(diemDanhTayChuaHuy([e('1', 'vao_ca', { tram: 'true' }), e('2', 'vao_ca', null)], []).map(x => x.id), ['1', '2']);
  });
});

// quyenXuongCua (routes/xuong.ts) trả tổ trưởng rỗng cho admin rồi mới gọi phamViTheoQuyen: kết quả phải như phamViXem cũ
describe('phạm vi xem từ quyền đọc một lần', () => {
  it('admin: cả xưởng dù không đọc danh sách tổ trưởng', () => {
    assert.deepEqual(phamViTheoQuyen(new Set(['*']), [], 'XA'), { chiTo: null });
  });
  it('tổ trưởng (kể cả có quyền quản lý): chỉ tổ mình trong xưởng đó', () => {
    assert.deepEqual(phamViTheoQuyen(new Set(['XA']), [{ id: 3, xuong: 'XA' }, { id: 9, xuong: 'XB' }], 'XA'), { chiTo: [3] });
    assert.equal(phamViTheoQuyen(new Set(['XA']), [{ id: 9, xuong: 'XB' }], 'XA'), null);
  });
  it('quản lý không làm tổ trưởng: cả xưởng mình; còn lại không được xem', () => {
    assert.deepEqual(phamViTheoQuyen(new Set(['XA']), [], 'XA'), { chiTo: null });
    assert.equal(phamViTheoQuyen(new Set(['XA']), [], 'XB'), null);
    assert.equal(phamViTheoQuyen(new Set(), [], 'XA'), null);
  });
});
