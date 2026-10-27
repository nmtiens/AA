import { describe, expect, it } from 'vitest';
import type { TCreatedPdf, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import type { DiemTonKhoVt, TongHopTonKhoVt } from '../../../services/tonKhoVtApi';
import { dungChuoi, tongCacNhom } from './xuLy';
import { FONT_ROBOTO, bangBaoCaoExcel, chuXuHuong, dungBaoCaoPdf, layModule, tenFileBaoCao, tongKetNhom, type DauVaoBaoCao } from './baoCao';

// Số thật cuối tháng T2 → T10/2026 (tỷ) của 2 nhóm; lần chốt 24/09 thiếu cờ chậm luân chuyển ở CẢ bảng
const NGAY = ['2026-02-26', '2026-03-26', '2026-04-23', '2026-05-28', '2026-06-25', '2026-07-30', '2026-08-27', '2026-09-24', '2026-10-22'];
const VAI = [[26.56, 18.32], [29.94, 23.07], [30.81, 24.22], [31.74, 25.24], [36.86, 26.25], [50.64, 27.9], [51.04, 28.04], [44.15, 0], [39.73, 29.01]];
const GO = [[34.47, 5.76], [35.05, 14.38], [35.73, 17.42], [30.62, 17.94], [31.12, 18.73], [25.25, 15.95], [24.99, 14.88], [24.11, 0], [22.33, 14.31]];
const diem = (ngay: string, nhom: string, v: number, c: number): DiemTonKhoVt =>
  ({ ngay, nhom, giaTri: v * 1000, giaTriCham: c * 1000, soMa: 100, soMaCham: c ? 60 : 0 });
const th: TongHopTonKhoVt = {
  capNhat: null, ngay: NGAY, nhom: ['KVT Vải Da Mouss', 'KVT Gỗ'],
  diem: NGAY.flatMap((n, i) => [diem(n, 'KVT Vải Da Mouss', VAI[i][0], VAI[i][1]), diem(n, 'KVT Gỗ', GO[i][0], GO[i][1])]),
};
const chuoi = dungChuoi(th, { moc: 'thang', chiSo: 'giaTri' });
// PNG 1×1 trắng
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const dauVao = (them: Partial<DauVaoBaoCao> = {}): DauVaoBaoCao => ({
  chuoi, tong: tongCacNhom(chuoi)!, chiSo: 'giaTri', moc: 'thang', khoangNhan: 'Tất cả', ngayMoiNhat: '2026-10-22',
  capNhat: '09:17 27/10/2026', nguoiLap: 'Nguyễn Văn Ấn', luc: new Date(2026, 9, 27, 10, 45),
  anh: { 'KVT Vải Da Mouss': PNG, 'KVT Gỗ': PNG }, mau: { 'KVT Vải Da Mouss': '#d55181', 'KVT Gỗ': '#eb6834' }, ...them,
});

/** Gom mọi chuỗi chữ trong cây nội dung pdfmake (để kiểm nội dung không phụ thuộc bố cục) */
const chu = (x: unknown): string[] => {
  if (typeof x === 'string') return [x];
  if (Array.isArray(x)) return x.flatMap(chu);
  if (x && typeof x === 'object') return Object.entries(x).filter(([k]) => k !== 'image').flatMap(([, v]) => chu(v));
  return [];
};

describe('báo cáo tồn kho vật tư — tổng kết nhóm', () => {
  it('số mới nhất, so đầu khoảng, đỉnh, trung bình, xu hướng, % chậm', () => {
    const k = tongKetNhom(chuoi[0], 'giaTri')!;
    expect(k.cuoi.tong).toBeCloseTo(39_730);
    expect(k.chenhDau).toBeCloseTo(13_170);
    expect(k.dinh.nhan).toBe('T8/26');
    expect(k.tb).toBeCloseTo(VAI.reduce((s, x) => s + x[0], 0) / 9 * 1000);
    expect(k.xh?.huong).toBe('tang');
    expect(k.ptCham).toBeCloseTo(29.01 / 39.73 * 100);
    expect(chuXuHuong(tongKetNhom(chuoi[1], 'giaTri')!.xh, 'giaTri', 'thang')).toMatch(/^giảm ~\d+\.\d\d tỷ\/tháng \(−\d+% cả khoảng\)$/);
  });
  it('sheet Excel "Báo cáo": tiêu đề cột có đơn vị, 1 dòng / nhóm + dòng tổng, số theo tỷ', () => {
    const b = bangBaoCaoExcel(chuoi, 'giaTri', 'thang');
    expect(b[0][1]).toBe('Tồn mới nhất (tỷ)');
    expect(b[0][8]).toBe('Xu hướng mỗi tháng (tỷ)');
    expect(b.map(r => r[0])).toEqual(['Nhóm vật tư', 'KVT Vải Da Mouss', 'KVT Gỗ', 'Tổng các nhóm']);
    expect(b[1][1]).toBe(39.73);
    expect(b[1][2]).toBe('22/10/2026');
    expect(b[1][6]).toBe('T8/26');
    expect(b[3][1]).toBe(62.06);
    expect(String(b[1][12])).toMatch(/^39\.73 tỷ — tăng/);
    const soMa = bangBaoCaoExcel(dungChuoi(th, { moc: 'thang', chiSo: 'soMa' }), 'soMa', 'thang');
    expect(soMa[0][1]).toBe('Tồn mới nhất (mã)');
    expect(soMa[1][1]).toBe(100);
  });
  it('tên file theo mốc + ngày chốt', () => {
    expect(tenFileBaoCao({ moc: 'thang', ngayMoiNhat: '2026-10-22' }, 'pdf')).toBe('bao-cao-ton-kho-vat-tu_theo-thang_2026-10-22.pdf');
  });
});

describe('báo cáo tồn kho vật tư — PDF', () => {
  it('nội dung: tiêu đề, khoảng thật, người lập, bảng tổng kết, mỗi nhóm câu tóm tắt + ảnh + bảng kỳ', () => {
    const doc = dungBaoCaoPdf(dauVao());
    expect(doc.pageOrientation).toBe('landscape');
    const t = chu(doc.content).join('\n');
    expect(t).toContain('BÁO CÁO TỒN KHO VẬT TƯ');
    expect(t).toContain('Tất cả (T2/26 – T10/26)');
    expect(t).toContain('người lập: Nguyễn Văn Ấn');
    expect(t).toContain('lập lúc 10:45 27/10/2026');
    expect(t).toContain('Tổng kết theo nhóm');
    expect(t).toMatch(/39\.73 tỷ — tăng 13\.17 tỷ \(\+50%\) so với T2\/26/);
    expect(t).toContain('Trung bình 9 tháng');
    expect(t).toContain('So kỳ trước');
    // lần chốt cuối tháng 9 (24/09) thiếu cờ => có ghi chú
    expect(t).toContain('Lần chốt 24/09/2026: file nguồn không có cột chậm luân chuyển');
    // Roboto không có ▲ ▼ (in ra ô vuông) => báo cáo PDF không được dùng
    expect(t).not.toMatch(/[▲▼]/);
    const anh = JSON.stringify(doc.content).match(/data:image\/png/g) ?? [];
    expect(anh).toHaveLength(2);
  });
  it('thiếu ảnh 1 nhóm => ghi chú thay ảnh; theo tuần > 13 kỳ => không in bảng kỳ', () => {
    const t = chu(dungBaoCaoPdf(dauVao({ anh: { 'KVT Vải Da Mouss': PNG } })).content).join('\n');
    expect(t).toContain('(Không chụp được biểu đồ của nhóm này)');
    const nhieu: TongHopTonKhoVt = { ...th, ngay: [], diem: [] };
    for (let i = 0; i < 20; i++) {
      const n = `2026-0${3 + Math.floor(i / 5)}-${String(1 + (i % 5) * 6).padStart(2, '0')}`;
      nhieu.ngay.push(n);
      nhieu.diem.push(diem(n, 'KVT Gỗ', 20 + i, 10));
    }
    const ct = dungChuoi(nhieu, { moc: 'tuan', chiSo: 'giaTri' });
    const t2 = chu(dungBaoCaoPdf(dauVao({ chuoi: ct, tong: tongCacNhom(ct)!, moc: 'tuan' })).content).join('\n');
    expect(t2).not.toContain('So kỳ trước');
    expect(t2).toContain('Trung bình 20 lần chốt');
  });

  it('nhóm đang lọc tên: ghi "lọc: …" ở bảng tổng kết + trang nhóm, in điều kiện + danh sách tên, ghi chú số tổng là toàn kho', () => {
    const ten = Array.from({ length: 23 }, (_, i) => `VẢI MẪU ${i + 1}`);
    const t = chu(dungBaoCaoPdf(dauVao({ loc: { 'KVT Vải Da Mouss': { ten, moTa: 'tên chứa “vải”' } } })).content).join('\n');
    expect(t.match(/Vải Da Mouss \(lọc: tên chứa “vải”\)/g)).toHaveLength(2);
    expect(t).toContain('Bộ lọc: tên chứa “vải” — 23 tên vật tư: VẢI MẪU 1, VẢI MẪU 2');
    expect(t).toContain('… và 3 tên khác');
    expect(t).not.toContain('VẢI MẪU 21');
    expect(t).toContain('4 số tổng phía trên tính cho toàn kho');
    expect(t).not.toContain('Gỗ (lọc');
    const khongLoc = chu(dungBaoCaoPdf(dauVao()).content).join('\n');
    expect(khongLoc).not.toContain('lọc');
    // Excel: tên dòng tổng do nơi gọi đặt khi có nhóm đang lọc
    expect(bangBaoCaoExcel(chuoi, 'giaTri', 'thang', 'Tổng các dòng trên (theo bộ lọc tên)').slice(-1)[0][0]).toBe('Tổng các dòng trên (theo bộ lọc tên)');
  });

  it('xem theo tháng có doanh thu: thêm dòng "Doanh thu (tỷ)" vào bảng từng kỳ, tháng đang chạy đánh *, kèm ghi chú', () => {
    const doanhThu = Object.fromEntries(NGAY.map((n, i) => [n.slice(0, 7), 100 + i]));
    const t = chu(dungBaoCaoPdf(dauVao({ doanhThu, thangTamTinh: '2026-10' })).content).join('\n');
    expect(t).toContain('Doanh thu (tỷ)');
    expect(t).toContain('108.00*');
    expect(t).toContain('* tạm tính (tháng chưa hết)');
    expect(t).toContain('Doanh thu tháng = giá trị nhập kho thành phẩm');
    expect(chu(dungBaoCaoPdf(dauVao()).content).join('\n')).not.toContain('Doanh thu');
  });

  it('render thật bằng pdfmake (font Roboto, chữ có dấu, trang ngang ≥ 2 trang)', async () => {
    interface PdfMakeServer {
      virtualfs: { writeFileSync(ten: string, du: Buffer): void };
      setFonts(f: TFontDictionary): void;
      setUrlAccessPolicy(f: () => boolean): void;
      setLocalAccessPolicy(f: () => boolean): void;
      createPdf(d: TDocumentDefinitions): TCreatedPdf & { getBuffer(): Promise<Buffer> };
    }
    const pdfmake = layModule<PdfMakeServer>(await import('pdfmake'));
    const vfs = layModule<Record<string, string>>(await import('pdfmake/build/vfs_fonts'));
    for (const [ten, b64] of Object.entries(vfs)) if (ten.endsWith('.ttf')) pdfmake.virtualfs.writeFileSync(ten, Buffer.from(b64, 'base64'));
    pdfmake.setFonts(FONT_ROBOTO);
    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy(() => false);
    const buf = await pdfmake.createPdf(dungBaoCaoPdf(dauVao())).getBuffer();
    const tho = buf.toString('latin1');
    expect(tho.slice(0, 4)).toBe('%PDF');
    expect(tho).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);
    expect(tho).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto-Medium/);
    const soTrang = Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(tho)?.[1] ?? 0);
    expect(soTrang).toBeGreaterThanOrEqual(2);
  }, 30_000);
});
