import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chuanTen, goiYMaBop, maCongDoan, chonViTri, dungBanDo, taoNguonBanDo, verBanDo, BAN_DO_TAT,
  type CongDoanViTri, type DongViTri,
} from '../src/server/xuong/viTriBop.js';
import type { SuKien } from '../src/server/xuong/types.js';

// Chạy: npm test. Không kết nối DB (nguồn bản đồ dùng truy vấn giả).
// Ghi chú: phủ hay không theo mã PC (P001/P002 vẫn phủ khi đã triển khai; P022/P025/GCVT/HỦY không phủ) nằm ở
// frontend viTriMra.ts — ở đây chỉ kiểm bản đồ hex -> vị trí.

const cd = (id: string, xuong: string, tenCd: string, cdChiTiet: string, thuTu: number, laBaoBi = false, maBop: string | null = null): CongDoanViTri =>
  ({ id, xuong, tenCd, cdChiTiet, thuTu, laBaoBi, maBop });
// Tên thật trong danh mục MRA
const DM = [
  cd('LAM', '2A', '2A-MÁY', 'LAMINATE', 1),
  cd('EPN', '2A', '2A-MÁY', 'ÉP NGUỘI', 2),
  cd('CNC2', '2A', '2A-MÁY', 'CNC X2', 5),
  cd('SON2', '2A', '2A-MỘC', 'SƠN', 6),
  cd('MTG', '4A', '4A-MÁY', 'MÁY TINH GỖ 1', 2),
  cd('MOC1', '4A', '4A-MỘC', 'MỘC 1', 3),
  cd('VEC', '4A', '4A-VECNI', 'VECNI 3', 1),
  cd('FIT', '4A', '4A-FITTING', 'FITTING X4', 4),
  cd('BB', '4A', '4A-BAO BÌ', 'BAO BÌ', 0, true),
  cd('GN4', '4A', 'GIAO NHẬN', 'GN-XƯỞNG 4A', 0),
  cd('RES', '8AB', '8AB-KIM LOẠI', 'KHẮC LASER', 3),
];
const theoId = new Map(DM.map(x => [x.id, x]));

let soId = 0;
const sk = (loai: SuKien['loai'], hex: string, them: Partial<SuKien> = {}): SuKien => ({
  id: String(++soId), loai, hex, congDoanId: null, toId: null, soLuong: null, congDoanDenId: null, congDoanNguonId: null,
  xuongNguon: null, soNguoi: null, duLieu: null, ts: soId * 1000, serverTs: Date.UTC(2026, 10, 1) + soId * 1000, suaCho: null, ...them,
});
const trienKhai = (hex: string, sl = 2, tuyen: string[] = []) => sk('trien_khai', hex, { soLuong: sl, duLieu: { xuong: '4A', tuyen } });
const dong = (hex: string, congDoanId: string, trangThai: string, them: Partial<DongViTri> = {}): DongViTri => ({
  hex, congDoanId, xuong: theoId.get(congDoanId)?.xuong ?? null, trangThai, slNhan: trangThai === 'cho_nhan' ? 0 : 2,
  suKienCuoi: '2026-11-01T00:00:00.000Z', dangChayTu: null, ...them,
});

