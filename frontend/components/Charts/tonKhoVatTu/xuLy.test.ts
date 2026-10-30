import { describe, expect, it } from 'vitest';
import type { DiemTonKhoVt, DongTonKhoVt, TongHopTonKhoVt } from '../../../services/tonKhoVtApi';
import {
  bangChiTietExcel, bangTongHopExcel, chonMoc, chonNhanTruc, chuanHoaNhom, demTheoLoc, dinhDangChenh, dinhDangPt, dinhDangTienDong,
  dungChuoi, khoangTheoLuaChon, namCuaKhoang, catDuBao, locDong, ngayThieuCham, phanLoaiDong, tenNhomGon, thuTuNhom, tongCacNhom, vachTrucY,
  chiSoNhan, congThangKhoa, duBaoTonTheoDoanhThu, locTenTheoTim, tomTatNhom, tyLeDatKeHoach, trungBinhTong, vachTheoSoKhoang, xepDong, xuHuongTong,
  KHOANG_TRANG_NHOM, XEP_MAC_DINH,
} from './xuLy';

const diem = (ngay: string, nhom: string, giaTri: number, giaTriCham = 0, soMa = 1, soMaCham = 0): DiemTonKhoVt =>
  ({ ngay, nhom, giaTri, giaTriCham, soMa, soMaCham });

const th = (ngay: string[], nhom: string[], ds: DiemTonKhoVt[]): TongHopTonKhoVt => ({ capNhat: null, ngay, nhom, diem: ds });

describe('chuẩn hoá nhóm', () => {
  it('bỏ dấu cách đầu / thừa; trống => Chưa phân nhóm', () => {
    expect(chuanHoaNhom(' KVT Vải Da Mouss')).toBe('KVT Vải Da Mouss');
    expect(chuanHoaNhom('KVT  Tấm – Ván ')).toBe('KVT Tấm – Ván');
    expect(chuanHoaNhom('')).toBe('Chưa phân nhóm');
    expect(chuanHoaNhom(null)).toBe('Chưa phân nhóm');
  });
  it('NBSP / khoảng trắng Unicode gộp như máy chủ; tên đã chuẩn hoá giữ nguyên (gửi lại làm tham số nhom)', () => {
    expect(chuanHoaNhom('KVT\u00a0Tấm – Ván')).toBe('KVT Tấm – Ván');
    expect(chuanHoaNhom('\ufeffKVT\u202fGỗ\u2007')).toBe('KVT Gỗ');
    expect(chuanHoaNhom('\u00a0\u3000')).toBe('Chưa phân nhóm');
    for (const x of ['KVT\u00a0Tấm – Ván', ' KVT  Vải Da Mouss ', '\tKVT Gỗ\n']) {
      expect(chuanHoaNhom(chuanHoaNhom(x))).toBe(chuanHoaNhom(x));
    }
    // 'KVT Gỗ' và 'KVT<NBSP>Gỗ' là 1 nhóm (1 biểu đồ)
    const t = th(['2026-10-22'], ['KVT Gỗ', 'KVT\u00a0Gỗ'], [diem('2026-10-22', 'KVT Gỗ', 10), diem('2026-10-22', 'KVT\u00a0Gỗ', 5)]);
    expect(thuTuNhom(t)).toEqual(['KVT Gỗ']);
    expect(dungChuoi(t, { moc: 'tuan', chiSo: 'giaTri' })[0].diem[0].tong).toBe(15);
  });
  it('tập khoảng trắng: chuỗi giống hệt KHOANG_TRANG của máy chủ, đúng bằng \\s của JS', () => {
    // Đổi chuỗi này thì đổi cả KHOANG_TRANG ở backend/src/routes/tonKhoVt.ts (test backend kiểm cùng chuỗi)
    expect(KHOANG_TRANG_NHOM).toBe(String.raw`[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+`);
    const re = new RegExp(`^${KHOANG_TRANG_NHOM}$`);
    const lech: string[] = [];
    for (let c = 0; c <= 0xffff; c++) {
      const ch = String.fromCharCode(c);
      if (re.test(ch) !== /^\s$/.test(ch)) lech.push(c.toString(16));
    }
    expect(lech).toEqual([]);
  });
  it('tên gọn bỏ tiền tố KVT', () => {
    expect(tenNhomGon('KVT Gỗ')).toBe('Gỗ');
    expect(tenNhomGon('Chưa phân nhóm')).toBe('Chưa phân nhóm');
  });
  it('thứ tự theo `nhom` của máy chủ, bỏ trùng sau chuẩn hoá; nhóm lạ thêm cuối theo giá trị mới nhất', () => {
    const t = th(['2026-10-15', '2026-10-22'], ['KVT Gỗ', ' KVT Gỗ', 'KVT Đá'], [
      diem('2026-10-22', 'KVT Gỗ', 10),
      diem('2026-10-22', 'KVT Đá', 5),
      diem('2026-10-22', 'Nhóm B', 1),
      diem('2026-10-22', 'Nhóm A', 3),
      diem('2026-10-15', 'Nhóm C', 99), // chỉ có ở lần trước => giá trị mới nhất 0 => cuối cùng
    ]);
    expect(thuTuNhom(t)).toEqual(['KVT Gỗ', 'KVT Đá', 'Nhóm A', 'Nhóm B', 'Nhóm C']);
  });
  it('gộp 2 điểm cùng nhóm viết khác nhau', () => {
    const t = th(['2026-10-22'], ['KVT Vải Da Mouss'], [
      diem('2026-10-22', 'KVT Vải Da Mouss', 100, 40, 10, 4),
      diem('2026-10-22', ' KVT Vải Da Mouss', 5, 5, 1, 1),
    ]);
    const c = dungChuoi(t, { moc: 'tuan', chiSo: 'giaTri' });
    expect(c).toHaveLength(1);
    expect(c[0].diem[0]).toMatchObject({ tong: 105, cham: 45, binhThuong: 60 });
    expect(c[0].diem[0].goc).toEqual({ giaTri: 105, giaTriCham: 45, soMa: 11, soMaCham: 5 });
  });
});

