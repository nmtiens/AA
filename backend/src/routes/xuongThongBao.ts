import type { Request, Response } from 'express';
import { pool } from '../db.js';
import { app } from '../server/app.js';
import { vnDayKey } from '../server/common.js';
import { activeUsers, PREF_OF, isMissingSchema, type NotifyKind } from '../notifications.js';
import { sendToUsers, cronAuth } from '../vuongMacPush.js';

// ============================================================================
// THÔNG BÁO MỤC XƯỞNG (đợt 2 — docs/designs/xuong-checkin.md, cải tiến 8 + 9). Dùng hệ thống notifications sẵn có:
// lưu hộp thông báo + Web Push, tôn trọng cài đặt "Xưởng" của từng người (users.notify_prefs.xuong).
//   - Có hàng chờ nhận: ngay khi tổ trước giao / kế hoạch triển khai (gọi từ /events, /trien-khai).
//   - Xưởng phụ được giao công đoạn khi triển khai: báo quản lý xưởng phụ.
//   - GET /api/cron/xuong?dot=sang (8h00): chưa chốt quân số ca chính · hạng mục chạy > 2 ngày không cập nhật ·
//     thao tác bị gắn cờ 24 giờ qua (quản lý); dọn ảnh tiến độ không sự kiện nào dùng. dot=chieu (16h30): chưa chốt quân số ca tăng ca đã khai ·
//     chưa xác nhận cuối ngày. Mỗi loại tối đa 1 lần / người / ngày (gọi lại cron không gửi trùng).
// Không bao giờ ném lỗi ra ngoài: lỗi thông báo không được làm hỏng thao tác chính.
// ============================================================================

const URL_XUONG = '/m/xuong';
const clip = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

interface TinXuong {
  kind: NotifyKind;
  userIds: Iterable<string | number>;
  title: string;
  body?: string | null;
  hex?: string | null;
  url?: string;
  /** Mỗi người chỉ nhận một lần / ngày cho cùng loại + tiêu đề (tiêu đề không chứa số đếm thay đổi — số để ở body) */
  moiNgayMotLan?: boolean;
}

export async function guiTinXuong(tins: TinXuong[], actorId?: number | null): Promise<number> {
  let tong = 0;
  try {
    const users = await activeUsers();
    const byId = new Map(users.map(u => [u.id, u]));
    for (const t of tins) {
      let ids = [...new Set([...t.userIds].map(String))]
        .filter(id => id !== String(actorId ?? '') && byId.get(id)?.prefs[PREF_OF[t.kind]]);
      if (!ids.length) continue;
      if (t.moiNgayMotLan) {
        try {
          const da = await pool.query(
            `SELECT DISTINCT user_id FROM notifications WHERE user_id = ANY($1::text[]) AND kind = $2 AND title = $3
               AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $4::date`, [ids, t.kind, t.title, vnDayKey(new Date())]);
          const daGui = new Set(da.rows.map(x => String(x.user_id)));
          ids = ids.filter(id => !daGui.has(id));
        } catch (e) { if (!isMissingSchema(e)) throw e; }
        if (!ids.length) continue;
      }
      try {
        await pool.query(
          `INSERT INTO notifications (user_id, kind, title, body, vuong_mac_id, hex, actor)
           SELECT u, $2, $3, $4, NULL, $5, NULL FROM unnest($1::text[]) u`,
          [ids, t.kind, t.title, t.body ? clip(t.body, 500) : null, t.hex ?? null]);
      } catch (e) { if (!isMissingSchema(e)) throw e; }
      await sendToUsers(ids, {
        title: t.title, body: clip(t.body ?? ''), tag: `${t.kind}-${t.hex ?? ''}-${vnDayKey(new Date())}`,
        target: { hex: t.hex ?? '', category: 'xuong', id: 0, url: t.url ?? URL_XUONG },
      });
      tong += ids.length;
    }
  } catch (e) {
    console.error('[xuong-thong-bao] lỗi', e);
  }
  return tong;
}

/** Người nhận theo tổ: tổ trưởng + thành viên đang trong tổ có tài khoản (users.msnv) */
async function nguoiCuaTo(toIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!toIds.length) return out;
  const r = await pool.query(
    `SELECT t.id AS to_id, t.to_truong_user_id::text AS uid FROM xuong_to t WHERE t.id = ANY($1::int[]) AND t.active AND t.to_truong_user_id IS NOT NULL
     UNION
     SELECT tv.to_id, u.id::text FROM xuong_to_thanh_vien tv JOIN users u ON upper(u.msnv) = upper(tv.mnv) AND u.is_active
     WHERE tv.to_id = ANY($1::int[]) AND (tv.den_ngay IS NULL OR tv.den_ngay >= CURRENT_DATE)`, [toIds]);
  for (const x of r.rows) {
    const k = Number(x.to_id);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(String(x.uid));
  }
  return out;
}

