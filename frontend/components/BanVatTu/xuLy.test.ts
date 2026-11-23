import { describe, expect, it } from 'vitest';
import { docDsAnh, docItem, docLyLichMua, type AnhNoiBo, type ItemBanVatTu, type MasterVatTu } from '../../services/banVatTuApi';
import {
  bangExcel, boDau, chuanBiDong, chuTat, docSoTrieu, dinhDangSoLuong, dinhDangTrieu, dsLuaChon,
  laGanCongTrinh, locDong, LOC_TRONG, nhanNgayNhap, nhanTuoi, nhomTuoi, soLocDangBat, soThangTuoi,
  tenDvt, tenKhoGon, tomTat, xepDong, DS_LOAI_CHINH, thuTuLoai,
  anhCanDuyet, chuThichAnh, coAnh, dsAnhHien, ganTrangThaiAnh, gopThuocTinh, nguonThuocTinhExcel, nhanCoAnh,
  laTrong,
} from './xuLy';

const HOM_NAY = '2026-11-14';

const item = (p: Partial<ItemBanVatTu> & { ma: string }): ItemBanVatTu => ({
  ten: `Vật tư ${p.ma}`, dvt: 'PCS', soLuong: 1, kho: 'KVT Phụ kiện', ngayNhap: '2026-10-01', chamLuanChuyen: false,
  tenCongTrinh: 'DÙNG CHUNG', maCongTrinh: null, giaTri: 1, donGiaVon: 1e6, master: null,
  anhLink: [],
  anh: [],
  ...p,
});

const master = (p: Partial<MasterVatTu> = {}): MasterVatTu => ({
  ten: null, nhomSap: null, tenNhomSap: null, loai: null, chungLoai: null, chatLieu: null, quyCach: null, mau: null,
  thuongHieu: null, xuatXu: null, thuocTinh: {}, giaBinhQuan: null, suyTuTen: {}, thuongHieuNcc: null, nguon: null, ...p,
});

const anh = (id: number, p: Partial<AnhNoiBo> = {}): AnhNoiBo => ({
  id, chacChan: true, trangThai: 'tu_dong', congTrinh: 'CT25-070', codeVatLieu: 'ST-05', ...p,
});

describe('đơn vị tính / kho / chữ', () => {
  it('đổi mã đơn vị SAP sang chữ dễ đọc, mã lạ giữ nguyên chữ thường', () => {
    expect(tenDvt('PCS')).toBe('cái');
    expect(tenDvt('TAM')).toBe('tấm');
    expect(tenDvt('M2')).toBe('m²');
    expect(tenDvt('XYZ')).toBe('xyz');
    expect(tenDvt(null)).toBe('');
  });
  it('tên kho gọn', () => {
    // Đủ 10 tên kho SAP trong file BC tồn 12/11/2026 => đúng 10 loại chính
    const sap = ['KVT vải,da,SF', 'KVT Gỗ', 'KVT Tấm – Ván', 'KVT Phụ kiện', 'KVT Đá', 'Kho VT Hóa chất', 'KVT GC ngoài',
      'KVT bao bì', 'Kho VT Kim loại', 'KVT CCDC'];
    expect(sap.map(tenKhoGon)).toEqual([...DS_LOAI_CHINH]);
    expect(tenKhoGon('Kho lạ')).toBe('Kho lạ');
    expect(tenKhoGon('')).toBe('Chưa rõ kho');
    expect(thuTuLoai('KVT Gỗ')).toBe(1);
    expect(thuTuLoai('Kho lạ')).toBe(DS_LOAI_CHINH.length);
  });
  it('bỏ dấu, chữ tắt, gán công trình', () => {
    expect(boDau('  Đá  Hoa Cương ')).toBe('da hoa cuong');
    expect(chuTat('KEO DÁN lá nhũ')).toBe('KD');
    expect(chuTat('')).toBe('?');
    expect(laGanCongTrinh('DÙNG CHUNG')).toBe(false);
    expect(laGanCongTrinh('dung chung')).toBe(false);
    expect(laGanCongTrinh(null)).toBe(false);
    expect(laGanCongTrinh('RIVERSIDE')).toBe(true);
    // Biến thể thật trong file tồn: vẫn là dùng chung (cùng quy tắc loader)
    for (const s of ['DÙNG CHUNG + CÔNG TRÌNH', 'DÙNG CHUNG PX5', 'DÙNG CHUNG NHIỀU CT', 'DUNG CHUNG  (GỖ TRÒN XẺ SẤY)',
      'DÙNG  CHUNG (LÔ MỌT CHẾT )', 'DÙNG CHUNG\nARHAUS', ' DÙNG CHUNG PX2']) {
      expect(laGanCongTrinh(s)).toBe(false);
    }
    expect(laGanCongTrinh('DÙNG CHUNGX')).toBe(true);
    expect(laGanCongTrinh('ARHAUS + DÙNG CHUNG')).toBe(true);
  });
});

