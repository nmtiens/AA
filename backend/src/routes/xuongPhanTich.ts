import type { Request, Response } from 'express';
import { pool, poolMra } from '../db.js';
import { app } from '../server/app.js';
import { taiCap, khungCaChinh, gioTrongCa, dauNgayVN, GIO, NGAY } from '../server/xuong/mraLichSu.js';
import { fail, phamViXem, COT_SU_KIEN, toSuKien, lichCaCuaXuong } from './xuong.js';

// ============================================================================
// PHÂN TÍCH SỐ LIỆU APP của một xưởng (tab Báo cáo → Phân tích) — cùng cách phân tích của tab "Lịch sử MRA" cũ
// (đã bỏ), áp cho thao tác trên app hiện tại — hiện ở tab Kế hoạch & phân tích (mốc chuẩn thời gian). Chỉ THỜI GIAN,
// không tính giờ công người (đã có ở báo cáo):
//   GET /api/xuong/phan-tich?xuong=3A&tu=YYYY-MM-DD&den=YYYY-MM-DD
// Mốc chuẩn: mỗi công đoạn chạy bao lâu (giờ trong ca), hạng mục nằm trong xưởng bao nhiêu ngày theo nhóm sản phẩm,
// tạm ngưng, theo tháng. Lấy các cặp (hạng mục × công đoạn) có thao tác đầu trong khoảng ngày; tổ trưởng chỉ công đoạn
// tổ mình phụ trách.
// ============================================================================

const NGAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const lam = (n: number, le = 2) => Math.round(n * 10 ** le) / 10 ** le;
const trungVi = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const phanVi = (a: number[], p: number) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const thang = (ts: number) => new Date(ts + 7 * GIO).toISOString().slice(0, 7);

