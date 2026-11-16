import { describe, expect, it } from 'vitest';
import { BUOC_MUA, BUOC_MUA_GON, cachDatAnh, coAnh, dsNutTrang, laAnhDet, nhanThongSoKhach, soTrang, tenHienThi, tenHienThiKhach, thongSoHien, xepAnhHopLe } from './xuLyCuaHang';
import { docHangKhach, docThongSo, LOAI_DAN_BE_MAT, type HangKhach } from '../../services/cuaHangApi';
import { cachXepCo, docHashCuaHang, donViQuyCach, khoaLoai, taoHashCuaHang } from './xuLyCuaHang';
import { demChungLoai, demNhomMau, docSoTrang, giaTriMau, khoaChungLoai, locThem, nhomMauCua, NHOM_MAU, tenChungLoai } from './xuLyCuaHang';
import {
  boDau, boTrungTen, chuanBiHang, chuanSdt, dongNhanHang, hangCungLoai, mucPhongToiDa, nhomThongSo, thongSoHang, datSoLuong, demTheoLoai, docGio, docSoLuong, dungBodyYeuCau, FORM_TRONG, gioHien, kiemTraYeuCau,
  laEmail, locHang, tenLoaiGon, themVaoGio, TOI_DA_DONG_GIO, xepHang, xoaKhoiGio, type DongGio,
} from './xuLyCuaHang';

const hang = (p: Partial<HangKhach> & { ma: string }): HangKhach => ({
  ten: p.ma, loai: 'KVT Gỗ', thuocTinh: {}, soLuong: 10, dvt: 'M2', giaBanVnd: null, moTa: null, anh: [], anhNgoai: [], ...p,
});

describe('chuanSdt', () => {
  it('bỏ khoảng trắng / chấm / gạch / ngoặc', () => {
    expect(chuanSdt('0912 345 678')).toBe('0912345678');
    expect(chuanSdt('0912.345.678')).toBe('0912345678');
    expect(chuanSdt('(028) 3812-3456')).toBe('02838123456');
  });
  it('+84 / 0084 / 84 đầu => 0', () => {
    expect(chuanSdt('+84 912 345 678')).toBe('0912345678');
    expect(chuanSdt('0084912345678')).toBe('0912345678');
    expect(chuanSdt('84912345678')).toBe('0912345678');
  });
  it('sai => null', () => {
    expect(chuanSdt('')).toBeNull();
    expect(chuanSdt('12345678')).toBeNull();       // 8 số
    expect(chuanSdt('0912345678901')).toBeNull();  // 13 số
    expect(chuanSdt('09123abc78')).toBeNull();
    expect(chuanSdt('<script>')).toBeNull();
  });
});

describe('laEmail', () => {
  it('nhận / từ chối', () => {
    expect(laEmail('a.b@cong-ty.vn')).toBe(true);
    expect(laEmail(' a@b.co ')).toBe(true);
    expect(laEmail('a@b')).toBe(false);
    expect(laEmail('a b@c.vn')).toBe(false);
    expect(laEmail('<a>@c.vn')).toBe(false);
    expect(laEmail(`${'a'.repeat(200)}@c.vn`)).toBe(false);
  });
});

describe('docSoLuong', () => {
  it('đọc kiểu Việt Nam và kiểu chấm thập phân', () => {
    expect(docSoLuong('12')).toBe(12);
    expect(docSoLuong('12,5')).toBe(12.5);
    expect(docSoLuong('1.000')).toBe(1000);
    expect(docSoLuong('1.000,5')).toBe(1000.5);
    expect(docSoLuong('12.5')).toBe(12.5);
    expect(docSoLuong(' 3 ')).toBe(3);
  });
  it('sai => null', () => {
    expect(docSoLuong('')).toBeNull();
    expect(docSoLuong('-1')).toBeNull();
    expect(docSoLuong('1e5')).toBeNull();
    expect(docSoLuong('abc')).toBeNull();
  });
});

describe('giỏ yêu cầu', () => {
  it('docGio chịu dữ liệu hỏng, gộp trùng, bỏ dòng sai', () => {
    expect(docGio(null)).toEqual([]);
    expect(docGio('{hỏng')).toEqual([]);
    expect(docGio('{"a":1}')).toEqual([]);
    expect(docGio(JSON.stringify([
      { ma: 'A', soLuong: 1 }, { ma: 'A', soLuong: 2.5 }, { ma: '', soLuong: 1 }, { ma: 'B', soLuong: -1 },
      { ma: 'C', soLuong: 'x' }, null, 5, { ma: 'D', soLuong: '4' },
    ]))).toEqual([{ ma: 'A', soLuong: 3.5 }, { ma: 'D', soLuong: 4 }]);
  });
  it(`docGio tối đa ${TOI_DA_DONG_GIO} dòng`, () => {
    const ds = Array.from({ length: 40 }, (_, i) => ({ ma: `M${i}`, soLuong: 1 }));
    expect(docGio(JSON.stringify(ds))).toHaveLength(TOI_DA_DONG_GIO);
  });
  it('themVaoGio cộng dồn, không vượt tồn, giỏ đầy báo day', () => {
    let g: DongGio[] = [];
    g = themVaoGio(g, 'A', 3, 5).gio;
    g = themVaoGio(g, 'A', 4, 5).gio;
    expect(g).toEqual([{ ma: 'A', soLuong: 5 }]);
    g = themVaoGio(g, 'B', 0.1, 1).gio;
    g = themVaoGio(g, 'B', 0.2, 1).gio;
    expect(g[1]).toEqual({ ma: 'B', soLuong: 0.3 });
    expect(themVaoGio(g, 'C', 0, 5).gio).toBe(g);
    const day = Array.from({ length: TOI_DA_DONG_GIO }, (_, i) => ({ ma: `M${i}`, soLuong: 1 }));
    const kq = themVaoGio(day, 'Z', 1, 5);
    expect(kq.day).toBe(true);
    expect(kq.gio).toHaveLength(TOI_DA_DONG_GIO);
    expect(themVaoGio(day, 'M0', 1, 5).day).toBe(false);
  });
  it('datSoLuong / xoaKhoiGio', () => {
    const g = [{ ma: 'A', soLuong: 2 }, { ma: 'B', soLuong: 1 }];
    expect(datSoLuong(g, 'A', 99, 10)).toEqual([{ ma: 'A', soLuong: 10 }, { ma: 'B', soLuong: 1 }]);
    expect(datSoLuong(g, 'A', 0, 10)).toEqual([{ ma: 'B', soLuong: 1 }]);
    expect(datSoLuong(g, 'A', NaN, 10)).toEqual([{ ma: 'B', soLuong: 1 }]);
    expect(xoaKhoiGio(g, 'B')).toEqual([{ ma: 'A', soLuong: 2 }]);
  });
  it('gioHien: mã đã gỡ => hetHang; vượt tồn mới => hạ bằng tồn', () => {
    const theoMa = new Map([['A', hang({ ma: 'A', soLuong: 4 })]]);
    const kq = gioHien([{ ma: 'A', soLuong: 6 }, { ma: 'X', soLuong: 1 }], theoMa);
    expect(kq[0]).toMatchObject({ ma: 'A', soLuong: 4, hetHang: false, daHa: true });
    expect(kq[1]).toMatchObject({ ma: 'X', hetHang: true, hang: null });
  });
});

