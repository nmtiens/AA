import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chuanHoaNhom, chuanHoaTen, docDanhSachTen, docNgayTruoc, KHOANG_TRANG, laNgayHopLe, sqlNhom, sqlTen, xepNhom,
  NHOM_TRONG, TEN_TRONG, type DiemTonKhoVt,
} from '../src/routes/tonKhoVt.js';

// Chạy: npm test. Tồn kho vật tư (bảng ton_kho_vt) — routes/tonKhoVt.ts. Chỉ hàm thuần, không đụng DB.

describe('chuẩn hoá nhóm vật tư', () => {
  it('bỏ khoảng trắng 2 đầu, gộp khoảng trắng giữa', () => {
    assert.equal(chuanHoaNhom(' KVT  Vải Da Mouss '), 'KVT Vải Da Mouss');
    assert.equal(chuanHoaNhom(' KVT Vải Da Mouss'), 'KVT Vải Da Mouss');
    assert.equal(chuanHoaNhom('\tKVT Gỗ\n'), 'KVT Gỗ');
    // Gạch ngang dài giữ nguyên
    assert.equal(chuanHoaNhom('KVT Tấm – Ván'), 'KVT Tấm – Ván');
  });
  it('trống => Chưa phân nhóm', () => {
    assert.equal(NHOM_TRONG, 'Chưa phân nhóm');
    assert.equal(chuanHoaNhom(''), NHOM_TRONG);
    assert.equal(chuanHoaNhom('   '), NHOM_TRONG);
    assert.equal(chuanHoaNhom(null), NHOM_TRONG);
    assert.equal(chuanHoaNhom(undefined), NHOM_TRONG);
  });
  it('NBSP / khoảng trắng Unicode (chép từ Word, web) cũng gộp — giống chuanHoaNhom ở giao diện', () => {
    assert.equal(chuanHoaNhom('KVT\u00a0Tấm – Ván'), 'KVT Tấm – Ván');
    assert.equal(chuanHoaNhom('\ufeffKVT\u202fGỗ\u2007'), 'KVT Gỗ');
    assert.equal(chuanHoaNhom('KVT \u00a0 Gỗ'), 'KVT Gỗ');
    assert.equal(chuanHoaNhom('\u00a0\u3000'), NHOM_TRONG);
    // Tên đã chuẩn hoá thì chuẩn hoá lại không đổi (giao diện gửi lại đúng tên máy chủ trả)
    for (const x of ['KVT\u00a0Tấm – Ván', ' KVT  Vải Da Mouss ', '\tKVT Gỗ\n']) {
      assert.equal(chuanHoaNhom(chuanHoaNhom(x)), chuanHoaNhom(x));
    }
  });
  it('tập khoảng trắng đúng bằng \\s của JS (mọi ký tự BMP); chuỗi giống hệt KHOANG_TRANG_NHOM ở giao diện', () => {
    assert.equal(KHOANG_TRANG, String.raw`[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+`);
    const re = new RegExp(`^${KHOANG_TRANG}$`);
    for (let c = 0; c <= 0xffff; c++) {
      const ch = String.fromCharCode(c);
      assert.equal(re.test(ch), /^\s$/.test(ch), `U+${c.toString(16).padStart(4, '0')}`);
    }
  });
  it('biểu thức SQL cùng quy tắc', () => {
    const s = sqlNhom('t.nhom_vat_tu');
    assert.ok(s.includes(`REGEXP_REPLACE(t.nhom_vat_tu, '${KHOANG_TRANG}', ' ', 'g')`));
    // Không dùng \s của Postgres (tập ký tự đổi theo locale); chuỗi nằm trong literal SQL nên không được có nháy đơn
    assert.ok(!s.includes('\\s'));
    assert.ok(!KHOANG_TRANG.includes("'"));
    assert.ok(s.includes('BTRIM('));
    assert.ok(s.includes("'Chưa phân nhóm'"));
    assert.ok(sqlNhom().includes('nhom_vat_tu'));
  });
});

describe('ngày YYYY-MM-DD hợp lệ', () => {
  it('ngày có thật', () => {
    assert.equal(laNgayHopLe('2026-10-22'), true);
    assert.equal(laNgayHopLe('2026-02-26'), true);
    assert.equal(laNgayHopLe('2028-02-29'), true);
    assert.equal(laNgayHopLe('2000-02-29'), true);
  });
  it('ngày không có thật / sai dạng', () => {
    assert.equal(laNgayHopLe('2026-02-30'), false);
    assert.equal(laNgayHopLe('2026-02-29'), false);
    assert.equal(laNgayHopLe('1900-02-29'), false);
    assert.equal(laNgayHopLe('2026-04-31'), false);
    assert.equal(laNgayHopLe('2026-13-01'), false);
    assert.equal(laNgayHopLe('2026-00-10'), false);
    assert.equal(laNgayHopLe('2026-10-00'), false);
    assert.equal(laNgayHopLe('0000-01-01'), false);
    assert.equal(laNgayHopLe('2026-1-5'), false);
    assert.equal(laNgayHopLe('22/10/2026'), false);
    assert.equal(laNgayHopLe('2026-10-22T00:00:00Z'), false);
    assert.equal(laNgayHopLe(' 2026-10-22'), false);
    assert.equal(laNgayHopLe(''), false);
    assert.equal(laNgayHopLe(undefined), false);
    assert.equal(laNgayHopLe(['2026-10-22']), false);
  });
});

