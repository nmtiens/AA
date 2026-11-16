import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kiemChiTietTien, docChiTietTien, cungChiTiet, moTaChiTietTien, tomTatMucGia, chenhGcvt, chenhVatTu,
  chuanHoaHex, tachDanhSachHex, trieuSangVnd, lamTronVnd, locGoiYVatTu, coGiaCongNgoai, dinhDangVnd,
  type DongSanPham,
} from '../src/server/vuongMacTien.js';

// ---------- kiemChiTietTien ----------
test('kiemChiTietTien: loại 6M khác money luôn null (bỏ chi tiết gửi kèm)', () => {
  assert.deepEqual(kiemChiTietTien('material', { loai: 'nhieu_gia', hexTrung: ['123456789'] }, '111111111'), { ok: true, value: null });
});

test('kiemChiTietTien: money không có chiTiet / không có loai vẫn lưu được (null)', () => {
  assert.deepEqual(kiemChiTietTien('money', undefined, '111111111'), { ok: true, value: null });
  assert.deepEqual(kiemChiTietTien('money', null, '111111111'), { ok: true, value: null });
  assert.deepEqual(kiemChiTietTien('money', { ghiChu: 'x' }, '111111111'), { ok: true, value: null });
});

test('kiemChiTietTien: nhieu_gia bỏ trùng, bỏ HEX chính, cắt mã nhà máy 13 số, bỏ trường lạ', () => {
  const kq = kiemChiTietTien('money', {
    loai: 'nhieu_gia',
    hexTrung: [' 222222222 ', '222222222', '111111111', '1005333333333', ''],
    giaiTrinh: 'không thuộc loại này',
    ghiChu: '  cùng tủ áo  ',
  }, '111111111');
  assert.deepEqual(kq, { ok: true, value: { loai: 'nhieu_gia', hexTrung: ['222222222', '333333333'], ghiChu: 'cùng tủ áo' } });
});

test('kiemChiTietTien: nhieu_gia cần ít nhất 1 HEX khác HEX chính', () => {
  assert.equal(kiemChiTietTien('money', { loai: 'nhieu_gia', hexTrung: [] }, '111111111').ok, false);
  assert.equal(kiemChiTietTien('money', { loai: 'nhieu_gia' }, '111111111').ok, false);
  assert.equal(kiemChiTietTien('money', { loai: 'nhieu_gia', hexTrung: ['111111111'] }, '111111111').ok, false);
});

test('kiemChiTietTien: nhieu_gia báo mã sai độ dài', () => {
  const kq = kiemChiTietTien('money', { loai: 'nhieu_gia', hexTrung: ['12345', '222222222'] }, '111111111');
  assert.equal(kq.ok, false);
  if (!kq.ok) assert.match(kq.message, /12345/);
});

test('kiemChiTietTien: gia_thap_gcvt bắt buộc giải trình, chi phí làm tròn đồng', () => {
  assert.equal(kiemChiTietTien('money', { loai: 'gia_thap_gcvt', chiPhiGcvt: 5_000_000 }, '1').ok, false);
  assert.equal(kiemChiTietTien('money', { loai: 'gia_thap_gcvt', giaiTrinh: '   ' }, '1').ok, false);
  assert.deepEqual(
    kiemChiTietTien('money', { loai: 'gia_thap_gcvt', chiPhiGcvt: 5_000_000.4, giaiTrinh: ' khung lớn ', hexTrung: ['222222222'] }, '1'),
    { ok: true, value: { loai: 'gia_thap_gcvt', chiPhiGcvt: 5_000_000, giaiTrinh: 'khung lớn' } },
  );
  // Không nhập chi phí vẫn được
  assert.deepEqual(kiemChiTietTien('money', { loai: 'gia_thap_gcvt', giaiTrinh: 'a', chiPhiGcvt: null }, '1'),
    { ok: true, value: { loai: 'gia_thap_gcvt', giaiTrinh: 'a' } });
});

test('kiemChiTietTien: chi phí âm / loại lạ bị từ chối', () => {
  assert.equal(kiemChiTietTien('money', { loai: 'gia_thap_gcvt', giaiTrinh: 'a', chiPhiGcvt: -1 }, '1').ok, false);
  assert.equal(kiemChiTietTien('money', { loai: 'khac' }, '1').ok, false);
});

