import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chuyenDoiTram, locTheoCheDo, cheDoTheoNgay, ngayCa, khoiCa, mocTuDong, coSuaNgay, laSuKienTram, dungBamTayKhiChuyen, noiCoMatTangCa,
} from '../src/server/xuong/tram.js';
import { tinhTrangThai } from '../src/server/xuong/state.js';
import { cuaSoTrongNgay, phanBoGioCong } from '../src/server/xuong/allocation.js';
import { doanCoMat } from '../src/server/xuong/chamCong.js';
import { pairKey, type LichCaRow, type SuKien } from '../src/server/xuong/types.js';

// Trạm quét theo tổ (docs/designs/xuong-tram-quet.md): sổ trạm → đoạn ở hàng, soNguoi có tên, doanChay, state

const LICH: LichCaRow[] = [
  { loaiCa: 'chinh', gioBatDau: '07:30', gioKetThuc: '15:45', nghi: [['11:30', '12:15']] },
  { loaiCa: 'ca1', gioBatDau: '16:15', gioKetThuc: '18:15', nghi: [] },
  { loaiCa: 'ca4', gioBatDau: '16:15', gioKetThuc: '06:00', nghi: [] },
];
const NGAY = '2026-10-13'; // thứ Ba
const t = (hhmm: string, ngay = NGAY) => Date.parse(`${ngay}T${hhmm}:00+07:00`);
const H = (h: number) => Math.round(h * 1000) / 1000;
const A = '250301895';
const B = '250301896';
const KA = pairKey(A, 'CD1');
const KB = pairKey(B, 'CD1');

let seq = 0;
const ev = (p: Partial<SuKien> & Pick<SuKien, 'loai'>, ts: number): SuKien => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  hex: null, congDoanId: null, toId: 1, soLuong: null, congDoanDenId: null, congDoanNguonId: null,
  xuongNguon: null, soNguoi: null, duLieu: null, ts, serverTs: ts, suaCho: null, ...p,
});
const vao = (mnv: string, hex: string, ts: number, toId = 1) =>
  ev({ loai: 'nguoi_vao', hex, congDoanId: 'CD1', toId, duLieu: { mnv, tram: true } }, ts);
const ra = (mnv: string, ts: number, hex: string | null = null) =>
  ev({ loai: 'nguoi_ra', hex, congDoanId: hex ? 'CD1' : null, duLieu: { mnv, tram: true } }, ts);
const raCa = (mnv: string, ts: number) =>
  ev({ loai: 'ra_ca', duLieu: { loaiCa: 'chinh', nguoi: [{ mnv }], mnv, tram: true } }, ts);
const vaoCa = (mnv: string, ts: number, tram = true) =>
  ev({ loai: 'vao_ca', duLieu: { loaiCa: 'chinh', nguoi: [{ mnv }], mnv, ...(tram ? { tram: true } : {}) } }, ts);
const nhan = (hex: string, sl: number, ts: number) => ev({ loai: 'nhan', hex, congDoanId: 'CD1', soLuong: sl }, ts);
const xong = (hex: string, sl: number, ts: number) => ev({ loai: 'hoan_thanh', hex, congDoanId: 'CD1', soLuong: sl }, ts);
const CUA_SO = { 1: cuaSoTrongNgay(NGAY, LICH, []) };
const CUOI_NGAY = t('23:00');