describe('mốc tuần / tháng', () => {
  const ngayT4 = ['2026-03-26', '2026-04-01', '2026-04-08', '2026-04-15', '2026-04-22', '2026-05-14'];
  it('tháng: lấy lần chốt CUỐI tháng, không cộng các lần chốt', () => {
    const t = th(ngayT4, ['KVT Gỗ'], ngayT4.map((n, i) => diem(n, 'KVT Gỗ', (i + 1) * 100, 0, i + 1)));
    const c = dungChuoi(t, { moc: 'thang', chiSo: 'giaTri' });
    expect(c[0].diem.map(d => [d.khoa, d.nhan, d.ngayChot, d.tong])).toEqual([
      ['2026-03', 'T3/26', '2026-03-26', 100],
      ['2026-04', 'T4/26', '2026-04-22', 500], // 22/04 (điểm thứ 5), không phải 200+300+400+500
      ['2026-05', 'T5/26', '2026-05-14', 600],
    ]);
    const so = dungChuoi(t, { moc: 'thang', chiSo: 'soMa' });
    expect(so[0].diem.map(d => d.tong)).toEqual([1, 5, 6]);
  });
  it('chonMoc tháng không phụ thuộc thứ tự vào', () => {
    expect(chonMoc(['2026-04-22', '2026-04-01'], 'thang')).toEqual([{ khoa: '2026-04', nhan: 'T4/26', ngayChot: '2026-04-22' }]);
  });
  it('tuần: nhãn dd/mm, mọi ngày chốt', () => {
    const t = th(ngayT4, ['KVT Gỗ'], [diem('2026-04-08', 'KVT Gỗ', 1)]);
    const c = dungChuoi(t, { moc: 'tuan', chiSo: 'giaTri' });
    expect(c[0].diem.map(d => d.nhan)).toEqual(['26/03', '01/04', '08/04', '15/04', '22/04', '14/05']);
  });
  it('ngày chốt nhóm không có dòng => 0 (vẫn có điểm)', () => {
    const t = th(['2026-10-08', '2026-10-15', '2026-10-22'], ['KVT Gỗ', 'KVT Kim Loại'], [
      diem('2026-10-08', 'KVT Gỗ', 10), diem('2026-10-15', 'KVT Gỗ', 12), diem('2026-10-22', 'KVT Gỗ', 11),
      diem('2026-10-08', 'KVT Kim Loại', 4), diem('2026-10-22', 'KVT Kim Loại', 6),
    ]);
    const kl = dungChuoi(t, { moc: 'tuan', chiSo: 'giaTri' })[1];
    expect(kl.nhom).toBe('KVT Kim Loại');
    expect(kl.diem.map(d => d.tong)).toEqual([4, 0, 6]);
    expect(kl.diem.map(d => d.chenh)).toEqual([null, -4, 6]);
    expect(kl.diem.map(d => d.chenhPt)).toEqual([null, -100, null]); // chia cho 0 => null
  });
});

