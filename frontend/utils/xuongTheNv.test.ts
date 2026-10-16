import { describe, it, expect } from 'vitest';
import { docMaQuet, caChoLanQuet, daHetCa, ngayCa, vaoHang, raHang, raCa, vaoCa, hangCua, daVaoCa, xongHang, type LichCaTram, type BangTram } from './xuongTheNv';

// Màn trạm quét (docs/designs/xuong-tram-quet.md): phân loại lần quét, ca của lần quét thẻ, bảng ai ở hàng nào

const biet = (m: string) => ['AO0001', 'AAF7615'].includes(m);

describe('docMaQuet — thẻ NV hay phiếu PTHSP', () => {
  it('mã NV trần (kể cả chữ thường / khoảng trắng) có trong danh sách → thẻ', () => {
    expect(docMaQuet('ao0001', biet)).toEqual({ loai: 'the', mnv: 'AO0001', biet: true });
    expect(docMaQuet(' AAF 7615 ', biet)).toEqual({ loai: 'the', mnv: 'AAF7615', biet: true });
  });
  it('QR đường dẫn / chuỗi có mã NV', () => {
    expect(docMaQuet('https://hr.example/nv?mnv=AO0001', biet)).toEqual({ loai: 'the', mnv: 'AO0001', biet: true });
    expect(docMaQuet('AA CORP|AO0001|Dang Minh Binh', biet)).toEqual({ loai: 'the', mnv: 'AO0001', biet: true });
  });
  it('phiếu PTHSP: mã 9 số trần hoặc trong đường dẫn', () => {
    expect(docMaQuet('260307510', biet)).toEqual({ loai: 'phieu', hex: '260307510' });
    expect(docMaQuet('https://app/hex/260307510?x=1', biet)).toEqual({ loai: 'phieu', hex: '260307510' });
  });
  it('thẻ lạ (dạng mã NV, không có trong danh sách) → thẻ chưa biết; rác → không rõ', () => {
    expect(docMaQuet('AO9999', biet)).toEqual({ loai: 'the', mnv: 'AO9999', biet: false });
    expect(docMaQuet('xin chao', biet).loai).toBe('khong_ro');
    expect(docMaQuet('', biet).loai).toBe('khong_ro');
  });
});

const LICH: LichCaTram[] = [
  { loaiCa: 'chinh', gioBatDau: '07:30', gioKetThuc: '15:45' },
  { loaiCa: 'ca1', gioBatDau: '16:15', gioKetThuc: '18:15' },
  { loaiCa: 'ca4', gioBatDau: '16:15', gioKetThuc: '06:00' },
];
const t = (s: string) => Date.parse(`${s}+07:00`);