describe('tuổi tồn', () => {
  it('đếm tháng tròn theo chuỗi ngày', () => {
    expect(soThangTuoi('2026-10-14', HOM_NAY)).toBe(1);
    expect(soThangTuoi('2026-10-15', HOM_NAY)).toBe(0);
    expect(soThangTuoi('2025-11-14', HOM_NAY)).toBe(12);
    expect(soThangTuoi(null, HOM_NAY)).toBeNull();
  });
  it('nhóm tuổi; ngày chuyển SAP 30/09/2024 => trên 24 tháng / trước 10/2024', () => {
    expect(nhomTuoi('2026-09-01', HOM_NAY)).toBe('duoi6');
    expect(nhomTuoi('2026-03-01', HOM_NAY)).toBe('6_12');
    expect(nhomTuoi('2025-06-01', HOM_NAY)).toBe('12_24');
    expect(nhomTuoi('2024-10-05', HOM_NAY)).toBe('tren24');
    expect(nhomTuoi('2024-09-30', '2025-01-01')).toBe('tren24');
    expect(nhomTuoi(null, HOM_NAY)).toBe('khong_ro');
  });
  it('nhãn ngày nhập / tuổi', () => {
    expect(nhanNgayNhap('2024-09-30')).toBe('Từ trước 10/2024');
    expect(nhanNgayNhap('2026-01-05')).toBe('05/01/2026');
    expect(nhanNgayNhap(null)).toBe('Không rõ');
    expect(nhanTuoi('2024-09-30', HOM_NAY)).toBe('Từ trước 10/2024');
    expect(nhanTuoi('2025-09-14', HOM_NAY)).toBe('1 năm 2 tháng');
    expect(nhanTuoi('2026-11-01', HOM_NAY)).toBe('Dưới 1 tháng');
  });
});

describe('định dạng tiền / số', () => {
  it('triệu đồng gọn', () => {
    expect(dinhDangTrieu(150110)).toBe('150,11 tỷ');
    expect(dinhDangTrieu(12.34)).toBe('12,3 tr');
    expect(dinhDangTrieu(0.5)).toBe('500 nghìn');
    expect(dinhDangTrieu(null)).toBe('—');
  });
  it('số lượng kèm đơn vị', () => {
    expect(dinhDangSoLuong(1250.5, 'M')).toBe('1.250,5 m');
    expect(dinhDangSoLuong(3, 'SET')).toBe('3 bộ');
  });
});

