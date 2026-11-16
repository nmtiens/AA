import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chuanHoaThuocTinh, docMaVatTu, dungDong, giaBinhQuanMotDvt, laThuocTinhNcc, dungSqlUpsert, dungThongTinBan, kiemTraThanPut, laUrlAnhHopLe, xepDong,
  chuanHoaSuyTuTen, thuongHieuTuNcc, tenNcc, docIdAnh, kiemTraThanPutAnh, mimeAnhAnToan, dungAnh, gomAnhTheoMa, laDongPrHuy, dungMuaHang,
  GIA_BAN_TOI_DA, SO_ANH_TOI_DA, SO_ANH_NOI_BO_TOI_DA, SO_CONG_TRINH_TOI_DA, SO_LAN_MUA_TOI_DA, type DongBanVatTu,
  kiemTraThanHangLoat, kiemTraThanPutYeuCau, dungYeuCau, docDongYeuCau, coTruongCongKhai, SO_MA_HANG_LOAT_TOI_DA,
} from '../src/routes/banVatTu.js';

// Chạy: npm test. Bán vật tư tồn kho — routes/banVatTu.ts. Chỉ hàm thuần, không đụng DB.

describe('kiểm tra thân PUT', () => {
  it('nhận đủ trường hợp lệ, bỏ khoảng trắng, chuỗi rỗng => null', () => {
    const r = kiemTraThanPut({
      giaBanVnd: 150000, anhUrls: [' https://a.vn/1.jpg ', 'http://b.vn/2.png'], trangThai: 'da_giu',
      lienHe: '  0901 234 567 ', ghiChu: '', laTruongLa: 1,
    });
    assert.deepEqual(r, {
      hopLe: true,
      thayDoi: { giaBanVnd: 150000, anhUrls: ['https://a.vn/1.jpg', 'http://b.vn/2.png'], trangThai: 'da_giu', lienHe: '0901 234 567', ghiChu: null },
    });
  });
  it('chỉ trường có gửi; null xoá giá', () => {
    assert.deepEqual(kiemTraThanPut({ giaBanVnd: null }), { hopLe: true, thayDoi: { giaBanVnd: null } });
    assert.deepEqual(kiemTraThanPut({ anhUrls: [] }), { hopLe: true, thayDoi: { anhUrls: [] } });
  });
  it('giá: 0 … 1e13, số hữu hạn', () => {
    assert.equal(kiemTraThanPut({ giaBanVnd: 0 }).hopLe, true);
    assert.equal(kiemTraThanPut({ giaBanVnd: GIA_BAN_TOI_DA }).hopLe, true);
    assert.equal(kiemTraThanPut({ giaBanVnd: GIA_BAN_TOI_DA + 1 }).hopLe, false);
    assert.equal(kiemTraThanPut({ giaBanVnd: -1 }).hopLe, false);
    assert.equal(kiemTraThanPut({ giaBanVnd: '1000' }).hopLe, false);
    assert.equal(kiemTraThanPut({ giaBanVnd: Number.NaN }).hopLe, false);
    assert.equal(kiemTraThanPut({ giaBanVnd: Infinity }).hopLe, false);
  });
  it('ảnh: tối đa 10, chỉ http(s), ≤ 1000 ký tự, bỏ trùng', () => {
    const muoi = Array.from({ length: SO_ANH_TOI_DA }, (_, i) => `https://x.vn/${i}.jpg`);
    assert.equal(kiemTraThanPut({ anhUrls: muoi }).hopLe, true);
    assert.equal(kiemTraThanPut({ anhUrls: [...muoi, 'https://x.vn/11.jpg'] }).hopLe, false);
    // trùng không tính 2 lần
    assert.deepEqual(kiemTraThanPut({ anhUrls: ['https://x.vn/a', 'https://x.vn/a'] }), { hopLe: true, thayDoi: { anhUrls: ['https://x.vn/a'] } });
    assert.equal(kiemTraThanPut({ anhUrls: ['javascript:alert(1)'] }).hopLe, false);
    assert.equal(kiemTraThanPut({ anhUrls: ['ftp://x.vn/a'] }).hopLe, false);
    assert.equal(kiemTraThanPut({ anhUrls: ['https://x.vn/' + 'a'.repeat(1000)] }).hopLe, false);
    assert.equal(kiemTraThanPut({ anhUrls: 'https://x.vn/a' }).hopLe, false);
    assert.equal(kiemTraThanPut({ anhUrls: [123] }).hopLe, false);
  });
  it('trạng thái trong tập', () => {
    for (const t of ['dang_ban', 'da_giu', 'da_ban', 'ngung_ban']) assert.equal(kiemTraThanPut({ trangThai: t }).hopLe, true);
    assert.equal(kiemTraThanPut({ trangThai: 'het_hang' }).hopLe, false);
    assert.equal(kiemTraThanPut({ trangThai: null }).hopLe, false);
  });
  it('chuỗi ≤ 2000 ký tự', () => {
    assert.equal(kiemTraThanPut({ ghiChu: 'a'.repeat(2000) }).hopLe, true);
    assert.equal(kiemTraThanPut({ ghiChu: 'a'.repeat(2001) }).hopLe, false);
    assert.equal(kiemTraThanPut({ lienHe: 12 }).hopLe, false);
  });
  it('thân rỗng / sai kiểu => lỗi', () => {
    assert.equal(kiemTraThanPut({}).hopLe, false);
    assert.equal(kiemTraThanPut(null).hopLe, false);
    assert.equal(kiemTraThanPut([]).hopLe, false);
    assert.equal(kiemTraThanPut('x').hopLe, false);
  });
});