describe('lần chốt để so (tham số truoc của /chi-tiet)', () => {
  it('bỏ trống => so với lần chốt liền trước', () => {
    assert.deepEqual(docNgayTruoc(undefined, '2026-10-22'), { hopLe: true, truoc: null });
    assert.deepEqual(docNgayTruoc('', '2026-10-22'), { hopLe: true, truoc: null });
  });
  it('theo tháng: so với cuối tháng trước', () => {
    assert.deepEqual(docNgayTruoc('2026-09-24', '2026-10-22'), { hopLe: true, truoc: '2026-09-24' });
  });
  it('sai dạng / không trước ngày chốt => không hợp lệ', () => {
    assert.deepEqual(docNgayTruoc('2026-10-22', '2026-10-22'), { hopLe: false });
    assert.deepEqual(docNgayTruoc('2026-10-29', '2026-10-22'), { hopLe: false });
    assert.deepEqual(docNgayTruoc('2026-02-30', '2026-10-22'), { hopLe: false });
    assert.deepEqual(docNgayTruoc('24/09/2026', '2026-10-22'), { hopLe: false });
    assert.deepEqual(docNgayTruoc(['2026-09-24'], '2026-10-22'), { hopLe: false });
  });
});

describe('thứ tự nhóm', () => {
  const d = (ngay: string, nhom: string, giaTri: number): DiemTonKhoVt =>
    ({ ngay, nhom, giaTri, giaTriCham: 0, soMa: 1, soMaCham: 0 });
  it('theo giá trị ở lần chốt mới nhất giảm dần; nhóm vắng ở lần đó xếp cuối theo tên', () => {
    const diem = [
      d('2026-10-15', 'KVT Kim Loại', 9999),
      d('2026-10-15', 'KVT Đá', 1),
      d('2026-10-15', 'KVT Gỗ', 5),
      d('2026-10-22', 'KVT Gỗ', 22327),
      d('2026-10-22', 'KVT Đá', 25326),
      d('2026-10-22', 'KVT Vải Da Mouss', 39726),
      d('2026-10-08', 'Chưa phân nhóm', 3),
    ];
    assert.deepEqual(xepNhom(diem), ['KVT Vải Da Mouss', 'KVT Đá', 'KVT Gỗ', 'Chưa phân nhóm', 'KVT Kim Loại']);
  });
  it('không có điểm nào', () => {
    assert.deepEqual(xepNhom([]), []);
  });
});

describe('bộ lọc tên vật tư của từng biểu đồ', () => {
  it('khoá tên giữ NGUYÊN chuỗi như ô Excel (NBSP, 2 dấu cách là tên khác); chỉ ô trống => (Không có tên)', () => {
    assert.equal(chuanHoaTen('VẢI_HS250601-35_KHỔ 1.4M '), 'VẢI_HS250601-35_KHỔ 1.4M ');
    assert.equal(chuanHoaTen('VẢI  04-CREAM'), 'VẢI  04-CREAM');
    assert.equal(chuanHoaTen('   '), '   ');
    assert.equal(chuanHoaTen(''), TEN_TRONG);
    assert.equal(chuanHoaTen(null), TEN_TRONG);
    assert.equal(sqlTen('t.ten_vat_tu'), `COALESCE(NULLIF(t.ten_vat_tu, ''), '${TEN_TRONG}')`);
  });
  it('danh sách tên: giữ nguyên chuỗi, bỏ trùng, xếp tăng; không gửi => rỗng', () => {
    assert.deepEqual(docDanhSachTen(['B', 'A', 'B', 'A ', '']), { hopLe: true, ten: [TEN_TRONG, 'A', 'A ', 'B'] });
    assert.deepEqual(docDanhSachTen(undefined), { hopLe: true, ten: [] });
    assert.deepEqual(docDanhSachTen(null), { hopLe: true, ten: [] });
  });
  it('sai kiểu / quá dài / quá nhiều => không hợp lệ', () => {
    assert.equal(docDanhSachTen('A').hopLe, false);
    assert.equal(docDanhSachTen([1]).hopLe, false);
    assert.equal(docDanhSachTen(['x'.repeat(301)]).hopLe, false);
    assert.equal(docDanhSachTen(Array.from({ length: 20001 }, (_, i) => `T${i}`)).hopLe, false);
  });
});