describe('kiểm tra + dựng thân yêu cầu', () => {
  const theoMa = new Map([['A', hang({ ma: 'A' })]]);
  const gio = gioHien([{ ma: 'A', soLuong: 2 }, { ma: 'X', soLuong: 1 }], theoMa);

  it('báo lỗi từng ô', () => {
    const loi = kiemTraYeuCau({ ...FORM_TRONG, ten: 'a', sdt: '123', email: 'x@', ghiChu: 'a'.repeat(1001) }, []);
    expect(Object.keys(loi).sort()).toEqual(['email', 'ghiChu', 'gio', 'sdt', 'ten']);
    expect(kiemTraYeuCau({ ...FORM_TRONG, ten: 'An' }, gio).sdt).toMatch(/nhập số điện thoại/);
  });
  it('hợp lệ => không lỗi; body chỉ gửi mã còn hàng, SĐT đã chuẩn, ô trống bỏ', () => {
    const f = { ...FORM_TRONG, ten: '  Nguyễn   Văn A ', sdt: '+84 912.345.678', congTy: ' AA ' };
    expect(kiemTraYeuCau(f, gio)).toEqual({});
    const body = dungBodyYeuCau(f, gio);
    expect(body).toEqual({ items: [{ ma: 'A', soLuong: 2 }], ten: 'Nguyễn Văn A', sdt: '0912345678', congTy: 'AA', web: '' });
    expect('email' in body).toBe(false);
  });
  it('giỏ chỉ còn mã đã gỡ => lỗi gio', () => {
    const chiHet = gioHien([{ ma: 'X', soLuong: 1 }], theoMa);
    expect(kiemTraYeuCau({ ...FORM_TRONG, ten: 'An', sdt: '0912345678' }, chiHet).gio).toBeTruthy();
  });
});

describe('lọc / sắp xếp / đếm loại', () => {
  const ds = chuanBiHang([
    hang({ ma: '100', ten: 'Gỗ sồi trắng', loai: 'KVT Gỗ', giaBanVnd: 500_000, thuocTinh: { mau: 'Trắng' } }),
    hang({ ma: '200', ten: 'Vải bố', loai: 'KVT Vải Da Mouss' }),
    hang({ ma: '300', ten: 'Bản lề', loai: 'KVT phụ kiện', giaBanVnd: 20_000, thuocTinh: { thuongHieu: 'Hafele' } }),
    hang({ ma: '400', ten: 'Ánh kim', loai: 'Loại lạ', giaBanVnd: 90_000 }),
  ]);
  it('tìm không dấu, mọi từ, theo thuộc tính + mã', () => {
    expect(locHang(ds, 'go soi', '').map(h => h.ma)).toEqual(['100']);
    expect(locHang(ds, 'HAFELE', '').map(h => h.ma)).toEqual(['300']);
    expect(locHang(ds, '200', '').map(h => h.ma)).toEqual(['200']);
    expect(locHang(ds, '', 'KVT Gỗ').map(h => h.ma)).toEqual(['100']);
    expect(locHang(ds, 'vai', 'KVT Gỗ')).toEqual([]);
  });
  it('xếp giá: Liên hệ luôn cuối', () => {
    expect(xepHang(ds, 'giaTang').map(h => h.ma)).toEqual(['300', '400', '100', '200']);
    expect(xepHang(ds, 'giaGiam').map(h => h.ma)).toEqual(['100', '400', '300', '200']);
    expect(xepHang(ds, 'moi').map(h => h.ma)).toEqual(['100', '200', '300', '400']);
    // 'moi': mã có ảnh lên trước, còn lại giữ thứ tự máy chủ
    const coAnhSau = chuanBiHang([hang({ ma: 'a' }), hang({ ma: 'b', anh: [1] }), hang({ ma: 'c' }), hang({ ma: 'd', anhNgoai: ['https://x/y.jpg'] })]);
    expect(xepHang(coAnhSau, 'moi').map(h => h.ma)).toEqual(['b', 'd', 'a', 'c']);
    expect(xepHang(ds, 'ten').map(h => h.ma)).toEqual(['400', '300', '100', '200']);
  });
  it('đếm loại theo thứ tự 10 loại chính, loại lạ cuối', () => {
    expect(demTheoLoai(ds).map(x => x.loai)).toEqual(['KVT Vải Da Mouss', 'KVT Gỗ', 'KVT phụ kiện', 'Loại lạ']);
  });
  it('tên loại gọn', () => {
    expect(tenLoaiGon('KVT Gỗ')).toBe('Gỗ');
    expect(tenLoaiGon('KVT phụ kiện')).toBe('Phụ kiện');
    expect(tenLoaiGon('Kho G.Công Ngoài')).toBe('Gia công ngoài');
    expect(tenLoaiGon('KVT Tấm-Ván')).toBe('Tấm ván');
    expect(tenLoaiGon('KVT Kim Loại')).toBe('Kim loại');
    expect(tenLoaiGon('KVT Vải Da Mouss')).toBe('Vải, da & mút');
  });
});

