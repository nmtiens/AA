import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  trangThaiDongPr, hanGiao, phanTramDungHen, docBoLoc, docDanhSach, tachTimKiem, docThamSoDong, sqlDieuKien, boGia,
  sqlTrangThai, RE_NGAY_GHI_CHU, TRANG_THAI, NHOM_TRONG_MA, khongPhanBietHoa, RE_DUNG_GHI_CHU, type DongPrTho,
  laThang, congThang, thangDuCuoi, thangTb3, soThangDuDung, phanTramHaoHut, docBoLocTieuHao, sqlDieuKienTieuHao,
  docThamSoChiTietTH, boGiaTongHopTieuHao, ganTieuHaoNhom, ganTieuHaoMa, type TongHopTieuHao, type TheoNhom, type TheoMa,
  sqlGopTieuHao, sqlDieuKienGop, sqlDieuKienTho, dungDuocGop, chayTungDot, BANG_GOP_TIEU_HAO,
} from '../src/routes/vatTu.js';
import { readFileSync } from 'node:fs';

// Chạy: npm test. Đặt – Mua theo nhóm SAP (routes/vatTu.ts). Chỉ hàm thuần, không đụng DB.
// trangThaiDongPr là bản TS của CASE sqlTrangThai — đã đối chiếu trên DB thật 21/11/2026: 29.656 / 29.656 dòng khớp
// (SQL = TS, và khớp materialLineState của frontend sau khi thêm luật cấp 2: tạm dừng / CCLD / kho báo về / gia công / nhu cầu SX).

const HN = '2026-11-21';
const dong = (x: Partial<DongPrTho>): DongPrTho => ({
  trang_thai: '2.ĐANG MUA', trang_thai_sap: 'Mở', so_luong_yeu_cau: 10, so_luong_da_nhan_sap: 0, so_luong_con_lai: 10,
  so_po: 4500001234, ngay_du_kien_giao_hang_pmh_nhap: '2026-12-01', team_pr_note: null, ...x,
});

