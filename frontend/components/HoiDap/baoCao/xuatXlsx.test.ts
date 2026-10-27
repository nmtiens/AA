import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { dungWorkbook } from './xuatXlsx';
import { dungBaoCao } from './moHinh';
import type { TraLoi } from '../traLoi';

const tra = (chu: string, bang?: TraLoi['bang']): TraLoi => ({ chu, bang });

/** Báo cáo mẫu: mục 1 không bảng, mục 2 có bảng với ô số đã định dạng + dòng tổng */
const bcMau = () => dungBaoCao([
  { cauHoi: 'nhập kho tháng này', tra: tra('**Nhập kho (P022)** tháng 10: **84.64 tỷ**\n_Hiểu là: Nhập kho · tháng 10/2026_') },
  {
    cauHoi: '🔎 Nhập kho · theo xưởng',
    tra: tra('7 nhóm.\n_Hiểu là: Nhập kho · theo xưởng_\n_Tồn kho chốt ngày 15/10/2026._', {
      cot: ['Xưởng', 'Số HEX', 'Tổng (tỷ)', 'Tỷ lệ', 'So kỳ trước'],
      dong: [
        ['4A', '1,263', '41.87', '27%', '▲ +8%'],
        ['4B', '980', '30.12', '19%', '▼ -2%'],
      ],
      phai: [1, 2, 3, 4],
      cuoi: ['Tổng', '2,243', '71.99', '46%', ''],
    }),
  },
], 'ĐINH BÁ LỘC', new Date(2026, 9, 23, 14, 5));