describe('chuyenDoiTram — người vào / ra hàng', () => {
  it('hai người vào cùng hàng, một người ra: soNguoi có tên theo thời gian, hàng chạy khi còn người', () => {
    const kq = chuyenDoiTram([vao('NV1', A, t('08:00')), vao('NV2', A, t('08:30')), ra('NV1', t('10:00')), ra('NV2', t('11:00'))],
      { now: CUOI_NGAY, cuaSoTheoTo: CUA_SO });
    assert.deepEqual(kq.soNguoi.map(x => [x.at, x.nguoi]), [
      [t('08:00'), ['NV1']], [t('08:30'), ['NV1', 'NV2']], [t('10:00'), ['NV2']], [t('11:00'), []],
    ]);
    assert.deepEqual(kq.doanChay[KA], [{ start: t('08:00'), end: t('11:00') }]);
    assert.deepEqual(kq.suKienGia[KA].map(e => [e.loai, e.ts]), [['bat_dau', t('08:00')], ['tam_ngung', t('11:00')]]);
    assert.deepEqual(kq.dangO, {});
  });

  it('đổi hàng: quét phiếu hàng B khi đang ở A → tự rời A tại mốc đó (hai lần vào chồng: lần sau thắng)', () => {
    const kq = chuyenDoiTram([vao('NV1', A, t('08:00')), vao('NV1', B, t('09:00'))], { now: t('10:00'), cuaSoTheoTo: CUA_SO });
    const [d1, d2] = kq.doanNguoi;
    assert.deepEqual([d1.key, d1.start, d1.end, d1.ketThuc], [KA, t('08:00'), t('09:00'), 'doi_hang']);
    assert.deepEqual([d2.key, d2.end], [KB, null]);
    assert.deepEqual(kq.dangO, { [KB]: ['NV1'] });
  });

  it('quét lại phiếu hàng đang ở: không mở đoạn mới', () => {
    const kq = chuyenDoiTram([vao('NV1', A, t('08:00')), vao('NV1', A, t('08:05'))], { now: t('09:00'), cuaSoTheoTo: CUA_SO });
    assert.equal(kq.doanNguoi.length, 1);
    assert.equal(kq.doanNguoi[0].start, t('08:00'));
  });

  it('ra ca đóng đoạn ở hàng', () => {
    const kq = chuyenDoiTram([vao('NV1', A, t('08:00')), raCa('NV1', t('14:00'))], { now: CUOI_NGAY, cuaSoTheoTo: CUA_SO });
    assert.deepEqual([kq.doanNguoi[0].end, kq.doanNguoi[0].ketThuc], [t('14:00'), 'ra']);
  });

  it('Xong hết số đã nhận: mọi người ra tại mốc Xong, không sinh tạm ngưng; Xong một phần không đổi ai', () => {
    const evts = [nhan(A, 10, t('07:45')), vao('NV1', A, t('08:00')), vao('NV2', A, t('08:00')),
      xong(A, 4, t('09:00')), xong(A, 6, t('10:00'))];
    const kq = chuyenDoiTram(evts, { now: CUOI_NGAY, cuaSoTheoTo: CUA_SO });
    assert.ok(kq.doanNguoi.every(d => d.end === t('10:00') && d.ketThuc === 'xong'));
    assert.deepEqual(kq.suKienGia[KA].map(e => e.loai), ['bat_dau']);
    // State: hàng thật Xong hết → chờ giao (không bị kẹt ở tạm ngưng)
    const own = [...evts.filter(e => e.loai === 'nhan' || e.loai === 'hoan_thanh'), ...kq.suKienGia[KA]];
    const st = tinhTrangThai(own, []);
    assert.equal(st.trangThai, 'cho_giao');
    assert.deepEqual(st.doanChay, [{ start: t('08:00'), end: t('10:00') }]);
  });

  it('mã NV sai hoặc sự kiện thường: bỏ qua', () => {
    const kq = chuyenDoiTram([ev({ loai: 'nguoi_vao', hex: A, congDoanId: 'CD1', duLieu: { mnv: '!' } }, t('08:00')),
      ev({ loai: 'bat_dau', hex: A, congDoanId: 'CD1', soNguoi: 3 }, t('08:00'))], { now: CUOI_NGAY });
    assert.equal(kq.doanNguoi.length, 0);
  });
});