describe('chuẩn bị, lọc, xếp', () => {
  const ds = chuanBiDong([
    item({ ma: '100000000024', ten: 'KEO PUR', soLuong: 570, giaTri: 94.5, kho: 'Kho VT Hóa chất', ngayNhap: '2026-11-04' }),
    item({ ma: '100000000024', ten: 'KEO PUR', soLuong: 10, giaTri: 1.6, kho: 'KVT Phụ kiện', ngayNhap: '2024-09-30', chamLuanChuyen: true }),
    item({ ma: '80000000001', ten: 'Đá marble trắng', soLuong: 3, giaTri: 0, kho: 'KVT Đá', tenCongTrinh: 'RIVERSIDE', ngayNhap: '2025-01-10',
      master: master({ nhomSap: 'D01', tenNhomSap: 'Đá tự nhiên', chungLoai: 'Marble', quyCach: '20MM', mau: 'Trắng', xuatXu: 'Ý' }) }),
    item({ ma: '400000000001', ten: 'Máy khoan', soLuong: 1, giaTri: 5, kho: 'KVT CCDC', ngayNhap: null,
      anhLink: ['https://x.vn/a.jpg'] }),
  ], HOM_NAY);

  it('khoá ma+kho duy nhất, giữ mã 11 số nguyên dạng chuỗi', () => {
    expect(new Set(ds.map(d => d.khoa)).size).toBe(4);
    expect(ds[2].ma).toBe('80000000001');
    expect(ds[2].nhom).toBe('Đá tự nhiên');
    expect(ds[0].nhom).toBe('Chưa phân nhóm');
    expect(ds[2].ganCT).toBe(true);
  });
  it('tìm không dấu, nhiều từ; tìm theo màu / quy cách master', () => {
    expect(locDong(ds, { ...LOC_TRONG, tim: 'da trang' }, true).map(d => d.ma)).toEqual(['80000000001']);
    expect(locDong(ds, { ...LOC_TRONG, tim: '20mm' }, true)).toHaveLength(1);
    expect(locDong(ds, { ...LOC_TRONG, tim: '100000000024' }, true)).toHaveLength(2);
  });
  it('lọc kho / gán CT / chậm / tuổi / ảnh / giá trị', () => {
    expect(locDong(ds, { ...LOC_TRONG, kho: 'KVT Hóa chất' }, true)).toHaveLength(1);
    expect(locDong(ds, { ...LOC_TRONG, ganCT: 'gan_ct' }, true)).toHaveLength(1);
    expect(locDong(ds, { ...LOC_TRONG, ganCT: 'dung_chung' }, true)).toHaveLength(3);
    expect(locDong(ds, { ...LOC_TRONG, cham: 'cham' }, true)).toHaveLength(1);
    expect(locDong(ds, { ...LOC_TRONG, tuoi: 'tren24' }, true)).toHaveLength(1);
    expect(locDong(ds, { ...LOC_TRONG, tuoi: 'khong_ro' }, true)).toHaveLength(1);
    expect(locDong(ds, { ...LOC_TRONG, anh: 'co' }, true)).toHaveLength(1);
    expect(locDong(ds, { ...LOC_TRONG, giaTriTu: 2, giaTriDen: 50 }, true).map(d => d.ma)).toEqual(['400000000001']);
    // Không có quyền giá vốn => bỏ qua khoảng giá trị
    expect(locDong(ds, { ...LOC_TRONG, giaTriTu: 2 }, false)).toHaveLength(4);
  });
  it('đếm số bộ lọc, lựa chọn bỏ qua chính nó', () => {
    expect(soLocDangBat(LOC_TRONG)).toBe(0);
    expect(soLocDangBat({ ...LOC_TRONG, tim: 'a', kho: 'x', giaTriDen: 3 })).toBe(3);
    const l = { ...LOC_TRONG, kho: 'Đá' };
    expect(dsLuaChon(locDong(ds, l, true, 'kho'), d => d.khoTen)).toHaveLength(4);
  });
  it('xếp giá trị giảm, tuổi giảm (trước 10/2024 cũ nhất), tên tăng', () => {
    expect(xepDong(ds, { cot: 'giaTri', giam: true })[0].giaTri).toBe(94.5);
    expect(xepDong(ds, { cot: 'tuoi', giam: true })[0].ngayNhap).toBe('2024-09-30');
    expect(xepDong(ds, { cot: 'ten', giam: false })[0].tenHien).toBe('Đá marble trắng');
  });
  it('tóm tắt: số mã, dòng, giá trị, gán CT, chậm luân chuyển (theo mã)', () => {
    const t = tomTat(ds);
    expect(t.soMa).toBe(3);
    expect(t.soDong).toBe(4);
    expect(t.tongGiaTri).toBeCloseTo(101.1);
    expect(t.ganCT).toBe(1);
    expect(t.cham).toBe(1);
  });
  it('bảng Excel: có / không cột giá vốn', () => {
    const co = bangExcel(ds, true, HOM_NAY);
    const khong = bangExcel(ds, false, HOM_NAY);
    expect(co[0]).toContain('Giá trị tồn (triệu)');
    expect(khong[0]).not.toContain('Giá trị tồn (triệu)');
    expect(co).toHaveLength(5);
    // Không còn cột bán
    for (const cot of ['Giá chào (đ/đvt)', 'Trạng thái', 'Trên trang khách', 'Tên cho khách', 'Liên hệ']) expect(co[0]).not.toContain(cot);
    expect(khong[4][khong[0].indexOf('Link ảnh')]).toBe('https://x.vn/a.jpg');
  });
});