describe('URL ảnh, mã vật tư', () => {
  it('laUrlAnhHopLe', () => {
    assert.equal(laUrlAnhHopLe('https://drive.google.com/file/d/abc/view'), true);
    assert.equal(laUrlAnhHopLe('https://a.vn/có dấu cách.jpg'), false);
    assert.equal(laUrlAnhHopLe(''), false);
    assert.equal(laUrlAnhHopLe('a.vn/x.jpg'), false);
  });
  it('docMaVatTu giữ nguyên chuỗi (không zfill), bỏ khoảng trắng 2 đầu', () => {
    assert.equal(docMaVatTu('80000012345'), '80000012345');
    assert.equal(docMaVatTu('0040001234'), '0040001234');
    assert.equal(docMaVatTu(' 4000123 '), '4000123');
    assert.equal(docMaVatTu(''), null);
    assert.equal(docMaVatTu('   '), null);
    assert.equal(docMaVatTu('x'.repeat(101)), null);
    assert.equal(docMaVatTu(undefined), null);
  });
});

describe('SQL upsert', () => {
  it('chỉ cột có gửi, ép kiểu, tham số theo thứ tự', () => {
    const { sql, thamSo } = dungSqlUpsert('4000123', 'tien', { anhUrls: ['https://a.vn/1'], ghiChu: null });
    assert.deepEqual(thamSo, ['4000123', 'tien', ['https://a.vn/1'], null]);
    assert.match(sql, /INSERT INTO ban_vt_thong_tin \(ma_vat_tu, anh_urls, ghi_chu, updated_by, updated_at\)/);
    assert.match(sql, /SELECT \$1::text, \$3::text\[\], \$4::text, \$2::text, now\(\)/);
    assert.match(sql, /WHERE EXISTS \(SELECT 1 FROM ban_vt_ton WHERE ma_vat_tu = \$1::text\)/);
    assert.match(sql, /DO UPDATE SET anh_urls = EXCLUDED.anh_urls, ghi_chu = EXCLUDED.ghi_chu, updated_by = EXCLUDED.updated_by/);
    assert.doesNotMatch(sql, /gia_ban_vnd =|trang_thai =|lien_he =/);
  });
  it('giá ép numeric', () => {
    const { sql, thamSo } = dungSqlUpsert('1', null, { giaBanVnd: 5000, trangThai: 'da_ban' });
    assert.deepEqual(thamSo, ['1', null, 5000, 'da_ban']);
    assert.match(sql, /\$3::numeric, \$4::text/);
  });
});