describe('khoảng ngày', () => {
  it('theo tuần: 6 tháng = (22/04, 22/10]', () => {
    expect(khoangTheoLuaChon('2026-10-22', '6t', 'tuan')).toEqual({ tu: '2026-04-23', den: '2026-10-22' });
    expect(khoangTheoLuaChon('2026-10-22', '3t', 'tuan')).toEqual({ tu: '2026-07-23', den: '2026-10-22' });
    // Theo năm: năm có lần chốt => cả năm; năm tới (chưa chốt) => chỉ lần chốt mới nhất làm điểm nối cho dự báo
    expect(khoangTheoLuaChon('2026-10-22', 'nam2026', 'thang')).toEqual({ tu: '2026-01-01', den: '2026-12-31' });
    expect(khoangTheoLuaChon('2026-10-22', 'nam2027', 'thang')).toEqual({ tu: '2026-10-01', den: '2026-10-22' });
    expect(khoangTheoLuaChon('2026-10-22', 'nam2027', 'tuan')).toEqual({ tu: '2026-10-22', den: '2026-10-22' });
    expect([namCuaKhoang('nam2027'), namCuaKhoang('tat_ca')]).toEqual([2027, null]);
  });
  it('theo tháng: 6 tháng gần nhất kể cả tháng mới nhất', () => {
    expect(khoangTheoLuaChon('2026-10-22', '6t', 'thang')).toEqual({ tu: '2026-05-01', den: '2026-10-22' });
    expect(khoangTheoLuaChon('2026-02-26', '3t', 'thang')).toEqual({ tu: '2025-12-01', den: '2026-02-26' });
  });
  it('kẹp ngày cuối tháng; tất cả / thiếu ngày => không giới hạn', () => {
    expect(khoangTheoLuaChon('2026-08-31', '6t', 'tuan')).toEqual({ tu: '2026-03-01', den: '2026-08-31' }); // 28/02 + 1
    expect(khoangTheoLuaChon('2026-10-22', 'tat_ca', 'tuan')).toEqual({ tu: null, den: null });
    expect(khoangTheoLuaChon(null, '6t', 'tuan')).toEqual({ tu: null, den: null });
  });
  it('dungChuoi lọc đúng [tu, den]', () => {
    const ngay = ['2026-04-16', '2026-04-23', '2026-07-23', '2026-10-22'];
    const t = th(ngay, ['KVT Gỗ'], ngay.map((n, i) => diem(n, 'KVT Gỗ', i + 1)));
    const k = khoangTheoLuaChon('2026-10-22', '6t', 'tuan');
    expect(dungChuoi(t, { ...k, moc: 'tuan', chiSo: 'giaTri' })[0].diem.map(d => d.ngayChot))
      .toEqual(['2026-04-23', '2026-07-23', '2026-10-22']);
  });
});

describe('chênh lệch & tổng các nhóm', () => {
  const t = th(['2026-10-08', '2026-10-15', '2026-10-22'], ['KVT Gỗ', 'KVT Đá'], [
    diem('2026-10-08', 'KVT Gỗ', 1000, 600, 100, 60), diem('2026-10-15', 'KVT Gỗ', 1200, 600, 110, 60), diem('2026-10-22', 'KVT Gỗ', 900, 700, 105, 70),
    diem('2026-10-08', 'KVT Đá', 500, 100, 50, 10), diem('2026-10-15', 'KVT Đá', 500, 100, 50, 10), diem('2026-10-22', 'KVT Đá', 600, 200, 55, 12),
  ]);
  it('chenh / chenhPt so điểm liền trước', () => {
    const go = dungChuoi(t, { moc: 'tuan', chiSo: 'giaTri' })[0];
    expect(go.diem.map(d => d.chenh)).toEqual([null, 200, -300]);
    expect(go.diem[1].chenhPt).toBeCloseTo(20);
    expect(go.diem[2].chenhPt).toBeCloseTo(-25);
    expect(go.diem[2]).toMatchObject({ cham: 700, binhThuong: 200 });
  });
  it('tổng ở điểm cuối, so lần trước và đầu khoảng, % chậm', () => {
    const tong = tongCacNhom(dungChuoi(t, { moc: 'tuan', chiSo: 'giaTri' }))!;
    expect(tong).toMatchObject({ ngayChot: '2026-10-22', tong: 1500, cham: 900, soNhom: 2, soDiem: 3 });
    expect(tong.ptCham).toBeCloseTo(60);
    expect(tong.truoc).toMatchObject({ ngayChot: '2026-10-15', tong: 1700, chenh: -200 });
    expect(tong.truoc!.chenhPt).toBeCloseTo(-11.7647, 3);
    expect(tong.dau).toMatchObject({ ngayChot: '2026-10-08', tong: 1500, chenh: 0, chenhPt: 0 });
    const soMa = tongCacNhom(dungChuoi(t, { moc: 'tuan', chiSo: 'soMa' }))!;
    expect(soMa).toMatchObject({ tong: 160, cham: 82 });
  });
  it('1 điểm => không có so sánh; rỗng => null', () => {
    const mot = tongCacNhom(dungChuoi(t, { tu: '2026-10-22', moc: 'tuan', chiSo: 'giaTri' }))!;
    expect(mot.truoc).toBeNull();
    expect(mot.dau).toBeNull();
    expect(tongCacNhom(dungChuoi(t, { tu: '2027-01-01', moc: 'tuan', chiSo: 'giaTri' }))).toBeNull();
    expect(tongCacNhom([])).toBeNull();
  });
  it('tổng đầu khoảng = 0 => chenhPt null', () => {
    const t0 = th(['2026-10-15', '2026-10-22'], ['KVT Gỗ'], [diem('2026-10-22', 'KVT Gỗ', 5)]);
    const tong = tongCacNhom(dungChuoi(t0, { moc: 'tuan', chiSo: 'giaTri' }))!;
    expect(tong.truoc).toMatchObject({ tong: 0, chenh: 5, chenhPt: null });
  });
  it('bảng Excel ngày × nhóm (tỷ)', () => {
    const b = bangTongHopExcel(dungChuoi(t, { moc: 'tuan', chiSo: 'giaTri' }));
    expect(b[0]).toHaveLength(2 + 2 * 3 + 3);
    expect(b[3]).toEqual(['22/10/2026', '22/10', 0.9, 0.7, 105, 0.6, 0.2, 55, 1.5, 0.9, 160]);
  });
});