describe('docHangKhach (đọc phòng thủ dữ liệu máy chủ)', () => {
  it('chỉ giữ trường trang khách dùng, bỏ trường lạ / kiểu sai', () => {
    const h = docHangKhach({
      ma: ' 1000123 ', ten: 'Tấm MDF', loai: 'KVT Tấm-Ván', soLuong: '12.5', dvt: 'TAM', giaBanVnd: 0,
      thuocTinh: { quyCach: '1220x2440', mau: '', ncc: 'X' }, anh: [3, -1, 'a', 2.5], anhNgoai: ['https://x.vn/a.jpg', 'javascript:alert(1)'],
      giaVon: 999, kho: 'K01', ncc: 'NCC A',
    });
    expect(h).toEqual({
      ma: '1000123', ten: 'Tấm MDF', loai: 'KVT Tấm-Ván', thuocTinh: { quyCach: '1220x2440' }, soLuong: 12.5, dvt: 'TAM',
      giaBanVnd: null, moTa: null, anh: [3], anhNgoai: ['https://x.vn/a.jpg'],
    });
    expect(docHangKhach({ ten: 'x' })).toBeNull();
    expect(docHangKhach(null)).toBeNull();
  });
});

describe('giỏ: tồn nhiều số lẻ không bị làm tròn vượt tồn', () => {
  it('thêm / đặt đúng số tồn 12,3456 => giữ 12,3456, không báo đã giảm', () => {
    const ton = 12.3456;
    const g1 = themVaoGio([], 'A', ton, ton).gio;
    expect(g1[0].soLuong).toBeLessThanOrEqual(ton);
    const g2 = datSoLuong(g1, 'A', 99, ton);
    expect(g2[0].soLuong).toBe(ton);
    const g3 = themVaoGio(g2, 'A', 1, ton).gio;
    expect(g3[0].soLuong).toBe(ton);
    const theoMa = new Map([['A', hang({ ma: 'A', soLuong: ton })]]);
    expect(gioHien(g3, theoMa)[0].daHa).toBe(false);
    // giỏ cũ đã lưu số làm tròn lên: gửi đúng tồn, không báo "đã giảm"
    const cu = gioHien([{ ma: 'A', soLuong: 12.346 }], theoMa)[0];
    expect(cu.soLuong).toBe(ton);
    expect(cu.daHa).toBe(false);
    expect(gioHien([{ ma: 'A', soLuong: 13 }], theoMa)[0].daHa).toBe(true);
  });
});