describe('dựng dòng', () => {
  const dongGoc = {
    ma: '4000123', ten: 'Vải bọc', dvt: 'M', so_luong: '20', gia_tri: '3.5', kho: 'K01', ngay_nhap: '2024-09-30',
    cham: true, ten_cong_trinh: 'DÙNG CHUNG', ma_cong_trinh: null,
    m_ma: '4000123', m_ten: 'Vải bọc master', m_dvt: 'M', m_nhom_sap: 'KVT01', m_ten_nhom_sap: 'Vải', m_loai: 'ZRAW',
    m_gia_binh_quan: '175000', m_chung_loai: 'Vải', m_chat_lieu: null, m_quy_cach: '1.4M', m_mau: 'Xám', m_thuong_hieu: null,
    m_xuat_xu: 'VN', m_thuoc_tinh: { 'MP01 Chủng loại': 'Vải', 'MP05 Khổ': 1.4, 'MP09 Trống': '  ', 'MP10': null },
    ban_gia: '250000', ban_anh: ['https://a.vn/1.jpg'], ban_trang_thai: 'da_giu', ban_lien_he: 'Anh A', ban_ghi_chu: null,
    ban_updated_by: 'tien', ban_updated_at: '2026-11-14T03:00:00Z',
  };
  it('có quyền giá: giá trị, đơn giá vốn = giá trị * 1e6 / số lượng', () => {
    const d = dungDong(dongGoc, true);
    assert.equal(d.ma, '4000123');
    assert.equal(d.soLuong, 20);
    assert.equal(d.giaTri, 3.5);
    assert.equal(d.donGiaVon, 175000);
    assert.equal(d.master?.giaBinhQuan, 175000);
    assert.deepEqual(d.master?.thuocTinh, { 'MP01 Chủng loại': 'Vải', 'MP05 Khổ': '1.4' });
    assert.deepEqual(d.ban, {
      giaBanVnd: 250000, anhUrls: ['https://a.vn/1.jpg'], trangThai: 'da_giu', lienHe: 'Anh A', ghiChu: null,
      updatedBy: 'tien', updatedAt: '2026-11-14T03:00:00Z', dangCongKhai: false, tenHienThi: null, moTaCongKhai: null,
    });
    assert.equal(d.chamLuanChuyen, true);
    assert.equal(d.ngayNhap, '2024-09-30');
  });
  it('không quyền giá: bỏ giá trị, đơn giá, giá bình quân', () => {
    const d = dungDong(dongGoc, false);
    assert.equal(d.giaTri, null);
    assert.equal(d.donGiaVon, null);
    assert.equal(d.master?.giaBinhQuan, null);
    // giá bán vẫn trả (giá chào cho người mua)
    assert.equal(d.ban.giaBanVnd, 250000);
  });
  it('số lượng ≤ 0 => không có đơn giá vốn', () => {
    assert.equal(dungDong({ ...dongGoc, so_luong: 0 }, true).donGiaVon, null);
    assert.equal(dungDong({ ...dongGoc, so_luong: null }, true).donGiaVon, null);
  });
  it('không master, chưa có thông tin bán => mặc định', () => {
    const d = dungDong({ ma: '80000012345', ten: null, dvt: null, so_luong: 1, gia_tri: 0, m_ma: null, m_dvt: 'PC' }, true);
    assert.equal(d.master, null);
    assert.equal(d.ten, '80000012345');
    assert.equal(d.dvt, null);
    assert.equal(d.giaTri, 0);
    assert.deepEqual(d.ban, {
      giaBanVnd: null, anhUrls: [], trangThai: 'dang_ban', lienHe: null, ghiChu: null, updatedBy: null, updatedAt: null,
      dangCongKhai: false, tenHienThi: null, moTaCongKhai: null,
    });
  });
  it('tên / ĐVT trống thì lấy master', () => {
    const d = dungDong({ ...dongGoc, ten: '  ', dvt: null }, true);
    assert.equal(d.ten, 'Vải bọc master');
    assert.equal(d.dvt, 'M');
  });
  it('thông tin bán: trạng thái lạ => đang bán; ảnh không phải mảng => []', () => {
    const b = dungThongTinBan({ ban_trang_thai: 'xyz', ban_anh: null });
    assert.equal(b.trangThai, 'dang_ban');
    assert.deepEqual(b.anhUrls, []);
  });
  it('thuộc tính JSONB dạng chuỗi / sai kiểu', () => {
    assert.deepEqual(chuanHoaThuocTinh('{"MP02 Màu":"Đỏ"}'), { 'MP02 Màu': 'Đỏ' });
    assert.deepEqual(chuanHoaThuocTinh('không phải json'), {});
    assert.deepEqual(chuanHoaThuocTinh([1, 2]), {});
    assert.deepEqual(chuanHoaThuocTinh(null), {});
  });
});

describe('giá bình quân theo price_unit + thuộc tính nhà cung cấp', () => {
  const dongGo = {
    ma: '1030001', ten: 'Gỗ sồi', dvt: 'CD3', so_luong: '500', gia_tri: '11.3', m_ma: '1030001',
    m_gia_binh_quan: '22554723', m_price_unit: '1000',
    m_thuoc_tinh: { 'MP01 CHỦNG LOẠI': 'GỖ', 'MP37 NHÀ CUNG CẤP': 'HGS', 'MP18 MÃ SẢN PHẨM NCC': 'X-01' },
  };
  it('giaBinhQuan = gia_binh_quan / price_unit (đồng / 1 đvt)', () => {
    assert.equal(dungDong(dongGo, true).master?.giaBinhQuan, 22554.723);
    assert.equal(giaBinhQuanMotDvt('175000', '1'), 175000);
    assert.equal(giaBinhQuanMotDvt('175000', null), 175000);
    assert.equal(giaBinhQuanMotDvt('175000', 0), 175000);
    assert.equal(giaBinhQuanMotDvt(null, 1000), null);
  });
  it('có quyền giá: giữ MP37 / MP18', () => {
    assert.deepEqual(dungDong(dongGo, true).master?.thuocTinh,
      { 'MP01 CHỦNG LOẠI': 'GỖ', 'MP37 NHÀ CUNG CẤP': 'HGS', 'MP18 MÃ SẢN PHẨM NCC': 'X-01' });
  });
  it('không quyền giá: bỏ thuộc tính nhà cung cấp, giữ thuộc tính khác', () => {
    assert.deepEqual(dungDong(dongGo, false).master?.thuocTinh, { 'MP01 CHỦNG LOẠI': 'GỖ' });
    assert.equal(laThuocTinhNcc('MP37 NHÀ CUNG CẤP'), true);
    assert.equal(laThuocTinhNcc('MP18 MÃ SẢN PHẨM NCC'), true);
    assert.equal(laThuocTinhNcc('MP01 CHỦNG LOẠI'), false);
  });
});

