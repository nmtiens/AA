import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dungItemCongKhai, gopDanhSachCongKhai, loaiTuKho, tenDvt, chuanHoaSdt, vanBanThuan, laEmailHopLe, kiemTraThanYeuCau, ghepYeuCau,
  taoMaYeuCau, bamIp, ipKhach, khoaIp, cheCongTrinh, cumCongTrinh, dungThuocTinhDayDu, tenNhomVatTu, suaQuyCachDayRong, NHAN_MP_CONG_KHAI, kieuThongBao, THONG_BAO_MOI_GIO_TOI_DA, KHOA_ITEM_CONG_KHAI, DS_LOAI_CHINH, LOAI_KHAC, SO_DONG_YEU_CAU_TOI_DA, type ItemCongKhai,
} from '../src/routes/banVatTuCongKhai.js';
import { PUBLIC_API_PREFIXES } from '../src/server/app.js';

// Chạy: npm test. Trang người mua công khai — routes/banVatTuCongKhai.ts. Chỉ hàm thuần, không đụng DB.

// Dòng DB "đầy đủ" — cố tình kèm mọi cột nhạy cảm để chắc chắn item công khai KHÔNG mang theo
const dongTon = (them: Record<string, unknown> = {}): Record<string, unknown> => ({
  ma: '400012345678', ten: 'VẢI BỌC SOFA XÁM', dvt: 'M', so_luong: '20.5', kho: 'KVT vải,da,SF',
  gia_tri: '12.5', don_gia_von: 600000, gia_binh_quan: '580000', m_gia_binh_quan: '580000', m_price_unit: 1,
  nha_cung_cap: '10000040 - HAFELE VIỆT NAM', ncc: 'HAFELE', m_thuoc_tinh: { 'MP37 NHÀ CUNG CẤP': 'HAFELE', 'MP18 MÃ SẢN PHẨM NCC': 'X1' },
  ten_cong_trinh: 'CT26-041 VILLA', ma_cong_trinh: 'CT26-041', ngay_nhap: '2025-01-02', ngay_nhap_kho_gan_nhat: '2025-01-02', cham: true,
  ghi_chu: 'ghi chú nội bộ', lien_he: 'Anh A 0901', updated_by: 'tien', nguon_file: 'G:/BC ton kho.xlsx', hex: 'ABC123',
  ngay_chot: '2026-11-12',
  ten_hien_thi: null, mo_ta_cong_khai: 'Hàng mới 95%', gia_ban_vnd: '250000', anh_urls: ['https://a.vn/1.jpg', 'javascript:alert(1)', 'https://a.vn/1.jpg'],
  dang_luc: '2026-11-15',
  m_ten: 'Vải master', m_dvt: 'M', m_chung_loai: 'Vải', m_chat_lieu: null, m_quy_cach: '1.4M', m_mau: 'Xám',
  m_thuong_hieu: null, m_xuat_xu: 'VN', m_nhom_sap: 'KVT01', m_ten_nhom_sap: 'Vải', m_nguon: 'MASTER',
  ...them,
});

const MP_CAM = ['MP00', 'MP18', 'MP36', 'MP37', 'MP38', 'MP39', 'MP99'];

const TRUONG_CAM = [
  'giaTri', 'gia_tri', 'donGiaVon', 'don_gia_von', 'giaBinhQuan', 'gia_binh_quan', 'nhaCungCap', 'nha_cung_cap', 'ncc', 'thuongHieuNcc',
  'tenCongTrinh', 'ten_cong_trinh', 'maCongTrinh', 'ma_cong_trinh', 'kho', 'ngayNhap', 'ngay_nhap', 'chamLuanChuyen', 'cham',
  'ghiChu', 'ghi_chu', 'lienHe', 'lien_he', 'updatedBy', 'updated_by', 'updatedAt', 'nguonFile', 'nguon_file', 'hex', 'master',
  'ban', 'trangThai', 'thuocTinhMp', 'muaHang', 'lanMua', 'congTrinh', 'codeVatLieu', 'chacChan', 'nguon',
];

/** Duyệt đệ quy mọi khoá trong object */
const moiKhoa = (o: unknown, kq: string[] = []): string[] => {
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) { kq.push(k); moiKhoa(v, kq); }
  }
  return kq;
};