describe('trạng thái dòng PR', () => {
  it('HỦY ưu tiên hơn mọi thứ (cả 2 kiểu đặt dấu, cột TRẠNG THÁI hoặc SAP)', () => {
    assert.equal(trangThaiDongPr(dong({ trang_thai: '4.HỦY', trang_thai_sap: 'Hủy' }), HN), 'huy');
    assert.equal(trangThaiDongPr(dong({ trang_thai: '2.ĐANG MUA', trang_thai_sap: 'Huỷ', so_luong_da_nhan_sap: 10 }), HN), 'huy');
    assert.equal(trangThaiDongPr(dong({ trang_thai: '4.HUỶ', trang_thai_sap: null }), HN), 'huy');
  });
  it('SAP Hoàn thành / nhận ≥ yêu cầu => Đã về đủ (kể cả SAP Đóng mà đã nhận đủ)', () => {
    assert.equal(trangThaiDongPr(dong({ trang_thai: '3.ĐÃ NHẬP KHO', trang_thai_sap: 'Hoàn thành', so_luong_da_nhan_sap: 10, so_luong_con_lai: 0 }), HN), 'du');
    assert.equal(trangThaiDongPr(dong({ trang_thai: '3.ĐÃ NHẬP KHO', trang_thai_sap: 'Đóng', so_luong_da_nhan_sap: 12, so_luong_con_lai: -2 }), HN), 'du');
    assert.equal(trangThaiDongPr(dong({ so_luong_da_nhan_sap: 10, so_luong_con_lai: 0 }), HN), 'du');
  });
  it('SAP Đóng chưa nhận đủ: có PO => Đóng thiếu, không PO => Đóng không PO', () => {
    assert.equal(trangThaiDongPr(dong({ trang_thai: '3.ĐÃ NHẬP KHO', trang_thai_sap: 'Đóng', so_luong_da_nhan_sap: 4, so_luong_con_lai: 6 }), HN), 'dongThieu');
    assert.equal(trangThaiDongPr(dong({ trang_thai: '3.ĐÃ NHẬP KHO', trang_thai_sap: 'Đóng', so_luong_da_nhan_sap: 0 }), HN), 'dongThieu');
    assert.equal(trangThaiDongPr(dong({ trang_thai: '3.ĐÃ NHẬP KHO', trang_thai_sap: 'Đóng', so_po: null }), HN), 'dongKhongPo');
    // Thiếu cột SAP mà nhãn ĐÃ NHẬP KHO, còn lại > 0 => coi như đóng thiếu (materialBaseOf)
    assert.equal(trangThaiDongPr(dong({ trang_thai: '3.ĐÃ NHẬP KHO', trang_thai_sap: null, so_luong_da_nhan_sap: 3, so_luong_con_lai: 7 }), HN), 'dongThieu');
  });
  it('1.CHƯA MUA hoặc chưa có PO => Chưa mua', () => {
    assert.equal(trangThaiDongPr(dong({ trang_thai: '1.CHƯA MUA', so_po: null }), HN), 'chuaMua');
    assert.equal(trangThaiDongPr(dong({ trang_thai: '1.CHƯA MUA' }), HN), 'chuaMua');
    assert.equal(trangThaiDongPr(dong({ so_po: '' }), HN), 'chuaMua');
  });
  it('có PO còn chờ: quá hạn => Trễ (cả khi đã nhận 1 phần); chưa tới hạn đã nhận => Về một phần; còn lại Đúng hẹn', () => {
    assert.equal(trangThaiDongPr(dong({ ngay_du_kien_giao_hang_pmh_nhap: '2026-11-20' }), HN), 'tre');
    assert.equal(trangThaiDongPr(dong({ ngay_du_kien_giao_hang_pmh_nhap: '2026-11-20', so_luong_da_nhan_sap: 3, so_luong_con_lai: 7 }), HN), 'tre');
    assert.equal(trangThaiDongPr(dong({ so_luong_da_nhan_sap: 3, so_luong_con_lai: 7 }), HN), 'motPhan');
    assert.equal(trangThaiDongPr(dong({ ngay_du_kien_giao_hang_pmh_nhap: HN }), HN), 'dungHen');
    assert.equal(trangThaiDongPr(dong({ ngay_du_kien_giao_hang_pmh_nhap: null }), HN), 'dungHen');
  });
  it('Team PR ghi ngày hẹn mới (muộn hơn) vào ghi chú => xét theo ngày đó', () => {
    assert.equal(trangThaiDongPr(dong({ ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01', team_pr_note: '2026-11-25 00:00:00' }), HN), 'dungHen');
    assert.equal(trangThaiDongPr(dong({ ngay_du_kien_giao_hang_pmh_nhap: '2026-11-30', team_pr_note: '2026-11-01' }), HN), 'dungHen');
    assert.equal(trangThaiDongPr(dong({ ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01', team_pr_note: 'GỌI NCC 2026-11-25' }), HN), 'tre');
  });
  it('dòng còn mở mà PO hủy / tạm dừng / pending (kể cả chữ thường) hoặc CCLD => Tạm dừng, không tính chưa mua / trễ', () => {
    assert.equal(trangThaiDongPr(dong({ tinh_trang_po: 'PO đã hủy', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'tamDung');
    assert.equal(trangThaiDongPr(dong({ trang_thai: '1.CHƯA MUA', so_po: null, team_pr_note: 'hủy, sd tồn' }), HN), 'tamDung');
    assert.equal(trangThaiDongPr(dong({ team_pr_note: 'BOD pending' }), HN), 'tamDung');
    assert.equal(trangThaiDongPr(dong({ ghi_chu_tinh_trang_po: 'Tạm ngưng giao' }), HN), 'tamDung');
    assert.equal(trangThaiDongPr(dong({ team_pr_note: 'ccld', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'tamDung');
    // CCLD trên dòng CHƯA MUA vẫn là chưa mua (như materialLineState)
    assert.equal(trangThaiDongPr(dong({ trang_thai: '1.CHƯA MUA', so_po: null, team_pr_note: 'CCLD' }), HN), 'chuaMua');
  });
  it('kho báo về đủ (≤ 1,5 lần SL yêu cầu) hoặc ghi chú HOÀN THÀNH => Đã về đủ', () => {
    assert.equal(trangThaiDongPr(dong({ sl_hang_ve_thuc_te: '10', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'du');
    assert.equal(trangThaiDongPr(dong({ sl_hang_ve_thuc_te: '15' }), HN), 'du');
    assert.equal(trangThaiDongPr(dong({ sl_hang_ve_thuc_te: '7249', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'tre');
    assert.equal(trangThaiDongPr(dong({ sl_hang_ve_thuc_te: '9' }), HN), 'dungHen');
    assert.equal(trangThaiDongPr(dong({ team_pr_note: ' hoàn thành ', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'du');
  });
  it('gia công ngoài (806 / ghi chú GC) => Gia công, không bao giờ trễ', () => {
    assert.equal(trangThaiDongPr(dong({ nhom_vt: '806 - Gia công', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'giaCong');
    assert.equal(trangThaiDongPr(dong({ team_pr_note: 'GC BTP-ghế', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'giaCong');
    assert.equal(trangThaiDongPr(dong({ team_pr_note: 'xx #gia công', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'giaCong');
    assert.equal(trangThaiDongPr(dong({ nhom_vt: '8060 - X', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'tre');
    assert.equal(trangThaiDongPr(dong({ team_pr_note: 'GCX', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'tre');
  });
  it('quá hạn mà cố ý về theo nhu cầu SX / dùng trước tồn kho => Theo nhu cầu SX (không tính trễ)', () => {
    assert.equal(trangThaiDongPr(dong({ team_pr_note: 'Về theo nhu cầu SX', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'theoNhuCau');
    assert.equal(trangThaiDongPr(dong({ ghi_chu_tinh_trang_po: 'Điều phối hàng về theo nhu cầu sản xuất', ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01' }), HN), 'theoNhuCau');
    assert.equal(trangThaiDongPr(dong({ team_pr_note: 'Về theo nhu cầu SX' }), HN), 'dungHen');
  });
  it('mọi kết quả nằm trong TRANG_THAI', () => {
    for (const x of [dong({}), dong({ so_po: null }), dong({ trang_thai: '4.HỦY' })]) assert.ok(TRANG_THAI.includes(trangThaiDongPr(x, HN)));
  });
});

describe('so khớp không phân biệt hoa / thường (DB locale C)', () => {
  it('đổi chữ cái thành lớp hoa / thường, giữ ký tự sau gạch chéo ngược và lớp sẵn có', () => {
    assert.equal(khongPhanBietHoa('HỦY'), '[Hh][Ủủ][Yy]');
    assert.equal(khongPhanBietHoa('NG[ƯỪU]'), '[Nn][Gg][ƯưỪừUu]');
    assert.equal(khongPhanBietHoa(String.raw`\d1`), String.raw`\d1`);
    const re = new RegExp(RE_DUNG_GHI_CHU);
    for (const s of ['hủy', 'HUỶ', 'tạm ngừng', 'Pending']) assert.ok(re.test(s), s);
    assert.ok(!re.test('huy'));
  });
});

describe('hạn giao + ngày trong ghi chú', () => {
  it('chỉ nhận ghi chú là đúng 1 ngày có thật', () => {
    const re = new RegExp(RE_NGAY_GHI_CHU);
    for (const s of ['2026-11-25', '2026-11-25 00:00:00', '2026-11-25T00:00:00.000', '2026-12-31', '2026-04-30']) assert.ok(re.test(s), s);
    for (const s of ['2026-02-30', '2026-04-31', '2026-13-01', '2026-11-25 08:00:00', 'x2026-11-25', '2026-02-29']) assert.ok(!re.test(s), s);
  });
  it('lấy ngày muộn hơn giữa PMH và ghi chú', () => {
    assert.equal(hanGiao(dong({ ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01', team_pr_note: '2026-11-25' })), '2026-11-25');
    assert.equal(hanGiao(dong({ ngay_du_kien_giao_hang_pmh_nhap: null, team_pr_note: '2026-11-25' })), '2026-11-25');
    assert.equal(hanGiao(dong({ ngay_du_kien_giao_hang_pmh_nhap: null, team_pr_note: null })), null);
    assert.equal(hanGiao(dong({ ngay_du_kien_giao_hang_pmh_nhap: '2026-11-01', team_pr_note: ' 2026-11-25 ' })), '2026-11-25');
  });
});

describe('% đúng hẹn', () => {
  it('(đúng hẹn + về một phần) / đang về; không có dòng đang về => null', () => {
    assert.equal(phanTramDungHen({ dungHen: 3, tre: 1, motPhan: 0 }), 75);
    assert.equal(phanTramDungHen({ dungHen: 0, tre: 0, motPhan: 0 }), null);
  });
});

describe('đọc bộ lọc', () => {
  it('mặc định ẩn 806 / 401 / 800 / HỦY; gửi 0 để hiện', () => {
    const a = docBoLoc({});
    assert.ok(a.hopLe);
    if (a.hopLe) assert.deepEqual([a.loc.an806, a.loc.an401, a.loc.an800, a.loc.anHuy], [true, true, true, true]);
    const b = docBoLoc({ an806: '0', an401: 'false', an800: '1', anHuy: '0' });
    if (b.hopLe) assert.deepEqual([b.loc.an806, b.loc.an401, b.loc.an800, b.loc.anHuy], [false, false, true, false]);
  });
  it('ngày sai / nhóm lạ / trạng thái lạ => lỗi', () => {
    assert.equal(docBoLoc({ tu: '2026-02-30' }).hopLe, false);
    assert.equal(docBoLoc({ nhom: 'abc' }).hopLe, false);
    assert.equal(docBoLoc({ trangThai: 'xyz' }).hopLe, false);
    assert.equal(docBoLoc({ nhom: ['115', NHOM_TRONG_MA], trangThai: 'tre,chuaMua' }).hopLe, true);
  });
  it('danh sách: tách phẩy, bỏ trùng, xếp tăng', () => {
    assert.deepEqual(docDanhSach('CT26-001, CT25-002,CT26-001'), ['CT25-002', 'CT26-001']);
    assert.deepEqual(docDanhSach(['115', '110,115']), ['110', '115']);
    assert.equal(docDanhSach([1 as unknown as string]), null);
  });
  it('ô tìm: số (bỏ .0 / số 0 đầu) và chữ tách riêng', () => {
    assert.deepEqual(tachTimKiem('1000123 4500001.0; 0100004 kính cường lực'), { so: ['100004', '1000123', '4500001'], chu: ['cường', 'kính', 'lực'] });
  });
  it('tham số /dong', () => {
    assert.deepEqual(docThamSoDong({}), { ma: null, dvt: null, loai: null, trang: 1, co: 200 });
    assert.deepEqual(docThamSoDong({ ma: '-', dvt: '-', loai: 'canTrong14', trang: '2', co: '50' }), { ma: '', dvt: '', loai: 'canTrong14', trang: 2, co: 50 });
    assert.equal(docThamSoDong({ ma: '100000469285', dvt: 'SET' })?.dvt, 'SET');
    assert.equal(docThamSoDong({ dvt: 'x'.repeat(51) }), null);
    assert.equal(docThamSoDong({ loai: 'lungtung' }), null);
    assert.equal(docThamSoDong({ co: '999999' }), null);
    assert.equal(docThamSoDong({ ma: 'ABC' }), null);
  });
});

describe('SQL', () => {
  it('điều kiện mặc định ẩn HỦY / 806 / 401 / 800; chọn nhóm 806 thì không ẩn 806', () => {
    const a = docBoLoc({});
    if (!a.hopLe) throw new Error('x');
    const p: unknown[] = ['2026-11-21'];
    const w = sqlDieuKien(a.loc, p);
    assert.match(w, /b\.tt <> 'huy'/);
    assert.match(w, /b\.ma_nhom <> '806'/);
    assert.match(w, /NOT LIKE '800%'/);
    const b = docBoLoc({ nhom: '806' });
    if (!b.hopLe) throw new Error('x');
    assert.doesNotMatch(sqlDieuKien(b.loc, ['x']), /<> '806'/);
  });
  it('tìm chữ: thoát % và _', () => {
    const a = docBoLoc({ q: '50%_x' });
    if (!a.hopLe) throw new Error('x');
    const p: unknown[] = ['x'];
    sqlDieuKien(a.loc, p);
    assert.equal(p[p.length - 1], '%50\\%\\_x%');
  });
  it('tìm: các từ chữ nối AND, nhóm số nối OR với nhóm chữ', () => {
    const a = docBoLoc({ q: 'kính ghép 1400017476' });
    if (!a.hopLe) throw new Error('x');
    const w = sqlDieuKien(a.loc, ['x']);
    assert.ok(w.includes(') AND (b.ten_vat_tu ILIKE'), w);
    assert.ok(w.includes('b.ma = ANY($2::text[])) OR ((b.ten_vat_tu ILIKE'), w);
  });
  it('CASE trạng thái có đủ các nhãn', () => {
    const s = sqlTrangThai('$1::date');
    for (const t of TRANG_THAI) assert.ok(s.includes(`'${t}'`), t);
  });
  it('bỏ giá trả bản mới, không sửa bản trong cache', () => {
    const goc = { giaTriPr: 1, giaTriCho: 2, x: 3 };
    const moi = boGia(goc);
    assert.deepEqual(moi, { giaTriPr: null, giaTriCho: null, x: 3 });
    assert.equal(goc.giaTriPr, 1);
  });
});

describe('xuất tiêu hao — tháng / TB 3 tháng / số tháng đủ dùng', () => {
  it('laThang + congThang qua năm', () => {
    assert.ok(laThang('2026-11'));
    assert.ok(!laThang('2026-13'));
    assert.ok(!laThang('2026-1'));
    assert.equal(congThang('2026-01', -1), '2025-12');
    assert.equal(congThang('2025-12', 1), '2026-01');
    assert.equal(congThang('2026-03', -14), '2025-01');
  });
  it('tháng đủ cuối: ngày cuối tháng => chính tháng đó, còn lại => tháng trước', () => {
    assert.equal(thangDuCuoi('2026-11-20'), '2026-10');
    assert.equal(thangDuCuoi('2026-11-30'), '2026-11');
    assert.equal(thangDuCuoi('2028-02-29'), '2028-02');
    assert.equal(thangDuCuoi('2026-02-28'), '2026-02');
    assert.equal(thangDuCuoi(null), null);
    assert.deepEqual(thangTb3('2026-11-20'), ['2026-08', '2026-09', '2026-10']);
    assert.deepEqual(thangTb3('2027-01-31'), ['2026-11', '2026-12', '2027-01']);
    assert.deepEqual(thangTb3(null), []);
  });
  it('số tháng đủ dùng: khác ĐVT / TB ≤ 0 / thiếu tồn => null; tồn âm => 0', () => {
    assert.equal(soThangDuDung(65, 'KG', 2.5, 'kg '), 26);
    assert.equal(soThangDuDung(65, 'KG', 2.5, 'M'), null);
    assert.equal(soThangDuDung(65, null, 2.5, 'M'), 26);
    assert.equal(soThangDuDung(65, 'KG', 0, 'KG'), null);
    assert.equal(soThangDuDung(null, 'KG', 1, 'KG'), null);
    assert.equal(soThangDuDung(-3, 'KG', 1, 'KG'), 0);
  });
  it('% hao hụt = Z14 / (tiêu hao + Z14)', () => {
    assert.equal(phanTramHaoHut(9, 1), 10);
    assert.equal(phanTramHaoHut(0, 0), null);
    assert.equal(phanTramHaoHut(null, 1), null);
  });
});

describe('xuất tiêu hao — đọc tham số + điều kiện SQL', () => {
  it('mặc định: ẩn 806/401, mọi loại xuất', () => {
    const a = docBoLocTieuHao({});
    if (!a.hopLe) throw new Error(a.loi);
    assert.equal(a.loc.mvt, '');
    assert.ok(a.loc.an806 && a.loc.an401 && !a.loc.chuaGhep);
    const w = sqlDieuKienTieuHao(a.loc, []);
    assert.match(w, /b\.k_nhom <> '806'/);
    assert.match(w, /b\.k_nhom <> '401'/);
    assert.match(w, /b\.k_nhom NOT IN \('BTP', 'TP'\)/);
  });
  it('BTP / TP: mặc định ẩn; anBtp=0 hiện; chọn nhóm BTP thì chỉ ẩn TP', () => {
    const a = docBoLocTieuHao({ anBtp: '0' });
    if (!a.hopLe) throw new Error(a.loi);
    assert.doesNotMatch(sqlDieuKienTieuHao(a.loc, []), /BTP/);
    const b = docBoLocTieuHao({ nhom: 'BTP' });
    if (!b.hopLe) throw new Error(b.loi);
    const w = sqlDieuKienTieuHao(b.loc, []);
    assert.match(w, /b\.k_nhom NOT IN \('TP'\)/);
    assert.doesNotMatch(w, /'BTP', 'TP'/);
    assert.equal(docBoLocTieuHao({ nhom: 'XYZ' }).hopLe, false);
  });
  it('HEX / xưởng không tách dấu phẩy: HEX ghép "H1, H2" là 1 khoá', () => {
    const a = docBoLocTieuHao({ hex: ['h1, h2', 'H3'], xuong: 'Xưởng A, chi nhánh' });
    if (!a.hopLe) throw new Error(a.loi);
    assert.deepEqual(a.loc.hex, ['H1, H2', 'H3']);
    assert.deepEqual(a.loc.xuong, ['Xưởng A, chi nhánh']);
    assert.deepEqual(docDanhSach('a,b', 10, 10, false), ['a,b']);
  });
  it('tháng sai / mvt lạ / nhóm lạ => lỗi', () => {
    assert.equal(docBoLocTieuHao({ tu: '2026-11-01' }).hopLe, false);
    assert.equal(docBoLocTieuHao({ mvt: '201' }).hopLe, false);
    assert.equal(docBoLocTieuHao({ nhom: 'abc' }).hopLe, false);
  });
  it('ct / hex viết hoa, bỏ trùng; "-" = chưa ghép', () => {
    const a = docBoLocTieuHao({ ct: 'ct26-055,CT26-055,-', hex: 'h001', tu: '2026-08', den: '2026-10', mvt: 'z14', chuaGhep: '1' });
    if (!a.hopLe) throw new Error(a.loi);
    assert.deepEqual(a.loc.ct, ['-', 'CT26-055']);
    assert.deepEqual(a.loc.hex, ['H001']);
    const p: unknown[] = [];
    const w = sqlDieuKienTieuHao(a.loc, p);
    assert.ok(w.includes(`COALESCE(b.k_ct, '-') = ANY(`), w);
    assert.ok(w.includes(`b.k_mvt IN ('Z14','Z15')`), w);
    assert.ok(w.includes('b.k_ct IS NULL AND b.k_hex IS NULL'), w);
    assert.deepEqual(p.slice(0, 2), ['2026-08', '2026-10']);
    // bỏ khoảng tháng (thẻ TB 3 tháng)
    const p2: unknown[] = [];
    assert.ok(!sqlDieuKienTieuHao(a.loc, p2, true).includes('b.thang'));
  });
  it('chọn nhóm 806 thì không ẩn 806; mvt tieuHao = 261 + 262', () => {
    const a = docBoLocTieuHao({ nhom: '806', mvt: 'tieuHao' });
    if (!a.hopLe) throw new Error(a.loi);
    const w = sqlDieuKienTieuHao(a.loc, []);
    assert.doesNotMatch(w, /<> '806'/);
    assert.match(w, /b\.k_mvt IN \('261','262'\)/);
  });
  it('tham số chi tiết: bỏ số 0 đầu mã, ĐVT viết hoa, "-" = trống', () => {
    assert.deepEqual(docThamSoChiTietTH({ ma: '000100000000440', dvt: 'kg' }), { ma: '100000000440', dvt: 'KG', trang: 1, co: 200 });
    assert.deepEqual(docThamSoChiTietTH({ ma: '-', dvt: '-', trang: '2', co: '50' }), { ma: '', dvt: '', trang: 2, co: 50 });
    assert.equal(docThamSoChiTietTH({ ma: 'abc' }), null);
    assert.equal(docThamSoChiTietTH({ co: '0' }), null);
  });
});

describe('xuất tiêu hao — bỏ giá + gắn vào Đặt – Mua', () => {
  const o = (th: number) => ({ th, hh: 1, sl: 5, slHh: 1, sd: 2, sdTh: 1, sdHh: 1 });
  it('bỏ giá: mọi giá trị null, bản cache không đổi', () => {
    const goc = {
      chuaCo: false, capNhat: null, homNay: 'x', coGia: true, theo: 'nhom', duLieuToi: null, thang262Tu: null, thangTb3: [], thang: ['2026-10'],
      dong: [{ khoa: '115', ten: '115', phu: null, thang: { '2026-10': o(3) }, tong: o(3), soMa: 1, gtTb3: 1, slTb3: null }],
      catBot: false, soKhoa: 1, tong: { thang: { '2026-10': o(3) }, tong: o(3), soMa: 1 },
      the: { thangMoi: null, thMoi: 1, thTruoc: 1, thTb3: 1, th: 3, hh: 1, ptHaoHut: 25, soMa: 1, soDong: 2, soDongChuaGhep: 0, ptChuaGhep: 0 },
    } as TongHopTieuHao;
    const moi = boGiaTongHopTieuHao(goc);
    assert.equal(moi.coGia, false);
    assert.equal(moi.dong[0].thang['2026-10'].th, null);
    assert.equal(moi.dong[0].tong.sd, 2);
    assert.equal(moi.dong[0].gtTb3, null);
    assert.equal(moi.the.ptHaoHut, null);
    assert.equal(moi.the.soDong, 2);
    assert.equal(goc.dong[0].thang['2026-10'].th, 3);
  });
  it('gắn TB3 nhóm + tổng; chưa có bảng => tieuHao null', () => {
    const x = { capNhat: null, homNay: 'x', coGia: true, nhom: [{ ma: '115' }, { ma: '110' }], tong: { soMa: 0 } } as unknown as TheoNhom;
    const g = ganTieuHaoNhom(x, { thangTb3: ['2026-08', '2026-09', '2026-10'], gt: new Map([['115', 2]]) });
    assert.deepEqual(g.nhom.map(n => n.tieuHaoTb3), [2, 0]);
    assert.equal(g.tong.tieuHaoTb3, 2);
    assert.equal(ganTieuHaoNhom(x, null).tieuHao, null);
  });
  it('gắn TB3 mã: nhiều ĐVT xuất => không có SL / số tháng; khớp mã bỏ số 0 đầu', () => {
    const x = { capNhat: null, homNay: 'x', coGia: true, catBot: false, ma: [{ ma: '100000000440' }, { ma: '100000004741' }, { ma: null }] } as unknown as TheoMa;
    const g = ganTieuHaoMa(x, {
      thangTb3: ['2026-08'],
      ma: new Map([
        ['100000000440', { gt: 1, sl: 2, dvt: 'KG', soDvt: 1, ton: 10, dvtTon: 'KG' }],
        ['100000004741', { gt: 1, sl: 2, dvt: 'M', soDvt: 2, ton: 10, dvtTon: 'M' }],
      ]),
    });
    assert.equal(g.ma[0].soThangDuDung, 5);
    assert.equal(g.ma[1].slTieuHaoTb3, null);
    assert.equal(g.ma[1].soThangDuDung, null);
    assert.equal(g.ma[2].tieuHaoTb3, null);
  });
});

describe('xuất tiêu hao — bảng gộp xuat_tieu_hao_vt_gop', () => {
  const gon = (x: string) => x.replace(/\s+/g, ' ').trim();
  it('file SQL chép đúng câu gộp sqlGopTieuHao()', () => {
    const f = readFileSync(new URL('../sql/2026-11-21_xuat_tieu_hao_vt_gop.sql', import.meta.url), 'utf-8');
    assert.ok(gon(f).includes(`${gon(sqlGopTieuHao())};`), 'câu gộp trong file .sql khác vatTu.ts — chép lại');
    assert.ok(f.includes(`CREATE TABLE IF NOT EXISTS ${BANG_GOP_TIEU_HAO}`));
  });
  it('câu gộp: điều kiện dòng gốc + khoá HEX', () => {
    const s = sqlGopTieuHao({ where: 'x.hex = $1', theoHex: true });
    assert.match(s, /AND \(x\.hex = \$1\)\nGROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9$/);
    assert.match(s, /AS k_hex/);
    assert.doesNotMatch(sqlGopTieuHao(), /k_hex/);
  });
  it('dùng được bảng gộp trừ khi lọc HEX / ô tìm / theo HEX', () => {
    const l = (q: Record<string, unknown>) => { const k = docBoLocTieuHao(q); assert.ok(k.hopLe); return k.loc; };
    assert.equal(dungDuocGop(l({ nhom: '115', ct: 'CT26-001', xuong: 'A', mvt: 'z14', chuaGhep: '1', tu: '2026-01' }), 'ma'), true);
    assert.equal(dungDuocGop(l({}), 'hex'), false);
    assert.equal(dungDuocGop(l({ hex: 'H1' }), 'nhom'), false);
    assert.equal(dungDuocGop(l({ q: '1000123' }), 'nhom'), false);
    assert.equal(dungDuocGop(l({ q: 'keo' }), 'nhom'), false);
  });
  it('điều kiện trên dòng gộp: mvt => k_loai, chưa ghép => cột chua_ghep, không có HEX / ô tìm', () => {
    const k = docBoLocTieuHao({ mvt: 'tieuHao', chuaGhep: '1', ct: 'ct26-001,-', hex: 'H1', q: 'keo 123', tu: '2026-02' });
    assert.ok(k.hopLe);
    const p: unknown[] = [];
    const w = sqlDieuKienGop(k.loc, p);
    assert.match(w, /b\.k_loai = 'TH'/);
    assert.match(w, /b\.chua_ghep/);
    assert.match(w, /COALESCE\(b\.k_ct, '-'\) = ANY\(\$2::text\[\]\)/);
    assert.doesNotMatch(w, /hex|ILIKE|so_ct/);
    assert.deepEqual(p, ['2026-02', ['-', 'CT26-001']]);
    const z = docBoLocTieuHao({ mvt: 'z14' });
    assert.ok(z.hopLe);
    assert.match(sqlDieuKienGop(z.loc, []), /b\.k_loai = 'HH'/);
  });
  it('điều kiện trên dòng gốc: HEX + ô tìm số / chữ, tham số nối tiếp', () => {
    const k = docBoLocTieuHao({ hex: 'h1', q: 'keo 00123' });
    assert.ok(k.hopLe);
    const p: unknown[] = ['truoc'];
    const w = sqlDieuKienTho(k.loc, p);
    assert.match(w, /COALESCE\(upper\(NULLIF\(btrim\(x\.hex\), ''\)\), '-'\) = ANY\(\$2::text\[\]\)/);
    assert.match(w, /x\.ten_vat_tu ILIKE \$4/);
    assert.equal(p.length, 4);
    const r = docBoLocTieuHao({});
    assert.ok(r.hopLe);
    assert.equal(sqlDieuKienTho(r.loc, []), '');
  });
  it('chayTungDot: giữ thứ tự kết quả, tối đa 2 việc cùng lúc', async () => {
    let dang = 0, nhieuNhat = 0;
    const viec = [5, 1, 4, 2, 3].map(ms => async () => {
      dang++; nhieuNhat = Math.max(nhieuNhat, dang);
      await new Promise(r => setTimeout(r, ms));
      dang--;
      return ms;
    });
    assert.deepEqual(await chayTungDot(viec), [5, 1, 4, 2, 3]);
    assert.equal(nhieuNhat, 2);
  });
});