const dong = (p: Partial<DongTonKhoVt>): DongTonKhoVt => ({
  ma: '100000000001', ten: 'Vật tư', nhom: 'KVT Gỗ', dvt: 'M3', soLuong: 1, soLuongTruoc: 1, giaTri: 10, giaTriTruoc: 10,
  soThang: 1, cham: false, congTrinh: null, ghiChu: null, ...p,
});

describe('phân loại dòng chi tiết', () => {
  it('5 loại theo giá trị khi có quyền xem giá', () => {
    expect(phanLoaiDong(dong({ soLuongTruoc: null, giaTriTruoc: null }), true)).toMatchObject({ loai: 'moi', chenhGiaTri: 10, chenhSoLuong: 1 });
    expect(phanLoaiDong(dong({ soLuong: null, giaTri: null }), true)).toMatchObject({ loai: 'het', chenhGiaTri: -10, chenhSoLuong: -1 });
    expect(phanLoaiDong(dong({ giaTri: 12, soLuong: 1 }), true)).toMatchObject({ loai: 'tang', chenhGiaTri: 2 });
    // số lượng tăng nhưng giá trị giảm => theo giá trị
    expect(phanLoaiDong(dong({ giaTri: 8, soLuong: 3 }), true)).toMatchObject({ loai: 'giam', chenhGiaTri: -2, chenhSoLuong: 2 });
    expect(phanLoaiDong(dong({}), true)).toMatchObject({ loai: 'khong_doi', chenhGiaTri: 0 });
  });
  it('không có quyền xem giá => so theo số lượng', () => {
    const k = (p: Partial<DongTonKhoVt>) => phanLoaiDong(dong({ giaTri: null, giaTriTruoc: null, ...p }), false);
    expect(k({ soLuong: 5, soLuongTruoc: 2 })).toMatchObject({ loai: 'tang', chenhGiaTri: null, chenhSoLuong: 3 });
    expect(k({ soLuong: 1, soLuongTruoc: 2 })).toMatchObject({ loai: 'giam' });
    expect(k({ soLuong: 2, soLuongTruoc: 2 })).toMatchObject({ loai: 'khong_doi' });
    // không truyền coGia: tự suy từ giaTri null
    expect(phanLoaiDong(dong({ giaTri: null, giaTriTruoc: null, soLuong: 4 })).loai).toBe('tang');
  });
  it('đếm / lọc / tìm không dấu theo mã, tên, công trình', () => {
    const ds = [
      dong({ ma: 'A1', ten: 'Gỗ sồi', giaTri: 20 }),
      dong({ ma: 'A2', ten: 'Ván MDF', giaTri: 5, cham: true, congTrinh: 'Khách sạn Đà Nẵng\nVilla Phú Quốc' }),
      dong({ ma: 'A3', soLuongTruoc: null, giaTriTruoc: null }),
      dong({ ma: 'A4', soLuong: null, giaTri: null, cham: true }),
      dong({ ma: 'A5' }),
    ].map(d => phanLoaiDong(d, true));
    expect(demTheoLoc(ds)).toEqual({ tat_ca: 5, tang: 1, giam: 1, moi: 1, het: 1, cham: 2 });
    expect(locDong(ds, 'cham', '').map(d => d.ma)).toEqual(['A2', 'A4']);
    expect(locDong(ds, 'tat_ca', 'go soi').map(d => d.ma)).toEqual(['A1']);
    expect(locDong(ds, 'tat_ca', 'da nang').map(d => d.ma)).toEqual(['A2']);
    expect(locDong(ds, 'tat_ca', 'phu quoc').map(d => d.ma)).toEqual(['A2']);
    expect(locDong(ds, 'giam', 'go').map(d => d.ma)).toEqual([]);
  });
  it('xếp mặc định theo |chênh| giảm dần; ô trống xuống cuối', () => {
    const ds = [
      dong({ ma: 'B1', giaTri: 11 }), // +1
      dong({ ma: 'B2', giaTri: 2 }), // -8
      dong({ ma: 'B3', giaTri: 15 }), // +5
    ].map(d => phanLoaiDong(d, true));
    expect(xepDong(ds, XEP_MAC_DINH).map(d => d.ma)).toEqual(['B2', 'B3', 'B1']);
    expect(xepDong(ds, { cot: 'chenh', giam: true }).map(d => d.ma)).toEqual(['B3', 'B1', 'B2']);
    const coTrong = [...ds, phanLoaiDong(dong({ ma: 'B0', soThang: null }), true)];
    expect(xepDong(coTrong, { cot: 'soThang', giam: false }).map(d => d.ma).slice(-1)).toEqual(['B0']);
    expect(xepDong(coTrong, { cot: 'soThang', giam: true }).map(d => d.ma).slice(-1)).toEqual(['B0']);
  });
  it('bảng Excel chi tiết ẩn cột giá khi không có quyền', () => {
    const ds = [phanLoaiDong(dong({ giaTri: null, giaTriTruoc: null, congTrinh: 'CT1\nCT2' }), false)];
    const b = bangChiTietExcel(ds, false);
    expect(b[0]).not.toContain('Giá trị lần này (triệu)');
    expect(b[1]).toContain('CT1; CT2');
    expect(bangChiTietExcel(ds, true)[0]).toContain('Chênh giá trị (triệu)');
  });
});