test('kiemChiTietTien: vat_tu_vuot_gia chỉ giữ ghi chú (tuỳ chọn)', () => {
  assert.deepEqual(kiemChiTietTien('money', { loai: 'vat_tu_vuot_gia' }, '1'), { ok: true, value: { loai: 'vat_tu_vuot_gia' } });
  assert.deepEqual(kiemChiTietTien('money', { loai: 'vat_tu_vuot_gia', ghiChu: 'PR gộp', chiPhiGcvt: 9 }, '1'),
    { ok: true, value: { loai: 'vat_tu_vuot_gia', ghiChu: 'PR gộp' } });
});

// ---------- đọc / so / mô tả ----------
test('docChiTietTien: đọc object hoặc chuỗi JSON, chỉ money, loại hợp lệ', () => {
  assert.deepEqual(docChiTietTien('money', '{"loai":"vat_tu_vuot_gia"}'), { loai: 'vat_tu_vuot_gia' });
  assert.deepEqual(docChiTietTien('money', { loai: 'nhieu_gia', hexTrung: ['1'] }), { loai: 'nhieu_gia', hexTrung: ['1'] });
  assert.equal(docChiTietTien('man', { loai: 'nhieu_gia' }), null);
  assert.equal(docChiTietTien('money', '{hỏng'), null);
  assert.equal(docChiTietTien('money', { loai: 'x' }), null);
  assert.equal(docChiTietTien('money', null), null);
});

test('cungChiTiet + moTaChiTietTien', () => {
  assert.equal(cungChiTiet(null, null), true);
  assert.equal(cungChiTiet({ loai: 'vat_tu_vuot_gia' }, null), false);
  assert.equal(moTaChiTietTien(null), 'không có');
  assert.equal(
    moTaChiTietTien({ loai: 'gia_thap_gcvt', chiPhiGcvt: 12_500_000, giaiTrinh: 'khung lớn' }),
    'Giá thấp, không GCVT được · chi phí GCVT 12.500.000 đ · giải trình: khung lớn',
  );
});

test('cungChiTiet: không phụ thuộc thứ tự khoá (cột jsonb tự xếp lại khoá)', () => {
  // Dựng như kiemChiTietTien: {loai, chiPhiGcvt, giaiTrinh, ghiChu}
  const moi = kiemChiTietTien('money', { loai: 'gia_thap_gcvt', chiPhiGcvt: 1_000_000, giaiTrinh: 'gt', ghiChu: 'gc' }, '123456789');
  assert.ok(moi.ok);
  // Đọc lại từ jsonb: Postgres trả {loai, ghiChu, giaiTrinh, chiPhiGcvt}
  const cu = docChiTietTien('money', { loai: 'gia_thap_gcvt', ghiChu: 'gc', giaiTrinh: 'gt', chiPhiGcvt: 1_000_000 });
  assert.equal(cungChiTiet(cu, moi.ok ? moi.value : null), true);
  const cu2 = docChiTietTien('money', '{"loai": "nhieu_gia", "ghiChu": "x", "hexTrung": ["111111111"]}');
  const moi2 = kiemChiTietTien('money', { loai: 'nhieu_gia', hexTrung: ['111111111'], ghiChu: 'x' }, '123456789');
  assert.equal(cungChiTiet(cu2, moi2.ok ? moi2.value : null), true);
  // Khác giá trị / khác thứ tự HEX trùng vẫn là khác
  assert.equal(cungChiTiet(cu, { loai: 'gia_thap_gcvt', giaiTrinh: 'gt', ghiChu: 'gc' }), false);
  assert.equal(cungChiTiet({ loai: 'nhieu_gia', hexTrung: ['1', '2'] }, { loai: 'nhieu_gia', hexTrung: ['2', '1'] }), false);
});

// ---------- tóm tắt mức giá ----------
test('tomTatMucGia: N HEX · K mức giá · chênh', () => {
  const t = tomTatMucGia([
    { hex: 'a', donGia: 1_200_000 }, { hex: 'b', donGia: 1_500_000 }, { hex: 'c', donGia: 1_200_000 }, { hex: 'a', donGia: 9 },
  ]);
  assert.equal(t.soHex, 3);
  assert.deepEqual(t.mucGia, [1_200_000, 1_500_000]);
  assert.equal(t.chenh, 300_000);
  assert.equal(t.text, '3 HEX · 2 mức giá: 1.200.000 / 1.500.000 · chênh 300.000');
});