describe('đọc dữ liệu API', () => {
  it('số dạng chuỗi, ẩn giá vốn khi không có quyền, link ảnh bỏ rỗng / trùng', () => {
    const raw = {
      ma: '80000000001', ten: 'Đá', soLuong: '3.5', giaTri: '12.5', donGiaVon: '100', ngayNhap: '2024-09-30T00:00:00Z',
      chamLuanChuyen: true, master: { ten: 'X', thuocTinh: { 'MP01 Chủng loại': 'Đá', 'MP02': '' }, giaBinhQuan: '5' },
      anhLink: ['https://a', '', ' https://a '], ban: { giaBanVnd: '200000' },
    };
    const a = docItem(raw, true);
    expect(a.ma).toBe('80000000001');
    expect(a.soLuong).toBe(3.5);
    expect(a.giaTri).toBe(12.5);
    expect(a.ngayNhap).toBe('2024-09-30');
    expect(a.master?.thuocTinh).toEqual({ 'MP01 Chủng loại': 'Đá' });
    expect(a.master?.giaBinhQuan).toBe(5);
    expect(a.anhLink).toEqual(['https://a']);
    // trường bán cũ máy chủ còn trả (nếu có) bị bỏ qua
    expect('ban' in a).toBe(false);
    const b = docItem(raw, false);
    expect(b.giaTri).toBeNull();
    expect(b.donGiaVon).toBeNull();
    expect(b.master?.giaBinhQuan).toBeNull();
  });
});

describe('docSoTrieu (ô lọc giá trị, kiểu vi-VN)', () => {
  it('dấu chấm hàng nghìn, dấu phẩy thập phân', () => {
    expect(docSoTrieu('1.000')).toBe(1000);
    expect(docSoTrieu('1.250.000')).toBe(1250000);
    expect(docSoTrieu('1.000,5')).toBe(1000.5);
    expect(docSoTrieu('2,5')).toBe(2.5);
    expect(docSoTrieu('1.5')).toBe(1.5);
    expect(docSoTrieu(' 300 ')).toBe(300);
  });
  it('trống / sai / âm => null', () => {
    expect(docSoTrieu('')).toBeNull();
    expect(docSoTrieu('abc')).toBeNull();
    expect(docSoTrieu('-5')).toBeNull();
  });
});