describe('xếp dòng', () => {
  const tao = (ma: string, kho: string | null, giaTri: number | null) => ({ ma, kho, giaTri }) as DongBanVatTu;
  it('có giá: giá trị giảm dần, rồi mã, kho', () => {
    const ds = xepDong([tao('B', 'K1', 1), tao('A', 'K2', 5), tao('A', 'K1', 5), tao('C', null, 9)], true);
    assert.deepEqual(ds.map(d => `${d.ma}|${d.kho}`), ['C|null', 'A|K1', 'A|K2', 'B|K1']);
  });
  it('không giá: theo mã, kho', () => {
    const ds = xepDong([tao('B', 'K1', null), tao('A', 'K2', null), tao('A', 'K1', null)], false);
    assert.deepEqual(ds.map(d => `${d.ma}|${d.kho}`), ['A|K1', 'A|K2', 'B|K1']);
  });
});

describe('bổ sung 15/11: suy từ tên, thương hiệu theo NCC', () => {
  it('suy_tu_ten: snake_case => camelCase, bỏ khoá lạ / rỗng / object', () => {
    assert.deepEqual(chuanHoaSuyTuTen({
      chung_loai: 'CHẶN CỬA', quy_cach: '78 mm', mau: ' ', ma_mau: 905, thuong_hieu: 'HAFELE', chat_lieu: 'INOX', xuat_xu: 'VN', khac: { a: 1 },
    }), { chungLoai: 'CHẶN CỬA', quyCach: '78 mm', maMau: '905', thuongHieu: 'HAFELE', chatLieu: 'INOX' });
    assert.deepEqual(chuanHoaSuyTuTen('{"mau":"Xám"}'), { mau: 'Xám' });
    assert.deepEqual(chuanHoaSuyTuTen(null), {});
    assert.deepEqual(chuanHoaSuyTuTen(undefined), {});
  });
  it('NCC chính hãng => tên hãng (NCC thật trong vat_tu)', () => {
    assert.equal(thuongHieuTuNcc('10000040 - HAFELE VIỆT NAM'), 'HAFELE');
    assert.equal(thuongHieuTuNcc('10001326 - BLUM VIỆT NAM'), 'BLUM');
    assert.equal(thuongHieuTuNcc('10000085 - CP GỖ AN CƯỜNG'), 'AN CƯỜNG');
    assert.equal(thuongHieuTuNcc('10001024 - AN CƯỜNG'), 'AN CƯỜNG');
    assert.equal(thuongHieuTuNcc('10000488 - JOWAT VIỆT NAM'), 'JOWAT');
    assert.equal(thuongHieuTuNcc('10001048 - SHERWIN-WILLIAMS'), 'SHERWIN-WILLIAMS');
    assert.equal(thuongHieuTuNcc('20000136 - FORMICA (THAILAND)'), 'FORMICA');
    assert.equal(thuongHieuTuNcc('Häfele'), 'HAFELE');
    assert.equal(thuongHieuTuNcc('hettich vn'), 'HETTICH');
  });
  it('NCC thương mại / trống => null', () => {
    assert.equal(thuongHieuTuNcc('10001388 - LEPLUS VIỆT NAM'), null);
    assert.equal(thuongHieuTuNcc('10000096 - A.P VINA'), null);
    assert.equal(thuongHieuTuNcc('10004009 - GỖ MINH LONG'), null);
    assert.equal(thuongHieuTuNcc(''), null);
    assert.equal(thuongHieuTuNcc(null), null);
    // không bắt nhầm chữ nằm trong từ khác
    assert.equal(thuongHieuTuNcc('10000099 - BLUMEN TRADING'), null);
  });
  it('tên vật tư ghi hãng khác (Blum mua qua Häfele) => null; cùng hãng / không ghi hãng => giữ', () => {
    assert.equal(thuongHieuTuNcc('10000040 - HAFELE VIỆT NAM', 'BẢN LỀ BLUM CLIP TOP 71B3550'), null);
    assert.equal(thuongHieuTuNcc('10000040 - HAFELE VIỆT NAM', 'CHẶN CỬA HAFELE 937.12.100'), 'HAFELE');
    assert.equal(thuongHieuTuNcc('10000040 - HAFELE VIỆT NAM', 'CHẶN CỬA TƯỜNG INOX 78MM'), 'HAFELE');
  });
  it('dựng dòng: suyTuTen + thuongHieuNcc gắn vào master, ảnh vào item', () => {
    const anh = [{ id: 7, chacChan: true, trangThai: 'tu_dong' as const, congTrinh: 'CT26-041', codeVatLieu: null }];
    const d = dungDong({ ma: '100000354367', ten: 'CHẶN CỬA TƯỜNG INOX 78MM 937.12.100', so_luong: 3, m_ma: '100000354367' }, false,
      { suyTuTen: { chung_loai: 'CHẶN CỬA', thuong_hieu: 'HAFELE' }, nccGanNhat: '10000040 - HAFELE VIỆT NAM', anh });
    assert.deepEqual(d.master?.suyTuTen, { chungLoai: 'CHẶN CỬA', thuongHieu: 'HAFELE' });
    assert.equal(d.master?.thuongHieuNcc, 'HAFELE');
    assert.deepEqual(d.anh, anh);
    // thiếu dữ liệu bổ sung (chưa chạy SQL) => như cũ
    const d2 = dungDong({ ma: '1', so_luong: 1, m_ma: '1' }, true);
    assert.deepEqual(d2.master?.suyTuTen, {});
    assert.equal(d2.master?.thuongHieuNcc, null);
    assert.equal(d2.master?.nguon, null);
    assert.deepEqual(d2.anh, []);
    // dòng master loader tạo cho mã chưa có MASTER DATA => giao diện biết để ghi rõ
    const d3 = dungDong({ ma: '2', so_luong: 1, m_ma: '2', m_nguon: 'SUY_TEN' }, true);
    assert.equal(d3.master?.nguon, 'SUY_TEN');
  });
  it('tenNcc bỏ mã NCC đầu chuỗi', () => {
    assert.equal(tenNcc('10001388 - LEPLUS VIỆT NAM'), 'LEPLUS VIỆT NAM');
    assert.equal(tenNcc('HD GLASS'), 'HD GLASS');
    assert.equal(tenNcc('  '), null);
    assert.equal(tenNcc(null), null);
  });
});

