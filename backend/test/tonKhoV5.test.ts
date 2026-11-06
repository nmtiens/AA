import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chonCuoiThang, ghepDauVaoV5, laHuy, laXuatTinh, nhomDuAn, sqlDonPsa, sqlDongLuong, sqlTonKhoV5, sqlTonNgay, tinhTonKhoV5, tinhTuoi,
  type DongMoc, type DongNhap, type DongPsa, type DongPsaNhom, type DongTon, type DongXuat, type InputTonKhoV5,
} from '../src/server/tonKhoV5.js';
import { LoiChiTiet, chiTietTonKhoV5, docYeuCauChiTiet, laNgay, type YeuCauChiTiet } from '../src/server/tonKhoV5ChiTiet.js';

// Chạy: npm test. Báo cáo Tồn kho thành phẩm v5 — server/tonKhoV5.ts. Chỉ hàm thuần, không đụng DB.

const NGAY = '2026-11-01';
const dTon = (o: Partial<DongTon>): DongTon => ({ sap: 'S1', hex: null, ct: 'CT25-001', ten: 'GOI A', nk: '2026-10-01', sl: 1, v: 100, tkh: null, gc: null, ...o });
const dMoc = (o: Partial<DongMoc>): DongMoc => ({ d: NGAY, sap: 'S1', ct: 'CT25-001', ten: 'GOI A', nk: '2026-10-01', v: 100, sl: 1, ...o });
const dPsa = (o: Partial<DongPsa>): DongPsa => ({ hex: '1', ct: 'CT25-001', ten: 'GOI A', pm: 'PM A', ipo: null, tn: null, nsp: '03. TỦ', dg: 1e6, sld: 100, sln: 100, ...o });
const dNhom = (o: Partial<DongPsaNhom>): DongPsaNhom => ({ ct: 'CT25-001', ten: 'GOI A', pm: 'PM A', ipo: null, ttda: null, tn: null, gtd: 1000, nhapCap: 500, con: 0, ...o });
const dNhap = (o: Partial<DongNhap>): DongNhap => ({ d: '2026-10-01', hex: '1', ct: 'CT25-001', ten: 'GOI A', sl: 1, tt: 100, gc: null, ...o });
const dXuat = (o: Partial<DongXuat>): DongXuat => ({ d: '2026-10-15', hex: '1', ct: 'CT25-001', ten: 'GOI A', tn: null, ipo: null, co: 'TÍNH', sl: 1, tt: 100, gc: null, ...o });
const dauVao = (o: Partial<InputTonKhoV5>): InputTonKhoV5 => ({ date: NGAY, ngayChot: [NGAY], ton: [], tonMoc: [], psa: [], psaNhom: [], nhap: [], xuat: [], ...o });

describe('định nghĩa', () => {
  it('HUỶ nhận mọi dạng chữ, chuẩn hoá trong JS', () => {
    for (const x of ['HỦY', 'Hủy', 'HÚY', 'hủy', 'húy', ' hủy ', 'huy', 'HỦY']) {
      assert.equal(laHuy(x, null), true, x);
    }
    assert.equal(laHuy('TẠM NGƯNG', null), false);
    assert.equal(laHuy(null, '03. HỦY ĐƠN'), true);
    assert.equal(laHuy(null, '02. HOÀN THÀNH'), false);
    assert.equal(laHuy(null, null), false);
  });
  it('xuất TÍNH: bỏ khoảng trắng, không phân biệt hoa thường, tiền > 0', () => {
    assert.equal(laXuatTinh({ co: ' tÍNH ', tt: 1 }), true);
    assert.equal(laXuatTinh({ co: 'tính', tt: 1 }), true);
    assert.equal(laXuatTinh({ co: 'TÍNH', tt: 0 }), false);
    assert.equal(laXuatTinh({ co: '', tt: 5 }), false);
    assert.equal(laXuatTinh({ co: 'KHÔNG', tt: 5 }), false);
  });
  it('tuổi = ROUND(ngày / 30,4), đúng biên', () => {
    assert.equal(tinhTuoi(NGAY, null), null);
    assert.equal(tinhTuoi('2026-11-01', '2026-11-01'), 0);
    // 197 ngày = 6 tháng (chưa cũ), 198 ngày = 7 tháng (cũ)
    assert.equal(tinhTuoi('2026-11-01', '2026-04-18'), 6);
    assert.equal(tinhTuoi('2026-11-01', '2026-04-17'), 7);
    // 380 ngày đúng 12,5 tháng: làm tròn lên như ROUND của Postgres
    assert.equal(tinhTuoi('2026-11-01', '2025-10-17'), 13);
  });
  it('danh mục dự án', () => {
    assert.equal(nhomDuAn('CT25-059', 'KHU KHÁCH SẠN NAM PHƯƠNG_CT25-059'), 'Nam Phương');
    assert.equal(nhomDuAn('CT9', 'Khu holiday inn bà nà'), 'Holiday Inn Bà Nà');
    assert.equal(nhomDuAn('EM123', 'BÀN LẺ'), 'Xuất khẩu (EM)');
    assert.equal(nhomDuAn('TỒN', 'UPLOAD AATN'), 'Hàng lẻ (mã TỒN)');
    assert.equal(nhomDuAn('CT1', 'XYZ'), 'Khác');
  });
  it('mốc cuối tháng: bỏ mốc sát ngày xem', () => {
    assert.deepEqual(chonCuoiThang(['2026-09-30', '2026-10-01', '2026-10-29', '2026-11-01']), ['2026-09-30', '2026-11-01']);
    assert.deepEqual(chonCuoiThang(['2026-09-30', '2026-10-15']), ['2026-09-30', '2026-10-15']);
    assert.deepEqual(chonCuoiThang([]), []);
  });
});