describe('thuộc tính gộp: master → suy từ tên → theo NCC', () => {
  it('master có thì dùng master, trống mới dùng suy luận; thương hiệu NCC chỉ khi cả hai trống', () => {
    const it1 = item({ ma: '1', master: master({
      chungLoai: 'Bản lề', mau: ' ', suyTuTen: { chungLoai: 'BẢN LỀ SAI', mau: 'ĐEN', quyCach: '35MM', maMau: 'RAL9005' },
      thuongHieuNcc: 'HAFELE',
    }) });
    const tt = gopThuocTinh(it1);
    expect(tt.chungLoai).toEqual({ giaTri: 'Bản lề', nguon: 'master' });
    expect(tt.mau).toEqual({ giaTri: 'ĐEN', nguon: 'ten' });
    expect(tt.quyCach).toEqual({ giaTri: '35MM', nguon: 'ten' });
    expect(tt.maMau).toEqual({ giaTri: 'RAL9005', nguon: 'ten' });
    expect(tt.thuongHieu).toEqual({ giaTri: 'HAFELE', nguon: 'ncc' });
    expect(tt.chatLieu).toBeUndefined();
    expect(nguonThuocTinhExcel(tt)).toBe('Quy cách, Màu, Mã màu: suy từ tên; Thương hiệu: theo NCC');
    // Thương hiệu suy từ tên thắng NCC; master thắng cả hai
    expect(gopThuocTinh({ master: master({ suyTuTen: { thuongHieu: 'BLUM' }, thuongHieuNcc: 'HAFELE' }) }).thuongHieu?.nguon).toBe('ten');
    expect(gopThuocTinh({ master: master({ thuongHieu: 'HETTICH', thuongHieuNcc: 'HAFELE' }) }).thuongHieu)
      .toEqual({ giaTri: 'HETTICH', nguon: 'master' });
    expect(gopThuocTinh({ master: null })).toEqual({});
    expect(nguonThuocTinhExcel({})).toBe('');
  });
  it('mã màu master lấy từ MP16; ô ghi "-" / N/A coi là trống như script nạp', () => {
    const tt = gopThuocTinh({ master: master({ thuocTinh: { 'MP16 MÃ MÀU': 'RAL 9016', 'MP15 MÀU': 'TRẮNG' } }) });
    expect(tt.maMau).toEqual({ giaTri: 'RAL 9016', nguon: 'master' });
    const it2 = item({ ma: '1', master: master({ thuocTinh: { 'MP16 MÃ MÀU': 'RAL 9016' } }) });
    expect(chuanBiDong([it2], HOM_NAY)[0].chuoiTim).toContain('ral 9016');
    const coGach = gopThuocTinh({ master: master({
      mau: '-', thuocTinh: { 'MP16 MÃ MÀU': 'N/A' }, suyTuTen: { mau: 'ĐEN', maMau: 'S2666' },
    }) });
    expect(coGach.mau).toEqual({ giaTri: 'ĐEN', nguon: 'ten' });
    expect(coGach.maMau).toEqual({ giaTri: 'S2666', nguon: 'ten' });
    expect(laTrong(' -- ')).toBe(true);
    expect(laTrong('na')).toBe(true);
    expect(laTrong('NAVY')).toBe(false);
  });
  it('tìm kiếm + chủng loại hiển thị dùng cả giá trị suy luận và code vật liệu của ảnh', () => {
    const ds = chuanBiDong([
      item({ ma: '1', ten: 'BAN LE A', master: master({ suyTuTen: { chungLoai: 'Bản lề', mau: 'Đen' } }) }),
      item({ ma: '2', ten: 'VIT B', master: master({ thuongHieuNcc: 'HAFELE' }), anh: [anh(5, { codeVatLieu: 'FAB-996' })] }),
    ], HOM_NAY);
    expect(ds[0].chungLoaiHien).toBe('Bản lề');
    expect(locDong(ds, { ...LOC_TRONG, tim: 'den' }, false).map(d => d.ma)).toEqual(['1']);
    expect(locDong(ds, { ...LOC_TRONG, tim: 'hafele' }, false).map(d => d.ma)).toEqual(['2']);
    expect(locDong(ds, { ...LOC_TRONG, tim: 'fab-996' }, false).map(d => d.ma)).toEqual(['2']);
  });
});

