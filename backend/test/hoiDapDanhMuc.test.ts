import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bangTheoId, sqlCot, loaiKhsx } from '../src/server/hoiDapDanhMuc.js';

// Chạy: npm test. Danh mục Hỏi số liệu — server/hoiDapDanhMuc.ts

describe('hỏi số liệu — danh mục', () => {
  it('bảng kế hoạch: cột kỳ có ngày cho cả KH THÁNG (ngày 1 của tháng), không chỉ KH TUẦN', () => {
    const b = bangTheoId.get('khsx')!;
    const sql = sqlCot(b.cot.find(c => c.id === b.ngay)!);
    assert.match(sql, /COALESCE\(t\.ngay_khnk, make_date\(t\.nam::int/);
  });

  it('loại KH mặc định theo kỳ hỏi: tuần / ngày / kỳ < 28 ngày = TUẦN; tháng / quý / năm / không kỳ = THÁNG; câu đã nói loại => không thêm', () => {
    const q = (tu?: string, den?: string, nhom: string[] = [], loc: Array<{ cot: string }> = []) => ({ loc, nhom, tu, den });
    assert.equal(loaiKhsx('khsx', q('2026-10-19', '2026-10-25')), 'TUẦN');
    assert.equal(loaiKhsx('khsx', q('2026-10-19', '2026-10-19')), 'TUẦN');
    assert.equal(loaiKhsx('khsx', q('2026-09-01', '2026-09-15')), 'TUẦN');
    assert.equal(loaiKhsx('khsx', q('2026-09-01', '2026-09-30')), 'THÁNG');
    assert.equal(loaiKhsx('khsx', q('2026-10-01', '2026-10-31')), 'THÁNG');
    assert.equal(loaiKhsx('khsx', q('2026-07-01', '2026-09-30')), 'THÁNG');
    assert.equal(loaiKhsx('khsx', q()), 'THÁNG');
    // Chia theo tuần / ngày => KH tuần dù kỳ dài; chia theo tháng => KH tháng dù kỳ ngắn
    assert.equal(loaiKhsx('khsx', q('2026-01-01', '2026-12-31', ['ngay_khnk@tuan'])), 'TUẦN');
    assert.equal(loaiKhsx('khsx', q('2026-01-01', '2026-12-31', ['ngay_khnk@ngay'])), 'TUẦN');
    assert.equal(loaiKhsx('khsx', q('2026-10-19', '2026-10-25', ['ngay_khnk@thang'])), 'THÁNG');
    // Câu đã lọc / chia theo loại kế hoạch => để nguyên
    assert.equal(loaiKhsx('khsx', q('2026-09-01', '2026-09-30', ['phan_loai_kh'])), null);
    assert.equal(loaiKhsx('khsx', q('2026-09-01', '2026-09-30', [], [{ cot: 'phan_loai_kh' }])), null);
    assert.equal(loaiKhsx('nhap_kho', q('2026-09-01', '2026-09-30')), null);
  });

  it('vướng mắc: trạng thái có "Mới" — "đang mở" = Mới + Đang xử lý (cùng cách đếm open của trang Vướng mắc)', () => {
    const st = bangTheoId.get('vuong_mac')!.cot.find(c => c.id === 'status')!;
    assert.deepEqual(st.gt, ['Mới', 'Đang xử lý', 'Đã xong', 'Đã đóng']);
  });
});