describe('thông số đầy đủ (cửa sổ chi tiết)', () => {
  it('docThongSo: bỏ dòng thiếu / trùng / nhãn cấm (NCC, giá vốn, công trình, HEX)', () => {
    expect(docThongSo(undefined)).toBeUndefined();
    expect(docThongSo([
      { nhan: 'Quy cách', giaTri: '600x1200' }, { nhan: 'Độ dày', giaTri: 18 }, { nhan: 'Màu', giaTri: '' }, { nhan: '', giaTri: 'x' },
      { nhan: 'quy cách', giaTri: 'trùng' }, { nhan: 'Mã NCC', giaTri: 'A' }, { nhan: 'Nhà cung cấp', giaTri: 'B' },
      { nhan: 'Giá vốn', giaTri: '1' }, { nhan: 'Công trình', giaTri: 'CT26-001' }, { nhan: 'Mã HEX', giaTri: 'H1' }, null, 'x',
    ])).toEqual([{ nhan: 'Quy cách', giaTri: '600x1200' }, { nhan: 'Độ dày', giaTri: '18' }]);
  });
  it('docHangKhach: máy chủ cũ không có trường mới => không gắn; có => đọc', () => {
    const cu = docHangKhach({ ma: 'A' })!;
    expect('thuocTinhDayDu' in cu).toBe(false);
    expect('nhomVatTu' in cu).toBe(false);
    const moi = docHangKhach({ ma: 'A', nhomVatTu: ' Đá tự nhiên ', thuocTinhDayDu: [{ nhan: 'Màu', giaTri: 'GOLD' }] })!;
    expect(moi.nhomVatTu).toBe('Đá tự nhiên');
    expect(moi.thuocTinhDayDu).toEqual([{ nhan: 'Màu', giaTri: 'GOLD' }]);
  });
  it('thongSoHang: chưa có bảng đầy đủ => 7 thuộc tính cũ', () => {
    expect(thongSoHang(hang({ ma: 'A', thuocTinh: { chungLoai: 'ĐÁ', mau: 'GOLD' } })))
      .toEqual([{ nhan: 'Chủng loại', giaTri: 'ĐÁ' }, { nhan: 'Màu', giaTri: 'GOLD' }]);
    expect(thongSoHang(hang({ ma: 'A', thuocTinh: { mau: 'X' }, thuocTinhDayDu: [{ nhan: 'Bề mặt', giaTri: 'Bóng' }] })))
      .toEqual([{ nhan: 'Bề mặt', giaTri: 'Bóng' }]);
  });
  it('nhomThongSo: < 6 dòng => 1 nhóm; đủ => chia Thông tin chung / Quy cách / Màu & hoàn thiện', () => {
    expect(nhomThongSo([])).toEqual([]);
    expect(nhomThongSo([{ nhan: 'Màu', giaTri: 'A' }])).toEqual([{ ten: null, dong: [{ nhan: 'Màu', giaTri: 'A' }] }]);
    const kq = nhomThongSo([
      { nhan: 'Chủng loại', giaTri: 'Đá' }, { nhan: 'Quy cách', giaTri: '600x1200' }, { nhan: 'Màu', giaTri: 'Gold' },
      { nhan: 'Độ dày', giaTri: '18' }, { nhan: 'Bề mặt', giaTri: 'Bóng' }, { nhan: 'Xuất xứ', giaTri: 'Ý' },
    ]);
    expect(kq.map(n => n.ten)).toEqual(['Thông tin chung', 'Quy cách', 'Màu & hoàn thiện']);
    expect(kq[0].dong.map(d => d.nhan)).toEqual(['Chủng loại', 'Xuất xứ']);
    expect(kq[1].dong.map(d => d.nhan)).toEqual(['Quy cách', 'Độ dày']);
    expect(kq[2].dong.map(d => d.nhan)).toEqual(['Màu', 'Bề mặt']);
    // Tên tấm / ván, Tên phụ kiện không rơi vào nhóm màu
    const tam = nhomThongSo([
      { nhan: 'Chủng loại', giaTri: 'MDF' }, { nhan: 'Tên tấm / ván', giaTri: 'MDF' }, { nhan: 'Tên phụ kiện', giaTri: 'X' },
      { nhan: 'Quy cách', giaTri: 'Dày 18' }, { nhan: 'Quy cách phách', giaTri: '50' }, { nhan: 'Màu sắc', giaTri: 'Trắng' },
      { nhan: 'Mã màu', giaTri: 'W1' },
    ]);
    expect(tam.map(n => n.ten)).toEqual(['Thông tin chung', 'Quy cách', 'Màu & hoàn thiện']);
    expect(tam[0].dong.map(d => d.nhan)).toEqual(['Chủng loại', 'Tên tấm / ván', 'Tên phụ kiện']);
  });
  it('nhomThongSo: có nhóm chỉ 1 dòng => không chia, giữ nguyên thứ tự', () => {
    const ds = [
      { nhan: 'Chủng loại', giaTri: 'GỖ' }, { nhan: 'Tên gỗ', giaTri: 'BEECH' }, { nhan: 'Xẻ gỗ', giaTri: 'XẺ' },
      { nhan: 'Tiêu chuẩn chất lượng', giaTri: '1C' }, { nhan: 'Độ ẩm / ướt', giaTri: 'SẤY' },
      { nhan: 'Quy cách', giaTri: 'PHÁCH 50' }, { nhan: 'Màu sắc', giaTri: 'TỰ NHIÊN' },
    ];
    expect(nhomThongSo(ds)).toEqual([{ ten: null, dong: ds }]);
  });
  it('mucPhongToiDa: ảnh nhỏ phóng ít (≥ 1,5), ảnh lớn tới 5, thiếu kích thước => 5', () => {
    expect(mucPhongToiDa(238, 234, 1440, 800)).toBe(1.5);
    expect(mucPhongToiDa(4000, 3000, 1000, 750)).toBe(5);
    expect(mucPhongToiDa(1000, 1000, 800, 800)).toBeCloseTo(2.5);
    expect(mucPhongToiDa(0, 0, 800, 800)).toBe(5);
  });
  it('boDau: Ð (U+00D0) như Đ => tìm "đá calacatta" ra mã', () => {
    expect(boDau('ÐÁ CALACATTA')).toBe('da calacatta');
    expect(locHang(chuanBiHang([hang({ ma: 'A', ten: 'ÐÁ CALACATTA GOLD MARBLE' })]), 'đá calacatta', '')).toHaveLength(1);
  });
  it('dongNhanHang: Loại · Nhóm · Chủng loại, bỏ rỗng và trùng', () => {
    expect(dongNhanHang({ loai: 'KVT Đá', nhomVatTu: 'Đá tự nhiên', thuocTinh: { chungLoai: 'ĐÁ' } })).toEqual(['Đá', 'Đá tự nhiên']);
    expect(dongNhanHang({ loai: 'KVT Gỗ', thuocTinh: { chungLoai: 'MDF' } })).toEqual(['Gỗ', 'MDF']);
    expect(dongNhanHang({ loai: 'KVT Tấm-Ván', nhomVatTu: 'Tấm/ Ván', thuocTinh: { chungLoai: 'MDF' } })).toEqual(['Tấm ván', 'MDF']);
    // Mục trùng nghĩa (mọi từ đã có ở mục trước) bị bỏ; chữ hoa SAP => tên hiển thị
    expect(dongNhanHang({ loai: 'KVT Vải Da Mouss', thuocTinh: { chungLoai: 'DA' } })).toEqual(['Vải, da & mút']);
    expect(dongNhanHang({ loai: 'KVT Vải Da Mouss', thuocTinh: { chungLoai: 'NVL PHỤ MAY' } })).toEqual(['Vải, da & mút', 'NVL Phụ May']);
  });
  it('boTrungTen: bỏ mục mô tả đã nằm trong tên', () => {
    expect(boTrungTen(['Nero'], 'Da 622 Nero')).toEqual([]);
    expect(boTrungTen(['Brown', '1200×2400'], 'ĐÁ AMAN BROWN')).toEqual(['1200×2400']);
    expect(boTrungTen(['Black', 'Bóng'], 'Potoro Black')).toEqual(['Bóng']);
  });
  it('hangCungLoai: cùng loại, bỏ chính nó / hết hàng, ưu tiên cùng chủng loại rồi có ảnh, tối đa n', () => {
    const h = hang({ ma: 'A', thuocTinh: { chungLoai: 'MDF' } });
    const ds = [
      h, hang({ ma: 'B' }), hang({ ma: 'C', thuocTinh: { chungLoai: 'mdf' } }), hang({ ma: 'D', anh: [1] }),
      hang({ ma: 'E', loai: 'KVT Đá', thuocTinh: { chungLoai: 'MDF' } }), hang({ ma: 'F', soLuong: 0, thuocTinh: { chungLoai: 'MDF' } }),
    ];
    expect(hangCungLoai(ds, h).map(x => x.ma)).toEqual(['C', 'D', 'B']);
    expect(hangCungLoai(ds, h, 1).map(x => x.ma)).toEqual(['C']);
  });
});