describe('báo cáo — xuất Excel', () => {
  it('thứ tự & số sheet: Tóm tắt trước, rồi mỗi câu có bảng 1 sheet (≤ 31 ký tự)', () => {
    const wb = dungWorkbook(bcMau());
    expect(wb.SheetNames).toEqual(['Tóm tắt', '2. Nhập kho · theo xưởng']);
    expect(wb.SheetNames.every(t => t.length <= 31)).toBe(true);
  });

  it('sheet Tóm tắt: tiêu đề, ngày lập, người lập, tiêu đề cột, 1 dòng / câu', () => {
    const bc = bcMau();
    const ws = dungWorkbook(bc).Sheets['Tóm tắt'];
    const dong = XLSX.utils.sheet_to_json<Array<string | number>>(ws, { header: 1, blankrows: true });
    expect(dong[0]).toEqual(['Báo cáo số liệu']);
    expect(dong[1]).toEqual(['Ngày lập', '23/10/2026 14:05']);
    expect(dong[2]).toEqual(['Người lập', 'ĐINH BÁ LỘC']);
    expect(dong[3]).toEqual([]);
    expect(dong[4]).toEqual(['STT', 'Câu hỏi', 'Kết quả', 'Điều kiện (Hiểu là)', 'Ghi chú', 'Bảng số liệu']);
    expect(dong[5]).toEqual([1, 'nhập kho tháng này', 'Nhập kho (P022) tháng 10: 84.64 tỷ', 'Nhập kho · tháng 10/2026', '', '']);
    // Câu trả lời dạng bảng: kết quả chính = "N nhóm." + dòng tổng (moHinh.ketQuaTuTong), ô tổng rỗng bị bỏ
    expect(dong[6]).toEqual([2, 'Nhập kho · theo xưởng', '7 nhóm. Số HEX: 2,243 · Tổng (tỷ): 71.99 · Tỷ lệ: 46%', 'Nhập kho · theo xưởng', 'Tồn kho chốt ngày 15/10/2026.', '2. Nhập kho · theo xưởng']);
    expect(dong).toHaveLength(7);
    // STT là số thật
    expect(ws['A6'].t).toBe('n');
    expect(ws['A6'].v).toBe(1);
    expect(ws['!cols']).toBeDefined();
    expect(ws['!cols']).toHaveLength(6);
  });

  it('sheet bảng: đầu trang (câu hỏi, Hiểu là, ghi chú, dòng trống), tiêu đề cột, ô số thành số, dòng tổng cuối', () => {
    const ws = dungWorkbook(bcMau()).Sheets['2. Nhập kho · theo xưởng'];
    const dong = XLSX.utils.sheet_to_json<Array<string | number>>(ws, { header: 1, blankrows: true });
    expect(dong[0]).toEqual(['2. Nhập kho · theo xưởng']);
    expect(dong[1]).toEqual(['Hiểu là: Nhập kho · theo xưởng']);
    expect(dong[2]).toEqual(['Tồn kho chốt ngày 15/10/2026.']);
    expect(dong[3]).toEqual([]);
    expect(dong[4]).toEqual(['Xưởng', 'Số HEX', 'Tổng (tỷ)', 'Tỷ lệ', 'So kỳ trước']);
    expect(dong[5]).toEqual(['4A', 1263, 41.87, '27%', '▲ +8%']);
    expect(dong[6]).toEqual(['4B', 980, 30.12, '19%', '▼ -2%']);

    // Ô số: "1,263" -> 1263 kiểu 'n'; "41.87" -> 41.87; "27%" và "▲ +8%" vẫn là chuỗi
    expect(ws['B6'].t).toBe('n');
    expect(ws['B6'].v).toBe(1263);
    expect(ws['C6'].t).toBe('n');
    expect(ws['C6'].v).toBe(41.87);
    expect(ws['D6'].t).toBe('s');
    expect(ws['D6'].v).toBe('27%');
    expect(ws['E6'].t).toBe('s');
    expect(ws['E6'].v).toBe('▲ +8%');

    // Dòng tổng (cuoi) là dòng cuối cùng, cũng qua oSangSo
    const cuoi = dong[dong.length - 1];
    expect(cuoi).toEqual(['Tổng', 2243, 71.99, '46%', '']);
    expect(dong).toHaveLength(8);
    const pham = XLSX.utils.decode_range(ws['!ref']!);
    expect(pham.e.r).toBe(7);
    expect(ws['B8'].t).toBe('n');
    expect(ws['B8'].v).toBe(2243);

    // Độ rộng cột: 5 cột, kẹp trong [8, 60]
    const cols = ws['!cols']!;
    expect(cols).toHaveLength(5);
    expect(cols.every(c => (c.wch ?? 0) >= 8 && (c.wch ?? 0) <= 60)).toBe(true);
    expect(cols[4].wch).toBe('So kỳ trước'.length);
  });

  it('độ rộng cột kẹp tối đa 60 khi ô quá dài', () => {
    const bc = dungBaoCao([{
      cauHoi: 'danh sách',
      tra: tra('1 dòng.', { cot: ['Tên'], dong: [['x'.repeat(200)]] }),
    }], 'A');
    const ws = dungWorkbook(bc).Sheets[bc.muc[0].tenSheet];
    expect(ws['!cols']![0].wch).toBe(60);
  });

  it('2 câu hỏi cùng chữ => 2 sheet tên khác nhau, đủ cả 2', () => {
    const bang: TraLoi['bang'] = { cot: ['Xưởng', 'Tổng (tỷ)'], dong: [['4A', '21.88']] };
    const bc = dungBaoCao([
      { cauHoi: 'nhập kho theo xưởng', tra: tra('a', bang) },
      { cauHoi: 'nhập kho theo xưởng', tra: tra('b', bang) },
    ], 'A');
    const wb = dungWorkbook(bc);
    expect(wb.SheetNames).toHaveLength(3);
    expect(new Set(wb.SheetNames).size).toBe(3);
    expect(wb.SheetNames.slice(1)).toEqual(bc.muc.map(m => m.tenSheet));
    expect(bc.muc[0].tenSheet).not.toBe(bc.muc[1].tenSheet);
  });

  it('không có câu nào có bảng => chỉ 1 sheet Tóm tắt', () => {
    const bc = dungBaoCao([{ cauHoi: 'nhập kho tháng này', tra: tra('84.64 tỷ') }], 'A');
    expect(dungWorkbook(bc).SheetNames).toEqual(['Tóm tắt']);
  });
});