describe('ảnh nội bộ (sheet 03)', () => {
  const ds = chuanBiDong([
    item({ ma: '1', anh: [anh(1), anh(2, { chacChan: false })] }),
    item({ ma: '1', kho: 'KVT Gỗ', anh: [anh(1), anh(2, { chacChan: false })] }),
    item({ ma: '2', anhLink: ['https://a.vn/x.jpg'] }),
    item({ ma: '3' }),
  ], HOM_NAY);
  it('có ảnh tính cả ảnh nội bộ: lọc, tóm tắt, cột Excel', () => {
    expect(coAnh(ds[0])).toBe(true);
    expect(coAnh(ds[3])).toBe(false);
    expect(locDong(ds, { ...LOC_TRONG, anh: 'co' }, false).map(d => d.ma)).toEqual(['1', '1', '2']);
    expect(locDong(ds, { ...LOC_TRONG, anh: 'chua' }, false).map(d => d.ma)).toEqual(['3']);
    expect(tomTat(ds).coAnh).toBe(2);
    const b = bangExcel(ds, false, HOM_NAY);
    const c = b[0].indexOf('Có ảnh');
    expect(c).toBeGreaterThan(0);
    expect(b[0]).toContain('Nguồn thuộc tính');
    expect(b[0]).toContain('Mã màu');
    expect(b.slice(1).map(r => r[c])).toEqual(['Có (ảnh mẫu CT)', 'Có (ảnh mẫu CT)', 'Có (link)', null]);
    expect(nhanCoAnh({ anhLink: ds[3].anhLink, anh: [anh(9, { chacChan: false })] })).toBe('Có (ảnh mẫu CT — cần duyệt)');
  });
  it('thứ tự ảnh hiện: link trước, ảnh nội bộ sau; nhãn cần duyệt, chú thích', () => {
    const d = { anhLink: [...ds[2].anhLink], anh: [anh(7)] };
    expect(dsAnhHien(d).map(a => a.loai)).toEqual(['link', 'noi_bo']);
    expect(anhCanDuyet(anh(1, { chacChan: false }))).toBe(true);
    expect(anhCanDuyet(anh(1, { chacChan: false, trangThai: 'da_duyet' }))).toBe(false);
    expect(anhCanDuyet(anh(1))).toBe(false);
    expect(chuThichAnh(anh(1))).toBe('Ảnh mẫu duyệt CT25-070 (ST-05)');
    expect(chuThichAnh(anh(1, { congTrinh: null, codeVatLieu: null }))).toBe('Ảnh mẫu duyệt công trình');
  });
  it('duyệt / ẩn ảnh áp cho mọi dòng cùng mã, không đổi mảng cũ', () => {
    const duyet = ganTrangThaiAnh(ds, '1', 2, 'da_duyet');
    expect(duyet[0].anh.map(a => [a.id, a.trangThai])).toEqual([[2, 'da_duyet'], [1, 'tu_dong']]);
    expect(duyet[1].anh[0].id).toBe(2);
    expect(ds[0].anh[0].id).toBe(1);
    const an = ganTrangThaiAnh(ds, '1', 1, 'an');
    expect(an[0].anh.map(a => a.id)).toEqual([2]);
    expect(an[1].anh.map(a => a.id)).toEqual([2]);
    expect(an[2]).toBe(ds[2]);
  });
  it('ẩn ảnh => ô tìm không còn khớp code vật liệu của ảnh đó; hoàn tác (anhGoc) thêm lại ảnh', () => {
    const d0 = chuanBiDong([item({ ma: '7', anh: [anh(1, { codeVatLieu: 'FAB-996' }), anh(2, { codeVatLieu: 'ST-05' })] })], HOM_NAY);
    const an = ganTrangThaiAnh(d0, '7', 1, 'an');
    expect(locDong(an, { ...LOC_TRONG, tim: 'fab-996' }, false)).toEqual([]);
    expect(locDong(an, { ...LOC_TRONG, tim: 'st-05' }, false).map(d => d.ma)).toEqual(['7']);
    const lai = ganTrangThaiAnh(an, '7', 1, 'tu_dong', d0[0].anh[0]);
    expect(lai[0].anh.map(a => a.id)).toEqual([2, 1]);
    expect(locDong(lai, { ...LOC_TRONG, tim: 'fab-996' }, false).map(d => d.ma)).toEqual(['7']);
    // không có anhGoc => không tự thêm ảnh lạ
    expect(ganTrangThaiAnh(an, '7', 1, 'tu_dong')).toEqual(an);
  });
});