describe('đăng ký đường công khai', () => {
  it('chỉ thêm đúng tiền tố /api/cong-khai/ vào danh sách không cần đăng nhập', () => {
    assert.ok(PUBLIC_API_PREFIXES.includes('/api/cong-khai/'));
    // Không mở rộng sang API khác
    assert.ok(!PUBLIC_API_PREFIXES.some(p => p === '/api/' || p === '/api/ban-vat-tu/' || '/api/ban-vat-tu/danh-sach'.startsWith(p)));
  });
});

describe('item công khai — KHÔNG có trường cấm', () => {
  it('chỉ đúng các khoá trong danh sách trắng', () => {
    const it = dungItemCongKhai([dongTon()], { suyTuTen: { ma_mau: 'G-01', thuong_hieu: 'SUY' }, anh: [3, 1] });
    assert.ok(it);
    assert.deepEqual(Object.keys(it).sort(), [...KHOA_ITEM_CONG_KHAI].sort());
    // thuocTinhDayDu: mỗi dòng đúng { nhan, giaTri } ('giaTri' ở đây là giá trị thuộc tính, không phải giá trị tồn)
    for (const d of it.thuocTinhDayDu) assert.deepEqual(Object.keys(d).sort(), ['giaTri', 'nhan']);
    const tatCa = moiKhoa({ ...it, thuocTinhDayDu: undefined });
    for (const k of TRUONG_CAM) assert.ok(!tatCa.includes(k), `lộ trường cấm ${k}`);
    // Không giá trị nhạy cảm nào lọt vào chuỗi JSON
    const json = JSON.stringify(it);
    for (const s of ['HAFELE', 'CT26-041', 'ghi chú nội bộ', 'Anh A', 'tien', 'BC ton kho', 'ABC123', '580000', '12.5', '2025-01-02', 'KVT vải']) {
      assert.ok(!json.includes(s), `lộ giá trị ${s}`);
    }
  });
  it('nội dung đúng: loại, tổng số lượng, đvt dễ đọc, giá bán, ảnh, thuộc tính master rồi suy từ tên', () => {
    const it = dungItemCongKhai([dongTon(), dongTon({ kho: 'KVT Gỗ', so_luong: 4.5 })], { suyTuTen: { ma_mau: 'G-01', mau: 'Đỏ', thuong_hieu: 'SUY' } }) as ItemCongKhai;
    assert.equal(it.ma, '400012345678');
    assert.equal(it.ten, 'VẢI BỌC SOFA XÁM');
    assert.equal(it.soLuong, 25);
    assert.equal(it.loai, 'KVT Vải Da Mouss'); // kho nhiều nhất
    assert.equal(it.dvt, 'm');
    assert.equal(it.giaBanVnd, 250000);
    assert.equal(it.moTa, 'Hàng mới 95%');
    assert.deepEqual(it.anhNgoai, ['https://a.vn/1.jpg']);
    assert.deepEqual(it.anh, []);
    assert.equal(it.dangLuc, '2026-11-15');
    // master có Màu 'Xám' => không lấy 'Đỏ' suy luận; mã màu / thương hiệu master trống => lấy suy luận (không gắn nhãn)
    assert.deepEqual(it.thuocTinh, { chungLoai: 'Vải', quyCach: '1.4M', mau: 'Xám', maMau: 'G-01', thuongHieu: 'SUY', xuatXu: 'VN' });
  });
  it('tên hiển thị admin đặt ưu tiên; tên tồn trống => tên master => chủng loại => "Vật tư <mã>"', () => {
    assert.equal(dungItemCongKhai([dongTon({ ten_hien_thi: '  Vải sofa cao cấp ' })])?.ten, 'Vải sofa cao cấp');
    assert.equal(dungItemCongKhai([dongTon({ ten: ' ' })])?.ten, 'Vải master');
    assert.equal(dungItemCongKhai([dongTon({ ten: null, m_ten: null })])?.ten, 'Vải');
    assert.equal(dungItemCongKhai([dongTon({ ten: null, m_ten: null, m_chung_loai: null })])?.ten, 'Vật tư 400012345678');
  });
  it('giá: chỉ > 0 mới hiện, còn lại null ("Liên hệ")', () => {
    for (const g of [null, '', 0, '0', -5, 'abc']) assert.equal(dungItemCongKhai([dongTon({ gia_ban_vnd: g })])?.giaBanVnd, null);
    assert.equal(dungItemCongKhai([dongTon({ gia_ban_vnd: 1 })])?.giaBanVnd, 1);
  });
  it('số lượng ≤ 0 => không chào bán', () => {
    assert.equal(dungItemCongKhai([dongTon({ so_luong: 0 })]), null);
    assert.equal(dungItemCongKhai([dongTon({ so_luong: -3 })]), null);
    assert.equal(dungItemCongKhai([]), null);
  });
  it('xuất xứ chỉ lấy master (không suy luận); thuộc tính rỗng bị bỏ khoá', () => {
    const it = dungItemCongKhai([dongTon({ m_xuat_xu: ' ', m_chung_loai: null, m_quy_cach: null, m_mau: null })], { suyTuTen: { xuat_xu: 'TQ' } }) as ItemCongKhai;
    assert.deepEqual(it.thuocTinh, {});
  });
  it('id ảnh sai bị bỏ; ảnh ngoài tối đa 10, chỉ http(s)', () => {
    const it = dungItemCongKhai([dongTon({ anh_urls: Array.from({ length: 15 }, (_, i) => `https://x.vn/${i}.jpg`).concat(['ftp://x.vn/a']) })], { anh: [5, -1, 1.5, 7] }) as ItemCongKhai;
    assert.deepEqual(it.anh, [5, 7]);
    assert.equal(it.anhNgoai.length, 10);
    assert.ok(it.anhNgoai.every(u => u.startsWith('https://')));
  });
  it('gộp danh sách theo mã, mới đăng trước rồi theo tên', () => {
    const ds = gopDanhSachCongKhai([
      dongTon({ ma: 'B', ten: 'Bê', dang_luc: '2026-11-10' }),
      dongTon({ ma: 'A', ten: 'Anh', dang_luc: '2026-11-10' }),
      dongTon({ ma: 'C', ten: 'Cờ', dang_luc: '2026-11-15' }),
      dongTon({ ma: 'A', ten: 'Anh', kho: 'KVT Gỗ', so_luong: 1 }),
      dongTon({ ma: 'D', ten: 'Đê', so_luong: 0 }),
    ], new Map(), new Map([['A', [9]]]));
    assert.deepEqual(ds.map(x => x.ma), ['C', 'A', 'B']);
    assert.equal(ds[1].soLuong, 21.5);
    assert.deepEqual(ds[1].anh, [9]);
  });
});