describe('chuanTen / goiYMaBop', () => {
  it('bỏ dấu, viết hoa, bỏ tiền tố xưởng', () => {
    assert.equal(chuanTen('4A-máy  tinh   gỗ'), 'MAY TINH GO');
    assert.equal(chuanTen('8AB-KIM LOẠI'), 'KIM LOAI');
    assert.equal(chuanTen('ĐÁ'), 'DA');
  });
  it('đủ bảng từ khoá, có dấu và không dấu', () => {
    const bang: Array<[string, string]> = [
      ['BAO BÌ', 'P021'], ['FITTING X4', 'P020'], ['DẶM VÁ 1', 'P020'], ['DÁN MOUSSE HÀNG LOẠT', 'P020'],
      ['VECNI 3', 'P018'], ['SƠN', 'P018'], ['UV', 'P018'], ['PVD', 'P018'],
      ['MỘC 1', 'P016'], ['LẮP RÁP 10', 'P016'], ['HÀN1', 'P016'], ['NGUỘI 2', 'P016'], ['MAY_01', 'P016'], ['BỌC NỆM 1', 'P016'],
      ['TINH TẤM', 'P014'], ['CNC X2', 'P014'], ['CHÀ NHÁM GỖ', 'P014'], ['CTS GỖ 1', 'P014'],
      ['CẮT', 'P013'], ['LAMINATE', 'P013'], ['ÉP NÓNG', 'P013'], ['PHÔI TẤM INLAY', 'P013'], ['VÁN LẠNG CT', 'P013'],
      ['VAN LANG OEM', 'P013'], ['moc sofa 2', 'P016'],
    ];
    for (const [ten, ma] of bang) assert.equal(goiYMaBop(ten, null, false), ma, ten);
    assert.equal(goiYMaBop('GN-XƯỞNG 4A', 'GIAO NHẬN', false), 'GIU_TRUOC');
  });
  it('tên thật dễ nhầm: máy tinh là P014, ép nguội là P013', () => {
    assert.equal(goiYMaBop('MÁY TINH GỖ 1', '4A-MÁY', false), 'P014');
    assert.equal(goiYMaBop('ÉP NGUỘI', '2A-MÁY', false), 'P013');
  });
  it('cd_chi_tiet thắng ten_cd; ten_cd "4A-MÁY" không bị hiểu là may', () => {
    assert.equal(goiYMaBop('SƠN', '2A-MỘC', false), 'P018');
    assert.equal(goiYMaBop('CHẠM', '4A-MỘC', false), 'P016');
    assert.equal(goiYMaBop('KHẮC LASER', '2A-MÁY', false), null);
  });
  it('la_bao_bi và ma_bop ghi đè', () => {
    assert.equal(goiYMaBop('ĐÓNG GÓI', 'X', true), 'P021');
    assert.equal(goiYMaBop('MỘC 1', '4A-MỘC', true, 'P018'), 'P018');
    assert.equal(goiYMaBop('MỘC 1', '4A-MỘC', false, 'sai'), 'P016');
  });
  it('tên lạ ra null', () => {
    assert.equal(goiYMaBop('MẠ VÀNG', '8AB-KIM LOẠI', false), null);
    assert.equal(goiYMaBop('TRÁNG GƯƠNG', '8C-KÍNH', false), null);
  });
});

describe('maCongDoan (giao nhận)', () => {
  const gn = theoId.get('GN4')!;
  it('giao nhận lấy mã công đoạn trước theo tuyến', () => {
    assert.equal(maCongDoan(gn, DM, [['MOC1', 'FIT', 'GN4']], theoId), 'P020');
  });
  it('không có tuyến: lấy công đoạn cùng xưởng thu_tu nhỏ hơn', () => {
    const gnGiua = { ...gn, thuTu: 3.5 };
    assert.equal(maCongDoan(gnGiua, DM), 'P016');
  });
  it('giao nhận đầu tuyến ra P013', () => {
    assert.equal(maCongDoan(gn, DM), 'P013');
    assert.equal(maCongDoan(gn, DM, [['GN4', 'MOC1']], theoId), 'P013');
  });
});