describe('tổng và phân loại', () => {
  it('cũ theo tuổi, không có ngày nhập không tính cũ', () => {
    const r = tinhTonKhoV5(dauVao({
      ton: [dTon({ nk: '2026-01-01', v: 100 }), dTon({ nk: null, v: 50 }), dTon({ nk: '2026-10-20', v: 30 })],
    }));
    assert.equal(r.tong.v, 180);
    assert.equal(r.tong.cu, 100);
    assert.equal(r.tong.khongNgay, 50);
    assert.deepEqual(r.duAn.map(d => [d.moi, d.cu, d.khongNgay]), [[30, 100, 50]]);
  });
  it('đếm công trình theo tên chuẩn hoá, không theo mã', () => {
    const r = tinhTonKhoV5(dauVao({
      ton: [dTon({ ct: 'CT25-001', ten: 'GOI A' }), dTon({ ct: 'CT25-002', ten: ' Goi  a ' }), dTon({ ct: 'CT25-003', ten: 'GOI B' })],
    }));
    assert.equal(r.tong.congTrinh, 2);
  });
  it('chỉ dòng TÍNH vào tỷ lệ xuất; đơn huỷ tách nhóm riêng', () => {
    const r = tinhTonKhoV5(dauVao({
      ton: [dTon({ hex: '1', v: 10 }), dTon({ sap: 'S2', hex: '2', v: 20 }), dTon({ sap: 'S3', hex: '3', v: 40 })],
      psa: [dPsa({ hex: '1', sln: 10 }), dPsa({ hex: '2', sln: 10, sld: 10 }), dPsa({ hex: '3', sln: 10, tn: 'Hủy' })],
      xuat: [
        dXuat({ hex: '1', co: '', sl: 9, tt: 0 }), // cờ trống: không tính
        dXuat({ hex: '1', co: 'TÍNH', sl: 9, tt: 0 }), // TÍNH nhưng tiền 0: không tính
        dXuat({ hex: '2', co: 'tÍNH', sl: 9, tt: 90 }),
      ],
    }));
    const n = Object.fromEntries(r.phanChia.map(p => [p.k, p.gt]));
    assert.equal(n.chuaXuat, 10);
    assert.equal(n.ganXong, 20);
    assert.equal(n.huy, 40);
    assert.equal(r.tong.chuaXuat, 10);
    assert.equal(r.doiChieu.huy.gt, 40);
  });
  it('% xuất theo tiền, % nhập bỏ đơn huỷ', () => {
    const r = tinhTonKhoV5(dauVao({
      ton: [dTon({ hex: '1' })], psa: [dPsa({ hex: '1' })],
      psaNhom: [dNhom({ gtd: 1000, nhapCap: 500 }), dNhom({ gtd: 9000, nhapCap: 0, tn: 'HÚY' })],
      nhap: [dNhap({ tt: 400 })], xuat: [dXuat({ tt: 100 })],
    }));
    assert.equal(r.duAn[0].pctNhap, 50);
    assert.equal(r.duAn[0].pctXuat, 25);
  });
  it('không PSA vào nhóm riêng, gom theo mã + công trình', () => {
    const r = tinhTonKhoV5(dauVao({ ton: [dTon({ hex: '9', v: 5 }), dTon({ hex: '9', sap: 'S2', v: 5 })] }));
    const k = r.phanChia.find(p => p.k === 'khongPsa')!;
    assert.deepEqual([k.gt, k.hex], [10, 2]);
    assert.equal(r.doiChieu.khongPsa.gt, 10);
  });
});

describe('gói đứng yên', () => {
  const nen = {
    ton: [dTon({ ct: 'CT25-059', ten: 'GOI DUNG', hex: '1', v: 90, nk: '2026-01-01' }), dTon({ ct: 'CT26-055', ten: 'GOI DI', hex: '2', sap: 'S2', v: 10 })],
    psa: [dPsa({ hex: '1', ct: 'CT25-059', pm: 'PM A' }), dPsa({ hex: '2', ct: 'CT26-055', pm: 'PM A' })],
    psaNhom: [dNhom({ ct: 'CT25-059', pm: 'PM A' }), dNhom({ ct: 'CT26-055', pm: 'PM A' })],
  };
  it('chọn gói lớn nhất không xuất 60 ngày, so với gói cùng PM', () => {
    const r = tinhTonKhoV5(dauVao({
      ...nen,
      nhap: [dNhap({ ct: 'CT25-059', hex: '1', tt: 500, d: '2026-01-31' })],
      xuat: [dXuat({ ct: 'CT25-059', hex: '1', tt: 7, d: '2026-08-12' }), dXuat({ ct: 'CT26-055', hex: '2', tt: 3, d: '2026-10-20' })],
    }));
    assert.equal(r.goiDung?.ct, 'CT25-059');
    assert.equal(r.goiDung?.nhap, 500);
    assert.equal(r.goiDung?.xuat, 7);
    assert.equal(r.goiDung?.ngayKhongXuat, 81);
    assert.deepEqual(r.soSanhGoi.map(g => g.ct), ['CT25-059', 'CT26-055']);
    const s = r.soSanhGoi[0];
    assert.equal(s.thang[0], '2026-01');
    assert.equal(s.nhapLuyKe.at(-1), 500);
    assert.equal(s.xuatLuyKe.at(-1), 7);
    assert.equal(r.soSanhGoi[1].nhapLuyKe[0], null); // chưa bắt đầu
  });
  it('gói so sánh ưu tiên cùng dự án, gói cùng PM còn lại vào dòng số', () => {
    const ten = (ct: string) => `NAM PHƯƠNG ${ct}`;
    const r = tinhTonKhoV5(dauVao({
      ton: [dTon({ ct: 'CT25-059', ten: ten('CT25-059'), hex: '1', v: 900, nk: '2026-01-01' })],
      psa: [dPsa({ hex: '1', ct: 'CT25-059', ten: ten('CT25-059') })],
      psaNhom: [
        dNhom({ ct: 'CT25-059', ten: ten('CT25-059') }), dNhom({ ct: 'CT26-055', ten: ten('CT26-055') }), dNhom({ ct: 'CT25-070', ten: ten('CT25-070') }),
        dNhom({ ct: 'CT26-078', ten: ten('CT26-078') }), dNhom({ ct: 'CT26-011', ten: 'TRỤC ĐÔNG TÂY' }), dNhom({ ct: 'CT26-099', ten: ten('CT26-099'), pm: 'PM B' }),
        dNhom({ ct: 'CT26-099', ten: ten('CT26-099'), gtd: 10 }), // lẫn vài dòng PM A: PM chính vẫn là PM B
      ],
      xuat: [
        dXuat({ ct: 'CT26-055', hex: '2', tt: 50 }), dXuat({ ct: 'CT25-070', hex: '3', tt: 20 }), dXuat({ ct: 'CT26-078', hex: '4', tt: 10 }),
        dXuat({ ct: 'CT26-011', hex: '5', tt: 30 }), dXuat({ ct: 'CT26-099', hex: '6', tt: 99 }),
      ],
    }));
    assert.deepEqual(r.soSanhGoi.map(g => g.ct), ['CT25-059', 'CT26-055', 'CT25-070']);
    assert.deepEqual(r.goiCungPm.map(g => g.ct), ['CT26-078', 'CT26-011']);
    assert.equal(r.goiCungPm[1].xuat60, 30);
  });
  it('xuất đúng 60 ngày trước vẫn tính là còn xuất; null khi mọi gói đều xuất', () => {
    const r = tinhTonKhoV5(dauVao({
      ...nen,
      xuat: [dXuat({ ct: 'CT25-059', hex: '1', tt: 1, d: '2026-09-02' }), dXuat({ ct: 'CT26-055', hex: '2', tt: 3, d: '2026-10-20' })],
    }));
    assert.equal(r.goiDung, null);
    assert.deepEqual(r.soSanhGoi, []);
  });
  it('gói dưới 2% tổng và mã không dạng CT không được chọn', () => {
    const r = tinhTonKhoV5(dauVao({
      ton: [dTon({ ct: 'CT1', v: 1 }), dTon({ ct: 'TỒN', v: 999 })],
    }));
    assert.equal(r.goiDung, null);
  });
});