async function quanLyCuaXuong(xuongs: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!xuongs.length) return out;
  const r = await pool.query('SELECT xuong, user_id::text AS uid FROM xuong_quan_ly WHERE xuong = ANY($1::text[])', [xuongs]);
  for (const x of r.rows) {
    if (!out.has(x.xuong)) out.set(x.xuong, []);
    out.get(x.xuong)!.push(String(x.uid));
  }
  return out;
}

const so = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** Có hàng giao tới công đoạn (giao / khai báo công đoạn): báo tổ phụ trách công đoạn nhận */
export async function baoHangChoNhan(ds: Array<{ hex: string; congDoanDenId: string; soLuong: number }>, actorId?: number | null) {
  try {
    if (!ds.length) return;
    const cds = [...new Set(ds.map(d => d.congDoanDenId))];
    const r = await pool.query(
      `SELECT tc.to_id, tc.cong_doan_id, c.cd_chi_tiet FROM xuong_to_cong_doan tc JOIN xuong_cong_doan c ON c.id = tc.cong_doan_id
       WHERE tc.cong_doan_id = ANY($1::text[])`, [cds]);
    const nguoi = await nguoiCuaTo([...new Set(r.rows.map(x => Number(x.to_id)))]);
    const tins: TinXuong[] = [];
    for (const x of r.rows) {
      const cua = ds.filter(d => d.congDoanDenId === x.cong_doan_id);
      if (!cua.length) continue;
      tins.push({
        kind: 'xuong_cho_nhan', userIds: nguoi.get(Number(x.to_id)) ?? [],
        title: `Có hàng giao tới ${x.cd_chi_tiet}`,
        body: cua.slice(0, 5).map(d => `${d.hex}: ${so(d.soLuong)} cái`).join(' · ') + (cua.length > 5 ? ` · và ${cua.length - 5} hạng mục khác` : ''),
        hex: cua.length === 1 ? cua[0].hex : null,
      });
    }
    await guiTinXuong(tins, actorId);
  } catch (e) {
    console.error('[xuong-thong-bao] hàng chờ nhận', e);
  }
}

/** Triển khai có công đoạn ở xưởng khác (xưởng phụ): báo quản lý xưởng đó (cải tiến 8) */
export async function baoXuongPhu(xuongChinh: string, items: Array<{ hex: string; soLuong: number; tuyen: string[] }>, actorId?: number | null) {
  try {
    const cdIds = [...new Set(items.flatMap(i => i.tuyen))];
    const cd = await pool.query('SELECT id, xuong, cd_chi_tiet FROM xuong_cong_doan WHERE id = ANY($1::text[])', [cdIds]);
    const cdMap = new Map(cd.rows.map(x => [String(x.id), x]));
    const theoXuong = new Map<string, string[]>();
    for (const it of items) {
      for (const id of it.tuyen) {
        const c = cdMap.get(id);
        if (!c || c.xuong === xuongChinh) continue;
        if (!theoXuong.has(c.xuong)) theoXuong.set(c.xuong, []);
        theoXuong.get(c.xuong)!.push(`${it.hex} · ${so(it.soLuong)} cái (${c.cd_chi_tiet})`);
      }
    }
    if (!theoXuong.size) return;
    const ql = await quanLyCuaXuong([...theoXuong.keys()]);
    await guiTinXuong([...theoXuong.entries()].map(([x, dong]) => ({
      kind: 'xuong_trien_khai' as const, userIds: ql.get(x) ?? [],
      title: `Xưởng ${xuongChinh} giao công đoạn cho xưởng ${x}`,
      body: [...new Set(dong)].slice(0, 6).join(' · '),
    })), actorId);
  } catch (e) {
    console.error('[xuong-thong-bao] xưởng phụ', e);
  }
}