app.get('/api/xuong/phan-tich', async (req: Request, res: Response) => {
  try {
    const xuong = typeof req.query.xuong === 'string' ? req.query.xuong.trim().toUpperCase() : '';
    const pv = xuong ? await phamViXem(req.user!.id, xuong) : null;
    if (!pv) return res.status(403).json({ success: false, message: 'Cần quyền quản lý xưởng này' });
    const tu = typeof req.query.tu === 'string' && NGAY_RE.test(req.query.tu) ? req.query.tu : null;
    const den = typeof req.query.den === 'string' && NGAY_RE.test(req.query.den) ? req.query.den : null;
    const t0 = tu ? dauNgayVN(tu) : -Infinity, t1 = den ? dauNgayVN(den) + NGAY : Infinity;

    const [capsGoc, lich, cdR, tcR] = await Promise.all([
      taiCap(xuong, 'app', toSuKien, COT_SU_KIEN, req.query.moi === '1'),
      lichCaCuaXuong(xuong),
      poolMra.query(`SELECT id, cd_chi_tiet, thu_tu FROM xuong_cong_doan WHERE xuong = $1`, [xuong]),
      pv.chiTo ? poolMra.query(`SELECT cong_doan_id FROM xuong_to_cong_doan WHERE to_id = ANY($1::int[])`, [pv.chiTo]) : Promise.resolve(null),
    ]);
    const cdCuaTo = tcR ? new Set(tcR.rows.map(x => String(x.cong_doan_id))) : null;
    const capsKy = capsGoc.filter(c => c.dau >= t0 && c.dau < t1 && (!cdCuaTo || cdCuaTo.has(c.cd)));
    if (!capsKy.length) return res.json({ success: true, xuong, chiTo: pv.chiTo, coDuLieu: false });
    const khung = khungCaChinh(lich);
    const cdMap = new Map(cdR.rows.map(x => [String(x.id), { ten: String(x.cd_chi_tiet), thuTu: x.thu_tu === null ? 999 : Number(x.thu_tu) }]));
    const caps = capsKy.map(c => ({
      ...c,
      gioChay: c.doan.reduce((a, d) => a + (d.end - d.start), 0) / GIO,
      gioCa: c.doan.reduce((a, d) => a + gioTrongCa(d.start, d.end, khung), 0),
    }));

    const hexes = [...new Set(caps.map(c => c.hex))];
    const info = new Map((await pool.query(
      `SELECT DISTINCT ON (hex::text) hex::text AS hex, ten_hang_muc, ten_cong_trinh, phan_loai_nhom_san_pham AS nhom
       FROM production_status_app WHERE hex::text = ANY($1::text[]) ORDER BY hex::text, updated_at DESC NULLS LAST`, [hexes])).rows
      .map(x => [String(x.hex), x]));

    // Theo hạng mục trong xưởng: từ thao tác đầu tới lần xong / giao cuối (chưa xong => chưa tính ngày)
    const theoHex = new Map<string, typeof caps>();
    for (const c of caps) { if (!theoHex.has(c.hex)) theoHex.set(c.hex, []); theoHex.get(c.hex)!.push(c); }
    const hms = [...theoHex.entries()].map(([hex, cs]) => {
      const dau = Math.min(...cs.map(c => c.dau));
      // Hạng mục còn công đoạn đang làm / chưa xong thì chưa tính là ra khỏi xưởng
      const conDo = cs.some(c => c.xongCuoi === null || c.slXong < c.slNhan - 0.0005);
      const xongs = cs.map(c => c.xongCuoi).filter((x): x is number => x !== null);
      const xong = !conDo && xongs.length ? Math.max(...xongs) : null;
      const i = info.get(hex);
      return {
        hex, nhom: (i?.nhom ? String(i.nhom).trim() : '') || 'Chưa phân nhóm', ten: i?.ten_hang_muc ?? null, congTrinh: i?.ten_cong_trinh ?? null,
        dau, xong, ngay: xong !== null ? (xong - dau) / NGAY : null, gioCa: cs.reduce((a, c) => a + c.gioCa, 0), soCd: cs.length,
      };
    });

    // Theo công đoạn
    const theoCd = new Map<string, typeof caps>();
    for (const c of caps) { if (!theoCd.has(c.cd)) theoCd.set(c.cd, []); theoCd.get(c.cd)!.push(c); }
    const congDoan = [...theoCd.entries()].map(([cd, cs]) => {
      const coChay = cs.filter(c => c.gioCa > 0);
      return {
        congDoanId: cd, ten: cdMap.get(cd)?.ten ?? cd, thuTu: cdMap.get(cd)?.thuTu ?? 999,
        soHm: cs.length, slXong: lam(cs.reduce((a, c) => a + c.slXong, 0), 1),
        gioCaTv: lam(trungVi(coChay.map(c => c.gioCa)) ?? 0, 1), gioCaP75: lam(phanVi(coChay.map(c => c.gioCa), 0.75) ?? 0, 1),
        gioCa: lam(cs.reduce((a, c) => a + c.gioCa, 0), 0),
        ngayChayTv: lam((trungVi(coChay.map(c => c.gioChay)) ?? 0) / 24, 1),
        gioTrenDvTv: lam(trungVi(cs.filter(c => c.slXong > 0 && c.gioCa > 0).map(c => c.gioCa / c.slXong)) ?? 0, 3),
        soNgung: cs.reduce((a, c) => a + c.soNgung, 0), gioNgung: lam(cs.reduce((a, c) => a + c.gioNgung, 0), 1),
        hmNgung: cs.filter(c => c.soNgung > 0).length,
      };
    }).sort((a, b) => a.thuTu - b.thuTu || b.soHm - a.soHm);

    // Theo nhóm sản phẩm
    const theoNhom = new Map<string, typeof hms>();
    for (const h of hms) { if (!theoNhom.has(h.nhom)) theoNhom.set(h.nhom, []); theoNhom.get(h.nhom)!.push(h); }
    const nhom = [...theoNhom.entries()].map(([ten, hs]) => {
      const ngay = hs.map(h => h.ngay).filter((x): x is number => x !== null);
      return {
        ten, soHm: hs.length, soXong: ngay.length,
        ngayTv: lam(trungVi(ngay) ?? 0, 1), ngayP75: lam(phanVi(ngay, 0.75) ?? 0, 1),
        gioCaTv: lam(trungVi(hs.map(h => h.gioCa).filter(x => x > 0)) ?? 0, 1),
      };
    }).sort((a, b) => b.soHm - a.soHm);

    // Theo tháng
    const thangMap = new Map<string, { soXong: number; gioCa: number; soBatDau: number }>();
    const lay = (m: string) => { if (!thangMap.has(m)) thangMap.set(m, { soXong: 0, gioCa: 0, soBatDau: 0 }); return thangMap.get(m)!; };
    for (const h of hms) { lay(thang(h.dau)).soBatDau++; if (h.xong !== null) lay(thang(h.xong)).soXong++; }
    for (const c of caps) lay(thang(c.dau)).gioCa += c.gioCa;
    const theoThang = [...thangMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, v]) => ({ thang: m, soXong: v.soXong, soBatDau: v.soBatDau, gioCa: lam(v.gioCa, 0) }));

    const ngayAll = hms.map(h => h.ngay).filter((x): x is number => x !== null);
    res.json({
      success: true, xuong, chiTo: pv.chiTo, coDuLieu: true,
      tong: {
        soHm: hms.length, soHmXong: ngayAll.length, soCap: caps.length,
        tu: new Date(Math.min(...caps.map(c => c.dau))).toISOString(), den: new Date(Math.max(...caps.map(c => c.xongCuoi ?? c.dau))).toISOString(),
        gioCa: lam(caps.reduce((a, c) => a + c.gioCa, 0), 0),
        soNgung: caps.reduce((a, c) => a + c.soNgung, 0), gioNgung: lam(caps.reduce((a, c) => a + c.gioNgung, 0), 0),
        ngayTv: lam(trungVi(ngayAll) ?? 0, 1), ngayP75: lam(phanVi(ngayAll, 0.75) ?? 0, 1),
      },
      congDoan, nhom, theoThang,
      lauNhat: hms.filter(h => h.ngay !== null).sort((a, b) => b.ngay! - a.ngay!).slice(0, 15)
        .map(h => ({ hex: h.hex, ten: h.ten, congTrinh: h.congTrinh, nhom: h.nhom, ngay: lam(h.ngay!, 1), gioCa: lam(h.gioCa, 1), soCd: h.soCd })),
    });
  } catch (e) { fail(res, e, '/api/xuong/phan-tich'); }
});