describe('loại / đơn vị tính', () => {
  it('10 kho SAP => 10 loại chính; kho lạ => Khác (không lộ tên kho)', () => {
    const sap = ['KVT vải,da,SF', 'KVT Gỗ', 'KVT Tấm – Ván', 'KVT Phụ kiện', 'KVT Đá', 'Kho VT Hóa chất', 'KVT GC ngoài',
      'KVT bao bì', 'Kho VT Kim loại', 'KVT CCDC'];
    assert.deepEqual(sap.map(loaiTuKho), [...DS_LOAI_CHINH]);
    assert.equal(loaiTuKho('Kho bí mật số 7'), LOAI_KHAC);
    assert.equal(loaiTuKho(null), LOAI_KHAC);
    assert.equal(loaiTuKho('KVT Gỗ'), 'KVT Gỗ');
  });
  it('đvt dễ đọc', () => {
    assert.equal(tenDvt('FT2'), 'ft²');
    assert.equal(tenDvt('PCS'), 'cái');
    assert.equal(tenDvt('XYZ'), 'xyz');
    assert.equal(tenDvt(' '), null);
  });
});

describe('yêu cầu báo giá', () => {
  const than = (them: Record<string, unknown> = {}) => ({
    items: [{ ma: '400012345678', soLuong: 2 }], ten: 'Nguyễn Văn A', sdt: '0901 234 567', ...them,
  });
  it('SĐT VN: bỏ khoảng trắng / chấm / gạch, +84 => 0, 9–12 chữ số', () => {
    assert.equal(chuanHoaSdt('0901 234 567'), '0901234567');
    assert.equal(chuanHoaSdt('0901.234.567'), '0901234567');
    assert.equal(chuanHoaSdt('+84 901 234 567'), '0901234567');
    assert.equal(chuanHoaSdt('(028) 3823-4567'), '02838234567');
    assert.equal(chuanHoaSdt('12345678'), null);
    assert.equal(chuanHoaSdt('1234567890123'), null);
    assert.equal(chuanHoaSdt('09012a4567'), null);
    assert.equal(chuanHoaSdt(901234567), null);
    assert.equal(chuanHoaSdt(''), null);
  });
  it('văn bản thuần: giữ < > (thông số khách ghi), bỏ ký tự điều khiển, gộp dấu cách', () => {
    assert.equal(vanBanThuan('Cần tấm dày <5mm, rộng >1m, giao Q.7'), 'Cần tấm dày <5mm, rộng >1m, giao Q.7');
    assert.equal(vanBanThuan('  a < b  '), 'a < b');
    assert.equal(vanBanThuan('a\u0000b\u0007c'), 'a b c');
    assert.equal(vanBanThuan('dòng 1\r\ndòng\t2\n\n\n\ndòng 3', true), 'dòng 1\ndòng 2\n\ndòng 3');
    assert.equal(vanBanThuan('a\nb'), 'a b');
  });
  it('email', () => {
    assert.equal(laEmailHopLe('a@b.vn'), true);
    assert.equal(laEmailHopLe('a@b'), false);
    assert.equal(laEmailHopLe('a b@c.vn'), false);
    assert.equal(laEmailHopLe('x'.repeat(196) + '@b.vn'), false);
  });
  it('hợp lệ: chuẩn hoá, gộp mã trùng, tuỳ chọn rỗng => null', () => {
    const r = kiemTraThanYeuCau(than({ items: [{ ma: ' 1 ', soLuong: 2 }, { ma: '1', soLuong: 0.5 }, { ma: '2', soLuong: 1 }], email: '', congTy: ' Cty <b>X</b> ', ghiChu: null, web: '' }));
    assert.deepEqual(r, {
      hopLe: true, laBot: false,
      than: { items: [{ ma: '1', soLuong: 2.5 }, { ma: '2', soLuong: 1 }], ten: 'Nguyễn Văn A', sdt: '0901234567', email: null, congTy: 'Cty <b>X</b>', ghiChu: null },
    });
  });
  it('honeypot có chữ => bot (route trả 201 giả cùng dạng, không lưu) — kể cả khi phần khác sai', () => {
    assert.deepEqual(kiemTraThanYeuCau(than({ web: 'http://spam' })), { hopLe: true, laBot: true });
    assert.deepEqual(kiemTraThanYeuCau({ web: 'x' }), { hopLe: true, laBot: true });
  });
  it('sai: items rỗng / quá 30 / số lượng ≤ 0 / không hữu hạn / chuỗi; tên; SĐT; email; độ dài', () => {
    const sai = (b: unknown) => assert.equal(kiemTraThanYeuCau(b).hopLe, false, JSON.stringify(b)?.slice(0, 80));
    sai(null); sai([]); sai('x');
    sai(than({ items: [] }));
    sai(than({ items: Array.from({ length: SO_DONG_YEU_CAU_TOI_DA + 1 }, (_, i) => ({ ma: String(i + 1), soLuong: 1 })) }));
    sai(than({ items: [{ ma: '1', soLuong: 0 }] }));
    sai(than({ items: [{ ma: '1', soLuong: -1 }] }));
    sai(than({ items: [{ ma: '1', soLuong: Infinity }] }));
    sai(than({ items: [{ ma: '1', soLuong: Number.NaN }] }));
    sai(than({ items: [{ ma: '1', soLuong: '2' }] }));
    sai(than({ items: [{ ma: '', soLuong: 1 }] }));
    sai(than({ items: [null] }));
    sai(than({ ten: 'A' }));
    sai(than({ ten: '  A \u0000 ' }));
    sai(than({ ten: 'a'.repeat(101) }));
    sai(than({ ten: undefined }));
    sai(than({ sdt: '123' }));
    sai(than({ sdt: undefined }));
    sai(than({ email: 'khong-phai-email' }));
    sai(than({ congTy: 'a'.repeat(201) }));
    sai(than({ ghiChu: 'a'.repeat(1001) }));
    sai(than({ ghiChu: 5 }));
    assert.equal(kiemTraThanYeuCau(than({ items: Array.from({ length: SO_DONG_YEU_CAU_TOI_DA }, (_, i) => ({ ma: String(i + 1), soLuong: 1 })) })).hopLe, true);
  });
  it('ghép với danh sách công khai: tên / đvt lấy từ DB, mã chưa đăng như không có, số lượng ≤ còn', () => {
    const it = dungItemCongKhai([dongTon({ ma: '1', ten: 'Vải DB', so_luong: 3, dvt: 'M2' })]) as ItemCongKhai;
    const theoMa = new Map([['1', it]]);
    assert.deepEqual(ghepYeuCau([{ ma: '1', soLuong: 3 }], theoMa), { hopLe: true, dong: [{ ma: '1', ten: 'Vải DB', soLuong: 3, dvt: 'm²' }] });
    const qua = ghepYeuCau([{ ma: '1', soLuong: 3.01 }], theoMa);
    assert.equal(qua.hopLe, false);
    const khong = ghepYeuCau([{ ma: '999', soLuong: 1 }], theoMa);
    assert.equal(khong.hopLe, false);
    if (!khong.hopLe) assert.match(khong.loi, /không còn chào bán/);
  });
  it('mã yêu cầu YC-YYYYMMDD-XXXX theo ngày VN', () => {
    // 2026-11-14T18:30Z = 01:30 ngày 15/11 giờ VN
    assert.equal(taoMaYeuCau(new Date('2026-11-14T18:30:00Z'), () => 0), 'YC-20261115-AAAA');
    assert.match(taoMaYeuCau(), /^YC-\d{8}-[A-HJ-NP-Z2-9]{4}$/);
  });
  it('IP: req.ip trước, rồi phần tử đầu x-forwarded-for; băm có bí mật, không lộ IP', () => {
    assert.equal(ipKhach({ ip: '1.2.3.4', headers: { 'x-forwarded-for': '9.9.9.9' } }), '1.2.3.4');
    assert.equal(ipKhach({ ip: undefined, headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' } }), '5.6.7.8');
    const h = bamIp('1.2.3.4', 'bi-mat');
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.notEqual(h, bamIp('1.2.3.4', 'khac'));
    assert.ok(!h.includes('1.2.3.4'));
  });
  it('IPv6 gộp dải /56: đổi địa chỉ trong dải không lách được; IPv4 giữ nguyên', () => {
    assert.equal(khoaIp('1.2.3.4'), '1.2.3.4');
    assert.equal(bamIp('2001:db8:abcd:1200::1', 'k'), bamIp('2001:db8:abcd:12ff:ffff::9', 'k'));
    assert.notEqual(bamIp('2001:db8:abcd:1200::1', 'k'), bamIp('2001:db8:abcd:1300::1', 'k'));
    assert.equal(khoaIp('::ffff:1.2.3.4'), '1.2.3.4');
    assert.equal(khoaIp('khong-ro'), 'khong-ro');
  });
  it('trần thông báo chung mỗi giờ: dưới trần báo từng cái, đúng trần báo gộp 1 lần, quá trần im', () => {
    assert.equal(kieuThongBao(0), 'tung_cai');
    assert.equal(kieuThongBao(THONG_BAO_MOI_GIO_TOI_DA - 1), 'tung_cai');
    assert.equal(kieuThongBao(THONG_BAO_MOI_GIO_TOI_DA), 'gop');
    assert.equal(kieuThongBao(THONG_BAO_MOI_GIO_TOI_DA + 1), 'khong');
  });
});

describe('che mã / tên công trình khỏi chữ ra trang khách', () => {
  it('mẫu (CT|PO)NN-NNN', () => {
    assert.equal(cheCongTrinh('BAN KHAM TRAI 40X40XH55CM CT24-017'), 'BAN KHAM TRAI 40X40XH55CM');
    assert.equal(cheCongTrinh('PO26-001_TEM VẢI'), 'TEM VẢI');
    assert.equal(cheCongTrinh('ỐC (ct 25 - 070) M6'), 'ỐC M6');
    // không cắt giữa từ / số
    assert.equal(cheCongTrinh('PICT24-0171 X'), 'PICT24-0171 X');
    assert.equal(cheCongTrinh('VẢI ÁO'), 'VẢI ÁO');
  });
  it('tên / mã công trình đang gán, đứng riêng, không phân biệt hoa thường', () => {
    const cum = cumCongTrinh(['ARTICLE', 'CARACOLE', 'BURROW', null]);
    assert.equal(cheCongTrinh('THẺ TREO_ARTICLE_A1_127X76', cum), 'THẺ TREO_A1_127X76');
    assert.equal(cheCongTrinh('TEM VẢI CARACOLE_NEW MATERIAL ONLY', cum), 'TEM VẢI NEW MATERIAL ONLY');
    assert.equal(cheCongTrinh('ĐINH NHỰA_BURROW-20.5x22MM', cum), 'ĐINH NHỰA_20.5x22MM');
    assert.equal(cheCongTrinh('tem article', cum), 'tem');
    assert.equal(cheCongTrinh('ARTICLES X', cum), 'ARTICLES X');
    assert.equal(cheCongTrinh('ARTICLE', cum), '');
  });
  it('cụm công trình: bỏ DÙNG CHUNG, giữ phần sau; bỏ ngoặc mô tả và cụm quá ngắn', () => {
    assert.deepEqual(cumCongTrinh(['DÙNG CHUNG', 'DUNG CHUNG (GỖ TRÒN XẺ SẤY)', 'AB', '']), []);
    assert.deepEqual(cumCongTrinh(['DÙNG CHUNG\nARHAUS']), ['ARHAUS']);
    assert.deepEqual(cumCongTrinh(['ARTICLE', 'ARTICLE A1']), ['ARTICLE A1', 'ARTICLE']);
  });
  it('item: tên + thuộc tính không mang mã / tên công trình; tên hiển thị admin đặt giữ nguyên', () => {
    const it0 = dungItemCongKhai(
      [dongTon({ ten: 'THẺ TREO_ARTICLE_A1 CT24-017', ten_cong_trinh: 'ARTICLE', ma_cong_trinh: 'CT24-017', m_mau: null })],
      { suyTuTen: { mau: 'CARACOLE' } })!;
    assert.equal(it0.ten, 'THẺ TREO_A1');
    assert.ok(!JSON.stringify(it0).includes('ARTICLE'));
    assert.ok(!JSON.stringify(it0).includes('CT24-017'));
    const it1 = dungItemCongKhai(
      [dongTon({ ten: 'X', ten_cong_trinh: 'CARACOLE', m_mau: null })], { suyTuTen: { mau: 'CARACOLE' } })!;
    assert.equal(it1.thuocTinh.mau, undefined);
    const it2 = dungItemCongKhai([dongTon({ ten: 'ARTICLE', ten_cong_trinh: 'ARTICLE', m_ten: null, m_chung_loai: null })])!;
    assert.equal(it2.ten, 'Vật tư 400012345678');
    const it3 = dungItemCongKhai([dongTon({ ten: 'TEM ARTICLE', ten_cong_trinh: 'ARTICLE', ten_hien_thi: 'Tem treo giấy' })])!;
    assert.equal(it3.ten, 'Tem treo giấy');
  });
});

describe('thuộc tính đầy đủ (cửa sổ chi tiết)', () => {
  // Đúng dạng ban_vt_master.thuoc_tinh thật (đo 15/11) + các MP cấm
  const MP = {
    'MP00 NHÓM VẬT TƯ': '106 -Vải', 'MP01 CHỦNG LOẠI': 'VẢI', 'MP05 TÊN VẢI/DA/MÂY': 'L4237', 'MP12 THƯƠNG HIỆU': 'VILLARCEAUX',
    'MP13 BỘ SƯU TẬP': 'ODEON CT24-017', 'MP15 MÀU SẮC': 'POMPADOUR', 'MP16 MÃ MÀU': '-', 'MP17 MÃ HỌA TIẾT': '(blank)',
    'MP18 MÃ SẢN PHẨM NCC': '0725 FENIX', 'MP22 QUY CÁCH RỘNG': '1290', 'MP21 QUY CÁCH DÀY': '0.5', 'MP27 HÌNH DẠNG': 'CUỘN',
    'MP29 ĐỘ ẨM/ƯỚT': 'N/A', 'MP34 PHƯƠNG PHÁP GIA CÔNG': '0', 'MP36 ĐƠN VỊ TÍNH': 'M', 'MP37 NHÀ CUNG CẤP': 'HGN',
    'MP38 LEADTIME': '45', 'MP39 LEADTIME 2': '60', 'MP99 CHÚ THÍCH THÊM': 'giữ cho CARACOLE', 'MP40 MỚI': 'lạ',
    'GHI CHÚ NCC': 'HAFELE',
  };
  it('item: không MP cấm, không mã công trình, nhãn tiếng Việt, không lặp ý', () => {
    const it = dungItemCongKhai(
      [dongTon({ m_thuoc_tinh: MP, m_quy_cach: 'Rộng 1290', m_mau: 'POMPADOUR', m_thuong_hieu: 'VILLARCEAUX', m_xuat_xu: null })],
      { suyTuTen: { ma_mau: 'L4237' } })!;
    assert.deepEqual(it.thuocTinhDayDu, [
      { nhan: 'Chủng loại', giaTri: 'Vải' },
      { nhan: 'Thương hiệu', giaTri: 'VILLARCEAUX' },
      { nhan: 'Bộ sưu tập', giaTri: 'ODEON' },
      { nhan: 'Màu sắc', giaTri: 'POMPADOUR' },
      { nhan: 'Mã màu', giaTri: 'L4237' },
      { nhan: 'Quy cách', giaTri: 'Rộng 1290' },
      { nhan: 'Hình dạng', giaTri: 'CUỘN' },
    ]);
    assert.equal(it.nhomVatTu, 'Vải');
    const json = JSON.stringify(it.thuocTinhDayDu);
    for (const s of ['HGN', 'FENIX', '45', '60', 'CARACOLE', 'HAFELE', 'lạ', 'CT24-017']) assert.ok(!json.includes(s), `lộ ${s}`);
    assert.ok(!/MP\d{2}/.test(json));
    assert.ok(!/(CT|PO)\d{2}-\d{3}/.test(JSON.stringify(it)));
  });
  it('danh sách trắng không có MP cấm', () => {
    for (const m of MP_CAM) assert.equal(NHAN_MP_CONG_KHAI[m], undefined, m);
  });
  it('không có quy cách gộp => hiện riêng dày / rộng; MP trùng giá trị trường gộp => 1 dòng', () => {
    const ds = dungThuocTinhDayDu({ mau: 'GOLD' }, {
      'MP15 MÀU SẮC': 'GOLD', 'MP06 TÊN ĐÁ/KÍNH': 'CALACATTA', 'MP21 QUY CÁCH DÀY': '18', 'MP22 QUY CÁCH RỘNG': '1600',
    }, v => v);
    assert.deepEqual(ds, [
      { nhan: 'Tên đá / kính', giaTri: 'CALACATTA' },
      { nhan: 'Màu sắc', giaTri: 'GOLD' },
      { nhan: 'Quy cách dày', giaTri: '18' },
      { nhan: 'Quy cách rộng', giaTri: '1600' },
    ]);
    assert.deepEqual(dungThuocTinhDayDu({}, null, v => v), []);
    assert.deepEqual(dungThuocTinhDayDu({}, 'không phải json', v => v), []);
  });
  it('tên nhóm: ten_nhom_sap, thiếu thì từ MP00; chỉ mã số => null', () => {
    assert.equal(tenNhomVatTu('Đá', {}), 'Đá');
    assert.equal(tenNhomVatTu(null, { 'MP00 NHÓM VẬT TƯ': '111 -Đá' }), 'Đá');
    assert.equal(tenNhomVatTu('103', { 'MP00 NHÓM VẬT TƯ': '103' }), null);
    assert.equal(tenNhomVatTu(null, null), null);
  });
  it('quy cách nhập lệch cột: Dày 1220 × Rộng 2440 => Rộng 1220 × Dài 2440; còn lại giữ nguyên', () => {
    assert.equal(suaQuyCachDayRong('Dày 1220 × Rộng 2440'), 'Rộng 1220 × Dài 2440');
    assert.equal(suaQuyCachDayRong('Dày 11 × Rộng 17'), 'Dày 11 × Rộng 17');
    assert.equal(suaQuyCachDayRong('Dày 18 × Rộng 1220 × Dài 2440'), 'Dày 18 × Rộng 1220 × Dài 2440');
    assert.equal(suaQuyCachDayRong('Dày 1220 × Rộng 600'), 'Dày 1220 × Rộng 600');
    assert.equal(suaQuyCachDayRong('1.4M'), '1.4M');
    const it2 = dungItemCongKhai([dongTon({
      m_quy_cach: 'Dày 1220 × Rộng 2440', m_thuoc_tinh: { 'MP21 QUY CÁCH DÀY': '1220', 'MP22 QUY CÁCH RỘNG': '2440' },
    })])!;
    assert.equal(it2.thuocTinh.quyCach, 'Rộng 1220 × Dài 2440');
    assert.ok(it2.thuocTinhDayDu.some(d => d.nhan === 'Quy cách' && d.giaTri === 'Rộng 1220 × Dài 2440'));
    assert.ok(!it2.thuocTinhDayDu.some(d => /Dày 1220|Quy cách dày/.test(`${d.nhan} ${d.giaTri}`)));
  });
});