// ---------------------------------------------------------------------------
// GET /api/cron/xuong?dot=sang|chieu — gọi lúc 8h00 và 16h30 (giờ VN) bằng CRON_SECRET
// ---------------------------------------------------------------------------
async function nhacSang(ngay: string) {
  const tins: TinXuong[] = [];
  const thu = new Date(`${ngay}T12:00:00+07:00`).getUTCDay();
  // 1) Chưa chốt quân số ca chính (ngày thường), tổ đang có việc
  if (thu !== 0) {
    const r = await pool.query(
      `SELECT t.id, t.ten_to FROM xuong_to t
       WHERE t.active AND EXISTS (SELECT 1 FROM xuong_to_cong_doan tc JOIN xuong_trang_thai s ON s.cong_doan_id = tc.cong_doan_id
                                  WHERE tc.to_id = t.id AND (s.trang_thai IN ('dang_lam','tam_ngung','da_nhan') OR s.sl_giao_den > s.sl_nhan))
         AND NOT EXISTS (SELECT 1 FROM xuong_su_kien e WHERE e.to_id = t.id AND e.loai = 'quan_so' AND e.du_lieu->>'loaiCa' = 'chinh'
                           AND (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $1::date
                           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id))`, [ngay]);
    const nguoi = await nguoiCuaTo(r.rows.map(x => Number(x.id)));
    for (const x of r.rows) {
      tins.push({ kind: 'xuong_quan_so', userIds: nguoi.get(Number(x.id)) ?? [], moiNgayMotLan: true,
        title: `${x.ten_to}: chưa chốt quân số ca chính`, body: 'Mở mục Xưởng, bấm "Chốt quân số" — giờ công của tổ tính theo quân số.' });
    }
  }
  // 2) Hạng mục đang chạy hơn 2 ngày không có thao tác mới
  const lau = await pool.query(
    // "Cập nhật" = thao tác của chính tổ trên cặp (hex, công đoạn) hoặc xác nhận cuối ngày có hạng mục đó;
    // hàng giao tới từ tổ khác không tính (su_kien_cuoi của bảng trạng thái có tính cả giao tới)
    `SELECT tc.to_id, s.hex, c.cd_chi_tiet FROM xuong_trang_thai s
     JOIN xuong_to_cong_doan tc ON tc.cong_doan_id = s.cong_doan_id JOIN xuong_cong_doan c ON c.id = s.cong_doan_id
     WHERE s.trang_thai = 'dang_lam' AND s.dang_chay_tu < now() - interval '48 hours'
       AND NOT EXISTS (SELECT 1 FROM xuong_su_kien e WHERE e.hex = s.hex AND e.cong_doan_id = s.cong_doan_id
                         AND e.device_ts_hieu_chinh > now() - interval '48 hours')
       AND NOT EXISTS (SELECT 1 FROM xuong_su_kien x WHERE x.to_id = tc.to_id AND x.loai = 'xac_nhan_cuoi_ngay'
                         AND x.device_ts_hieu_chinh > now() - interval '48 hours'
                         AND x.du_lieu->'hangMuc' @> jsonb_build_array(jsonb_build_object('hex', s.hex, 'congDoanId', s.cong_doan_id, 'trangThai', 'van_lam')))`);
  const nguoiLau = await nguoiCuaTo([...new Set(lau.rows.map(x => Number(x.to_id)))]);
  const theoToLau = new Map<number, string[]>();
  for (const x of lau.rows) {
    const k = Number(x.to_id);
    if (!theoToLau.has(k)) theoToLau.set(k, []);
    theoToLau.get(k)!.push(`${x.hex} (${x.cd_chi_tiet})`);
  }
  for (const [to, ds] of theoToLau) {
    tins.push({ kind: 'xuong_chay_lau', userIds: nguoiLau.get(to) ?? [], moiNgayMotLan: true,
      title: 'Hạng mục đang chạy hơn 2 ngày chưa cập nhật',
      body: `${ds.length} hạng mục: ${ds.slice(0, 5).join(' · ')} — kiểm tra: còn làm, tạm ngưng hay đã xong?` });
  }
  // 3) Thao tác bị gắn cờ trong 24 giờ qua: báo quản lý xưởng
  const co = await pool.query(
    `SELECT xuong, count(*)::int AS n FROM xuong_su_kien WHERE co <> '{}' AND server_ts > now() - interval '24 hours' AND xuong IS NOT NULL
     GROUP BY xuong`);
  const ql = await quanLyCuaXuong(co.rows.map(x => String(x.xuong)));
  for (const x of co.rows) {
    tins.push({ kind: 'xuong_co', userIds: ql.get(x.xuong) ?? [], moiNgayMotLan: true, url: '/#/setup?tab=xuong',
      title: `Xưởng ${x.xuong}: có thao tác cần xem`,
      body: `${x.n} thao tác trong 24 giờ qua — Setup dữ liệu → Xưởng → Cần xem (giờ máy lệch, gửi hộ, giao vượt số đã xong…).` });
  }
  await donAnhMoCoi();
  return guiTinXuong(tins);
}