describe('ngày cắt', () => {
  it('dòng sau ngày xem không vào số nào', () => {
    const date = '2026-10-15';
    const r = tinhTonKhoV5(dauVao({
      date, ngayChot: ['2026-09-30', date, NGAY],
      ton: [dTon({ hex: '1', ct: 'CT25-059', v: 100 })],
      tonMoc: [dMoc({ d: '2026-09-30', ct: 'CT25-059', v: 90 }), dMoc({ d: date, ct: 'CT25-059', v: 100 }), dMoc({ d: NGAY, ct: 'CT25-059', v: 5000 })],
      psa: [dPsa({ hex: '1', ct: 'CT25-059', sln: 10 })],
      nhap: [dNhap({ ct: 'CT25-059', d: '2026-10-10', tt: 30 }), dNhap({ ct: 'CT25-059', d: '2026-10-20', tt: 9999 })],
      xuat: [dXuat({ ct: 'CT25-059', d: '2026-10-20', sl: 10, tt: 8888 })],
    }));
    assert.deepEqual(r.moc.map(m => m.d), ['2026-09-30', date]);
    assert.deepEqual(r.cuoiThang.map(m => m.d), ['2026-09-30', date]);
    assert.equal(r.ky.dong[0].nhap, 30);
    assert.equal(r.ky.dong[0].xuatTinh, 0);
    assert.equal(r.ky.dong[0].chuaDoiSoat, 20); // 90 + 30 − 100 − 0
    assert.equal(r.goiDung?.xuat, 0);
    assert.equal(r.tong.chuaXuat, 100);
  });
});

describe('đo theo lô và sổ sách', () => {
  it('vượt mốc và ra giữa 2 mốc cuối tháng', () => {
    const d0 = '2026-09-30';
    const r = tinhTonKhoV5(dauVao({
      ngayChot: [d0, NGAY],
      tonMoc: [
        dMoc({ d: d0, sap: 'A', nk: '2026-01-01', v: 100 }), dMoc({ d: NGAY, sap: 'A', nk: '2026-01-01', v: 70 }), // lô cũ giảm 30
        dMoc({ d: d0, sap: 'B', nk: '2026-03-20', v: 50 }), dMoc({ d: NGAY, sap: 'B', nk: '2026-03-20', v: 50 }), // 194 ngày -> 226 ngày: vượt mốc
        dMoc({ d: d0, sap: 'C', nk: '2026-09-01', v: 10 }), dMoc({ d: NGAY, sap: 'C', nk: '2026-09-01', v: 10 }), // lô mới
      ],
    }));
    assert.equal(r.cuoiThang[0].vuotMoc, null);
    assert.equal(r.cuoiThang[1].vuotMoc, 50);
    assert.equal(r.cuoiThang[1].ra, 30);
    assert.equal(r.goiCu.vao, 50);
    assert.equal(r.goiCu.ra, 30);
    assert.equal(r.goiCu.ngay, 32);
  });
  it('dư = đã phân loại + chưa rõ; lô chưa vào sổ tách lắp tại công trình', () => {
    const d0 = '2026-09-30';
    const r = tinhTonKhoV5(dauVao({
      ngayChot: [d0, NGAY],
      ton: [dTon({ hex: '1', sl: 5, v: 0 })],
      tonMoc: [dMoc({ d: d0, ct: 'CT25-001', v: 100 })],
      psa: [dPsa({ hex: '1', dg: 1e6 })],
      psaNhom: [dNhom({})],
      nhap: [dNhap({ d: '2026-10-05', sl: 0, tt: 300, gc: 'Lắp tại công trình' })],
    }));
    assert.equal(r.soSach.du, 400); // 100 + 300 − 0 − 0
    assert.equal(r.soSach.lapCongTrinh, 300);
    assert.equal(r.soSach.choVeKho, 0);
    assert.equal(r.soSach.chuaRo, 100);
    assert.equal(r.tong.duPhanLoai, 300);
    assert.equal(r.soSach.theoMa[0].ct, 'CT25-001');
    assert.equal(r.soSach.theoMa[0].du, 300 + 100);
    assert.deepEqual(r.soSach.kiemKe.map(k => k.ten.slice(0, 7)), ['Đơn huỷ', 'Trạng t', 'Đã rời ']);
  });
  it('đơn huỷ tách dòng riêng ở bảng gói', () => {
    const r = tinhTonKhoV5(dauVao({
      ton: [dTon({ hex: '1', v: 60, nk: '2026-01-01', gc: 'CT24-066' }), dTon({ hex: '2', sap: 'S2', v: 40, nk: '2026-01-01' })],
      psa: [dPsa({ hex: '1', tn: 'hủy' }), dPsa({ hex: '2' })],
    }));
    assert.deepEqual(r.goiCu.dong.map(g => [g.cu, !!g.huy]), [[60, true], [40, false]]);
    assert.equal(r.doiChieu.huy.soGhi, 'CT24-066');
    assert.equal(r.doiChieu.huy.cu, 60);
  });
  it('dữ liệu rỗng không lỗi', () => {
    const r = tinhTonKhoV5(dauVao({ ngayChot: [] }));
    assert.equal(r.tong.v, 0);
    assert.equal(r.goiDung, null);
    assert.deepEqual(r.cuoiThang, []);
    assert.equal(r.soSach.tu, null);
  });
});