describe('trục & định dạng', () => {
  it('nhãn trục thưa, luôn giữ điểm cuối', () => {
    const k = Array.from({ length: 33 }, (_, i) => `k${i}`);
    const n = chonNhanTruc(k, 8);
    expect(n.length).toBeLessThanOrEqual(8);
    expect(n[n.length - 1]).toBe('k32');
    expect(chonNhanTruc(['a', 'b'], 8)).toEqual(['a', 'b']);
  });
  it('vạch trục Y gọn', () => {
    // 29.010 tỷ (triệu) => bước 10 tỷ, 0..30
    expect(vachTrucY(29_010, 'ty')).toEqual({ vach: [0, 10_000, 20_000, 30_000], soLe: 0 });
    // 0,519 tỷ => bước 0,2 tỷ (1 số lẻ)
    const nho = vachTrucY(519, 'ty');
    expect(nho.soLe).toBe(1);
    expect(nho.vach[nho.vach.length - 1]).toBeGreaterThanOrEqual(519);
    expect(vachTrucY(7, 'so')).toEqual({ vach: [0, 2, 4, 6, 8], soLe: 0 });
    // 42 tỷ => 0..50 (không phải 0..60)
    expect(vachTrucY(42_000, 'ty').vach).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000]);
    // 1.828 mã => 0..2.000
    expect(vachTrucY(1828, 'so').vach.slice(-1)).toEqual([2000]);
    expect(vachTrucY(0, 'so').vach).toEqual([0, 1]);
  });
  it('định dạng tiền từng dòng và phần trăm', () => {
    expect(dinhDangTienDong(1234.5)).toBe('1.23 tỷ');
    expect(dinhDangTienDong(12.34)).toBe('12.3 tr');
    expect(dinhDangTienDong(-0.03, true)).toBe('−0.03 tr');
    expect(dinhDangTienDong(5, true)).toBe('+5.0 tr');
    expect(dinhDangTienDong(null)).toBe('—');
    expect(dinhDangPt(5.04, true)).toBe('+5%');
    expect(dinhDangPt(-25)).toBe('−25%');
    expect(dinhDangPt(null)).toBe('—');
  });
  it('định dạng chênh: nhỏ thì triệu, lớn thì tỷ', () => {
    expect(dinhDangChenh(1234, 'giaTri')).toBe('+1.23 tỷ');
    expect(dinhDangChenh(-3.24, 'giaTri')).toBe('−3.2 tr');
    expect(dinhDangChenh(0, 'giaTri')).toBe('0.00 tỷ');
    expect(dinhDangChenh(-12, 'soMa')).toBe('−12 mã');
  });
});

describe('lần chốt thiếu cờ chậm luân chuyển', () => {
  // 03/09: cả bảng không mã nào có cờ (file nguồn thiếu cột) trong khi các tuần khác có
  const t = th(['2026-08-27', '2026-09-03', '2026-09-10'], ['KVT Gỗ', 'KVT Đá'], [
    diem('2026-08-27', 'KVT Gỗ', 100, 60, 10, 6), diem('2026-08-27', 'KVT Đá', 50, 10, 5, 1),
    diem('2026-09-03', 'KVT Gỗ', 98, 0, 10, 0), diem('2026-09-03', 'KVT Đá', 51, 0, 5, 0),
    diem('2026-09-10', 'KVT Gỗ', 97, 59, 10, 6), diem('2026-09-10', 'KVT Đá', 52, 0, 5, 0),
  ]);
  it('nhận ra ngày cả bảng 0 cờ; nhóm 0 cờ ở ngày khác (Đá 10/09) vẫn là 0 thật', () => {
    expect([...ngayThieuCham(t)]).toEqual(['2026-09-03']);
    const [go, da] = dungChuoi(t, { moc: 'tuan', chiSo: 'giaTri' });
    expect(go.diem.map(d => d.thieuCham)).toEqual([false, true, false]);
    expect(da.diem[2]).toMatchObject({ thieuCham: false, cham: 0 });
  });
  it('cả bảng chưa từng có cờ => không coi là thiếu (không đoán)', () => {
    const k = th(['2026-09-03'], ['KVT Gỗ'], [diem('2026-09-03', 'KVT Gỗ', 10, 0, 2, 0)]);
    expect(ngayThieuCham(k).size).toBe(0);
  });
  it('tổng: lần chốt cuối thiếu cờ => % chậm null; Excel để ô trống', () => {
    const c = dungChuoi(t, { moc: 'tuan', chiSo: 'giaTri', den: '2026-09-03' });
    expect(tongCacNhom(c)).toMatchObject({ thieuCham: true, ptCham: null });
    const b = bangTongHopExcel(c);
    expect(b[2][3]).toBe('');
    expect(b[1][3]).toBe(0.06);
  });
  it('theo tháng: mốc tháng 9 lấy lần chốt cuối (10/09) nên không thiếu', () => {
    const c = dungChuoi(t, { moc: 'thang', chiSo: 'giaTri' });
    expect(c[0].diem.map(d => [d.ngayChot, d.thieuCham])).toEqual([['2026-08-27', false], ['2026-09-10', false]]);
  });
});

