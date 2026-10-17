import type { Request, Response } from 'express';
import { pool, poolMra } from '../db.js';
import { app } from '../server/app.js';
import { isoWeekRangeInYear } from '../server/common.js';
import { numericCol, notCancelledHexCond } from '../server/data.js';
import { ensureWorkshopGroups, workshopCondition } from '../server/workshopGroups.js';
import { fail, phamViXem, COT_SU_KIEN, toSuKien, suKienTheoHex } from './xuong.js';
import { mocChuanTheoCd, duBaoHangMuc, type DuBao } from '../server/xuong/duBao.js';
import { tinhTrangThai } from '../server/xuong/state.js';
import { dauNgayVN, NGAY } from '../server/xuong/mraLichSu.js';
import type { SuKien } from '../server/xuong/types.js';

// ============================================================================
// KẾ HOẠCH TUẦN của xưởng đối chiếu với MRA (mục Báo cáo → tab Kế hoạch tuần)
//   GET /api/xuong/ke-hoach-tuan?xuong=2A&nam=2026&tuan=41
// - Kế hoạch: bảng khsx, phan_loai_kh 'TUẦN', theo tuần ISO (cùng cách KHSX đánh số), bỏ hạng mục HỦY.
// - Thực hiện: nhap_kho trong khoảng ngày của tuần (cùng quy tắc "theo KH" của /api/khsx-nhapkho/summary).
// - MRA: đã triển khai cho xưởng chưa, từng công đoạn đang ở đâu (xuong_trang_thai), tạm ngưng vì sao.
// Tiền: triệu đồng. Giờ công sản phẩm từng hạng mục lấy ở /api/xuong/bao-cao (cùng khoảng ngày) phía máy khách.
// Tổ trưởng: chỉ hạng mục ĐI QUA công đoạn tổ mình (có thao tác ở công đoạn của tổ — app hoặc MRA cũ — hoặc tuyến
// triển khai / khai CĐ chi tiết có công đoạn của tổ); nhập kho, biểu đồ theo ngày cũng chỉ tính các hạng mục đó.
// ============================================================================

/** Hạng mục (trong `hexes`) đi qua một trong các công đoạn `cds` */
async function hexQuaCongDoan(hexes: string[], cds: string[]): Promise<Set<string>> {
  if (!hexes.length || !cds.length) return new Set();
  const [coThaoTac, tuyen] = await Promise.all([
    poolMra.query(`SELECT DISTINCT hex FROM xuong_su_kien WHERE hex = ANY($1::text[]) AND cong_doan_id = ANY($2::text[])`, [hexes, cds]),
    poolMra.query(
      `SELECT hex, du_lieu::text AS dl FROM xuong_su_kien e WHERE loai IN ('trien_khai', 'khai_bao_cd') AND hex = ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)`, [hexes]),
  ]);
  const out = new Set(coThaoTac.rows.map(x => String(x.hex)));
  for (const x of tuyen.rows) if (x.dl && cds.some(c => String(x.dl).includes(`"${c}"`))) out.add(String(x.hex));
  return out;
}