describe('câu truy vấn', () => {
  const c = sqlTonKhoV5({
    date: NGAY, cuoiThang: ['2026-09-30', NGAY], giaTriTon: 's."gia_tri_num"', tienNhap: 'n."tt"', soLuongXuat: 'x."sl"',
    phamViTon: ps => { ps.push(['A']); return [`s.x = ANY($${ps.length}::text[])`]; },
    phamViPsa: ps => { ps.push(['B']); return [`xuong = ANY($${ps.length}::text[])`]; },
  });
  it('không dùng cột tinh_trang của PSA, đánh số tham số khớp', () => {
    for (const q of [c.ton, c.tonMoc, c.psa, c.luong]) {
      assert.ok(!/\btinh_trang\b/.test(q.sql), q.sql);
      const lon = Math.max(...[...q.sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1])));
      assert.equal(lon, q.params.length, q.sql);
    }
  });
  it('ghép dòng PSA gom và dòng HEX, nhập và xuất', () => {
    const v = ghepDauVaoV5(NGAY, [NGAY], {
      ton: [], tonMoc: [],
      psa: [{ hex: '1', sln: '5' }, { hex: null, gtd: '7', nhap_cap: '3', con: null }],
      luong: [{ loai: 'n', d: NGAY, sl: null, tt: '2' }, { loai: 'x', d: NGAY, co: '', sl: '1', tt: null }],
    });
    assert.equal(v.psa[0].sln, 5);
    assert.equal(v.psaNhom[0].nhapCap, 3);
    assert.equal(v.nhap[0].sl, null);
    assert.equal(v.xuat[0].tt, 0);
  });
});