describe('chonViTri', () => {
  const vao = (hex: string, ds: DongViTri[], ev: SuKien[]) => ({ dong: ds, suKien: ev, cdTheoId: theoId, dsCongDoan: DM });

  it('song song P016 và P018 ra P016', () => {
    const v = chonViTri(vao('A', [dong('A', 'VEC', 'dang_lam'), dong('A', 'MOC1', 'da_nhan')], [trienKhai('A')]));
    assert.equal(v?.ma, 'P016');
    assert.deepEqual(v?.cd, ['MỘC 1']);
    assert.equal(v?.trangThai, 'da_nhan');
  });
  it('bằng hạng thì chọn tu cũ nhất', () => {
    const v = chonViTri(vao('B', [
      dong('B', 'MOC1', 'da_nhan', { suKienCuoi: '2026-11-05T00:00:00.000Z' }),
      dong('B', 'EPN', 'tam_ngung', { suKienCuoi: '2026-11-02T00:00:00.000Z' }),
      dong('B', 'LAM', 'cho_giao', { suKienCuoi: '2026-11-03T00:00:00.000Z' }),
    ], [trienKhai('B')]));
    assert.equal(v?.ma, 'P013');
    assert.equal(v?.tu, '2026-11-02T00:00:00.000Z');
    assert.deepEqual([...(v?.cd ?? [])].sort(), ['LAMINATE', 'ÉP NGUỘI'].sort());
  });
  it('toàn chờ nhận (sl_nhan = 0) ra P012, tu = thao tác cũ nhất', () => {
    const v = chonViTri(vao('C', [
      dong('C', 'MOC1', 'cho_nhan', { suKienCuoi: '2026-11-04T00:00:00.000Z' }),
      dong('C', 'LAM', 'cho_nhan', { suKienCuoi: '2026-11-03T00:00:00.000Z' }),
    ], [trienKhai('C')]));
    assert.equal(v?.ma, 'P012');
    assert.equal(v?.tu, '2026-11-03T00:00:00.000Z');
    assert.equal(v?.trangThai, 'cho_nhan');
  });
  it('chờ nhận nhưng đã có dòng xong: không ép P012', () => {
    const v = chonViTri(vao('C2', [dong('C2', 'LAM', 'xong'), dong('C2', 'MOC1', 'cho_nhan')], [trienKhai('C2')]));
    assert.equal(v?.ma, 'P016');
  });
  it('triển khai chưa có dòng ra P012, tu = server_ts triển khai gần nhất', () => {
    const t1 = trienKhai('D', 1), t2 = trienKhai('D', 1);
    const v = chonViTri(vao('D', [], [t1, t2]));
    assert.equal(v?.ma, 'P012');
    assert.equal(v?.trangThai, 'trien_khai');
    assert.equal(v?.tu, new Date(t2.serverTs).toISOString());
  });
  it('huỷ hết triển khai ra null', () => {
    const t = trienKhai('E');
    assert.equal(chonViTri(vao('E', [], [t, sk('huy', 'E', { suaCho: t.id })])), null);
  });
  it('toàn xong ra null và đếm giữ PC', () => {
    let giu = 0;
    const v = chonViTri(vao('F', [dong('F', 'LAM', 'xong'), dong('F', 'BB', 'xong')], [trienKhai('F')]), { giuPc: () => { giu++; } });
    assert.equal(v, null);
    assert.equal(giu, 1);
  });
  it('CĐ tên lạ + CĐ có mã: chọn CĐ có mã, tên lạ vào chuaNoi', () => {
    const chuaNoi = new Set<string>();
    const v = chonViTri(vao('G', [dong('G', 'RES', 'dang_lam'), dong('G', 'VEC', 'da_nhan')], [trienKhai('G')]), { chuaNoi });
    assert.equal(v?.ma, 'P018');
    assert.deepEqual([...chuaNoi], ['KHẮC LASER']);
  });
  it('mọi dòng tên lạ: giữ PC (null)', () => {
    assert.equal(chonViTri(vao('G2', [dong('G2', 'RES', 'dang_lam')], [trienKhai('G2')])), null);
  });
  it('tu theo dang_lam = dang_chay_tu', () => {
    const v = chonViTri(vao('H', [dong('H', 'CNC2', 'dang_lam', {
      dangChayTu: '2026-10-20T00:00:00.000Z', suKienCuoi: '2026-11-06T00:00:00.000Z',
    })], [trienKhai('H')]));
    assert.equal(v?.ma, 'P014');
    assert.equal(v?.tu, '2026-10-20T00:00:00.000Z');
  });
});

describe('dungBanDo', () => {
  it('gom theo hex, thống kê chuaNoi / giuPc', () => {
    const { map, thongKe } = dungBanDo(
      [dong('A', 'MOC1', 'dang_lam'), dong('B', 'LAM', 'xong'), dong('C', 'RES', 'da_nhan'), dong('C', 'FIT', 'cho_nhan', { slNhan: 1 })],
      [trienKhai('A'), trienKhai('B'), trienKhai('C'), trienKhai('D')], DM);
    assert.deepEqual(Object.keys(map).sort(), ['A', 'C', 'D']);
    assert.equal(map.A.ma, 'P016');
    assert.equal(map.C.ma, 'P020');
    assert.equal(map.D.ma, 'P012');
    assert.deepEqual(thongKe, { soHex: 3, chuaNoi: ['KHẮC LASER'], giuPc: 1 });
  });
});