describe('caChoLanQuet — ca của lần quét thẻ', () => {
  it('trong ca chính → ca chính, tính từ giờ quét', () => {
    const c = caChoLanQuet(t('2026-10-13T09:00:00'), LICH, []);
    expect([c.loaiCa, c.som, c.ngoaiCa, c.luc]).toEqual(['chinh', false, false, t('2026-10-13T09:00:00')]);
  });
  it('trước 7:30 (từ 06:00) → vào ca chính, công tính từ 7:30', () => {
    const c = caChoLanQuet(t('2026-10-13T06:05:00'), LICH, []);
    expect([c.loaiCa, c.som, c.ngoaiCa, c.luc]).toEqual(['chinh', true, false, t('2026-10-13T07:30:00')]);
  });
  it('từ 15:45 quét thẻ = ra ca; tổ có tăng ca 16:15 thì chưa; hết tăng ca thì ra ca', () => {
    expect(daHetCa(t('2026-10-13T15:30:00'), LICH, [])).toBe(false);
    expect(daHetCa(t('2026-10-13T15:45:00'), LICH, [])).toBe(true);
    expect(daHetCa(t('2026-10-13T15:50:00'), LICH, ['ca1'])).toBe(false);
    expect(daHetCa(t('2026-10-13T18:20:00'), LICH, ['ca1'])).toBe(true);
    expect(daHetCa(t('2026-10-13T07:00:00'), LICH, [])).toBe(false);
  });
  it('quét sớm 45 phút trước ca → vào ca, giờ công tính từ giờ bắt đầu ca', () => {
    const c = caChoLanQuet(t('2026-10-13T06:45:00'), LICH, []);
    expect([c.loaiCa, c.som, c.luc]).toEqual(['chinh', true, t('2026-10-13T07:30:00')]);
  });
  it('sau 15:45, tổ chưa khai tăng ca → ngoài ca (gắn vào loại ca theo lịch phủ lúc đó)', () => {
    const c = caChoLanQuet(t('2026-10-13T17:00:00'), LICH, []);
    expect([c.ngoaiCa, c.loaiCa]).toEqual([true, 'ca1']);
  });
  it('tổ đã khai tăng ca ca1: quét 16:00 (sớm 15 phút) thuộc ca1', () => {
    const c = caChoLanQuet(t('2026-10-13T16:00:00'), LICH, ['ca1']);
    expect([c.loaiCa, c.som, c.ngoaiCa]).toEqual(['ca1', true, false]);
  });
  it('ca 4 qua đêm: quét 1h sáng thuộc ngày bắt đầu ca', () => {
    expect(ngayCa(t('2026-10-14T01:00:00'))).toBe('2026-10-13');
    const c = caChoLanQuet(t('2026-10-14T01:00:00'), LICH, ['ca4']);
    expect([c.loaiCa, c.ngoaiCa, c.ketThuc]).toEqual(['ca4', false, t('2026-10-14T06:00:00')]);
  });
  it('Chủ nhật không có ca chính', () => {
    expect(caChoLanQuet(t('2026-10-18T09:00:00'), LICH, []).ngoaiCa).toBe(true);
  });
});

describe('bảng ai đang ở hàng nào (cập nhật ngay trên máy)', () => {
  const A = { hex: '260307510', congDoanId: 'CD1', tenHangMuc: 'Tủ' };
  const B = { hex: '260307511', congDoanId: 'CD1', tenHangMuc: 'Kệ' };
  const binh = { mnv: 'AO0001', hoTen: 'Bình' };
  const cuong = { mnv: 'AO0002', hoTen: 'Cường' };
  const rong: BangTram = { dangO: [], chuaVaoHang: [] };
  it('vào ca → chưa ở hàng; vào hàng → rời danh sách chờ; đổi hàng → tự rời hàng cũ', () => {
    let b = vaoCa(rong, binh);
    expect(daVaoCa(b, 'AO0001')).toBe(true);
    b = vaoHang(b, binh, A);
    b = vaoHang(b, cuong, A);
    expect(b.chuaVaoHang).toEqual([]);
    expect(hangCua(b, 'AO0002')?.hex).toBe(A.hex);
    b = vaoHang(b, binh, B);
    expect(hangCua(b, 'AO0001')?.hex).toBe(B.hex);
    expect(b.dangO.find(h => h.hex === A.hex)?.nguoi.map(n => n.mnv)).toEqual(['AO0002']);
  });
  it('ra hàng → chưa ở hàng nào; ra ca → bỏ khỏi bảng; hàng hết người thì bỏ dòng', () => {
    let b = vaoHang(rong, binh, A);
    b = raHang(b, binh);
    expect(b.dangO).toEqual([]);
    expect(b.chuaVaoHang.map(n => n.mnv)).toEqual(['AO0001']);
    b = raCa(b, 'AO0001');
    expect(daVaoCa(b, 'AO0001')).toBe(false);
  });
  it('Xong hết hàng → cả nhóm về "chưa ở hàng nào", hàng khác không đổi', () => {
    let b = vaoHang(vaoHang(vaoHang(rong, binh, A), cuong, A), { mnv: 'AO0003', hoTen: 'Dung' }, B);
    b = xongHang(b, A.hex, A.congDoanId);
    expect(b.dangO.map(h => h.hex)).toEqual([B.hex]);
    expect(b.chuaVaoHang.map(n => n.mnv).sort()).toEqual(['AO0001', 'AO0002']);
  });
});