describe('đọc dữ liệu API mới (chịu thiếu trường)', () => {
  it('máy chủ cũ chưa có suyTuTen / anh => rỗng', () => {
    const a = docItem({ ma: '1', ten: 'x', master: { ten: 'x' } }, false);
    expect(a.anh).toEqual([]);
    expect(a.master?.suyTuTen).toEqual({});
    expect(a.master?.thuongHieuNcc).toBeNull();
  });
  it('suyTuTen chỉ nhận khoá biết, bỏ rỗng; ảnh bỏ hỏng / ẩn / trùng', () => {
    const a = docItem({
      ma: '1', master: { suyTuTen: { mau: ' Đen ', la: 'x', quyCach: '' }, thuongHieuNcc: 'BLUM' },
      anh: [{ id: 3, chacChan: true, trangThai: 'da_duyet', congTrinh: 'CT26-001' }, { id: 3 }, { id: 'x' }, { id: 4, trangThai: 'an' }, null,
        { id: '5', trangThai: 'lạ' }],
    }, false);
    expect(a.master?.suyTuTen).toEqual({ mau: 'Đen' });
    expect(a.master?.thuongHieuNcc).toBe('BLUM');
    expect(a.anh).toEqual([
      { id: 3, chacChan: true, trangThai: 'da_duyet', congTrinh: 'CT26-001', codeVatLieu: null },
      { id: 5, chacChan: false, trangThai: 'tu_dong', congTrinh: null, codeVatLieu: null },
    ]);
    expect(docDsAnh(undefined)).toEqual([]);
  });
  it('lý lịch mua: có quyền / không quyền giá', () => {
    const co = docLyLichMua({
      soDongPr: '12', ngayPrCuoi: '2026-10-02T00:00:00Z', congTrinh: ['CT26-001', 'CT26-001', ''], codeVatLieu: ['ST-05'],
      nhomVt: 'PK', tenPr: 'BẢN LỀ', nhaCungCap: ['HAFELE'], donGiaGanNhat: { gia: '85000', dvt: 'PCS', ngay: '2026-09-01' },
      lanMua: [{ ngayPr: '2026-10-02', congTrinh: 'CT26-001', soLuong: '10', dvt: 'PCS', donGia: null, ncc: null }, null],
    });
    expect(co.soDongPr).toBe(12);
    expect(co.ngayPrCuoi).toBe('2026-10-02');
    expect(co.congTrinh).toEqual(['CT26-001']);
    expect(co.donGiaGanNhat).toEqual({ gia: 85000, dvt: 'PCS', ngay: '2026-09-01' });
    expect(co.lanMua).toHaveLength(1);
    expect(co.lanMua[0].soLuong).toBe(10);
    const khong = docLyLichMua({ soDongPr: 3, nhaCungCap: null, donGiaGanNhat: null });
    expect(khong.nhaCungCap).toBeNull();
    expect(khong.donGiaGanNhat).toBeNull();
    expect(khong.lanMua).toEqual([]);
    expect(docLyLichMua(null).soDongPr).toBe(0);
  });
});