/** Ảnh đã gửi lên nhưng không sự kiện nào tham chiếu sau 2 ngày (sự kiện tiến độ bị từ chối) — xoá cho nhẹ DB */
async function donAnhMoCoi() {
  try {
    const r = await pool.query(
      `DELETE FROM xuong_anh a WHERE a.created_at < now() - interval '2 days'
         AND NOT EXISTS (SELECT 1 FROM xuong_su_kien e WHERE e.loai = 'tien_do' AND e.hex = a.hex AND e.du_lieu->'anh' ? a.id::text)`);
    if (r.rowCount) console.log(`[xuong] xoá ${r.rowCount} ảnh không còn sự kiện nào dùng`);
  } catch (e) {
    if (!isMissingSchema(e)) console.error('[xuong] dọn ảnh mồ côi lỗi', e);
  }
}

async function nhacChieu(ngay: string) {
  const tins: TinXuong[] = [];
  // 1) Đã khai tăng ca hôm nay nhưng chưa chốt quân số ca đó
  const tc = await pool.query(
    `SELECT DISTINCT t.id, t.ten_to, e.du_lieu->>'loaiCa' AS ca FROM xuong_su_kien e JOIN xuong_to t ON t.id = e.to_id
     WHERE e.loai = 'tang_ca' AND (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $1::date
       AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
       AND NOT EXISTS (SELECT 1 FROM xuong_su_kien q WHERE q.to_id = t.id AND q.loai = 'quan_so' AND q.du_lieu->>'loaiCa' = e.du_lieu->>'loaiCa'
                         AND (q.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $1::date
                         AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h2 WHERE h2.loai = 'huy' AND h2.sua_cho = q.id))`, [ngay]);
  const nguoiTc = await nguoiCuaTo([...new Set(tc.rows.map(x => Number(x.id)))]);
  for (const x of tc.rows) {
    tins.push({ kind: 'xuong_quan_so', userIds: nguoiTc.get(Number(x.id)) ?? [], moiNgayMotLan: true,
      title: `${x.ten_to}: chưa chốt quân số tăng ca`, body: 'Bấm "Chốt quân số" cho ca tăng ca để giờ tăng ca được phân bổ đúng.' });
  }
  // 2) Có hạng mục đang chạy mà chưa xác nhận cuối ngày
  const xn = await pool.query(
    `SELECT t.id, t.ten_to, count(*)::int AS n FROM xuong_to t
     JOIN xuong_to_cong_doan tc ON tc.to_id = t.id JOIN xuong_trang_thai s ON s.cong_doan_id = tc.cong_doan_id AND s.trang_thai = 'dang_lam'
     WHERE t.active AND NOT EXISTS (SELECT 1 FROM xuong_su_kien e WHERE e.to_id = t.id AND e.loai = 'xac_nhan_cuoi_ngay'
                                      AND (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $1::date
                                      AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id))
     GROUP BY t.id, t.ten_to`, [ngay]);
  const nguoiXn = await nguoiCuaTo(xn.rows.map(x => Number(x.id)));
  for (const x of xn.rows) {
    tins.push({ kind: 'xuong_xac_nhan', userIds: nguoiXn.get(Number(x.id)) ?? [], moiNgayMotLan: true,
      title: `${x.ten_to}: xác nhận cuối ngày`,
      body: `${x.n} hạng mục đang chạy — bấm "Tất cả vẫn đang làm" hoặc chọn hạng mục đã dừng; không xác nhận 2 ngày liền thì ngừng tính giờ.` });
  }
  return guiTinXuong(tins);
}

app.get('/api/cron/xuong', cronAuth, async (req: Request, res: Response) => {
  try {
    const t0 = Date.now();
    const ngay = vnDayKey(new Date());
    const gio = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false }).format(new Date()));
    const dot = req.query.dot === 'sang' || req.query.dot === 'chieu' ? req.query.dot : (gio < 12 ? 'sang' : 'chieu');
    const daGui = dot === 'sang' ? await nhacSang(ngay) : await nhacChieu(ngay);
    res.json({ ok: true, dot, ngay, daGui, ms: Date.now() - t0 });
  } catch (e) {
    if (isMissingSchema(e)) return res.json({ ok: true, available: false });
    console.error('Lỗi cron xuong:', e);
    res.status(500).json({ ok: false, error: 'Lỗi hệ thống' });
  }
});