describe('bổ sung 15/11: ảnh nội bộ', () => {
  it('id ảnh: số nguyên dương', () => {
    assert.equal(docIdAnh('12'), 12);
    for (const x of ['0', '-1', '1.5', 'abc', '', '1e3', '1234567890123456', undefined]) assert.equal(docIdAnh(x), null, String(x));
  });
  it('thân PUT ảnh', () => {
    for (const t of ['da_duyet', 'an', 'tu_dong']) assert.deepEqual(kiemTraThanPutAnh({ trangThai: t }), { hopLe: true, trangThai: t });
    assert.equal(kiemTraThanPutAnh({ trangThai: 'xoa' }).hopLe, false);
    assert.equal(kiemTraThanPutAnh({}).hopLe, false);
    assert.equal(kiemTraThanPutAnh(null).hopLe, false);
    assert.equal(kiemTraThanPutAnh([]).hopLe, false);
  });
  it('mime: chỉ ảnh raster, SVG / lạ => image/jpeg', () => {
    assert.equal(mimeAnhAnToan('image/png'), 'image/png');
    assert.equal(mimeAnhAnToan(' IMAGE/WEBP '), 'image/webp');
    assert.equal(mimeAnhAnToan('image/svg+xml'), 'image/jpeg');
    assert.equal(mimeAnhAnToan('text/html'), 'image/jpeg');
    assert.equal(mimeAnhAnToan(null), 'image/jpeg');
  });
  it('dungAnh bỏ ảnh đã ẩn / id sai', () => {
    assert.deepEqual(dungAnh({ id: '5', chac_chan: false, trang_thai: 'tu_dong', cong_trinh: ' CT26-124 ', code_vat_lieu: 'ST-102' }),
      { id: 5, chacChan: false, trangThai: 'tu_dong', congTrinh: 'CT26-124', codeVatLieu: 'ST-102', congKhai: false });
    assert.equal(dungAnh({ id: 6, chac_chan: true, trang_thai: 'da_duyet', cong_khai: true })?.congKhai, true);
    assert.equal(dungAnh({ id: 5, chac_chan: true, trang_thai: 'an' }), null);
    assert.equal(dungAnh({ id: 'x', chac_chan: true, trang_thai: 'tu_dong' }), null);
  });
  it('gom theo mã: đã duyệt, chắc chắn, mới nhất; cùng lần nạp theo id; tối đa SO_ANH_NOI_BO_TOI_DA', () => {
    const rows = [
      { id: 1, ma_vat_tu: 'A', chac_chan: false, trang_thai: 'tu_dong', tao_luc: '2026-11-15T01:00:00.000000Z' },
      { id: 2, ma_vat_tu: 'A', chac_chan: true, trang_thai: 'tu_dong', tao_luc: '2026-11-15T01:00:00.000000Z' },
      { id: 3, ma_vat_tu: 'A', chac_chan: false, trang_thai: 'da_duyet', tao_luc: '2026-11-15T01:00:00.000000Z' },
      { id: 4, ma_vat_tu: 'A', chac_chan: true, trang_thai: 'tu_dong', tao_luc: '2026-11-16T01:00:00.000000Z' },
      { id: 5, ma_vat_tu: 'A', chac_chan: true, trang_thai: 'an', tao_luc: '2026-11-16T01:00:00.000000Z' },
      { id: 6, ma_vat_tu: 'B', chac_chan: true, trang_thai: 'tu_dong', tao_luc: null },
    ];
    const g = gomAnhTheoMa(rows);
    assert.deepEqual(g.get('A')?.map(a => a.id), [3, 4, 2, 1]);
    assert.deepEqual(g.get('B')?.map(a => a.id), [6]);
    const nhieu = Array.from({ length: SO_ANH_NOI_BO_TOI_DA + 3 }, (_, i) => ({ id: i + 1, ma_vat_tu: 'C', chac_chan: true, trang_thai: 'tu_dong' }));
    assert.equal(gomAnhTheoMa(nhieu).get('C')?.length, SO_ANH_NOI_BO_TOI_DA);
  });
});