describe('nguồn bản đồ', () => {
  it("chế độ 'off' khi chưa có DB MRA riêng: không truy vấn", async () => {
    let soLan = 0;
    const lay = taoNguonBanDo({ tat: () => true, q: async () => { soLan++; return { rows: [] }; } });
    const ban = await lay();
    assert.equal(ban, BAN_DO_TAT);
    assert.equal(ban.ver, 'off');
    assert.deepEqual(ban.map, {});
    assert.equal(soLan, 0);
  });
  it('dựng từ DB giả, nhớ 30 giây, ver theo nội dung', async () => {
    let now = 1_000_000;
    const lenh: string[] = [];
    const q = async (sql: string) => {
      lenh.push(sql);
      if (sql.includes('count(*)')) return { rows: [{ n: 1, m: '2026-11-01T00:00:00Z' }] };
      if (sql.includes('information_schema')) return { rows: [] };
      // Lệnh sự kiện cũng có xuong_trang_thai (NOT EXISTS) => xét trước
      if (sql.includes('FROM xuong_su_kien e')) return { rows: [{ id: 1, loai: 'trien_khai', hex: 'A', so_luong: 2, du_lieu: {}, device_ts_hieu_chinh: '2026-11-01T00:00:00Z', server_ts: '2026-11-01T00:00:00Z' }] };
      if (sql.includes('FROM xuong_cong_doan')) return { rows: [{ id: 'MOC1', xuong: '4A', ten_cd: '4A-MỘC', cd_chi_tiet: 'MỘC 1', thu_tu: 3, la_bao_bi: false }] };
      if (sql.includes('FROM xuong_trang_thai t')) return { rows: [{ hex: 'A', cong_doan_id: 'MOC1', xuong: '4A', trang_thai: 'dang_lam', sl_nhan: 2, su_kien_cuoi: '2026-11-02T00:00:00Z', dang_chay_tu: '2026-11-01T00:00:00Z' }] };
      return { rows: [] };
    };
    const lay = taoNguonBanDo({ tat: () => false, q, bayGio: () => now });
    const [b1, b1b] = await Promise.all([lay(), lay()]);
    assert.equal(b1, b1b);
    assert.equal(b1.map.A.ma, 'P016');
    assert.equal(b1.map.A.tu, '2026-11-01T00:00:00.000Z');
    assert.match(b1.ver, /^[0-9a-f]{16}$/);
    const soLenh = lenh.length;
    now += 10_000;
    assert.equal(await lay(), b1);
    assert.equal(lenh.length, soLenh);
    // Quá 30 giây: chỉ dò phiên bản, không đổi => giữ bản cũ
    now += 30_000;
    assert.equal(await lay(), b1);
    assert.equal(lenh.length, soLenh + 1);
  });
});