describe('chuyenDoiTram — tự đóng cuối ca, ngoài ca, ca qua đêm', () => {
  it('quên ra: đoạn tự đóng ở cuối ca chính (15:45), cờ tự đóng; nghỉ trưa không cắt khối', () => {
    const kq = chuyenDoiTram([vao('NV1', A, t('08:00'))], { now: CUOI_NGAY, cuaSoTheoTo: CUA_SO });
    assert.deepEqual([kq.doanNguoi[0].end, kq.doanNguoi[0].ketThuc], [t('15:45'), 'tu_dong']);
    assert.deepEqual(kq.doanChay[KA], [{ start: t('08:00'), end: t('15:45') }]);
    // Chưa tới cuối ca: còn mở
    const dang = chuyenDoiTram([vao('NV1', A, t('08:00'))], { now: t('15:00'), cuaSoTheoTo: CUA_SO });
    assert.equal(dang.doanNguoi[0].end, null);
  });

  it('tổ có khai tăng ca 16:15: đoạn nối qua mốc chuyển ca, tự đóng ở cuối tăng ca', () => {
    const cs = { 1: cuaSoTrongNgay(NGAY, LICH, ['ca1']) };
    const kq = chuyenDoiTram([vao('NV1', A, t('14:00'))], { now: CUOI_NGAY, cuaSoTheoTo: cs });
    assert.equal(kq.doanNguoi[0].end, t('18:15'));
  });

  it('quét sớm 45 phút trước ca: vẫn trong khối; quét ngoài mọi ca: đoạn rỗng cờ ngoài ca, hàng không chạy', () => {
    const k = khoiCa(CUA_SO[1]);
    assert.equal(mocTuDong(k, t('06:45')).ngoaiCa, false);
    assert.equal(mocTuDong(k, t('19:00')).ngoaiCa, true);
    const kq = chuyenDoiTram([vao('NV1', A, t('19:00'))], { now: CUOI_NGAY, cuaSoTheoTo: CUA_SO });
    assert.deepEqual([kq.doanNguoi[0].end, kq.doanNguoi[0].ketThuc], [t('19:00'), 'ngoai_ca']);
    assert.equal(kq.doanChay[KA], undefined);
    assert.equal(kq.suKienGia[KA], undefined);
  });

  it('ca 4 qua đêm: quét 1h sáng thuộc ngày bắt đầu ca; đoạn tự đóng 06:00 hôm sau', () => {
    assert.equal(ngayCa(t('01:00', '2026-10-14')), NGAY);
    assert.equal(ngayCa(t('07:00', '2026-10-14')), '2026-10-14');
    const cs = { 1: cuaSoTrongNgay(NGAY, LICH, ['ca4']) };
    const kq = chuyenDoiTram([vao('NV1', A, t('22:00'))], { now: t('09:00', '2026-10-14'), cuaSoTheoTo: cs });
    assert.equal(kq.doanNguoi[0].end, t('06:00', '2026-10-14'));
  });
});

describe('chế độ tổ — hợp đồng chống hồi quy R3', () => {
  const cheDo = cheDoTheoNgay([{ toId: 1, cheDo: 'song_song', tuNgay: '2026-10-13' }, { toId: 1, cheDo: 'tram', tuNgay: '2026-10-20' }]);
  it('chế độ theo ngày ca; tổ chưa đổi = cu', () => {
    assert.equal(cheDo(1, '2026-10-12'), 'cu');
    assert.equal(cheDo(1, '2026-10-13'), 'song_song');
    assert.equal(cheDo(1, '2026-10-25'), 'tram');
    assert.equal(cheDo(2, '2026-10-25'), 'cu');
    assert.equal(cheDo(null, '2026-10-25'), 'cu');
  });

  const bamTay = [ev({ loai: 'bat_dau', hex: A, congDoanId: 'CD1', soNguoi: 3 }, t('08:00')), vaoCa('NV9', t('07:30'), false)];
  const tram = [vao('NV1', A, t('08:10')), vaoCa('NV1', t('07:31'))];

  it('(1) tổ cu: sự kiện trạm lạc bị bỏ qua — sổ còn lại y hệt bấm tay', () => {
    const cu = cheDoTheoNgay([]);
    assert.deepEqual(locTheoCheDo([...bamTay, ...tram], cu).map(e => e.id), bamTay.map(e => e.id));
  });
  it('(2) song song: chính thức = bấm tay; so khớp = chỉ sổ trạm', () => {
    assert.deepEqual(locTheoCheDo([...bamTay, ...tram], cheDo).map(e => e.id).sort(), bamTay.map(e => e.id).sort());
    assert.deepEqual(locTheoCheDo([...bamTay, ...tram], cheDo, 'so_khop').map(e => e.id).sort(), tram.map(e => e.id).sort());
  });
  it('tổ trạm: bỏ Bắt đầu / Tạm ngưng / Chia người bấm tay, giữ sổ trạm và điểm danh tay', () => {
    const ngay20 = (e: SuKien) => ({ ...e, ts: e.ts + 7 * 86_400_000, serverTs: e.serverTs + 7 * 86_400_000 });
    const kept = locTheoCheDo([...bamTay, ...tram].map(ngay20), cheDo).map(e => e.loai).sort();
    assert.deepEqual(kept, ['nguoi_vao', 'vao_ca', 'vao_ca']);
  });
  it('laSuKienTram: vao_ca tay không phải sự kiện trạm', () => {
    assert.equal(laSuKienTram(vaoCa('NV1', 0, false)), false);
    assert.equal(laSuKienTram(vaoCa('NV1', 0, true)), true);
  });

  it('(2) song song: giờ công chính thức không đổi khi có thêm sổ trạm', () => {
    const cs = cuaSoTrongNgay(NGAY, LICH, []);
    const tinh = (evts: SuKien[]) => {
      const st = tinhTrangThai(evts.filter(e => e.hex === A), []);
      return phanBoGioCong({
        cuaSo: cs, quanSo: { chinh: 3 }, doanChay: { [KA]: st.doanChay },
        soNguoi: evts.filter(e => e.loai === 'bat_dau').map(e => ({ key: KA, at: e.ts, soNguoi: e.soNguoi! })),
        now: CUOI_NGAY,
      });
    };
    const goc = tinh(bamTay);
    const coTram = tinh(locTheoCheDo([...bamTay, ...tram], cheDo));
    assert.deepEqual(coTram, goc);
  });
});