describe('bổ sung 15/11: lý lịch mua', () => {
  // Dòng thật (rút gọn) của 100000009017 ĐÁ MINT GREEN, đã xếp mới nhất trước như SQL
  const dongDa = [
    { so_pr: '1400017445', ngay_pr: '2026-11-04', trackingno: 'CT26-083', ten_cong_trinh: 'MARRIOTT S4 APEC_ĐẠI TRÀ_CT26-083', so_luong: 695.52, dvt: 'M2', don_gia: 0, nha_cung_cap: null, nhom_vt: '111 - Đá', code_vat_lieu: 'ST-102', ten_vat_tu: 'ĐÁ MINT GREEN', trang_thai: '1.CHƯA MUA' },
    { so_pr: '1400017410', ngay_pr: '2026-11-03', trackingno: 'CT26-124', ten_cong_trinh: 'CT26-124 …', so_luong: 471.96, dvt: 'M2', don_gia: 0, nha_cung_cap: null, nhom_vt: '111 - Đá', code_vat_lieu: null, ten_vat_tu: 'ĐÁ MINT GREEN', trang_thai: '4.HỦY' },
    { so_pr: '1400016476', ngay_pr: '2026-10-03', trackingno: 'CT26-104', ten_cong_trinh: 'S4 APEC H1 …', so_luong: 6.86, dvt: 'M2', don_gia: 0, nha_cung_cap: null, nhom_vt: '111 - Đá', code_vat_lieu: 'ST-102', ten_vat_tu: 'ĐÁ MINT GREEN', trang_thai: '1.CHƯA MUA' },
    { so_pr: '1400015652', ngay_pr: '2026-09-09', trackingno: 'CT26-083', ten_cong_trinh: 'MARRIOTT …', so_luong: 500, dvt: 'M2', don_gia: 3380000, nha_cung_cap: '20000316 - XIAMEN ORIENTAL RESOURCE', nhom_vt: '111 - Đá', code_vat_lieu: 'ST-102', ten_vat_tu: 'ĐÁ MINT GREEN', trang_thai: '2.ĐANG MUA' },
    { so_pr: '1400011335', ngay_pr: '2026-03-30', trackingno: 'CT26-006', ten_cong_trinh: 'MUR …', so_luong: 8.82, dvt: 'M2', don_gia: 4966000, nha_cung_cap: '20000121 - XIAMEN ALPS STONE CO LTD', nhom_vt: '111 - Đá', code_vat_lieu: 'ST-102', ten_vat_tu: 'ĐÁ MINT GREEN', trang_thai: '3.ĐÃ NHẬP KHO' },
  ];
  it('có quyền giá: đơn giá = dòng gần nhất CÓ giá (bỏ dòng giá 0), bỏ PR huỷ', () => {
    const m = dungMuaHang(dongDa, true, 'ĐÁ MINT GREEN');
    assert.equal(m.soDongPr, 4);
    assert.equal(m.ngayPrCuoi, '2026-11-04');
    assert.deepEqual(m.congTrinh, ['CT26-083', 'CT26-104', 'CT26-006']);
    assert.deepEqual(m.codeVatLieu, ['ST-102']);
    assert.equal(m.nhomVt, '111 - Đá');
    assert.equal(m.tenPr, null);
    assert.deepEqual(m.nhaCungCap, ['XIAMEN ORIENTAL RESOURCE', 'XIAMEN ALPS STONE CO LTD']);
    assert.deepEqual(m.donGiaGanNhat, { gia: 3380000, dvt: 'M2', ngay: '2026-09-09' });
    assert.equal(m.lanMua.length, 4);
    assert.deepEqual(m.lanMua[0], { ngayPr: '2026-11-04', soPr: '1400017445', congTrinh: 'CT26-083', soLuong: 695.52, dvt: 'M2', donGia: null, ncc: null });
    assert.deepEqual(m.lanMua[2], { ngayPr: '2026-09-09', soPr: '1400015652', congTrinh: 'CT26-083', soLuong: 500, dvt: 'M2', donGia: 3380000, ncc: 'XIAMEN ORIENTAL RESOURCE' });
  });
  it('không quyền giá: không NCC, không đơn giá', () => {
    const m = dungMuaHang(dongDa, false, 'ĐÁ MINT GREEN');
    assert.equal(m.nhaCungCap, null);
    assert.equal(m.donGiaGanNhat, null);
    assert.ok(m.lanMua.every(l => l.donGia === null && l.ncc === null));
    assert.equal(m.soDongPr, 4);
  });
  it('tên PR chỉ trả khi khác tên tồn (không phân biệt hoa thường / khoảng trắng)', () => {
    assert.equal(dungMuaHang(dongDa, false, 'đá  mint green').tenPr, null);
    assert.equal(dungMuaHang(dongDa, false, 'ĐÁ MINT GREEN 20MM').tenPr, 'ĐÁ MINT GREEN');
    assert.equal(dungMuaHang(dongDa, false, null).tenPr, 'ĐÁ MINT GREEN');
  });
  it('không có PR => rỗng; công trình / lần mua có giới hạn', () => {
    assert.deepEqual(dungMuaHang([], true, 'X'), {
      soDongPr: 0, ngayPrCuoi: null, congTrinh: [], codeVatLieu: [], nhomVt: null, tenPr: null, nhaCungCap: [], donGiaGanNhat: null, lanMua: [],
    });
    const nhieu = Array.from({ length: 30 }, (_, i) => ({ trackingno: `CT26-${String(i).padStart(3, '0')}`, ngay_pr: '2026-01-01', trang_thai: '3.ĐÃ NHẬP KHO' }));
    const m = dungMuaHang(nhieu, true, null);
    assert.equal(m.congTrinh.length, SO_CONG_TRINH_TOI_DA);
    assert.equal(m.lanMua.length, SO_LAN_MUA_TOI_DA);
    // trackingno trống => tên công trình
    assert.deepEqual(dungMuaHang([{ trackingno: ' ', ten_cong_trinh: 'KHO CHUNG' }], true, null).congTrinh, ['KHO CHUNG']);
  });
  it('PR huỷ', () => {
    assert.equal(laDongPrHuy('4.HỦY'), true);
    assert.equal(laDongPrHuy('hủy'), true);
    assert.equal(laDongPrHuy('3.ĐÃ NHẬP KHO'), false);
    assert.equal(laDongPrHuy('2.ĐANG MUA'), false);
    assert.equal(laDongPrHuy(null), false);
  });
});