describe('nguồn bản đồ: lỗi, dò sự kiện, giữ PC, ver', () => {
  const taoQ = (o: { loi?: () => boolean; e?: () => string; tu?: () => string; giu?: number }) => {
    const lenh: string[] = [];
    const q = async (sql: string) => {
      lenh.push(sql);
      if (o.loi?.()) throw new Error('supabase lỗi');
      if (sql.includes('count(*)')) return { rows: [{ n: 1, m: '2026-11-01T00:00:00Z', e: o.e?.() ?? null }] };
      if (sql.includes('bool_and')) return { rows: [{ so_giu: o.giu ?? 0 }] };
      if (sql.includes('information_schema')) return { rows: [] };
      if (sql.includes('FROM xuong_su_kien e')) return { rows: [{ id: 1, loai: 'trien_khai', hex: 'A', so_luong: 2, du_lieu: {}, device_ts_hieu_chinh: '2026-11-01T00:00:00Z', server_ts: '2026-11-01T00:00:00Z' }] };
      if (sql.includes('FROM xuong_cong_doan')) return { rows: [{ id: 'MOC1', xuong: '4A', ten_cd: '4A-MỘC', cd_chi_tiet: 'MỘC 1', thu_tu: 3, la_bao_bi: false }] };
      if (sql.includes('FROM xuong_trang_thai t')) return { rows: [{ hex: 'A', cong_doan_id: 'MOC1', xuong: '4A', trang_thai: 'da_nhan', sl_nhan: 2, su_kien_cuoi: o.tu?.() ?? '2026-11-02T01:00:00Z', dang_chay_tu: null }] };
      return { rows: [] };
    };
    return { q, lenh };
  };

  it('lần dò sau lỗi: trả bản cũ, chờ 30 giây mới thử lại', async () => {
    let now = 1_000_000; let loi = false;
    const { q, lenh } = taoQ({ loi: () => loi });
    const lay = taoNguonBanDo({ tat: () => false, q, bayGio: () => now });
    const b1 = await lay();
    loi = true; now += 31_000;
    assert.equal(await lay(), b1);
    const n = lenh.length;
    now += 10_000;
    assert.equal(await lay(), b1);
    assert.equal(lenh.length, n); // chưa thử lại
  });

  it('chưa có bản nào mà lỗi: ném lỗi, không truy vấn lại trong 30 giây', async () => {
    let now = 1_000_000; let loi = true;
    const { q, lenh } = taoQ({ loi: () => loi });
    const lay = taoNguonBanDo({ tat: () => false, q, bayGio: () => now });
    await assert.rejects(lay());
    const n = lenh.length;
    now += 5_000;
    await assert.rejects(lay());
    assert.equal(lenh.length, n);
    loi = false; now += 30_000;
    assert.equal((await lay()).map.A.ma, 'P016');
  });

  it('sự kiện triển khai / huỷ mới (chưa đổi xuong_trang_thai) => dựng lại', async () => {
    let now = 1_000_000; let e = '2026-11-01T00:00:00Z';
    const { q, lenh } = taoQ({ e: () => e });
    const lay = taoNguonBanDo({ tat: () => false, q, bayGio: () => now });
    await lay();
    now += 31_000;
    let n = lenh.length;
    await lay();
    assert.equal(lenh.length, n + 1); // chỉ dò
    e = '2026-11-01T00:05:00Z'; now += 31_000; n = lenh.length;
    await lay();
    assert.ok(lenh.length > n + 1); // dựng lại
  });

  it('giuPc lấy từ truy vấn riêng', async () => {
    const { q } = taoQ({ giu: 7 });
    const b = await taoNguonBanDo({ tat: () => false, q, bayGio: () => 1 })();
    assert.equal(b.thongKe.giuPc, 7);
  });

  it('ver không đổi khi chỉ trạng thái / giờ trong ngày của tu đổi; đổi khi sang ngày', () => {
    const v = (trangThai: string, tu: string) => verBanDo({ A: { ma: 'P016', tu, cd: ['MỘC 1'], trangThai } });
    assert.equal(v('da_nhan', '2026-11-02T01:00:00Z'), v('dang_lam', '2026-11-02T08:30:00Z'));
    assert.notEqual(v('da_nhan', '2026-11-02T01:00:00Z'), v('da_nhan', '2026-11-03T01:00:00Z'));
    assert.notEqual(verBanDo({ A: { ma: 'P016', tu: null, cd: [], trangThai: 'x' } }), verBanDo({ A: { ma: 'P018', tu: null, cd: [], trangThai: 'x' } }));
  });
});

describe('goiYMaBop: tên không có từ khoá chung', () => {
  it('gán theo đúng cả tên', () => {
    assert.equal(goiYMaBop('DÁN CẠNH', '2A-MÁY', false), 'P014');
    assert.equal(goiYMaBop('TUBI', '2A-MÁY', false), 'P014');
    assert.equal(goiYMaBop('KÍNH', '8C-KÍNH', false), 'P014');
    assert.equal(goiYMaBop('ĐÁ', '8C-ĐÁ', false), 'P014');
    assert.equal(goiYMaBop('ĐỒNG NHÔM', '8AB-KIM LOẠI', false), 'P016');
    assert.equal(goiYMaBop('RESIN', '8AB-KIM LOẠI', false), 'P018');
  });
  it('"ĐÁ" chỉ khớp cả tên: cắt da vải vẫn là ra phôi', () => {
    assert.equal(goiYMaBop('CẮT DA VẢI', '5A-SOFA', false), 'P013');
  });
});