describe('chuyển tổ sang trạm: hạng mục còn chạy theo bấm tay', () => {
  const batDau = ev({ loai: 'bat_dau', hex: A, congDoanId: 'CD1', soNguoi: 3 }, t('08:00', '2026-10-12'));
  const moc = [{ toId: 1, cheDo: 'tram' as const, tuNgay: NGAY }];
  it('đang chạy lúc chuyển → tạm ngưng ở 06:00 ngày ca chuyển, rồi chạy theo người quét', () => {
    const gia = dungBamTayKhiChuyen([batDau], moc);
    assert.deepEqual(gia.map(e => [e.loai, e.ts]), [['tam_ngung', t('06:00')]]);
    const kq = chuyenDoiTram([vao('NV1', A, t('08:00'))], { now: t('09:00'), cuaSoTheoTo: CUA_SO });
    const st = tinhTrangThai([batDau, ...gia, ...kq.suKienGia[KA]], []);
    assert.equal(st.trangThai, 'dang_lam');
    assert.equal(st.doanChay[0].end, t('06:00'));
    assert.equal(st.doanChay[1].start, t('08:00'));
  });
  it('đã tạm ngưng / xong trước khi chuyển, hoặc tổ chưa chuyển: không thêm gì', () => {
    const ngung = ev({ loai: 'tam_ngung', hex: A, congDoanId: 'CD1', lyDoTamNgung: 'khac' }, t('15:00', '2026-10-12'));
    assert.deepEqual(dungBamTayKhiChuyen([batDau, ngung], moc), []);
    assert.deepEqual(dungBamTayKhiChuyen([batDau], []), []);
    assert.deepEqual(dungBamTayKhiChuyen([batDau], [{ toId: 1, cheDo: 'song_song', tuNgay: NGAY }]), []);
  });
});