describe('chi tiết từng con số', () => {
  const D0 = '2026-08-31', D1 = '2026-09-30';
  const ton: DongTon[] = [
    dTon({ ct: 'CT25-059', ten: 'GOI DUNG', hex: '1', sap: 'A1', nk: '2026-01-01', v: 500, sl: 5 }),
    dTon({ ct: 'CT25-059', ten: 'GOI DUNG', hex: '2', sap: 'A2', nk: '2026-10-01', v: 100, sl: 2 }),
    dTon({ ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', hex: '3', sap: 'B1', nk: '2026-08-01', v: 80, sl: 8 }),
    dTon({ ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', hex: '4', sap: 'B2', nk: '2026-05-20', v: 60, sl: 6 }),
    dTon({ ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', hex: '5', sap: 'B3', nk: null, v: 20, sl: 2 }),
    dTon({ ct: 'CT26-070', ten: 'GOI HUY', hex: '6', sap: 'C1', nk: '2026-02-01', v: 40, gc: 'chuyển CT24-066', sl: 4 }),
    dTon({ ct: 'TỒN', ten: 'UPLOAD AATN', hex: null, sap: 'X1', nk: '2025-01-01', v: 30, tkh: 'Đã xuất' }),
    dTon({ ct: 'CT26-080', ten: 'GOI KHONG PSA', hex: '99', sap: 'X2', nk: '2026-09-01', v: 25 }),
    dTon({ ct: 'CT26-090', ten: 'GOI RA', hex: '8', sap: 'E1', nk: '2026-10-10', v: 30, sl: 3 }),
    dTon({ ct: 'CT26-091', ten: 'GOI CHO', hex: '9', sap: 'F1', nk: '2026-10-10', v: 0, sl: 3 }),
    dTon({ ct: 'CT26-092', ten: 'GOI CHO 2', hex: '10', sap: 'F2', nk: '2026-10-10', v: 0, sl: 3 }),
    ...Array.from({ length: 11 }, (_, i) => dTon({ ct: `CT24-1${10 + i}`, ten: `GOI CU ${i}`, hex: String(200 + i), sap: `G${i}`, nk: '2025-12-01', v: 10 + i, sl: 1 })),
  ];
  const psa: DongPsa[] = [
    dPsa({ hex: '1', ct: 'CT25-059', ten: 'GOI DUNG', sln: 10 }), dPsa({ hex: '2', ct: 'CT25-059', ten: 'GOI DUNG', sln: 10 }),
    dPsa({ hex: '3', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', sln: 10, sld: 10 }), dPsa({ hex: '4', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', sln: 10, sld: 100, nsp: '05. BÀN' }),
    dPsa({ hex: '5', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', sln: 10 }), dPsa({ hex: '6', ct: 'CT26-070', ten: 'GOI HUY', tn: 'hủy' }),
    dPsa({ hex: '8', ct: 'CT26-090', ten: 'GOI RA', sln: 10 }), dPsa({ hex: '9', ct: 'CT26-091', ten: 'GOI CHO', sln: 10 }), dPsa({ hex: '10', ct: 'CT26-092', ten: 'GOI CHO 2', sln: 10 }),
    ...Array.from({ length: 11 }, (_, i) => dPsa({ hex: String(200 + i), ct: `CT24-1${10 + i}`, ten: `GOI CU ${i}`, sln: 10 })),
  ];
  const psaNhom: DongPsaNhom[] = [
    dNhom({ ct: 'CT25-059', ten: 'GOI DUNG', ipo: '01. ĐANG SẢN XUẤT', con: 70 }),
    dNhom({ ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', ipo: '01. ĐANG SẢN XUẤT', con: 33, gtd: 800, nhapCap: 300 }),
    dNhom({ ct: 'CT26-056', ten: 'NAM PHƯƠNG T2', ipo: '01. TẠM NGƯNG', ttda: 'ĐÓNG DỰ ÁN', con: 9, gtd: 200, nhapCap: 100 }),
    dNhom({ ct: 'CT26-070', ten: 'GOI HUY', tn: 'HÚY', con: 500 }),
  ];
  const dauTon = (d: string, a: DongTon[], daoLai: Record<string, number> = {}): DongMoc[] => a.filter(t => t.v).map(t => ({ d, sap: t.sap, ct: t.ct, ten: t.ten, nk: t.nk, v: daoLai[t.sap!] ?? t.v, sl: t.sl }));
  const tonGoc = ton.filter(t => t.ct !== 'CT26-090' && t.nk !== '2026-10-01');
  const tonMoc: DongMoc[] = [
    ...dauTon(D0, tonGoc, { A1: 600, B1: 90 }),
    ...dauTon(D1, tonGoc, { A1: 550 }),
    dMoc({ d: D1, ct: 'CT26-099', ten: 'GOI DA HET', sap: 'H1', nk: '2026-01-15', v: 45 }),
    ...dauTon(NGAY, ton),
  ];
  const nhap: DongNhap[] = [
    dNhap({ d: '2026-01-31', hex: '1', ct: 'CT25-059', ten: 'GOI DUNG', tt: 900 }),
    dNhap({ d: '2026-09-15', hex: '3', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', tt: 120 }),
    dNhap({ d: '2026-10-05', hex: '10', ct: 'CT26-092', ten: 'GOI CHO 2', sl: 0, tt: 75, gc: 'chờ giao block A' }),
    dNhap({ d: '2026-10-06', hex: '9', ct: 'CT26-091', ten: 'GOI CHO', sl: 0, tt: 44, gc: 'Lắp tại công trình' }),
    dNhap({ d: '2026-10-07', hex: null, ct: null, ten: null, tt: 13 }), // không có PSA
    dNhap({ d: '2026-10-08', hex: '8', ct: 'CT26-090', ten: 'GOI RA', tt: 90 }),
    ...Array.from({ length: 6 }, (_, i) => dNhap({ d: '2026-10-09', hex: String(300 + i), ct: `CT26-2${10 + i}`, ten: `GOI LE ${i}`, tt: 5 + i })),
  ];
  const xuat: DongXuat[] = [
    dXuat({ d: '2026-08-12', hex: '1', ct: 'CT25-059', ten: 'GOI DUNG', tt: 7, sl: 0 }),
    dXuat({ d: '2026-10-20', hex: '3', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', tt: 50, sl: 9 }),
    dXuat({ d: '2026-10-21', hex: '4', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', tt: 20, sl: 3 }),
    dXuat({ d: '2026-10-22', hex: '8', ct: 'CT26-090', ten: 'GOI RA', tt: 60, sl: 6 }),
    dXuat({ d: '2026-10-23', hex: '8', ct: 'CT26-090', ten: 'GOI RA', co: '', tt: 0, sl: 5, gc: 'giao phòng 301' }),
    dXuat({ d: '2026-10-23', hex: '1', ct: 'CT25-059', ten: 'GOI DUNG', co: '', tt: 0, sl: 9, gc: 'giao block B' }),
    dXuat({ d: '2026-10-24', hex: null, ct: null, ten: null, tt: 11, sl: 1 }), // không có PSA
  ];
  const input = dauVao({ ngayChot: [D0, D1, NGAY], ton, tonMoc, psa, psaNhom, nhap, xuat });
  const r = tinhTonKhoV5(input);
  const kiemSo = (ten: string, gt: number | null | undefined, yc: YeuCauChiTiet) => {
    const c = chiTietTonKhoV5(input, yc);
    assert.ok(Math.abs(c.tong - (gt ?? 0)) <= 0.01, `${ten}: payload ${gt}, chi tiết ${c.tong}`);
  };

  it('dữ liệu mẫu có đủ các trường hợp', () => {
    assert.equal(r.goiDung?.ct, 'CT25-059');
    assert.ok(r.goiCu.conLai.soGoi > 0);
    assert.ok(r.goiCu.ra > 0 && r.goiCu.vao > 0);
    assert.ok(r.soSach.lapCongTrinh > 0 && r.soSach.choVeKho > 0 && r.soSach.daRoiKho > 0 && r.soSach.chuaRo !== 0);
    assert.ok(r.doiChieu.huy.gt > 0 && r.doiChieu.khongPsa.gt > 0 && r.doiChieu.sapVuot.gt > 0);
    assert.ok(r.tong.chuaXuat4 > 0);
  });
  it('KPI và vấn đề cần trả lời', () => {
    kiemSo('tổng', r.tong.v, { loai: 'ton' });
    kiemSo('cũ', r.tong.cu, { loai: 'ton', tuoi: 'cu' });
    kiemSo('cũ 12', r.tong.cu12, { loai: 'ton', tuoi: 'cu12' });
    kiemSo('không ngày', r.tong.khongNgay, { loai: 'ton', tuoi: 'khong' });
    kiemSo('chưa xuất', r.tong.chuaXuat, { loai: 'chua_xuat' });
    kiemSo('từ 4 tháng', r.tong.chuaXuat4, { loai: 'chua_xuat', nhomTuoi: ['t46', 't6'] });
    kiemSo('dư', r.tong.du, { loai: 'du' });
    kiemSo('gói đứng yên', r.goiDung!.ton, { loai: 'ton', ct: r.goiDung!.ct });
    kiemSo('gói đứng yên cũ', r.goiDung!.cu, { loai: 'ton', ct: r.goiDung!.ct, tuoi: 'cu' });
    kiemSo('nhập lớn', r.soSach.theoMa.filter(m => m.ct && m.du > 0).reduce((s, m) => s + m.du, 0), { loai: 'du', lon: true });
    kiemSo('sắp vượt', r.doiChieu.sapVuot.gt, { loai: 'sap_vuot' });
    for (const x of r.doiChieu.sapVuot.theoDuAn) kiemSo(`sắp vượt ${x.duAn}`, x.gt, { loai: 'sap_vuot', duAn: [x.duAn] });
    kiemSo('huỷ', r.doiChieu.huy.gt, { loai: 'huy' });
    kiemSo('huỷ cũ', r.doiChieu.huy.cu, { loai: 'huy', cu: true });
    kiemSo('không PSA', r.doiChieu.khongPsa.gt, { loai: 'khong_psa' });
    kiemSo('không PSA cũ', r.doiChieu.khongPsa.cu, { loai: 'khong_psa', cu: true });
    for (const x of r.doiChieu.khongPsa.lonNhat) kiemSo(`không PSA ${x.ct}`, x.v, { loai: 'khong_psa', ct: x.ct });
  });
  it('mốc cuối tháng, diễn biến, so 2 mốc', () => {
    for (const c of r.cuoiThang) {
      kiemSo('tồn mốc', c.v, { loai: 'moc', d: c.d });
      kiemSo('cũ mốc', c.cu, { loai: 'moc', d: c.d, cu: true });
      kiemSo('gói', c.cuGoi, { loai: 'moc', d: c.d, cu: true, phan: 'goi' });
      kiemSo('còn lại', c.cu - c.cuGoi, { loai: 'moc', d: c.d, cu: true, phan: 'con' });
      if (c.vuotMoc !== null) kiemSo('vượt mốc', c.vuotMoc, { loai: 'vuot_moc', d: c.d });
      if (c.ra !== null) kiemSo('ra', c.ra, { loai: 'ra', d: c.d });
    }
    assert.ok(r.cuoiThang.some(c => (c.ra ?? 0) > 0));
    for (const m of r.moc) { kiemSo('lần chốt', m.v, { loai: 'moc', d: m.d }); kiemSo('lần chốt cũ', m.cu, { loai: 'moc', d: m.d, cu: true }); }
    for (let i = 1; i < r.moc.length; i++) {
      const a = r.moc[i - 1], b = r.moc[i];
      kiemSo('chênh tồn', b.v - a.v, { loai: 'so_moc', tu: a.d, den: b.d });
      kiemSo('chênh cũ', b.cu - a.cu, { loai: 'so_moc', tu: a.d, den: b.d, f: 'cu' });
    }
    const A = r.duAnMoc[0], B = r.duAnMoc[r.duAnMoc.length - 1];
    for (const k of new Set([...Object.keys(A.da), ...Object.keys(B.da)])) {
      kiemSo(`dự án ${k}`, (B.da[k]?.v ?? 0) - (A.da[k]?.v ?? 0), { loai: 'so_moc', tu: A.d, den: B.d, duAn: [k] });
      kiemSo(`dự án cũ ${k}`, (B.da[k]?.cu ?? 0) - (A.da[k]?.cu ?? 0), { loai: 'so_moc', tu: A.d, den: B.d, duAn: [k], f: 'cu' });
    }
    const c = chiTietTonKhoV5(input, { loai: 'so_moc', tu: A.d, den: B.d, duAn: ['Nam Phương'] });
    assert.deepEqual(c.cot.map(x => x.k).slice(-3), ['dau', 'cuoi', 'chenh']);
  });
  it('lũy kế gói, bảng dự án', () => {
    for (const g of r.soSanhGoi) {
      kiemSo('nhập lũy kế', g.nhapLuyKe.at(-1), { loai: 'nhap', ct: g.ct });
      kiemSo('xuất lũy kế', g.xuatLuyKe.at(-1), { loai: 'xuat_tinh', ct: g.ct });
      kiemSo('xuất 60', g.xuat60, { loai: 'xuat_tinh', ct: g.ct, xuat60: true });
      kiemSo('tồn gói', g.ton, { loai: 'ton', ct: g.ct });
      g.thang.forEach((t, i) => { if (g.nhapLuyKe[i] !== null) kiemSo('điểm lũy kế', g.nhapLuyKe[i], { loai: 'nhap', ct: g.ct, denThang: t }); });
    }
    for (const x of r.duAn) {
      const da = { duAn: [x.duAn] };
      kiemSo('tồn', x.ton, { loai: 'ton', ...da });
      kiemSo('≤ 6', x.moi, { loai: 'ton', tuoi: 'moi', ...da });
      kiemSo('> 6', x.cu, { loai: 'ton', tuoi: 'cu', ...da });
      kiemSo('không rõ', x.khongNgay, { loai: 'ton', tuoi: 'khong', ...da });
      for (const h of x.hang) kiemSo(`nhóm ${h.ten}`, h.v, { loai: 'ton', nsp: h.ten, ...da });
      kiemSo('đơn chưa nhập', x.donChuaNhap, { loai: 'don_chua_nhap', ...da });
      const dn = chiTietTonKhoV5(input, { loai: 'da_nhap', ...da });
      if (x.pctNhap !== null) assert.equal(Math.round(dn.tong / dn.phu![0].gt * 100), x.pctNhap);
      const dx = chiTietTonKhoV5(input, { loai: 'xuat_tinh', ...da });
      if (x.pctXuat !== null) assert.equal(Math.round(dx.tong / dx.phu![0].gt * 100), x.pctXuat);
    }
  });
  it('chưa xuất, hàng cũ theo gói, lô nhập', () => {
    for (const p of r.phanChia) { kiemSo(p.k, p.gt, { loai: 'phan_chia', nhom: p.k }); kiemSo(`${p.k} cũ`, p.cu, { loai: 'phan_chia', nhom: p.k, cu: true }); }
    for (const x of r.chuaXuatDuAn) {
      kiemSo('dự án', x.tong, { loai: 'chua_xuat', duAn: [x.duAn] });
      for (const k of ['t01', 't23', 't46', 't6', 'thieuBo', 'khong'] as const) kiemSo(k, x[k], { loai: 'chua_xuat', duAn: [x.duAn], nhomTuoi: [k] });
      kiemSo('≥ 4', x.t46 + x.t6, { loai: 'chua_xuat', duAn: [x.duAn], nhomTuoi: ['t46', 't6'] });
    }
    for (const g of r.goiCu.dong) {
      kiemSo(`gói ${g.ct}`, g.cu, { loai: 'goi_cu', ct: g.ct, huy: g.huy });
      if (!g.huy) kiemSo(`ra ${g.ct}`, g.ra93, { loai: 'goi_ra', ct: g.ct });
      if (g.xuat60 !== null) kiemSo(`xuất 60 ${g.ct}`, g.xuat60, { loai: 'xuat_tinh', ct: g.ct, xuat60: true });
    }
    kiemSo('gói còn lại', r.goiCu.conLai.cu, { loai: 'goi_cu', conLai: true });
    kiemSo('ra còn lại', r.goiCu.conLai.ra93, { loai: 'goi_ra', conLai: true });
    kiemSo('ra', r.goiCu.ra, { loai: 'goi_ra' });
    kiemSo('vào', r.goiCu.vao, { loai: 'goi_vao' });
    for (const c of r.loNhap.cot) {
      kiemSo(c.thang, c.tong, { loai: 'lo_nhap', thang: [c.thang] });
      kiemSo(`${c.thang} cũ`, c.cu, { loai: 'lo_nhap', thang: [c.thang], cu: true });
      for (const [s, gt] of Object.entries(c.theoDuAn)) kiemSo(`${c.thang} ${s}`, gt, { loai: 'lo_nhap', thang: [c.thang], seri: s });
    }
    for (const m of r.loNhap.moc6) {
      kiemSo('moc6', m.gt, { loai: 'moc6', moc: m.moc });
      for (const [s, gt] of Object.entries(m.theoDuAn)) kiemSo(`moc6 ${s}`, gt, { loai: 'moc6', moc: m.moc, seri: s });
    }
  });
  it('theo kỳ và nhập chưa khớp', () => {
    r.ky.dong.forEach((k, i) => {
      const tu = r.cuoiThang[i].d;
      kiemSo('nhập kỳ', k.nhap, { loai: 'nhap', tu, den: k.den });
      kiemSo('xuất kỳ', k.xuatTinh, { loai: 'xuat_tinh', tu, den: k.den });
      kiemSo('chưa đối soát', k.chuaDoiSoat, { loai: 'chua_doi_soat', den: k.den });
      kiemSo('tồn cuối kỳ', k.ton, { loai: 'moc', d: k.den });
    });
    const s = r.soSach;
    kiemSo('chờ về', s.choVeKho, { loai: 'so_sach', muc: 'cho_ve' });
    kiemSo('lắp', s.lapCongTrinh, { loai: 'so_sach', muc: 'lap_ct' });
    kiemSo('rời kho', s.daRoiKho, { loai: 'so_sach', muc: 'roi_kho' });
    kiemSo('chưa rõ', s.chuaRo, { loai: 'so_sach', muc: 'chua_ro' });
    for (const m of s.theoMa) kiemSo(`mã ${m.ct}`, m.du, m.ct ? { loai: 'du', ct: m.ct } : { loai: 'du', conLai: true });
    kiemSo('kk huỷ', s.kiemKe[0].gt, { loai: 'kiem_ke', muc: 'huy' });
    kiemSo('kk đã xuất', s.kiemKe[1].gt, { loai: 'kiem_ke', muc: 'da_xuat' });
    kiemSo('kk rời kho', s.kiemKe[2].gt, { loai: 'kiem_ke', muc: 'roi_kho' });
    assert.ok(s.kiemKe[1].gt > 0);
  });
  it('dòng thật đọc thêm cho cùng tổng, có chứng từ và hạng mục', () => {
    const c = chiTietTonKhoV5(input, { loai: 'xuat_tinh', ct: 'CT26-055' }, {
      xuat: [
        { ...dXuat({ d: '2026-10-20', hex: '3', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', tt: 30, sl: 5 }), ctu: 'PX1', hm: 'TỦ A' },
        { ...dXuat({ d: '2026-10-20', hex: '3', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', tt: 20, sl: 4 }), ctu: 'PX2', hm: 'TỦ A' },
        { ...dXuat({ d: '2026-10-21', hex: '4', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', co: 'tÍnh', tt: 20, sl: 3 }), ctu: 'PX3', hm: null },
        { ...dXuat({ d: '2026-10-21', hex: '4', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', co: '', tt: 99, sl: 3 }), ctu: 'PX4', hm: null }, // không TÍNH
        { ...dXuat({ d: '2026-11-02', hex: '4', ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', tt: 77, sl: 3 }), ctu: 'PX5', hm: null }, // sau ngày xem
      ],
      moTa: { hex: new Map([['4', { hm: 'BÀN B', xg: 'X1', nsp: '05. BÀN' }]]), sap: new Map() },
    });
    assert.equal(c.tong, 70);
    assert.deepEqual(c.rows.map(x => [x.ctu, x.hm, x.tt]), [['PX1', 'TỦ A', 30], ['PX2', 'TỦ A', 20], ['PX3', 'BÀN B', 20]]);
    const t = chiTietTonKhoV5(input, { loai: 'ton', ct: 'CT26-055', tuoi: 'moi' }, { moTa: { hex: new Map([['3', { hm: 'TỦ A', xg: 'X1', nsp: '03. TỦ' }]]), sap: new Map() } });
    assert.deepEqual(t.rows[0], { ct: 'CT26-055', ten: 'NAM PHƯƠNG T1', hex: '3', sap: 'B1', hm: 'TỦ A', nsp: 'TỦ', xuong: 'X1', nk: '2026-08-01', tuoi: 3, v: 80 });
    const d = chiTietTonKhoV5(input, { loai: 'du', ct: 'CT26-091' }, {
      tonNgay: { [D0]: [], [NGAY]: [] },
      nhap: [{ ...dNhap({ d: '2026-10-06', hex: '9', ct: 'CT26-091', tt: 44, sl: 0 }), ctu: null, hm: null }], xuat: [],
    });
    assert.deepEqual(d.rows.map(x => [x.hex, x.nhap, x.du]), [['9', 44, 44]]);
  });
  it('cắt 5000 dòng, tổng vẫn đủ, sắp giảm dần', () => {
    const lon = dauVao({ ton: Array.from({ length: 5200 }, (_, i) => dTon({ sap: `S${i}`, v: 1 + i / 1000 })) });
    const c = chiTietTonKhoV5(lon, { loai: 'ton' });
    assert.equal(c.soDong, 5200);
    assert.equal(c.rows.length, 5000);
    assert.equal(c.truncated, true);
    assert.equal(c.tong, tinhTonKhoV5(lon).tong.v);
    assert.equal(c.rows[0].v, 6.199);
  });
  it('2 cột mốc của So 2 mốc theo từng dự án', () => {
    for (const m of r.duAnMoc) for (const [k, x] of Object.entries(m.da)) {
      kiemSo(`${m.d} ${k}`, x.v, { loai: 'moc', d: m.d, duAn: [k] });
      kiemSo(`${m.d} ${k} cũ`, x.cu, { loai: 'moc', d: m.d, cu: true, duAn: [k] });
    }
    assert.ok(r.duAnMoc.some(m => Object.keys(m.da).length > 1));
  });
  it('"mới phân loại" và Nhập lớn theo dự án có danh sách riêng', () => {
    kiemSo('đã phân loại', r.tong.duPhanLoai, { loai: 'so_sach', muc: 'phan_loai' });
    const lon = r.soSach.theoMa.filter(m => m.ct && m.du > 0);
    assert.ok(lon.length > 0);
    for (const k of new Set(lon.map(m => m.duAn!))) {
      kiemSo(k, lon.filter(m => m.duAn === k).reduce((s, m) => s + m.du, 0), { loai: 'du', lon: true, duAn: [k] });
    }
  });
  it('ngày xem phải là 1 chuỗi ngày có thật', () => {
    assert.equal(laNgay('2026-11-01'), true);
    for (const x of ['2026-02-31', '2026-13-01', '01/11/2026', ['2026-11-01'], undefined, 20261101]) assert.equal(laNgay(x), false, JSON.stringify(x));
  });

  it('tham số sai bị chặn', () => {
    const sai = (q: Record<string, unknown>) => assert.throws(() => docYeuCauChiTiet(q), LoiChiTiet, JSON.stringify(q));
    sai({}); sai({ loai: 'xoa' }); sai({ loai: 'moc' }); sai({ loai: 'moc', d: '2026-13-45' }); sai({ loai: 'moc', d: "2026-01-01' OR 1=1" });
    sai({ loai: 'lo_nhap', thang: "x'; --" }); sai({ loai: 'kiem_ke', muc: 'khac' }); sai({ loai: 'nhap' }); sai({ loai: 'ton', ct: 'x'.repeat(65) });
    sai({ loai: 'ton', ct: ['a', 'b'] }); sai({ loai: 'so_moc', tu: '2026-02-01', den: '2026-01-01' }); sai({ loai: 'chua_xuat', nhomTuoi: 'x' });
    sai({ loai: 'nhap', tu: '2026-02-31', den: '2026-03-01' }); // ngày không có thật: không được rơi xuống SQL thành lỗi 500
    assert.deepEqual(docYeuCauChiTiet({ loai: 'chua_xuat', duAn: 'Nam Phương,Mini Hotel', nhomTuoi: ['t46', 't6'], date: '2026-11-01', xuong: 'A' }).duAn, ['Nam Phương', 'Mini Hotel']);
    assert.throws(() => chiTietTonKhoV5(input, { loai: 'moc', d: '2026-10-15' }), LoiChiTiet); // không phải ngày chốt
    assert.throws(() => chiTietTonKhoV5(input, { loai: 'ra', d: D0 }), LoiChiTiet); // mốc đầu không có kỳ
    assert.throws(() => chiTietTonKhoV5(input, { loai: 'moc6', moc: '2026-01-01' }), LoiChiTiet);
  });
  it('câu truy vấn đọc thêm đánh số tham số khớp', () => {
    const t = {
      date: NGAY, cuoiThang: [], giaTriTon: 's."g"', tienNhap: 'n."t"', soLuongXuat: 'x."s"',
      phamViTon: (ps: unknown[]) => { ps.push(['A']); return [`s.x = ANY($${ps.length}::text[])`]; },
      phamViPsa: (ps: unknown[]) => { ps.push(['B']); return [`xuong = ANY($${ps.length}::text[])`]; },
    };
    const ds = [
      sqlTonNgay(t, [D0, NGAY]), sqlDonPsa(t, ['CT1']), sqlDonPsa({ ...t, phamViPsa: null }, ['CT1']),
      sqlDongLuong(t, { loai: 'n', cts: ['CT1'], tu: D0, den: NGAY }), sqlDongLuong(t, { loai: 'x', cts: null, tu: null, den: null }),
      sqlDongLuong({ ...t, phamViPsa: null }, { loai: 'x', cts: ['CT1'], tu: D0, den: null }),
    ];
    for (const q of ds) {
      assert.ok(!/\btinh_trang\b/.test(q.sql), q.sql);
      const lon = Math.max(...[...q.sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1])));
      assert.equal(lon, q.params.length, q.sql);
    }
  });
});