test('tomTatMucGia: 1 mức giá không ghi chênh; thiếu giá được đếm riêng', () => {
  const t = tomTatMucGia([{ hex: 'a', donGia: 100 }, { hex: 'b', donGia: 100 }, { hex: 'c', donGia: null }]);
  assert.equal(t.chenh, 0);
  assert.deepEqual(t.thieuGia, ['c']);
  assert.equal(t.text, '3 HEX · 1 mức giá: 100 · 1 HEX chưa có giá');
  assert.equal(tomTatMucGia([{ hex: 'a', donGia: null }]).chenh, null);
});

// ---------- chênh ----------
test('chenhGcvt / chenhVatTu: thiếu số -> null, dương = vượt', () => {
  assert.equal(chenhGcvt(12_000_000, 10_000_000), 2_000_000);
  assert.equal(chenhGcvt(null, 10), null);
  assert.equal(chenhGcvt(5, undefined), null);
  assert.equal(chenhVatTu(80, 100), -20);
  assert.equal(chenhVatTu(100, null), null);
});

// ---------- đơn vị + phụ trợ ----------
test('trieuSangVnd: trị giá đơn hàng triệu đồng -> VNĐ', () => {
  assert.equal(trieuSangVnd(449.56978), 449_569_780);
  assert.equal(trieuSangVnd('17.778125'), 17_778_125);
  assert.equal(trieuSangVnd(null), null);
  assert.equal(trieuSangVnd('abc'), null);
  assert.equal(lamTronVnd(20434990.4), 20434990);
});

test('chuanHoaHex + tachDanhSachHex', () => {
  assert.equal(chuanHoaHex(' 250607396 '), '250607396');
  assert.equal(chuanHoaHex('1002250607396'), '250607396');
  assert.equal(chuanHoaHex('12345'), null);
  assert.deepEqual(tachDanhSachHex('a, b,,a ;c'), ['a', 'b', 'c']);
  assert.deepEqual(tachDanhSachHex(['a,b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(tachDanhSachHex(undefined), []);
});

test('coGiaCongNgoai + dinhDangVnd', () => {
  assert.equal(coGiaCongNgoai('Yes'), true);
  assert.equal(coGiaCongNgoai(null), false);
  assert.equal(dinhDangVnd(1234567), '1.234.567');
  assert.equal(dinhDangVnd(-1000), '-1.000');
  assert.equal(dinhDangVnd(999), '999');
});

// ---------- gợi ý vật tư vượt giá ----------
test('locGoiYVatTu: bỏ HỦY / trị giá 0 / vật tư <= trị giá; đổi triệu -> VNĐ; sắp chênh giảm dần; giới hạn', () => {
  const dong = (hex: string, triGiaTrieu: number | null, tinhTrang = '05. MỘC'): DongSanPham =>
    ({ hex, ten_hang_muc: `HM ${hex}`, ten_cong_trinh: `ct ${hex}`, tri_gia_don_hang_tong: triGiaTrieu, tinh_trang: tinhTrang });
  const tong = { a: 15_000_000, b: 50_000_000, c: 9_000_000, d: 99_000_000, e: 99_000_000, f: 10_000_000 };
  const ds = locGoiYVatTu(
    [dong('a', 10), dong('b', 20), dong('c', 10), dong('d', 1, 'HỦY'), dong('e', 0), dong('f', 10), dong('g', 1)],
    tong, 300, t => t.toUpperCase(),
  );
  assert.deepEqual(ds.map(d => d.hex), ['b', 'a']);
  assert.deepEqual(ds[0], { hex: 'b', tenHangMuc: 'HM b', tenCongTrinh: 'CT B', triGia: 20_000_000, tongVatTu: 50_000_000, chenh: 30_000_000 });
  assert.equal(locGoiYVatTu([dong('a', 10), dong('b', 20)], tong, 1).length, 1);
});

test('kiemChiTietTien: nhieu_gia giữ 1 ảnh sản phẩm chung; loại khác bỏ ảnh', () => {
  const kq = kiemChiTietTien('money', { loai: 'nhieu_gia', hexTrung: ['261119528'], anhSp: 12 }, '190402647');
  assert.equal(kq.ok && kq.value?.anhSp, 12);
  const khong = kiemChiTietTien('money', { loai: 'nhieu_gia', hexTrung: ['261119528'] }, '190402647');
  assert.equal(khong.ok && 'anhSp' in (khong.value ?? {}), false);
  const gcvt = kiemChiTietTien('money', { loai: 'gia_thap_gcvt', giaiTrinh: 'x', anhSp: 12 }, '190402647');
  assert.equal(gcvt.ok && 'anhSp' in (gcvt.value ?? {}), false);
});
