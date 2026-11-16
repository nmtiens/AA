import { describe, expect, it } from 'vitest';
import { tachHex, tomTatMucGia, docSoTien, nhapSoTien, fmtDongGon, thieuTruongTien, chuanHoaChiTiet, hieu, noiDungTuDong } from './tienM6';

describe('tachHex', () => {
  it('dán nhiều mã cách nhau phẩy / khoảng trắng / xuống dòng, bỏ trùng và HEX chính', () => {
    const kq = tachHex('123456789, 223456789;\n323456789  123456789 HEX 423456789', ['323456789']);
    expect(kq.hop).toEqual(['123456789', '223456789', '423456789']);
    expect(kq.loi).toEqual([]);
  });
  it('báo phần không phải mã 9 số', () => {
    const kq = tachHex('12345678 1234567890 abc 123456789');
    expect(kq.hop).toEqual(['123456789']);
    expect(kq.loi).toEqual(['12345678', '1234567890', 'abc']);
  });
  it('mã nhà máy 13 số (quét tem) bỏ 4 số đầu thành HEX, như máy chủ', () => {
    const kq = tachHex('1004123456789 1004323456789', ['323456789']);
    expect(kq.hop).toEqual(['123456789']);
    expect(kq.loi).toEqual([]);
  });
});

describe('tomTatMucGia', () => {
  it('đếm mức giá, chênh và % so với mức thấp nhất', () => {
    const t = tomTatMucGia(['a', 'b', 'c', 'd'], {
      a: { donGia: 1_200_000 }, b: { donGia: 1_500_000 }, c: { donGia: 1_200_000 }, d: { donGia: null },
    });
    expect(t.soHex).toBe(4);
    expect(t.mucGia).toEqual([1_200_000, 1_500_000]);
    expect(t.chenh).toBe(300_000);
    expect(t.chenhPt).toBe(25);
    expect(t.chuaCoGia).toEqual(['d']);
    expect(t.text).toBe('4 HEX · 2 mức giá: 1.2 tr / 1.5 tr · chênh 300,000 đ (25%) · 1 mã chưa có giá');
  });
  it('cùng giá / chưa có giá', () => {
    expect(tomTatMucGia(['a', 'b'], { a: { donGia: 5 }, b: { donGia: 5 } }).text).toBe('2 HEX · 1 mức giá: 5 đ · cùng giá');
    expect(tomTatMucGia(['a'], {}).text).toBe('1 HEX · chưa có đơn giá · 1 mã chưa có giá');
  });
});

describe('tiền', () => {
  it('đọc / hiện ô nhập có dấu nghìn', () => {
    expect(docSoTien('12,500,000')).toBe(12_500_000);
    expect(docSoTien('')).toBeNull();
    expect(nhapSoTien('12500000đ')).toBe('12,500,000');
  });
  it('gọn theo tỷ / triệu', () => {
    expect(fmtDongGon(1_250_000_000)).toBe('1.25 tỷ');
    expect(fmtDongGon(12_500_000)).toBe('12.5 tr');
    expect(fmtDongGon(850_000)).toBe('850,000 đ');
    expect(fmtDongGon(null)).toBe('—');
  });
  it('hiệu chỉ khi đủ 2 số', () => {
    expect(hieu(5, 3)).toBe(2);
    expect(hieu(null, 3)).toBeNull();
  });
});

describe('kiểm tra + chuẩn hoá chi tiết', () => {
  it('trường bắt buộc theo loại', () => {
    expect(thieuTruongTien(null)).toBeNull();
    expect(thieuTruongTien({ loai: 'nhieu_gia', hexTrung: [] })).not.toBeNull();
    expect(thieuTruongTien({ loai: 'nhieu_gia', hexTrung: ['123456789'] })).toBeNull();
    expect(thieuTruongTien({ loai: 'gia_thap_gcvt', giaiTrinh: '  ' })).not.toBeNull();
    expect(thieuTruongTien({ loai: 'vat_tu_vuot_gia' })).toBeNull();
    // Đổi HEX chính đúng bằng mã duy nhất đã thêm => coi như chưa có mã khác (máy chủ cũng bỏ HEX chính)
    expect(thieuTruongTien({ loai: 'nhieu_gia', hexTrung: ['123456789'] }, '123456789')).not.toBeNull();
    expect(chuanHoaChiTiet({ loai: 'nhieu_gia', hexTrung: ['1', '2', '1'] }, '2')).toEqual({ loai: 'nhieu_gia', hexTrung: ['1'] });
  });
  it('bỏ trường không thuộc loại / rỗng', () => {
    expect(chuanHoaChiTiet({ loai: 'vat_tu_vuot_gia', hexTrung: ['1'], giaiTrinh: 'x', ghiChu: ' ' })).toEqual({ loai: 'vat_tu_vuot_gia' });
    expect(chuanHoaChiTiet({ loai: 'gia_thap_gcvt', chiPhiGcvt: 5_000_000, giaiTrinh: ' lý do ' })).toEqual({ loai: 'gia_thap_gcvt', chiPhiGcvt: 5_000_000, giaiTrinh: 'lý do' });
    expect(chuanHoaChiTiet({})).toBeNull();
  });
});

describe('noiDungTuDong', () => {
  const g = { tenHangMuc: null, tenCongTrinh: null, maCongTrinh: null, donGia: 1_000, triGia: 5_000, dvt: null, coGiaCongNgoai: null };
  it('vật tư > giá: không có quyền xem tiền vật tư thì không ghi số / dấu so sánh', () => {
    const t = noiDungTuDong('123456789', { loai: 'vat_tu_vuot_gia' }, { '123456789': { ...g, tongVatTu: null, coGiaVatTu: false } });
    expect(t).toContain('không có quyền xem');
    expect(t).not.toContain('>');
    expect(t).not.toContain('chênh');
  });
  it('vật tư > giá: đủ số thì ghi chênh', () => {
    const t = noiDungTuDong('123456789', { loai: 'vat_tu_vuot_gia' }, { '123456789': { ...g, tongVatTu: 8_000, coGiaVatTu: true } });
    expect(t).toContain('chênh +3,000 đ');
  });
});
