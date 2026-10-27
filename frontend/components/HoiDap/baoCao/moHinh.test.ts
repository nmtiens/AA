import { describe, it, expect } from 'vitest';
import { coTheXuat, dungBaoCao, ketQuaTuTong, laLenhXuat, oSangSo, tachTraLoi, tenFile, tenSheetHopLe } from './moHinh';
import type { TraLoi } from '../traLoi';

describe('báo cáo — mô hình', () => {
  it('tách câu trả lời: kết quả chính, Hiểu là, ghi chú; bỏ dòng chỉ dẫn', () => {
    const r = tachTraLoi([
      '**Tổng giá trị nhập kho (tỷ):** **40.54**', '**Số HEX:** 428',
      '_Theo câu trước: Xưởng = 4A — muốn hỏi chung thì thêm "tất cả"_',
      '_Hiểu là: **Nhập kho** · tổng giá trị nhập kho · lọc: Xưởng = 4A_',
      '_Tồn kho chốt ngày 15/10/2026 (tồn kho là số chụp từng ngày, không cộng dồn)._',
      '_Bỏ qua: chưa hiểu chữ "x" — kết quả có thể chưa đúng ý, bấm Sửa điều kiện để thêm điều kiện._',
    ].join('\n'));
    expect(r.ketQua).toBe('Tổng giá trị nhập kho (tỷ): 40.54 · Số HEX: 428');
    expect(r.hieuLa).toBe('Nhập kho · tổng giá trị nhập kho · lọc: Xưởng = 4A');
    expect(r.ghiChu).toEqual(['Tồn kho chốt ngày 15/10/2026 (tồn kho là số chụp từng ngày, không cộng dồn).']);
  });

  it('tên sheet hợp lệ: ≤ 31 ký tự, bỏ ký tự cấm, không trùng', () => {
    const daCo = new Set<string>();
    expect(tenSheetHopLe('1. nhập kho xưởng 4A tháng 9 theo công trình', daCo)).toBe('1. nhập kho xưởng 4A tháng 9 th');
    expect(tenSheetHopLe('2. a/b:c*d?e[f]\\g', daCo)).toBe('2. a b c d e f g');
    expect(tenSheetHopLe('1. nhập kho xưởng 4A tháng 9 theo công trình', daCo)).toBe('1. nhập kho xưởng 4A tháng (2)');
  });

  it('dựng báo cáo: thứ tự, tên sheet, bỏ 🔎, ngày lập', () => {
    const tra = (chu: string, bang?: TraLoi['bang']): TraLoi => ({ chu, bang });
    const bc = dungBaoCao([
      { cauHoi: 'nhập kho tháng này', tra: tra('**Nhập kho (P022)** tháng 10: 84.64 tỷ', undefined) },
      { cauHoi: '🔎 Nhập kho · theo xưởng', tra: tra('7 nhóm.\n_Hiểu là: Nhập kho · theo xưởng_', { cot: ['Xưởng', 'Tổng (tỷ)'], dong: [['4A', '21.88']], cuoi: ['Tổng', '88.55'] }) },
    ], 'ĐINH BÁ LỘC', new Date(2026, 9, 23, 14, 5), '');
    expect(bc.tieuDe).toBe('Báo cáo số liệu');
    expect(bc.ngayLap).toBe('23/10/2026 14:05');
    expect(bc.muc.map(m => m.tenSheet)).toEqual(['1. nhập kho tháng này', '2. Nhập kho · theo xưởng']);
    expect(bc.muc[1].hieuLa).toBe('Nhập kho · theo xưởng');
    expect(bc.muc[1].bang?.cuoi).toEqual(['Tổng', '88.55']);
    expect(tenFile(bc, 'xlsx')).toBe('bao-cao-so-lieu-2026-10-23-1405.xlsx');
  });

  it('kết quả chính của câu trả lời dạng bảng lấy thêm dòng tổng', () => {
    expect(ketQuaTuTong('7 nhóm.', { cot: ['Xưởng', 'Tổng giá trị nhập kho (tỷ)', 'Số HEX'], dong: [], cuoi: ['Tổng', '88.55', '1,263'] }))
      .toBe('7 nhóm. Tổng giá trị nhập kho (tỷ): 88.55 · Số HEX: 1,263');
    expect(ketQuaTuTong('Có 82 nhóm — hiện 5 nhóm đầu.', { cot: ['Hạng mục', 'Tổng (tỷ)'], dong: [], cuoi: ['Tổng', '2.38'] })).toBe('Có 82 nhóm — hiện 5 nhóm đầu. Tổng (tỷ): 2.38');
    expect(ketQuaTuTong('Tổng giá trị nhập kho (tỷ): 40.54', { cot: ['a'], dong: [], cuoi: ['Tổng'] })).toBe('Tổng giá trị nhập kho (tỷ): 40.54');
    expect(ketQuaTuTong('7 nhóm.', undefined)).toBe('7 nhóm.');
  });

  it('ô đã định dạng -> số', () => {
    expect(oSangSo('1,263')).toBe(1263);
    expect(oSangSo('41.87')).toBe(41.87);
    expect(oSangSo('-3.5')).toBe(-3.5);
    expect(oSangSo('27%')).toBe('27%');
    expect(oSangSo('▲ +8%')).toBe('▲ +8%');
    expect(oSangSo('(trống)')).toBe('(trống)');
    expect(oSangSo('CT25-070')).toBe('CT25-070');
    expect(oSangSo(5)).toBe(5);
  });

  it('câu nào đưa vào báo cáo được', () => {
    expect(coTheXuat({ chu: 'x', bang: { cot: [], dong: [] } })).toBe(true);
    expect(coTheXuat({ chu: 'x', tv: { bang: 'nhap_kho', kieu: 'tong', do: [], nhom: [], loc: [] } })).toBe(true);
    // Câu trả lời mẫu: chỉ khi có con số in đậm; câu trợ giúp / không tìm thấy (rong) thì không
    expect(coTheXuat({ chu: '**Nhập kho (P022)** tháng 10: **1,263 mục** · **84.64 tỷ**', nk: { duong: 'mau' } })).toBe(true);
    expect(coTheXuat({ chu: 'Gõ mã HEX, hoặc hỏi bằng câu ngắn: **bảng** + **kỳ**', nk: { duong: 'mau' } })).toBe(false);
    expect(coTheXuat({ chu: 'Tìm "**abc**": **3 hạng mục**', nk: { duong: 'mau' }, rong: true })).toBe(false);
    expect(coTheXuat({ chu: 'Chào bạn' })).toBe(false);
    expect(coTheXuat({ chu: 'x', nk: { duong: 'khong_hieu' } })).toBe(false);
    expect(coTheXuat({ chu: 'Chữ "may"…', chon: [{ nhan: 'a', cau: 'b' }] })).toBe(false);
    expect(coTheXuat(undefined)).toBe(false);
  });

  it('lệnh xuất báo cáo: nhận dạng, định dạng, phần câu hỏi kèm theo', () => {
    expect(laLenhXuat('xuất báo cáo')).toEqual({ dinhDang: null, conLai: '' });
    expect(laLenhXuat('Xuất báo cáo đi')).toEqual({ dinhDang: null, conLai: '' });
    expect(laLenhXuat('xuat bao cao nhe')).toEqual({ dinhDang: null, conLai: '' });
    expect(laLenhXuat('xuất file excel')).toEqual({ dinhDang: 'xlsx', conLai: '' });
    expect(laLenhXuat('xuất pdf')).toEqual({ dinhDang: 'pdf', conLai: '' });
    expect(laLenhXuat('làm báo cáo pdf giúp mình')).toEqual({ dinhDang: 'pdf', conLai: '' });
    expect(laLenhXuat('gửi file')).toEqual({ dinhDang: null, conLai: '' });
    expect(laLenhXuat('xuất báo cáo nhập kho tháng 10 theo xưởng')).toEqual({ dinhDang: null, conLai: 'nhập kho tháng 10 theo xưởng' });
    expect(laLenhXuat('xuất báo cáo về hạng mục quá hạn giao theo PM ra pdf')).toEqual({ dinhDang: 'pdf', conLai: 'hạng mục quá hạn giao theo PM' });
    expect(laLenhXuat('xuất excel nhập kho xưởng 4A tháng 9')).toEqual({ dinhDang: 'xlsx', conLai: 'nhập kho xưởng 4A tháng 9' });
    expect(laLenhXuat('cho tui xuất báo cáo')).toEqual({ dinhDang: null, conLai: '' });
  });

  it('không phải lệnh: câu hỏi số liệu có chữ "báo cáo" / "file"', () => {
    expect(laLenhXuat('báo cáo tiến độ công trình CT25-070')).toBeNull();
    expect(laLenhXuat('nhập kho tháng này')).toBeNull();
    expect(laLenhXuat('tình hình công trình')).toBeNull();
    expect(laLenhXuat('file nào chưa về')).toBeNull();
    // Có lời đệm nhưng vẫn là câu hỏi số liệu
    expect(laLenhXuat('em muốn biết nhập kho tháng này')).toBeNull();
    expect(laLenhXuat('cho mình hỏi xuất kho tuần này vậy')).toBeNull();
    expect(laLenhXuat('tại sao xuất kho giảm')).toBeNull();
  });

  it('lệnh có lời đệm đầu / cuối câu (biến thể loi_dem của bộ câu), dấu hỏi, viết hoa', () => {
    expect(laLenhXuat('ad ơi xuất báo cáo')).toEqual({ dinhDang: null, conLai: '' });
    expect(laLenhXuat('ad ơi, cho mình hỏi xuất báo cáo nhé')).toEqual({ dinhDang: null, conLai: '' });
    expect(laLenhXuat('cho mình hỏi xuất báo cáo nhập kho tháng này vậy')).toEqual({ dinhDang: null, conLai: 'nhập kho tháng này' });
    expect(laLenhXuat('cho tui xem xuất excel nhập kho xưởng 4A tháng 9 ạ')).toEqual({ dinhDang: 'xlsx', conLai: 'nhập kho xưởng 4A tháng 9' });
    expect(laLenhXuat('xem giúp xuất báo cáo đơn hàng tuần này theo xưởng nhé')).toEqual({ dinhDang: null, conLai: 'đơn hàng tuần này theo xưởng' });
    expect(laLenhXuat('hỏi chút xuất pdf giúp mình')).toEqual({ dinhDang: 'pdf', conLai: '' });
    expect(laLenhXuat('em muốn biết xuất báo cáo?')).toEqual({ dinhDang: null, conLai: '' });
    expect(laLenhXuat('xuất báo cáo tồn kho giúp mình?')).toEqual({ dinhDang: null, conLai: 'tồn kho' });
    expect(laLenhXuat('XUẤT BÁO CÁO ĐƠN HÀNG THÁNG NÀY THEO XƯỞNG')).toEqual({ dinhDang: null, conLai: 'ĐƠN HÀNG THÁNG NÀY THEO XƯỞNG' });
    expect(laLenhXuat('xuat excel nhap kho nam nay')).toEqual({ dinhDang: 'xlsx', conLai: 'nhap kho nam nay' });
    // "ra excel" + lời đệm chồng nhau ở cuối; "này" / "4A" không bị cắt nhầm thành lời đệm
    expect(laLenhXuat('xuất báo cáo nhập kho tháng 9 ra excel đi')).toEqual({ dinhDang: 'xlsx', conLai: 'nhập kho tháng 9' });
    expect(laLenhXuat('xuất báo cáo nhập kho năm nay')).toEqual({ dinhDang: null, conLai: 'nhập kho năm nay' });
    expect(laLenhXuat('xuất báo cáo nhập kho xưởng 4A')).toEqual({ dinhDang: null, conLai: 'nhập kho xưởng 4A' });
  });

  it('lệnh chỉ "các câu đã hỏi" / "cuộc hỏi này": không đem đi hỏi số liệu, chỉ xuất các câu đã tick', () => {
    expect(laLenhXuat('xuất báo cáo các câu đã hỏi')).toEqual({ dinhDang: null, conLai: '' });
    expect(laLenhXuat('xuất báo cáo cuộc hỏi này')).toEqual({ dinhDang: null, conLai: '' });
    expect(laLenhXuat('xuất báo cáo những câu đã tick ra pdf')).toEqual({ dinhDang: 'pdf', conLai: '' });
    expect(laLenhXuat('báo cáo các câu đã hỏi đi')).toEqual({ dinhDang: null, conLai: '' });
    expect(laLenhXuat('xuất excel các câu đã chọn ở trên nhé')).toEqual({ dinhDang: 'xlsx', conLai: '' });
    expect(laLenhXuat('xuất báo cáo tất cả')).toEqual({ dinhDang: null, conLai: '' });
    // Câu hỏi số liệu thật bắt đầu bằng "các …" vẫn giữ nguyên
    expect(laLenhXuat('xuất báo cáo các công trình quá hạn giao')).toEqual({ dinhDang: null, conLai: 'các công trình quá hạn giao' });
  });
});