describe('phân công đầu ca + tự gán (công nhân không thao tác)', () => {
  const HOM_QUA = '2026-10-12';
  const phanCong = (mnv: string, hex: string, ts: number) =>
    ev({ loai: 'nguoi_vao', hex, congDoanId: 'CD1', duLieu: { mnv, tram: true, phanCong: true } }, ts);
  const nhanHq = nhan(A, 10, t('07:00', HOM_QUA));

  it('phân công trước khi tới: có hiệu lực từ lúc vào ca; vắng cả ngày thì không tính', () => {
    const kq = chuyenDoiTram([phanCong('NV1', A, t('07:00')), phanCong('NV2', A, t('07:00')), vaoCa('NV1', t('07:40'))],
      { now: t('09:00'), cuaSoTheoTo: CUA_SO });
    assert.deepEqual(kq.doanNguoi.map(d => [d.mnv, d.start, d.nguon]), [['NV1', t('07:40'), 'phan_cong']]);
    assert.deepEqual(kq.dangO, { [KA]: ['NV1'] });
  });

  it('có mặt quá 30 phút chưa vào hàng nào: tự gán từ lúc vào ca vào hàng làm dở hôm trước', () => {
    const evts = [nhanHq, vao('NV1', A, t('08:00', HOM_QUA)), raCa('NV1', t('15:45', HOM_QUA)), vaoCa('NV1', t('07:30'))];
    const truoc = chuyenDoiTram(evts, { now: t('07:50'), cuaSoTheoTo: CUA_SO });
    assert.equal(truoc.doanNguoi.filter(d => d.nguon === 'tu_gan').length, 0); // chưa đủ 30 phút
    const kq = chuyenDoiTram(evts, { now: t('09:00'), cuaSoTheoTo: CUA_SO });
    const tg = kq.doanNguoi.find(d => d.nguon === 'tu_gan')!;
    assert.deepEqual([tg.key, tg.start, tg.end], [KA, t('07:30'), null]);
  });

  it('không tự gán khi: đã quét / được phân công trong 30 phút đầu, hàng hôm trước đã xong hết, không có hàng hôm trước', () => {
    const goc = [nhanHq, vao('NV1', A, t('08:00', HOM_QUA)), raCa('NV1', t('15:45', HOM_QUA)), vaoCa('NV1', t('07:30'))];
    const daQuet = chuyenDoiTram([...goc, vao('NV1', B, t('07:45'))], { now: t('09:00'), cuaSoTheoTo: CUA_SO });
    assert.equal(daQuet.doanNguoi.filter(d => d.nguon === 'tu_gan').length, 0);
    const daXong = chuyenDoiTram([...goc, xong(A, 10, t('15:00', HOM_QUA))], { now: t('09:00'), cuaSoTheoTo: CUA_SO });
    assert.equal(daXong.doanNguoi.filter(d => d.nguon === 'tu_gan').length, 0);
    const moi = chuyenDoiTram([vaoCa('NV9', t('07:30'))], { now: t('09:00'), cuaSoTheoTo: CUA_SO });
    assert.equal(moi.doanNguoi.length, 0);
  });

  it('tổ trưởng giữ nguyên hàng đang tự gán (phân công lại) = xác nhận: đoạn đổi nguồn, không mở đoạn mới', () => {
    const evts = [nhanHq, vao('NV1', A, t('08:00', HOM_QUA)), raCa('NV1', t('15:45', HOM_QUA)), vaoCa('NV1', t('07:30')),
      phanCong('NV1', A, t('10:00'))];
    const kq = chuyenDoiTram(evts, { now: t('11:00'), cuaSoTheoTo: CUA_SO });
    const homNay = kq.doanNguoi.filter(d => d.start >= t('07:00'));
    assert.deepEqual(homNay.map(d => [d.start, d.nguon]), [[t('07:30'), 'phan_cong']]);
  });

  it('tự gán rồi quét sang hàng khác: rời hàng tự gán tại mốc quét', () => {
    const evts = [nhanHq, vao('NV1', A, t('08:00', HOM_QUA)), raCa('NV1', t('15:45', HOM_QUA)), vaoCa('NV1', t('07:30')),
      vao('NV1', B, t('09:00'))];
    const kq = chuyenDoiTram(evts, { now: t('10:00'), cuaSoTheoTo: CUA_SO });
    const tg = kq.doanNguoi.find(d => d.nguon === 'tu_gan')!;
    assert.deepEqual([tg.end, tg.ketThuc], [t('09:00'), 'doi_hang']);
    assert.deepEqual(kq.dangO, { [KB]: ['NV1'] });
  });
});