describe('câu tóm tắt & nhãn số', () => {
  // Vải Da Mouss cuối tháng T2 → T10/2026 (tỷ => triệu)
  const t = th(['2026-02-26', '2026-03-26', '2026-04-23', '2026-05-28', '2026-06-25', '2026-07-30', '2026-08-27', '2026-09-24', '2026-10-22'],
    ['KVT Vải Da Mouss'],
    [[26.56, 18.32], [29.94, 23.07], [30.81, 24.22], [31.74, 25.24], [36.86, 26.25], [50.64, 27.9], [51.04, 28.04], [44.15, 27.47], [39.73, 29.01]]
      .map(([v, c], i) => diem(['2026-02-26', '2026-03-26', '2026-04-23', '2026-05-28', '2026-06-25', '2026-07-30', '2026-08-27', '2026-09-24', '2026-10-22'][i],
        'KVT Vải Da Mouss', v * 1000, c * 1000, 100, 50)));
  it('tăng so với đầu khoảng + đỉnh giữa khoảng + % chậm luân chuyển', () => {
    const [c] = dungChuoi(t, { moc: 'thang', chiSo: 'giaTri' });
    expect(tomTatNhom(c.diem, 'giaTri')).toBe('39.73 tỷ — tăng 13.17 tỷ (+50%) so với T2/26; đỉnh 51.04 tỷ (T8/26), đã giảm 11.31 tỷ; 73% là hàng chậm luân chuyển > 3 tháng');
  });
  it('gần như không đổi; thấp nhất cuối khoảng; 1 điểm', () => {
    const d = (tong: number, nhan: string, cham = 0) => ({ khoa: nhan, nhan, ngayChot: '2026-10-22', tong, cham, binhThuong: tong - cham, chenh: null, chenhPt: null, thieuCham: false, goc: { giaTri: tong, giaTriCham: cham, soMa: 0, soMaCham: 0 } });
    expect(tomTatNhom([d(16620, 'T2/26'), d(15700, 'T4/26'), d(16180, 'T10/26', 12070)], 'giaTri'))
      .toBe('16.18 tỷ — giảm 0.44 tỷ (−2.6%) so với T2/26; 75% là hàng chậm luân chuyển > 3 tháng'); // hồi 0.48 tỷ < 5% => không nêu
    expect(tomTatNhom([d(20000, 'T2/26'), d(12000, 'T5/26'), d(18000, 'T10/26')], 'giaTri'))
      .toBe('18.00 tỷ — giảm 2.00 tỷ (−10%) so với T2/26; thấp nhất 12.00 tỷ (T5/26), đã tăng lại 6.00 tỷ; 0% là hàng chậm luân chuyển > 3 tháng');
    expect(tomTatNhom([d(25650, 'T2/26'), d(25000, 'T6/26'), d(25900, 'T10/26')], 'giaTri')).toBe('25.90 tỷ — gần như không đổi so với T2/26; 0% là hàng chậm luân chuyển > 3 tháng');
    expect(tomTatNhom([d(34470, 'T2/26'), d(30000, 'T6/26'), d(22330, 'T10/26')], 'giaTri')).toBe('22.33 tỷ — giảm 12.14 tỷ (−35%) so với T2/26; thấp nhất từ đầu khoảng; 0% là hàng chậm luân chuyển > 3 tháng');
    expect(tomTatNhom([d(1365, '22/10', 1221)], 'soMa')).toBe('1,365 mã — 89% là hàng chậm luân chuyển > 3 tháng');
    expect(tomTatNhom([], 'giaTri')).toBe('');
  });
  it('nhãn số: ≤ 13 điểm ghi hết; nhiều hơn chỉ đầu / cuối / cao nhất / thấp nhất; bỏ null', () => {
    expect([...chiSoNhan([1, 2, null, 4])]).toEqual([0, 1, 3]);
    const tuan = Array.from({ length: 25 }, (_, i) => (i === 7 ? 99 : i === 15 ? 1 : 50));
    expect([...chiSoNhan(tuan)].sort((a, b) => a - b)).toEqual([0, 7, 15, 24]);
  });
  it('trung bình tổng của các điểm đang xem (theo tháng: 9 lần chốt cuối tháng)', () => {
    const [c] = dungChuoi(t, { moc: 'thang', chiSo: 'giaTri' });
    expect(trungBinhTong(c.diem)).toBeCloseTo((26.56 + 29.94 + 30.81 + 31.74 + 36.86 + 50.64 + 51.04 + 44.15 + 39.73) / 9 * 1000, 6);
    expect(trungBinhTong([])).toBeNull();
  });
  it('xu hướng: hồi quy tuyến tính theo thứ tự điểm; tăng / giảm / đi ngang; < 3 điểm => null', () => {
    const d = (tong: number) => ({ khoa: '', nhan: '', ngayChot: '', tong, cham: 0, binhThuong: tong, chenh: null, chenhPt: null, thieuCham: false, goc: { giaTri: tong, giaTriCham: 0, soMa: 0, soMaCham: 0 } });
    const t1 = xuHuongTong([d(10), d(12), d(14), d(16)])!;
    expect(t1.moiDiem).toBeCloseTo(2, 9);
    expect(t1.giaTri.map(v => Math.round(v * 1e9) / 1e9)).toEqual([10, 12, 14, 16]);
    expect(t1).toMatchObject({ huong: 'tang' });
    expect(t1.ptCaKhoang).toBeCloseTo(60, 9);
    const t2 = xuHuongTong([d(34470), d(35730), d(30620), d(25250), d(22330)])!;
    expect(t2.huong).toBe('giam');
    expect(t2.moiDiem).toBeLessThan(0);
    expect(xuHuongTong([d(100), d(101), d(99), d(100)])!.huong).toBe('ngang');
    // Tấm – Ván T2→T10/2026: lên xuống quanh 22.6–27 tỷ, đường thẳng chỉ giải thích 19% => không rõ (không báo "tăng")
    const tamVan = xuHuongTong([25650, 23360, 25130, 24040, 26250, 22560, 25470, 26700, 27010].map(d))!;
    expect(tamVan.r2).toBeCloseTo(0.19, 2);
    expect(tamVan.huong).toBe('khongRo');
    // Đá: tăng đều, R² 0.90 => tăng
    const da = xuHuongTong([11740, 12460, 16840, 20390, 21550, 19660, 22970, 26010, 25330].map(d))!;
    expect(da.r2).toBeCloseTo(0.90, 2);
    expect(da.huong).toBe('tang');
    expect(xuHuongTong([d(1), d(2)])).toBeNull();
  });
});