describe('trang khách 15/11: phần admin', () => {
  it('PUT nhận dangCongKhai / tenHienThi (≤ 200) / moTaCongKhai (≤ 2000)', () => {
    assert.deepEqual(kiemTraThanPut({ dangCongKhai: true, tenHienThi: '  Vải bọc xám ', moTaCongKhai: '' }), {
      hopLe: true, thayDoi: { dangCongKhai: true, tenHienThi: 'Vải bọc xám', moTaCongKhai: null },
    });
    assert.equal(kiemTraThanPut({ dangCongKhai: 'true' }).hopLe, false);
    assert.equal(kiemTraThanPut({ dangCongKhai: null }).hopLe, false);
    assert.equal(kiemTraThanPut({ tenHienThi: 'a'.repeat(200) }).hopLe, true);
    assert.equal(kiemTraThanPut({ tenHienThi: 'a'.repeat(201) }).hopLe, false);
    assert.equal(kiemTraThanPut({ moTaCongKhai: 'a'.repeat(2001) }).hopLe, false);
    assert.equal(coTruongCongKhai({ giaBanVnd: 1 }), false);
    assert.equal(coTruongCongKhai({ tenHienThi: null }), true);
  });
  it('SQL upsert: bật đăng ghi mốc đăng (dòng mới now() khi bật; dòng cũ chỉ khi đổi từ tắt sang bật)', () => {
    const { sql, thamSo } = dungSqlUpsert('1', 'tien', { trangThai: 'dang_ban', dangCongKhai: true });
    assert.deepEqual(thamSo, ['1', 'tien', 'dang_ban', true]);
    assert.match(sql, /\(ma_vat_tu, trang_thai, dang_cong_khai, dang_cong_khai_luc, updated_by, updated_at\)/);
    assert.match(sql, /\$4::boolean, CASE WHEN \$4::boolean THEN now\(\) END, \$2::text, now\(\)/);
    assert.match(sql, /dang_cong_khai_luc = CASE WHEN EXCLUDED.dang_cong_khai AND NOT ban_vt_thong_tin.dang_cong_khai THEN now\(\)/);
    assert.match(sql, /ban_dang_cong_khai/);
    // Không gửi dangCongKhai => không đụng mốc đăng
    assert.doesNotMatch(dungSqlUpsert('1', null, { giaBanVnd: 1 }).sql, /dang_cong_khai_luc/);
  });
  it('SQL upsert: DB chưa có cột trang khách => RETURNING bỏ cột mới (chỉ khi thay đổi không đụng cột đó)', () => {
    assert.doesNotMatch(dungSqlUpsert('1', null, { giaBanVnd: 1 }, false).sql, /dang_cong_khai|ten_hien_thi/);
    assert.match(dungSqlUpsert('1', null, { tenHienThi: 'x' }, false).sql, /AS ban_ten_hien_thi/);
  });
  it('thông tin bán đọc cột trang khách', () => {
    const b = dungThongTinBan({ ban_dang_cong_khai: true, ban_ten_hien_thi: 'Tên khách', ban_mo_ta_cong_khai: 'Mô tả' });
    assert.equal(b.dangCongKhai, true);
    assert.equal(b.tenHienThi, 'Tên khách');
    assert.equal(b.moTaCongKhai, 'Mô tả');
    assert.equal(dungThongTinBan({ ban_dang_cong_khai: 't' }).dangCongKhai, false);
  });
  it('PUT ảnh: trangThai và / hoặc congKhai', () => {
    assert.deepEqual(kiemTraThanPutAnh({ congKhai: true }), { hopLe: true, congKhai: true });
    assert.deepEqual(kiemTraThanPutAnh({ trangThai: 'da_duyet', congKhai: false }), { hopLe: true, trangThai: 'da_duyet', congKhai: false });
    assert.equal(kiemTraThanPutAnh({ congKhai: 1 }).hopLe, false);
    assert.equal(kiemTraThanPutAnh({ trangThai: 'xoa', congKhai: true }).hopLe, false);
  });
  it('đăng hàng loạt: 1…6000 mã, bỏ trùng, bat boolean', () => {
    assert.deepEqual(kiemTraThanHangLoat({ mas: ['1', ' 1 ', '0040001234'], bat: true }), { hopLe: true, mas: ['1', '0040001234'], bat: true });
    assert.equal(kiemTraThanHangLoat({ mas: [], bat: true }).hopLe, false);
    assert.equal(kiemTraThanHangLoat({ mas: ['1'] }).hopLe, false);
    assert.equal(kiemTraThanHangLoat({ mas: ['1'], bat: 'false' }).hopLe, false);
    assert.equal(kiemTraThanHangLoat({ mas: [''], bat: false }).hopLe, false);
    assert.equal(kiemTraThanHangLoat({ mas: [123], bat: false }).hopLe, false);
    assert.equal(kiemTraThanHangLoat({ mas: Array.from({ length: SO_MA_HANG_LOAT_TOI_DA }, (_, i) => String(i + 1)), bat: true }).hopLe, true);
    assert.equal(kiemTraThanHangLoat({ mas: Array.from({ length: SO_MA_HANG_LOAT_TOI_DA + 1 }, (_, i) => String(i + 1)), bat: true }).hopLe, false);
    assert.equal(kiemTraThanHangLoat(null).hopLe, false);
  });
  it('PUT yêu cầu: trạng thái trong tập, ghi chú nội bộ ≤ 2000', () => {
    assert.deepEqual(kiemTraThanPutYeuCau({ trangThai: 'dang_xu_ly', ghiChuNoiBo: ' đã gọi ' }), { hopLe: true, trangThai: 'dang_xu_ly', ghiChuNoiBo: 'đã gọi' });
    assert.deepEqual(kiemTraThanPutYeuCau({ ghiChuNoiBo: '' }), { hopLe: true, ghiChuNoiBo: null });
    assert.equal(kiemTraThanPutYeuCau({ trangThai: 'xong' }).hopLe, false);
    assert.equal(kiemTraThanPutYeuCau({ ghiChuNoiBo: 'a'.repeat(2001) }).hopLe, false);
    assert.equal(kiemTraThanPutYeuCau({}).hopLe, false);
  });
  it('dựng yêu cầu: không trả ip_hash / user_agent; items JSONB chuỗi / sai dạng', () => {
    const y = dungYeuCau({
      id: '7', ma_yeu_cau: 'YC-20261115-AB12', items: '[{"ma":"1","ten":"Vải","soLuong":2,"dvt":"m"},{"x":1}]', ten_khach: 'An', sdt: '0901234567',
      email: null, cong_ty: null, ghi_chu: null, trang_thai: 'moi', ghi_chu_noi_bo: null, xu_ly_boi: null, xu_ly_luc: null,
      created_at: '2026-11-15T01:00:00Z', ip_hash: 'abc', user_agent: 'UA',
    });
    assert.equal(y.id, 7);
    assert.deepEqual(y.items, [{ ma: '1', ten: 'Vải', soLuong: 2, dvt: 'm' }]);
    assert.ok(!('ipHash' in y) && !('userAgent' in y) && !('ip_hash' in y));
    assert.equal(dungYeuCau({ trang_thai: 'la' }).trangThai, 'moi');
    assert.deepEqual(docDongYeuCau('không phải json'), []);
    assert.deepEqual(docDongYeuCau(null), []);
  });
});