describe('phân trang', () => {
  it('số trang', () => {
    expect(soTrang(0)).toBe(1);
    expect(soTrang(30)).toBe(1);
    expect(soTrang(263)).toBe(9);
  });
  it('nút số trang có dấu …', () => {
    expect(dsNutTrang(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(dsNutTrang(1, 14)).toEqual([1, 2, 3, 4, '…', 14]);
    expect(dsNutTrang(7, 14)).toEqual([1, '…', 6, 7, 8, '…', 14]);
    expect(dsNutTrang(14, 14)).toEqual([1, '…', 11, 12, 13, 14]);
    expect(dsNutTrang(4, 14)).toEqual([1, 2, 3, 4, 5, '…', 14]);
  });
});

describe('tên hiển thị (Chữ Hoa Đầu Từ, giữ mã)', () => {
  it('tên SAP chữ hoa => hoa đầu từ, giữ mã / số / ngoặc', () => {
    expect(tenHienThi('ĐÁ ARABESCATO (SLAB) (M2)')).toBe('Đá Arabescato (Slab) (M2)');
    expect(tenHienThi('ĐÁ BQ9500 AMARCORD')).toBe('Đá BQ9500 Amarcord');
    expect(tenHienThi('VẢI DA MOUSS 1.4M')).toBe('Vải Da Mouss 1.4 m');
    expect(tenHienThi('GOLD')).toBe('Gold');
  });
  it('kích thước 1200X2400 => 1200×2400; viết tắt / toàn phụ âm giữ hoa; từ nối viết thường', () => {
    expect(tenHienThi('TẤM MDF CHỐNG ẨM 1200X2400 18MM')).toBe('Tấm MDF Chống Ẩm 1200×2400 18 mm');
    expect(tenHienThi('NẸP PVC KD VÀ KEO')).toBe('Nẹp PVC KD và Keo');
    expect(tenHienThi('VÀ TẤM-VÁN')).toBe('Và Tấm-Ván');
  });
  it("'_' => dấu cách, tách theo '-', số + đơn vị => '6 mm'", () => {
    expect(tenHienThi('DA_419 BURGUNDY')).toBe('Da 419 Burgundy');
    expect(tenHienThi('DA_CL 9-5')).toBe('Da CL 9-5');
    expect(tenHienThi('DÂY DÙ_VPR-PE557_20MM')).toBe('Dây Dù VPR-PE557 20 mm');
    expect(tenHienThi('DA 217-PEATMOOS')).toBe('Da 217-Peatmoos');
    expect(tenHienThi('VICOSTONE_BQ3603')).toBe('Vicostone BQ3603');
  });
  it('tên có chữ thường giữ nguyên', () => {
    expect(tenHienThi('Gỗ sồi trắng FSC')).toBe('Gỗ sồi trắng FSC');
  });
  it('thẻ: bỏ chữ loại trùng ở đầu tên, không bỏ nếu chỉ còn số', () => {
    expect(tenHienThi('ĐÁ CALACATTA GOLD MARBLE', 'KVT Đá')).toBe('Calacatta Gold Marble');
    expect(tenHienThi('ĐÁ CALACATTA', 'KVT Gỗ')).toBe('Đá Calacatta');
    expect(tenHienThi('ĐÁ 12', 'KVT Đá')).toBe('Đá 12');
    expect(tenHienThi('Gỗ sồi trắng', 'KVT Gỗ')).toBe('Sồi trắng');
    expect(tenHienThi('ÐÁ AMAN BROWN', 'Đá')).toBe('Aman Brown');
  });
});

describe('ảnh', () => {
  it('coAnh', () => {
    expect([hang({ ma: '1', anh: [3] }), hang({ ma: '2', anhNgoai: ['https://x/y.jpg'] }), hang({ ma: '3' })].map(coAnh)).toEqual([true, true, false]);
  });
  it('laAnhDet: quá dẹt / quá dài / quá nhỏ; chưa biết kích thước => hợp lệ', () => {
    expect(laAnhDet(443, 46)).toBe(true);
    expect(laAnhDet(46, 443)).toBe(true);
    expect(laAnhDet(100, 80)).toBe(true);
    expect(laAnhDet(443, 259)).toBe(false);
    expect(laAnhDet(600, 200)).toBe(false);
    expect(laAnhDet(0, 0)).toBe(false);
  });
  it('xepAnhHopLe: ảnh dẹt xuống cuối, giữ thứ tự còn lại', () => {
    const kt = new Map([['a', { w: 443, h: 46 }], ['b', { w: 500, h: 400 }], ['d', { w: 50, h: 50 }]]);
    expect(xepAnhHopLe(['a', 'b', 'c', 'd'], kt)).toEqual(['b', 'c', 'a', 'd']);
    expect(xepAnhHopLe(['a', 'b'], new Map())).toEqual(['a', 'b']);
  });
  it('BUOC_MUA có 3 bước (bản gọn cũng vậy)', () => {
    expect(BUOC_MUA).toHaveLength(3);
    expect(BUOC_MUA_GON).toHaveLength(3);
  });
});

describe('tên / thông số / ảnh cho khách (vòng 2)', () => {
  it('tenHienThiKhach: giữ chữ loại đầu tên, bỏ đuôi đơn vị SAP', () => {
    expect(tenHienThiKhach('ĐÁ NUNG KẾT FR80SS101')).toBe('Đá Nung Kết FR80SS101');
    expect(tenHienThiKhach('ĐÁ ARABESCATO (SLAB) (M2)')).toBe('Đá Arabescato (Slab)');
    expect(tenHienThiKhach('MARBLE STATURIO (SLAB)(M2)')).toBe('Marble Staturio (Slab)');
    expect(tenHienThiKhach('(M2)')).toBe('(M2)');
  });
  it('nhanThongSoKhach: tên trường gộp nhiều loại => Tên mẫu', () => {
    expect(nhanThongSoKhach('Tên đá / kính')).toBe('Tên mẫu');
    expect(nhanThongSoKhach('Tên vải / da / mây')).toBe('Tên mẫu');
    expect(nhanThongSoKhach('Tên gỗ')).toBe('Tên gỗ');
    expect(nhanThongSoKhach('Màu sắc')).toBe('Màu sắc');
  });
  it('thongSoHien: giữ đủ dòng, kể cả Chủng loại trùng loại (15/11/2026 không được thiếu thông số)', () => {
    const ts = (giaTri: string) => [{ nhan: 'Chủng loại', giaTri }, { nhan: 'Tên đá / kính', giaTri: 'CALACATTA' }, { nhan: 'Màu sắc', giaTri: 'Trắng' }];
    expect(thongSoHien({ loai: 'KVT Đá', thuocTinh: {}, thuocTinhDayDu: ts('ĐÁ') }).map(t => t.nhan)).toEqual(['Chủng loại', 'Tên mẫu', 'Màu sắc']);
    expect(thongSoHien({ loai: 'KVT Đá', thuocTinh: {}, thuocTinhDayDu: ts('SOLID SURFACE') }).map(t => t.nhan)).toEqual(['Chủng loại', 'Tên mẫu', 'Màu sắc']);
  });
  it('cachDatAnh: ảnh quá nhỏ / quá dẹt => hiện trọn; ảnh vừa => cắt', () => {
    expect(cachDatAnh(443, 259, 165, 165)).toBe('cat');
    expect(cachDatAnh(443, 46, 165, 165)).toBe('tron');
    expect(cachDatAnh(100, 100, 300, 300)).toBe('tron');
    expect(cachDatAnh(0, 0, 300, 300)).toBe('cat');
  });
});

describe('giám định vòng cuối (15/11/2026)', () => {
  const N = ' ';
  it('tenHienThiKhach: khổ vải tách bằng " · ", số và đơn vị không ngắt dòng', () => {
    expect(tenHienThiKhach('VẢI CANDELA-21 SESAME -KHỔ 3.2M')).toBe(`Vải Candela-21 Sesame · Khổ${N}3.2${N}m`);
    expect(tenHienThiKhach('VẢI ASURI 26-KHỔ 1.4M')).toBe(`Vải Asuri 26 · Khổ${N}1.4${N}m`);
    expect(tenHienThiKhach('VẢI 30532-005_COLOR FORESTA_KHỔ 1.35M')).toBe(`Vải 30532-005 Color Foresta · Khổ${N}1.35${N}m`);
    expect(tenHienThiKhach('SIMILI P.CAROLA II-01_ KHỔ 1.37M')).toBe(`Simili P.Carola II-01 · Khổ${N}1.37${N}m`);
    expect(tenHienThiKhach('DÂY DÙ_VPR-PE557_20MM')).toBe(`Dây Dù VPR-PE557 20${N}mm`);
    expect(tenHienThiKhach('ĐÁ CALACATTA GOLD MARBLE')).toBe('Đá Calacatta Gold Marble');
    expect(tenHienThiKhach('DÂY THỪNG_MÀU NÂU VÀNG Φ18MM')).toBe(`Dây Thừng Màu Nâu Vàng Φ18${N}mm`);
  });
  it('donViQuyCach: quy cách chỉ có số => thêm mm; có đơn vị / dạng khác giữ nguyên', () => {
    expect(donViQuyCach('Rộng 3200')).toBe(`Rộng 3200${N}mm`);
    expect(donViQuyCach('Khổ 1400')).toBe(`Khổ 1400${N}mm`);
    expect(donViQuyCach('Rộng 1220 × Dài 2440')).toBe(`Rộng 1220 × Dài 2440${N}mm`);
    expect(donViQuyCach('18 mm')).toBe('18 mm');
    expect(donViQuyCach('GOLD')).toBe('GOLD');
  });
  it('thongSoHien: thêm đơn vị nhưng vẫn giữ đủ dòng', () => {
    const kq = thongSoHien({ loai: 'KVT Vải Da Mouss', thuocTinh: { chungLoai: 'VẢI', quyCach: 'Rộng 3200' } });
    expect(kq.map(t => t.nhan)).toEqual(['Chủng loại', 'Quy cách']);
    expect(kq[1].giaTri).toBe(`Rộng 3200${N}mm`);
  });
  it('boTrungTen: Φ18MM trong tên = quy cách 18 mm', () => {
    expect(boTrungTen(['18 mm', 'Nâu'], 'Dây Thừng Màu Nâu Vàng Φ18MM')).toEqual([]);
  });
  it('cachXepCo: chưa mã nào có giá => ẩn xếp theo giá', () => {
    expect(cachXepCo(false)).toEqual(['moi', 'ten']);
    expect(cachXepCo(true)).toEqual(['moi', 'ten', 'giaTang', 'giaGiam']);
  });
  it('địa chỉ trang: loại + trang', () => {
    expect(khoaLoai('KVT Đá')).toBe('da');
    expect(khoaLoai('KVT Vải Da Mouss')).toBe('vai-da-mut');
    expect(taoHashCuaHang('', 1)).toBe('#/cua-hang');
    expect(taoHashCuaHang('KVT Đá', 2)).toBe('#/cua-hang?loai=da&trang=2');
    expect(docHashCuaHang('#/cua-hang?loai=da&trang=2')).toEqual({ loai: 'da', chungLoai: '', mau: '', trang: 2 });
    expect(docHashCuaHang('#/cua-hang?trang=abc')).toEqual({ loai: '', chungLoai: '', mau: '', trang: 1 });
    expect(docHashCuaHang('#/cua-hang')).toEqual({ loai: '', chungLoai: '', mau: '', trang: 1 });
  });
  it('docHangKhach: giấy dán tường / laminate => Vật liệu dán bề mặt; simili giữ ở Vải', () => {
    const doc = (ten: string, nhomVatTu: string, loai = 'KVT Vải Da Mouss', chungLoai?: string) =>
      docHangKhach({ ma: '1', ten, loai, nhomVatTu, thuocTinh: chungLoai ? { chungLoai } : {} })!;
    expect(doc('GIẤY DÁN TƯỜNG LS2-05-05', 'Vải')).toMatchObject({ loai: LOAI_DAN_BE_MAT, nhomVatTu: 'Giấy dán tường' });
    expect(doc('GIẤY DÁN TƯỜNG_97064-1_KHỔ 0.914M', 'Vải')).toMatchObject({ loai: LOAI_DAN_BE_MAT });
    expect(doc('HKG 0196', 'Vải', 'KVT Vải Da Mouss', 'GIẤY DÁN TƯỜNG').loai).toBe(LOAI_DAN_BE_MAT);
    expect(doc('LAMINATE LK 1175A_1220X2440', 'Vật liệu dán bề mặt', 'KVT Tấm-Ván')).toMatchObject({ loai: LOAI_DAN_BE_MAT, nhomVatTu: 'Vật liệu dán bề mặt' });
    expect(doc('SIMILI POLO 30-KHỔ 1.4M', 'Da').loai).toBe('KVT Vải Da Mouss');
  });
  it('demTheoLoai: Vật liệu dán bề mặt đứng ngay sau Tấm ván', () => {
    const ds = chuanBiHang([
      { ma: 'a', ten: 'A', loai: LOAI_DAN_BE_MAT, thuocTinh: {}, soLuong: 1, dvt: null, giaBanVnd: null, moTa: null, anh: [], anhNgoai: [] },
      { ma: 'b', ten: 'B', loai: 'KVT Đá', thuocTinh: {}, soLuong: 1, dvt: null, giaBanVnd: null, moTa: null, anh: [], anhNgoai: [] },
      { ma: 'c', ten: 'C', loai: 'KVT Tấm-Ván', thuocTinh: {}, soLuong: 1, dvt: null, giaBanVnd: null, moTa: null, anh: [], anhNgoai: [] },
    ]);
    expect(demTheoLoai(ds).map(c => c.loai)).toEqual(['KVT Tấm-Ván', LOAI_DAN_BE_MAT, 'KVT Đá']);
  });
});

describe('thanh lọc chủng loại + màu (16/11/2026)', () => {
  it('nhomMauCua: gom tiếng Anh / Việt / Ý về nhóm tiếng Việt, từ màu đầu tiên thắng', () => {
    const g = (s: string | null) => nhomMauCua(s);
    expect(['WHITE', 'TRẮNG', 'SNOW', 'GHIACCIO'].map(g)).toEqual(['trang', 'trang', 'trang', 'trang']);
    expect(['GREY', 'GRAY', 'XÁM', 'GREY LIGHT', 'TURKEY GREY'].map(g)).toEqual(['xam', 'xam', 'xam', 'xam', 'xam']);
    expect(['BLACK', 'ĐEN', 'NOIR', 'NERO', 'BLACK FOREST'].map(g)).toEqual(['den', 'den', 'den', 'den', 'den']);
    expect(['BROWN', 'NÂU', 'CHOCOLATE', 'RUST', 'MALT', 'CORTECCIA'].map(g)).toEqual(['nau', 'nau', 'nau', 'nau', 'nau', 'nau']);
    expect(['BEIGE', 'KEM', 'CREAM', 'IVORY', 'MÀU SỮA', 'CREAM MOCA', 'SESAME', 'NATURAL'].map(g)).toEqual(Array(8).fill('kem'));
    expect(['GOLD', 'VÀNG'].map(g)).toEqual(['vang', 'vang']);
    expect(['GREEN', 'MINT', 'SEAGRASS', 'XANH LÁ'].map(g)).toEqual(Array(4).fill('xanh-la'));
    expect(['BLUE', 'XANH DƯƠNG', 'XANH NGỌC'].map(g)).toEqual(Array(3).fill('xanh-duong'));
    expect(['RED', 'ĐỎ', 'PINK', 'HỒNG', 'BURGUNDY', 'POMPADOUR'].map(g)).toEqual(Array(6).fill('do'));
    // Không rõ: 'xanh' đơn lẻ, tên mẫu không phải màu, rỗng
    expect(['XANH', 'LIGHT', 'CAMOUFLAGE', 'AUTUMN', '', null].map(g)).toEqual(Array(6).fill(null));
    // Không bắt nhầm từ nằm trong từ khác ('red' trong 'REDWOOD', 'do' trong 'DOMINO')
    expect(g('REDWOOD')).toBeNull();
    expect(g('DOMINO')).toBeNull();
    expect(NHOM_MAU.map(n => n.id)).toContain('xam');
  });
  it('nhomMauCua: tên màu gặp trong dữ liệu + nhóm AI nhìn ảnh ghi vào MP15', () => {
    const g = (s: string) => nhomMauCua(s);
    expect(['MUSCHIO', 'VERDE', 'PINE', 'OLIVE', 'SAGE', 'XANH LÁ', 'XANH RÊU'].map(g)).toEqual(Array(7).fill('xanh-la'));
    expect(['TESTA MORO', 'FANGO', 'SADDLE', 'MOCHA', 'WALNUT', 'NÂU', 'NÂU ĐẤT'].map(g)).toEqual(Array(7).fill('nau'));
    expect(['RUBY', 'TABASCO', 'WINE', 'ĐỎ'].map(g)).toEqual(Array(4).fill('do'));
    expect(['OCEAN', 'NAVY', 'AZZURRO', 'XANH DƯƠNG'].map(g)).toEqual(Array(4).fill('xanh-duong'));
    expect(['WHEAT', 'SAND', 'LINEN', 'TAUPE', 'KEM / BE', 'BE NHẠT'].map(g)).toEqual(Array(6).fill('kem'));
    expect(['PLUM', 'LAVENDER', 'TÍM'].map(g)).toEqual(Array(3).fill('tim'));
    // 12 nhóm AI trả về đều vào đúng nhóm trang khách
    expect(['TRẮNG', 'XÁM', 'ĐEN', 'VÀNG', 'CAM', 'HỒNG'].map(g)).toEqual(['trang', 'xam', 'den', 'vang', 'vang', 'do']);
    // mô tả ghép: lấy màu ĐẦU
    expect(g('XÁM VÂN TRẮNG')).toBe('xam');
    expect(g('TRẮNG VÂN XÁM')).toBe('trang');
    // không phải màu
    expect(['MARBLE', 'POLARIS', 'FOSSIL', 'VÂN'].map(g)).toEqual(Array(4).fill(null));
    // mọi nhóm gán được đều có trong NHOM_MAU (Tím, Vàng & cam có ô chọn)
    const id = new Set(NHOM_MAU.map(n => n.id));
    expect(['TÍM', 'CAM', 'HỒNG', 'KEM / BE'].map(g).every(x => x !== null && id.has(x))).toBe(true);
  });
  it('giaTriMau: thuộc tính mau, không có thì dòng Màu sắc (không lấy Mã màu)', () => {
    expect(giaTriMau({ thuocTinh: { mau: 'GREY' } })).toBe('GREY');
    expect(giaTriMau({ thuocTinh: {}, thuocTinhDayDu: [{ nhan: 'Mã màu', giaTri: '217' }, { nhan: 'Màu sắc', giaTri: 'NÂU' }] })).toBe('NÂU');
    expect(giaTriMau({ thuocTinh: { maMau: 'WHITE' }, thuocTinhDayDu: [{ nhan: 'Mã màu', giaTri: 'WHITE' }] })).toBe('');
  });
  it('tenChungLoai / khoaChungLoai', () => {
    expect(tenChungLoai('SOLID SURFACE')).toBe('Solid surface');
    expect(tenChungLoai('GIẤY DÁN TƯỜNG')).toBe('Giấy dán tường');
    expect(tenChungLoai('MDF')).toBe('MDF');
    expect(tenChungLoai('Vải')).toBe('Vải');
    expect(khoaChungLoai('GIẤY DÁN TƯỜNG')).toBe('giay-dan-tuong');
    expect(khoaChungLoai('ĐÁ')).toBe('dda');
    expect(khoaChungLoai('ÐÁ')).toBe('dda'); // 'Ð' U+00D0 (SAP gõ nhầm) như 'Đ'
    // 'DA' (da, loại Vải, da & mút) và 'ĐÁ' (đá) phải ra hai khoá khác nhau — không gộp "Da (85)" ở 'Tất cả'
    expect(khoaChungLoai('DA')).toBe('da');
    expect(khoaChungLoai('DA')).not.toBe(khoaChungLoai('ĐÁ'));
    expect(khoaChungLoai('đường may')).toBe('dduong-may');
    expect(khoaChungLoai('')).toBe('');
  });
  const ds = chuanBiHang([
    hang({ ma: '1', loai: 'KVT Đá', thuocTinh: { chungLoai: 'ĐÁ', mau: 'WHITE' } }),
    hang({ ma: '2', loai: 'KVT Đá', thuocTinh: { chungLoai: 'ĐÁ', mau: 'GREY' } }),
    hang({ ma: '3', loai: 'KVT Đá', thuocTinh: { chungLoai: 'SOLID SURFACE' }, thuocTinhDayDu: [{ nhan: 'Màu sắc', giaTri: 'TRẮNG' }] }),
    hang({ ma: '4', loai: 'KVT Đá', thuocTinh: { chungLoai: 'ĐÁ', mau: 'CAMOUFLAGE' } }),
    hang({ ma: '5', loai: 'KVT Đá', thuocTinh: {} }),
  ]);
  it('chuanBiHang gắn khoaCL + nhomMau', () => {
    expect(ds.map(h => [h.khoaCL, h.nhomMau])).toEqual([['dda', 'trang'], ['dda', 'xam'], ['solid-surface', 'trang'], ['dda', null], ['', null]]);
  });
  it('demChungLoai: nhiều mã trước, bỏ mã không có chủng loại', () => {
    expect(demChungLoai(ds)).toEqual([{ khoa: 'dda', ten: 'Đá', dem: 3 }, { khoa: 'solid-surface', ten: 'Solid surface', dem: 1 }]);
  });
  it('demNhomMau: đúng thứ tự nhóm, đếm mã chưa rõ màu riêng', () => {
    const kq = demNhomMau(ds);
    expect(kq.nhom.map(n => [n.id, n.dem])).toEqual([['trang', 2], ['xam', 1]]);
    expect(kq.chuaRo).toBe(2);
  });
  it('locThem: chủng loại + màu; mã chưa rõ màu không lọt vào nhóm màu', () => {
    expect(locThem(ds, '', '')).toBe(ds);
    expect(locThem(ds, 'dda', '').map(h => h.ma)).toEqual(['1', '2', '4']);
    expect(locThem(ds, '', 'trang').map(h => h.ma)).toEqual(['1', '3']);
    expect(locThem(ds, 'dda', 'trang').map(h => h.ma)).toEqual(['1']);
  });
  it('địa chỉ trang có bộ lọc', () => {
    expect(taoHashCuaHang('KVT Đá', 2, { chungLoai: 'solid-surface', mau: 'xam' })).toBe('#/cua-hang?loai=da&cl=solid-surface&mau=xam&trang=2');
    expect(taoHashCuaHang('', 1, { mau: 'den' })).toBe('#/cua-hang?mau=den');
    expect(docHashCuaHang('#/cua-hang?loai=da&cl=Solid-Surface&mau=XAM&trang=3')).toEqual({ loai: 'da', chungLoai: 'solid-surface', mau: 'xam', trang: 3 });
  });
  it('docSoTrang: ô Đến trang', () => {
    expect(docSoTrang('3', 9)).toBe(3);
    expect(docSoTrang(' 12 ', 9)).toBe(9);
    expect(docSoTrang('0', 9)).toBe(1);
    expect(docSoTrang('', 9)).toBeNull();
    expect(docSoTrang('2a', 9)).toBeNull();
  });
});