describe('bộ lọc tên từng biểu đồ', () => {
  it('tìm bỏ dấu, nhiều chữ = phải có đủ; trống => tất cả', () => {
    const ds = [{ ten: 'VẢI NAVY BLUE-1.4M' }, { ten: 'CHỈ_SỢI NYLON' }, { ten: 'SIMILI MELIS 02-1.4M' }, { ten: 'VẢI SA-16-2.8M' }];
    expect(locTenTheoTim(ds, 'vai').map(x => x.ten)).toEqual(['VẢI NAVY BLUE-1.4M', 'VẢI SA-16-2.8M']);
    expect(locTenTheoTim(ds, 'vai 1.4').map(x => x.ten)).toEqual(['VẢI NAVY BLUE-1.4M']);
    expect(locTenTheoTim(ds, 'nylon').map(x => x.ten)).toEqual(['CHỈ_SỢI NYLON']);
    expect(locTenTheoTim(ds, '  ')).toHaveLength(4);
  });
  it('dungChuoi nhận lần chốt thiếu cờ từ toàn bảng (dữ liệu đã lọc 0 chậm luân chuyển vẫn là 0 thật)', () => {
    const loc = th(['2026-09-03', '2026-09-10'], ['KVT Gỗ'], [diem('2026-09-03', 'KVT Gỗ', 10, 0, 1, 0), diem('2026-09-10', 'KVT Gỗ', 12, 0, 1, 0)]);
    const [tuTinh] = dungChuoi(loc, { moc: 'tuan', chiSo: 'giaTri' });
    expect(tuTinh.diem.map(d => d.thieuCham)).toEqual([false, false]);
    const [toanBang] = dungChuoi(loc, { moc: 'tuan', chiSo: 'giaTri', thieu: new Set(['2026-09-03']) });
    expect(toanBang.diem.map(d => d.thieuCham)).toEqual([true, false]);
  });
});

describe('trục phụ doanh thu', () => {
  it('cùng số khoảng với trục chính, bước đẹp, đỉnh ≥ max', () => {
    expect(vachTheoSoKhoang(152.3, 4).vach).toEqual([0, 40, 80, 120, 160]);
    expect(vachTheoSoKhoang(152.3, 6).vach).toEqual([0, 30, 60, 90, 120, 150, 180]);
    expect(vachTheoSoKhoang(126.4, 3).vach).toEqual([0, 50, 100, 150]);
    const nho = vachTheoSoKhoang(0.92, 5);
    expect(nho.vach).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(nho.soLe).toBe(1);
    expect(vachTheoSoKhoang(0, 4).vach).toHaveLength(5);
  });
});