describe('tăng ca ở tổ trạm: ở lại không quét lại thẻ', () => {
  it('người chưa ra ca được tính có mặt + giờ ở hàng trong tăng ca đã khai; người ra ca 15:45 thì không', () => {
    const cs = cuaSoTrongNgay(NGAY, LICH, ['ca1']);
    // NV3 chỉ đến làm tăng ca (quét thẻ vào ca1) → ca1 có điểm danh; NV1 ở lại từ ca chính không quét lại
    const vaoCa1 = ev({ loai: 'vao_ca', duLieu: { loaiCa: 'ca1', nguoi: [{ mnv: 'NV3' }], mnv: 'NV3', tram: true } }, t('16:10'));
    const evts = [vaoCa('NV1', t('07:30')), vaoCa('NV2', t('07:30')), vao('NV1', A, t('07:30')), vao('NV2', A, t('07:30')),
      raCa('NV2', t('15:45')), vaoCa1, vao('NV3', A, t('16:15')), raCa('NV1', t('18:15'))];
    const kq = chuyenDoiTram(evts, { now: CUOI_NGAY, cuaSoTheoTo: { 1: cs } });
    const coMat = noiCoMatTangCa(doanCoMat(evts), cs);
    assert.deepEqual(coMat.ca1?.map(d => [d.mnv, d.start, d.end]), [['NV3', t('16:10'), null], ['NV1', t('16:15'), t('18:15')]]);
    const pb = phanBoGioCong({ cuaSo: cs, quanSo: {}, doanChay: kq.doanChay, soNguoi: kq.soNguoi, coMat, now: CUOI_NGAY });
    assert.equal(pb.theoNguoi.NV1.congTangCa, 2);
    assert.equal(pb.theoNguoi.NV2.congTangCa, 0);
    assert.equal(pb.theoNguoi.NV3.congTangCa, 2);
    // Không nối thì giờ tăng ca mất (lỗi trước khi sửa)
    const sai = phanBoGioCong({ cuaSo: cs, quanSo: {}, doanChay: kq.doanChay, soNguoi: kq.soNguoi, coMat: doanCoMat(evts), now: CUOI_NGAY });
    assert.equal(sai.theoNguoi.NV1?.congTangCa ?? 0, 0);
  });
});

describe('tổ trạm → allocation (không đổi thuật toán)', () => {
  it('giờ công theo người = các đoạn ở hàng cắt theo cửa sổ ca; người vào ca không ở hàng nào là giờ chờ', () => {
    const evts = [vaoCa('NV1', t('07:20')), vaoCa('NV2', t('07:25')), vao('NV1', A, t('07:30')), vao('NV2', B, t('07:30')),
      vao('NV2', A, t('09:30')), ra('NV2', t('10:30')), raCa('NV1', t('11:30')), raCa('NV2', t('11:30'))];
    const kq = chuyenDoiTram(evts, { now: CUOI_NGAY, cuaSoTheoTo: CUA_SO });
    const coMat = doanCoMat(evts);
    const pb = phanBoGioCong({
      cuaSo: cuaSoTrongNgay(NGAY, LICH, []), quanSo: {}, doanChay: kq.doanChay, soNguoi: kq.soNguoi, coMat, now: CUOI_NGAY,
    });
    assert.equal(pb.theoNguoi.NV1.congThuong, 4);
    assert.equal(pb.theoNguoi.NV1.theoHangMuc[KA], 4);
    assert.equal(pb.theoNguoi.NV2.theoHangMuc[KB], 2);
    assert.equal(pb.theoNguoi.NV2.theoHangMuc[KA], 1);
    assert.equal(pb.theoNguoi.NV2.cho, 1);
    assert.equal(H(pb.theoHangMuc[KA].gioCongThuong), 5);
  });

  it('hai trạm cùng ghi vào ca cho một người: giữ lần sớm nhất, giờ có mặt không nhân đôi', () => {
    const coMat = doanCoMat([vaoCa('NV1', t('07:30')), vaoCa('NV1', t('07:40'))]);
    assert.equal(coMat.chinh!.length, 1);
    assert.equal(coMat.chinh![0].start, t('07:30'));
  });
});

describe('coSuaNgay — cờ màn Sửa ngày', () => {
  it('khoảng trống > 30 phút, đoạn > 4 giờ, tự đóng, vào ca không vào hàng', () => {
    const kq = chuyenDoiTram([vao('NV1', A, t('07:30')), ra('NV1', t('08:00')), vao('NV1', B, t('09:00'))],
      { now: CUOI_NGAY, cuaSoTheoTo: CUA_SO });
    const co = coSuaNgay(kq.doanNguoi, [{ start: t('07:30'), end: t('15:45') }], CUOI_NGAY);
    assert.deepEqual(co, ['doan_dai', 'khoang_trong', 'tu_dong']);
    assert.deepEqual(coSuaNgay([], [{ start: t('07:30'), end: null }], CUOI_NGAY), ['khong_vao_hang']);
    const gon = chuyenDoiTram([vao('NV1', A, t('07:30')), raCa('NV1', t('11:00'))], { now: CUOI_NGAY, cuaSoTheoTo: CUA_SO });
    assert.deepEqual(coSuaNgay(gon.doanNguoi, [{ start: t('07:30'), end: t('11:00') }], CUOI_NGAY), []);
  });
});