app.get('/api/xuong/ke-hoach-tuan', async (req: Request, res: Response) => {
  try {
    const xuong = typeof req.query.xuong === 'string' ? req.query.xuong.trim().toUpperCase() : '';
    const nam = Number(req.query.nam);
    const tuan = Number(req.query.tuan);
    const pv = xuong ? await phamViXem(req.user!.id, xuong) : null;
    if (!pv) return res.status(403).json({ success: false, message: 'Cần quyền quản lý xưởng này' });
    const cdCuaTo = pv.chiTo
      ? (await poolMra.query('SELECT DISTINCT cong_doan_id FROM xuong_to_cong_doan WHERE to_id = ANY($1::int[])', [pv.chiTo])).rows.map(x => String(x.cong_doan_id))
      : null;
    const khoang = isoWeekRangeInYear(nam, tuan);
    if (!khoang) return res.status(400).json({ success: false, message: 'Tuần không hợp lệ' });
    await ensureWorkshopGroups();

    // ---- Kế hoạch tuần (gộp theo hex: 1 hạng mục có thể có nhiều dòng kế hoạch trong tuần) ----
    const khP: unknown[] = [nam, tuan];
    const kh = await pool.query(
      `SELECT hex::text AS hex, max(trim(ten_hang_muc)) AS ten_hang_muc, max(trim(ten_cong_trinh)) AS ten_cong_trinh,
              max(trim(dvt)) AS dvt, sum(${numericCol('khsx', 'so_luong_kh')}) AS sl_kh,
              sum(${numericCol('khsx', 'thanh_tien_ke_hoach')}) AS kh, to_char(min(ngay_khnk), 'YYYY-MM-DD') AS ngay_khnk,
              max(${numericCol('khsx', 'tri_gia_don_hang_tong')}) AS gia_tri_don
       FROM khsx
       WHERE upper(trim(phan_loai_kh)) LIKE '%TUẦN%' AND nam = $1::bigint AND tuan = $2::double precision AND hex IS NOT NULL
         AND ${notCancelledHexCond('hex')} AND ${workshopCondition('xuong_chinh', xuong, khP)}
       GROUP BY hex::text ORDER BY sum(${numericCol('khsx', 'thanh_tien_ke_hoach')}) DESC NULLS LAST`, khP);

    // ---- Nhập kho trong tuần của xưởng (cả hạng mục ngoài kế hoạch) ----
    const nkP: unknown[] = [khoang.start, khoang.end];
    const nk = await pool.query(
      `SELECT hex::text AS hex, max(trim(ten_hang_muc)) AS ten_hang_muc, sum(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}) AS tien,
              sum(${numericCol('nhap_kho', 'so_luong_nhap_kho')}) AS sl
       FROM nhap_kho
       WHERE date_parsed BETWEEN $1::date AND $2::date AND hex IS NOT NULL AND ${notCancelledHexCond('hex')}
         AND ${workshopCondition('xuong_chinh', xuong, nkP)}
       GROUP BY hex::text`, nkP);
    // Tổ trưởng: chỉ hạng mục đi qua công đoạn tổ mình (cả kế hoạch lẫn nhập kho ngoài kế hoạch)
    const quaTo = cdCuaTo ? await hexQuaCongDoan([...new Set([...kh.rows, ...nk.rows].map(x => String(x.hex)))], cdCuaTo) : null;
    if (quaTo) {
      kh.rows = kh.rows.filter(x => quaTo.has(String(x.hex)));
      nk.rows = nk.rows.filter(x => quaTo.has(String(x.hex)));
    }
    const hexKh = kh.rows.map(x => String(x.hex));
    const nkMap = new Map(nk.rows.map(x => [String(x.hex), { tien: Number(x.tien) || 0, sl: Number(x.sl) || 0, ten: x.ten_hang_muc as string | null }]));
    const nkMoiNhat = (await pool.query(`SELECT to_char(max(date_parsed),'YYYY-MM-DD') AS d FROM nhap_kho`)).rows[0]?.d ?? null;
    // Nhập kho luỹ kế tới hết tuần của hạng mục kế hoạch: đã nhập đủ đơn hàng từ trước tuần thì không phải "rớt"
    // (Dashboard tính "nhập kho trước kế hoạch" vào đúng tiến độ)
    const lk = hexKh.length ? await pool.query(
      `SELECT hex::text AS hex, sum(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}) AS tien FROM nhap_kho
       WHERE hex::text = ANY($1::text[]) AND date_parsed <= $2::date GROUP BY hex::text`, [hexKh, khoang.end]) : { rows: [] };
    const lkMap = new Map(lk.rows.map(x => [String(x.hex), Number(x.tien) || 0]));
    // Nhập kho từng ngày trong tuần, tách theo / ngoài kế hoạch (biểu đồ)
    const ngP: unknown[] = [khoang.start, khoang.end, hexKh, quaTo ? [...quaTo] : null];
    const theoNgay = await pool.query(
      `SELECT to_char(date_parsed,'YYYY-MM-DD') AS ngay,
              sum(CASE WHEN hex::text = ANY($3::text[]) THEN ${numericCol('nhap_kho', 'thanh_tien_nhap_kho')} ELSE 0 END) AS theo_kh,
              sum(CASE WHEN hex::text = ANY($3::text[]) THEN 0 ELSE ${numericCol('nhap_kho', 'thanh_tien_nhap_kho')} END) AS ngoai_kh
       FROM nhap_kho
       WHERE date_parsed BETWEEN $1::date AND $2::date AND hex IS NOT NULL AND ${notCancelledHexCond('hex')}
         AND ($4::text[] IS NULL OR hex::text = ANY($4::text[]))
         AND ${workshopCondition('xuong_chinh', xuong, ngP)}
       GROUP BY date_parsed ORDER BY date_parsed`, ngP);

    // ---- MRA: triển khai + trạng thái công đoạn của các hạng mục kế hoạch ----
    const [tk, tt, ngung] = hexKh.length ? await Promise.all([
      poolMra.query(
        `SELECT hex, sum(so_luong)::float AS sl, min(device_ts_hieu_chinh) AS luc FROM xuong_su_kien e
         WHERE loai = 'trien_khai' AND hex = ANY($1::text[]) AND upper(coalesce(du_lieu->>'xuong', xuong)) = $2
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         GROUP BY hex`, [hexKh, xuong]),
      poolMra.query(
        `SELECT t.hex, t.cong_doan_id, t.trang_thai, t.sl_giao_den::float AS giao_den, t.sl_nhan::float AS nhan,
                t.sl_hoan_thanh::float AS xong, t.sl_giao::float AS giao, c.cd_chi_tiet AS ten, c.thu_tu, c.xuong
         FROM xuong_trang_thai t LEFT JOIN xuong_cong_doan c ON c.id = t.cong_doan_id
         WHERE t.hex = ANY($1::text[])`, [hexKh]),
      poolMra.query(
        `SELECT DISTINCT ON (hex, cong_doan_id) hex, cong_doan_id, ly_do_tam_ngung, device_ts_hieu_chinh AS luc FROM xuong_su_kien e
         WHERE loai = 'tam_ngung' AND hex = ANY($1::text[]) AND nguon = 'app'
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         ORDER BY hex, cong_doan_id, device_ts_hieu_chinh DESC`, [hexKh]),
    ]) : [{ rows: [] }, { rows: [] }, { rows: [] }];
    const tkMap = new Map(tk.rows.map(x => [String(x.hex), { sl: Number(x.sl) || 0, luc: x.luc }]));
    const ngungMap = new Map(ngung.rows.map(x => [`${x.hex}|${x.cong_doan_id}`, { lyDo: x.ly_do_tam_ngung as string | null, luc: x.luc }]));
    const cdTheoHex = new Map<string, Array<Record<string, unknown>>>();
    for (const x of tt.rows) {
      const k = String(x.hex);
      if (!cdTheoHex.has(k)) cdTheoHex.set(k, []);
      cdTheoHex.get(k)!.push({
        congDoanId: x.cong_doan_id, ten: x.ten ?? x.cong_doan_id, xuong: x.xuong, thuTu: x.thu_tu === null ? null : Number(x.thu_tu),
        trangThai: x.trang_thai, slGiaoDen: x.giao_den, slNhan: x.nhan, slHoanThanh: x.xong, slGiao: x.giao,
        ngung: x.trang_thai === 'tam_ngung' ? ngungMap.get(`${x.hex}|${x.cong_doan_id}`) ?? null : null,
      });
    }
    // Giai đoạn MRA cũ: hạng mục chưa có số liệu app => tình trạng theo lịch sử MRA tại cuối tuần kế hoạch
    const mraTk = new Map<string, { sl: number; luc: string }>();
    const canMra = hexKh.filter(h => !cdTheoHex.has(h));
    if (canMra.length) {
      const cuoiTuan = dauNgayVN(khoang.end) + NGAY;
      const ev = await poolMra.query(
        `SELECT ${COT_SU_KIEN} FROM xuong_su_kien WHERE nguon = 'mra' AND hex = ANY($1::text[]) AND cong_doan_id IS NOT NULL
           AND device_ts_hieu_chinh < to_timestamp($2::double precision / 1000)`, [canMra, cuoiTuan]);
      const theoCap = new Map<string, SuKien[]>();
      for (const r0 of ev.rows) {
        const e = toSuKien(r0);
        const k = `${e.hex}|${e.congDoanId}`;
        if (!theoCap.has(k)) theoCap.set(k, []);
        theoCap.get(k)!.push(e);
      }
      const cdIds = [...new Set([...theoCap.keys()].map(k => k.split('|')[1]))];
      const cdInfo = new Map(cdIds.length ? (await poolMra.query('SELECT id, cd_chi_tiet, thu_tu, xuong FROM xuong_cong_doan WHERE id = ANY($1::text[])', [cdIds])).rows
        .map(x => [String(x.id), x]) : []);
      for (const [k, evs] of theoCap) {
        const [hex, cd] = k.split('|');
        evs.sort((a, b) => a.ts - b.ts);
        const t = tinhTrangThai(evs, []);
        const trangThai = t.trangThai === 'cho_nhan' || t.trangThai === 'cho_giao'
          ? (t.slNhan > 0 && t.slHoanThanh >= t.slNhan ? 'xong' : t.slNhan > 0 ? 'da_nhan' : t.trangThai) : t.trangThai;
        const ci = cdInfo.get(cd);
        if (!cdTheoHex.has(hex)) cdTheoHex.set(hex, []);
        cdTheoHex.get(hex)!.push({
          congDoanId: cd, ten: ci?.cd_chi_tiet ?? cd, xuong: ci?.xuong ?? null, thuTu: ci?.thu_tu === null || ci?.thu_tu === undefined ? null : Number(ci.thu_tu),
          trangThai, slGiaoDen: t.slGiaoDen, slNhan: t.slNhan, slHoanThanh: t.slHoanThanh, slGiao: t.slGiao,
          ngung: trangThai === 'tam_ngung' ? { lyDo: null, luc: null } : null, mra: true,
        });
        const cu = mraTk.get(hex);
        mraTk.set(hex, { sl: Math.max(cu?.sl ?? 0, t.slNhan), luc: new Date(Math.min(cu ? Date.parse(cu.luc) : evs[0].ts, evs[0].ts)).toISOString() });
      }
    }
    for (const ds2 of cdTheoHex.values()) ds2.sort((a, b) => (Number(a.thuTu ?? 999) - Number(b.thuTu ?? 999)));

    // ---- Dự báo nguy cơ rớt (tuần chưa qua): ngày lịch còn cần theo mốc "thường mất" từng công đoạn còn lại ----
    const duBao = new Map<string, DuBao & { tenConLai: string[]; tenThieuMoc: string[] }>();
    const now = Date.now();
    const cuoiNgay = (ngay: string) => dauNgayVN(ngay) + NGAY;
    if (hexKh.length && cuoiNgay(khoang.end) > now) {
      const evApp = (await suKienTheoHex(poolMra, hexKh)).map(toSuKien);
      const cdIdsTuyen = [...new Set(evApp.flatMap(e => {
        const tp = Array.isArray(e.duLieu?.thanhPhan) ? (e.duLieu!.thanhPhan as Array<Record<string, unknown>>) : [];
        const t = [...tp.flatMap(x => (Array.isArray(x?.tuyen) ? x.tuyen : [])), ...(Array.isArray(e.duLieu?.tuyen) ? (e.duLieu!.tuyen as unknown[]) : [])];
        return t.map(String);
      }))];
      const cdR = cdIdsTuyen.length ? (await poolMra.query('SELECT id, xuong, cd_chi_tiet FROM xuong_cong_doan WHERE id = ANY($1::text[])', [cdIdsTuyen])).rows : [];
      const tenCd = new Map(cdR.map(x => [String(x.id), String(x.cd_chi_tiet)]));
      const moc = await mocChuanTheoCd([xuong, ...cdR.map(x => String(x.xuong))], toSuKien, COT_SU_KIEN);
      for (const x of kh.rows) {
        const hex = String(x.hex);
        const daNhapDu = (Number(x.kh) || 0) > 0 && (nkMap.get(hex)?.tien ?? 0) >= (Number(x.kh) || 0) * 0.98;
        if (daNhapDu) continue;
        const slTk = tkMap.get(hex)?.sl ?? 0;
        const st = new Map((cdTheoHex.get(hex) ?? []).map(c => [String(c.congDoanId), c]));
        const xong = (cd: string) => {
          const c = st.get(cd);
          return !!c && (c.trangThai === 'xong' || (slTk > 0 && Number(c.slHoanThanh) >= slTk - 0.0005));
        };
        const han = x.ngay_khnk && cuoiNgay(String(x.ngay_khnk)) > now ? cuoiNgay(String(x.ngay_khnk)) : cuoiNgay(khoang.end);
        const d = duBaoHangMuc(evApp.filter(e => e.hex === hex), moc, xong, han, now);
        if (d) duBao.set(hex, { ...d, tenConLai: d.conLai.map(c => tenCd.get(c) ?? c), tenThieuMoc: d.thieuMoc.map(c => tenCd.get(c) ?? c) });
      }
    }

    const daCoKh = new Set(hexKh);
    res.json({
      success: true, xuong, chiTo: pv.chiTo, nam, tuan, tu: khoang.start, den: khoang.end, nhapKhoMoiNhat: nkMoiNhat,
      nhapKhoTheoNgay: theoNgay.rows.map(x => ({ ngay: x.ngay, theoKh: Number(x.theo_kh) || 0, ngoaiKh: Number(x.ngoai_kh) || 0 })),
      keHoach: kh.rows.map(x => {
        const hex = String(x.hex);
        const n = nkMap.get(hex);
        return {
          hex, tenHangMuc: x.ten_hang_muc, tenCongTrinh: x.ten_cong_trinh, dvt: x.dvt,
          slKh: x.sl_kh === null ? null : Number(x.sl_kh), kh: Number(x.kh) || 0,
          ngayKhnk: (x.ngay_khnk as string | null) ?? null,
          nhapKho: n?.tien ?? 0, slNhapKho: n?.sl ?? 0,
          nhapKhoLuyKe: lkMap.get(hex) ?? 0, giaTriDon: x.gia_tri_don === null ? null : Number(x.gia_tri_don),
          // Không triển khai trên app nhưng có lịch sử MRA: coi như đã triển khai (làm theo MRA)
          trienKhai: tkMap.get(hex) ?? (mraTk.has(hex) ? { ...mraTk.get(hex)!, mra: true } : null),
          congDoan: cdTheoHex.get(hex) ?? [],
          duBao: duBao.get(hex) ?? null,
        };
      }),
      // Nhập kho trong tuần của hạng mục KHÔNG có trong kế hoạch tuần
      ngoaiKeHoach: [...nkMap.entries()].filter(([hex]) => !daCoKh.has(hex))
        .map(([hex, v]) => ({ hex, tenHangMuc: v.ten, nhapKho: v.tien, slNhapKho: v.sl }))
        .sort((a, b) => b.nhapKho - a.nhapKho),
    });
  } catch (e) { fail(res, e, '/api/xuong/ke-hoach-tuan'); }
});