describe('dự báo tồn theo kế hoạch doanh thu', () => {
  it('cắt dự báo tới tháng 12 của năm đang xem', () => {
    const d = { tyLeDat: 1, tyLeTu: '', tyLeDen: '', saiSo: [], saiSoGiuNguyen: [], soLanKiem: [],
      diem: ['2026-11', '2026-12', '2027-01'].map((khoa, i) => ({ khoa, nhan: khoa, h: i + 1, ton: 1, thap: null, cao: null, keHoach: 1, dtDuKien: 1 })) };
    expect(catDuBao(d, '2026-12')!.diem.map(x => x.khoa)).toEqual(['2026-11', '2026-12']);
    expect(catDuBao(d, null)).toBe(d);
  });
  it('cộng tháng qua năm (khoá YYYY-MM)', () => {
    expect([congThangKhoa('2026-11', 2), congThangKhoa('2026-01', -1), congThangKhoa('2026-10', 0)]).toEqual(['2027-01', '2025-12', '2026-10']);
  });
  // Số thật 2026 (tỷ): doanh thu nhập kho, kế hoạch năm; tồn toàn kho cuối tháng 2–10
  const thucTe: Record<string, number> = {
    '2026-01': 113.24, '2026-02': 79.95, '2026-03': 118.84, '2026-04': 97.16, '2026-05': 100.95, '2026-06': 131.34,
    '2026-07': 150.93, '2026-08': 150.90, '2026-09': 156.08, '2026-10': 84.64,
  };
  const KH = [133.39, 109.91, 145.25, 165.03, 169.26, 186.28, 196.51, 196.51, 181.96, 163.95, 90.25, 77.92];
  const keHoach = Object.fromEntries(KH.map((v, i) => [`2026-${String(i + 1).padStart(2, '0')}`, v]));
  const TON = [115.32, 116.71, 124.66, 123.92, 132.87, 136.35, 142.61, 138.34, 131.09];
  const ds = TON.map((v, i) => {
    const khoa = `2026-${String(i + 2).padStart(2, '0')}`;
    return { khoa, nhan: khoa, ngayChot: `${khoa}-20`, tong: v * 1000, cham: 0, binhThuong: v * 1000, chenh: null, chenhPt: null, thieuCham: false, goc: { giaTri: v * 1000, giaTriCham: 0, soMa: 0, soMaCham: 0 } };
  });
  it('tỷ lệ đạt kế hoạch = 3 tháng đã hết gần nhất (tháng 10 chưa hết => 7–9)', () => {
    expect(tyLeDatKeHoach({ thucTe, keHoach }, '2026-10')).toBeCloseTo((150.93 + 150.90 + 156.08) / (196.51 + 196.51 + 181.96), 6);
    expect(tyLeDatKeHoach({ thucTe, keHoach: {} }, '2026-10')).toBeNull();
  });
  it('tồn tháng tới = tồn × (DT bình quân 3 tháng tới ÷ hiện tại)^0.5; kế hoạch T11–T12 giảm => tồn dự báo giảm', () => {
    const kq = duBaoTonTheoDoanhThu(ds, { thucTe, keHoach }, '2026-10')!;
    const tl = kq.tyLeDat;
    const r0 = (150.90 + 156.08 + 163.95 * tl) / 3, r11 = (156.08 + 163.95 * tl + 90.25 * tl) / 3, r12 = (163.95 * tl + 90.25 * tl + 77.92 * tl) / 3;
    expect(kq.diem.map(d => d.khoa)).toEqual(['2026-11', '2026-12']);
    expect(kq.diem[0].ton).toBeCloseTo(131090 * Math.sqrt(r11 / r0), 3);
    expect(kq.diem[1].ton).toBeCloseTo(131090 * Math.sqrt(r12 / r0), 3);
    expect(kq.diem[0].dtDuKien).toBeCloseTo(90.25 * tl, 6);
    expect([kq.tyLeTu, kq.tyLeDen]).toEqual(['2026-07', '2026-09']);
  });
  it('kiểm lại trên các tháng đã qua: có sai số theo tầm 1, 2 tháng; dải ± quanh dự báo', () => {
    const kq = duBaoTonTheoDoanhThu(ds, { thucTe, keHoach }, '2026-10')!;
    expect(kq.soLanKiem[0]).toBeGreaterThanOrEqual(5);
    expect(kq.saiSo[0]).not.toBeNull();
    // ở mức toàn kho, trước 2 tháng: cách này sát hơn "giữ nguyên tồn"
    expect(kq.saiSo[1]!).toBeLessThan(kq.saiSoGiuNguyen[1]!);
    expect(kq.diem[0].cao! - kq.diem[0].ton).toBeCloseTo(kq.saiSo[0]!, 6);
  });
  it('không có kế hoạch tháng tới / thiếu doanh thu => không dự báo', () => {
    expect(duBaoTonTheoDoanhThu(ds, { thucTe, keHoach: { ...keHoach, '2026-11': undefined as unknown as number } }, '2026-10')!.diem).toEqual([]);
    expect(duBaoTonTheoDoanhThu(ds, { thucTe: {}, keHoach }, '2026-10')).toBeNull();
  });
});
