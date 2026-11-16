import { lechLucBam, authXuong, idNguoiDangDung, XUONG_DEVICE_KEY } from './xuongClock';

// ============================================================================
// HÀNG ĐỢI SỰ KIỆN MỤC XƯỞNG TRÊN MÁY (nguyên tắc 5, R3, R13, C3 — docs/designs/xuong-checkin.md)
// - Mỗi lần bấm lưu vào IndexedDB TRƯỚC (giờ bấm + lệch đồng hồ lúc bấm), rồi mới gửi.
// - Gửi theo lô ≤ 200, server chống ghi trùng theo id. Chỉ xoá khỏi máy những id server trả về
//   (đã lưu hoặc bị từ chối hẳn); phần còn lại giữ nguyên để gửi lại.
// - 429 / lỗi server / mất mạng: chờ tăng dần có jitter (1 giây → tối đa 60 giây), không mất sự kiện.
// - 401 (token hết hạn / bị thu hồi): dừng, GIỮ hàng đợi, báo cần đăng nhập lại.
// - 403 (tài khoản chưa có quyền Xưởng): dừng, giữ hàng đợi, không tự thử lại tới khi mở lại app / bấm Gửi lại.
// - Ảnh bị máy chủ từ chối (400 / 413): bỏ đúng ảnh đó, sự kiện vẫn gửi với ảnh còn lại.
// - Hàng đợi app tổ chỉ gửi thao tác của người đang đăng nhập; của người khác giữ lại chờ người đó đăng nhập.
// - Ghi IndexedDB lỗi (đầy bộ nhớ / bị chặn): ném LoiLuuMay — giao diện phải báo "chưa lưu được trên máy",
//   không được giả vờ đã lưu.
// ============================================================================

const DB_NAME = 'xuong-hang-doi';
const DB_VERSION = 2;
const STORE = 'su-kien';
/** Ảnh tiến độ chờ gửi (D24: lưu Postgres) — mỗi ảnh gắn với sự kiện qua duLieu.anhCho = [id ảnh trên máy] */
const STORE_ANH = 'anh';
export const ANH_CHO_TOI_DA = 20;
export const LO_TOI_DA = 200;
export const CANH_BAO_SAU_MS = 4 * 3_600_000;

/** Phần do màn hình truyền vào (theo loại sự kiện) */
export interface SuKienNhap {
  loai: string;
  hex?: string | null;
  congDoanId?: string | null;
  toId?: number | null;
  soLuong?: number | null;
  congDoanDenId?: string | null;
  congDoanNguonId?: string | null;
  xuongNguon?: string | null;
  soNguoi?: number | null;
  lyDoTamNgung?: string | null;
  tienDo?: number | null;
  ghiChu?: string | null;
  duLieu?: Record<string, unknown> | null;
  suaCho?: string | null;
  /** Ghi lùi giờ (ms, giờ máy): chỉ dùng cho "Đã dừng lúc …" khi xác nhận cuối ngày (3C). Mặc định = lúc bấm */
  lucXayRa?: number;
}

/** Sự kiện đang chờ gửi (đúng hình dạng API POST /api/xuong/events nhận) */
export interface SuKienCho extends SuKienNhap {
  id: string;
  deviceTs: number;
  lechMs: number | null;
  sauDoiGio: boolean;
  userId: number | null;
  /** Lúc đưa vào hàng đợi (ms) — sắp thứ tự gửi */
  queuedAt: number;
}

/** Máy đã có 20 ảnh chờ gửi (R11): chặn chụp thêm tới khi có sóng gửi bớt */
export class LoiQuaNhieuAnh extends Error {
  constructor() { super(`Máy đang giữ ${ANH_CHO_TOI_DA} ảnh chưa gửi — cần có sóng để gửi bớt rồi mới chụp thêm.`); this.name = 'LoiQuaNhieuAnh'; }
}

export class LoiLuuMay extends Error {
  constructor(cause: unknown) {
    super('Chưa lưu được trên máy (bộ nhớ trình duyệt đầy hoặc bị chặn). Thao tác này CHƯA được ghi nhận.');
    this.name = 'LoiLuuMay';
    (this as { cause?: unknown }).cause = cause;
  }
}

interface AnhCho { id: string; blob: Blob; kieu: 'image/webp' | 'image/jpeg'; hex: string; queuedAt: number }

const xong = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const xongTx = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error('Giao dịch IndexedDB bị huỷ'));
});

const uuid = (): string => (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.()
  ?? '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));

/**
 * Mốc xếp hàng tăng dần NGẶT: một lần bấm ghi nhiều sự kiện cùng mili-giây (Xong + Giao, Vào ca + Quân số, Chia người +
 * Bắt đầu) phải gửi đúng thứ tự bấm — trước trùng queuedAt thì xếp theo id ngẫu nhiên, ~1/2 số lần "Giao" đi trước
 * "Xong" và máy chủ từ chối "Giao nhiều hơn số đã xong".
 */
let queuedCuoi = 0;
const mocXepHang = (now: number) => { queuedCuoi = Math.max(now, queuedCuoi + 0.001); return queuedCuoi; };

/** Thời gian chờ gửi lại sau lần thất bại thứ n (0-based): 1s, 2s, 4s … tối đa 60s, nhân jitter 0,5–1,5 */
export const thoiGianChoLai = (lanThatBai: number, ngauNhien: number): number =>
  Math.round(Math.min(60_000, 1000 * 2 ** Math.max(0, lanThatBai)) * (0.5 + Math.min(1, Math.max(0, ngauNhien))));

export interface KetQuaGui {
  /** Số sự kiện server đã nhận (lưu mới hoặc đã có) */
  daGui: number;
  /** Bị server từ chối hẳn — đã bỏ khỏi máy, giao diện cần báo cho người bấm */
  tuChoi: Array<{ id: string; reason: string; suKien?: SuKienCho }>;
  conLai: number;
  /** 'mat_mang' | 'qua_tai' | 'dang_nhap_lai' | 'loi_server' | 'mat_quyen' | 'cho_lai' | null */
  loi: string | null;
  /** ms tới lần thử kế tiếp (khi lỗi tạm thời) */
  thuLaiSau: number | null;
  /** Số ảnh máy chủ từ chối (400 / 413) — đã bỏ khỏi máy, sự kiện vẫn gửi */
  anhBo: number;
}

/** Tuỳ chọn một lượt gửi */
export interface TuyChonGui {
  /** Bấm "Gửi lại": bỏ qua thời gian chờ (choToi) và lần dừng vì mất quyền */
  boQuaCho?: boolean;
}

/** Thao tác của người khác đang nằm trên máy (chưa gửi được dưới tên người đang đăng nhập) */
export interface NhomNguoiKhac { userId: number | null; ten: string; so: number }

const KHOA_TEN_NGUOI = 'xuong_ten_nguoi';
const tenNguoi = (userId: number | null): string => {
  if (userId === null) return 'người chưa rõ';
  try {
    const m = JSON.parse(localStorage.getItem(KHOA_TEN_NGUOI) || '{}') as Record<string, string>;
    if (m[String(userId)]) return m[String(userId)];
  } catch { /* bỏ qua */ }
  return `tài khoản #${userId}`;
};

/**
 * Tách hàng đợi: phần của người đang đăng nhập (gửi được) và phần của người khác theo từng người.
 * nguoi = null (chưa rõ người — vd máy trạm): coi cả hàng là của mình.
 */
export function tachTheoNguoi(ds: SuKienCho[], nguoi: number | null): { cuaToi: SuKienCho[]; cuaNguoiKhac: NhomNguoiKhac[] } {
  if (nguoi === null) return { cuaToi: ds, cuaNguoiKhac: [] };
  const cuaToi: SuKienCho[] = [];
  const dem = new Map<number | null, number>();
  for (const e of ds) {
    if (e.userId === nguoi) cuaToi.push(e);
    else dem.set(e.userId ?? null, (dem.get(e.userId ?? null) ?? 0) + 1);
  }
  return { cuaToi, cuaNguoiKhac: [...dem].map(([userId, so]) => ({ userId, ten: tenNguoi(userId), so })) };
}

/** Cấu hình một hàng đợi: app tổ trưởng (mặc định) hoặc máy trạm quét (kho IndexedDB, API, token riêng) */
export interface CauHinhHangDoi {
  /** Tên cơ sở dữ liệu IndexedDB */
  dbName: string;
  /** API nhận lô */
  duongDan: string;
  /** Khoá localStorage của mã thiết bị đã ký */
  khoaThietBi: string;
  /** Header đăng nhập */
  auth: () => Record<string, string>;
  /** Sau mỗi lô máy chủ nhận (vd lưu token trạm được gia hạn) */
  sauLo?: (body: Record<string, unknown>) => void;
  /** Id người đang đăng nhập: có thì chỉ gửi sự kiện của người đó (app tổ). Không có: gửi cả hàng (máy trạm). */
  nguoiGui?: () => number | null;
}

export function taoHangDoi(ch: CauHinhHangDoi) {
  let dbPromise: Promise<IDBDatabase> | null = null;
  function moDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(ch.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('queuedAt', 'queuedAt');
        if (!db.objectStoreNames.contains(STORE_ANH)) db.createObjectStore(STORE_ANH, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }

  /** Ghi một lần bấm vào hàng đợi trên máy. Ném LoiLuuMay nếu không ghi được. */
  async function themSuKien(input: SuKienNhap, userId: number | null): Promise<SuKienCho> {
    const { lechMs, sauDoiGio } = lechLucBam();
    const now = Date.now();
    const { lucXayRa, ...nhap } = input;
    const ev: SuKienCho = {
      ...nhap, id: uuid(), deviceTs: lucXayRa !== undefined && lucXayRa <= now ? lucXayRa : now,
      lechMs, sauDoiGio, userId, queuedAt: mocXepHang(now),
    };
    try {
      const db = await moDb();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(ev);
      await xongTx(tx);
    } catch (e) {
      throw new LoiLuuMay(e);
    }
    return ev;
  }

  /** Mọi sự kiện đang chờ gửi, cũ trước */
  async function danhSachCho(): Promise<SuKienCho[]> {
    const db = await moDb();
    const all = await xong(db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<SuKienCho[]>);
    return all.sort((a, b) => a.queuedAt - b.queuedAt || (a.id < b.id ? -1 : 1));
  }


  /** Số ảnh đang chờ tải lên */
  async function soAnhCho(): Promise<number> {
    const db = await moDb();
    return xong(db.transaction(STORE_ANH, 'readonly').objectStore(STORE_ANH).count());
  }

  /** Lưu một ảnh đã nén vào máy; trả id ảnh để gắn vào sự kiện (duLieu.anhCho). Ném LoiQuaNhieuAnh / LoiLuuMay. */
  async function themAnh(blob: Blob, kieu: AnhCho['kieu'], hex: string): Promise<string> {
    let so: number;
    try { so = await soAnhCho(); } catch (e) { throw new LoiLuuMay(e); }
    if (so >= ANH_CHO_TOI_DA) throw new LoiQuaNhieuAnh();
    const a: AnhCho = { id: uuid(), blob, kieu, hex, queuedAt: Date.now() };
    try {
      const db = await moDb();
      const tx = db.transaction(STORE_ANH, 'readwrite');
      tx.objectStore(STORE_ANH).put(a);
      await xongTx(tx);
    } catch (e) {
      throw new LoiLuuMay(e);
    }
    return a.id;
  }

  /**
   * Gửi ảnh của các sự kiện trong lô (POST /api/xuong/anh, id ảnh do máy sinh nên gửi lại không trùng) rồi thay
   * duLieu.anhCho bằng duLieu.anh = [id ảnh] (lưu lại sự kiện, xoá ảnh khỏi máy). Lỗi mạng: ném để lượt gửi dừng và
   * thử lại sau — sự kiện + ảnh vẫn giữ trên máy. Máy chủ chưa bật ảnh (chưa chạy SQL): bỏ ảnh, vẫn gửi sự kiện.
   */
  async function taiAnhCuaLo(lo: SuKienCho[], fetchImpl: typeof fetch): Promise<number> {
    const can = lo.filter(e => Array.isArray(e.duLieu?.anhCho) && (e.duLieu!.anhCho as unknown[]).length);
    if (!can.length) return 0;
    const db = await moDb();
    let anhBo = 0;
    for (const ev of can) {
      const ids = (ev.duLieu!.anhCho as string[]);
      const khoa: string[] = [];
      let tat = false;
      for (const id of ids) {
        const a = await xong(db.transaction(STORE_ANH, 'readonly').objectStore(STORE_ANH).get(id) as IDBRequest<AnhCho | undefined>);
        if (!a) continue;
        const r = await fetchImpl(`/api/xuong/anh?id=${encodeURIComponent(a.id)}&hex=${encodeURIComponent(a.hex)}`, {
          method: 'POST', headers: { 'Content-Type': a.kieu, ...ch.auth() }, body: a.blob,
        });
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error(String(r.status)), { status: r.status });
        // Ảnh hỏng / quá lớn: máy chủ không bao giờ nhận — xoá ảnh này khỏi máy ngay, gửi ảnh còn lại
        if (r.status === 400 || r.status === 413) {
          const tx = db.transaction(STORE_ANH, 'readwrite');
          tx.objectStore(STORE_ANH).delete(id);
          await xongTx(tx);
          anhBo++;
          continue;
        }
        if (!r.ok) throw Object.assign(new Error(`anh ${r.status}`), { status: r.status });
        const b = await r.json() as { bat?: boolean; khoa?: string };
        if (!b.bat || !b.khoa) { tat = true; break; }
        khoa.push(b.khoa);
      }
      const { anhCho: _bo, ...conLai } = ev.duLieu as Record<string, unknown>;
      const moi: SuKienCho = { ...ev, duLieu: tat || !khoa.length ? conLai : { ...conLai, anh: khoa } };
      const tx = db.transaction([STORE, STORE_ANH], 'readwrite');
      tx.objectStore(STORE).put(moi);
      for (const id of ids) tx.objectStore(STORE_ANH).delete(id);
      await xongTx(tx);
      Object.assign(ev, moi);
    }
    return anhBo;
  }

  /** Người đang đăng nhập (máy trạm: null — gửi cả hàng) */
  const nguoiHienTai = () => (ch.nguoiGui ? ch.nguoiGui() : null);

  /**
   * Số sự kiện chờ gửi của người đang đăng nhập và tuổi sự kiện cũ nhất (ms) — thanh trạng thái, cảnh báo đỏ khi
   * quá 4 giờ. cuaNguoiKhac: thao tác của người khác còn trên máy (chờ người đó đăng nhập).
   */
  async function tinhTrangHangDoi(now = Date.now()): Promise<{ soCho: number; tuoiCuNhatMs: number | null; canhBao: boolean; cuaNguoiKhac: NhomNguoiKhac[] }> {
    const { cuaToi: ds, cuaNguoiKhac } = tachTheoNguoi(await danhSachCho(), nguoiHienTai());
    const tuoi = ds.length ? now - ds[0].queuedAt : null;
    return { soCho: ds.length, tuoiCuNhatMs: tuoi, canhBao: tuoi !== null && tuoi > CANH_BAO_SAU_MS, cuaNguoiKhac };
  }

  async function xoaIds(ids: string[]) {
    if (!ids.length) return;
    const db = await moDb();
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    for (const id of ids) st.delete(id);
    await xongTx(tx);
  }

  let lanThatBai = 0;
  let choToi = 0;
  /** Người đã bị 403 (mất quyền): lượt gửi tự động của người đó không gọi máy chủ, chờ mở lại app hoặc bấm Gửi lại.
   *  Gắn với người — người khác đăng nhập cùng tab vẫn gửi bình thường */
  let matQuyen: { nguoi: number | null } | null = null;
  /** Người của lượt gửi trước: đổi người thì bỏ thời gian chờ / số lần lỗi của người trước */
  let nguoiTruoc: number | null | undefined;
  let dangGui: Promise<KetQuaGui> | null = null;

  /**
   * Gửi hàng đợi. Gọi lúc mở app, khi có mạng lại, sau mỗi lần bấm. Gọi chồng nhau thì dùng chung một lượt.
   * tuyChon.boQuaCho (nút "Gửi lại"): gửi ngay, không chờ hết thời gian chờ / lần dừng vì mất quyền.
   */
  function guiHangDoi(fetchImpl: typeof fetch = fetch, ngauNhien: () => number = Math.random, tuyChon: TuyChonGui = {}): Promise<KetQuaGui> {
    if (dangGui) return dangGui;
    dangGui = (async (): Promise<KetQuaGui> => {
      const tuChoi: KetQuaGui['tuChoi'] = [];
      let daGui = 0;
      let anhBo = 0;
      const nguoi = nguoiHienTai();
      // Chỉ thao tác của người đang đăng nhập; của người khác để nguyên trên máy (không gửi, không xoá)
      const cuaToi = async () => tachTheoNguoi(await danhSachCho(), nguoi).cuaToi;
      const now = Date.now();
      if (nguoiTruoc !== undefined && nguoi !== nguoiTruoc) { choToi = 0; lanThatBai = 0; matQuyen = null; }
      nguoiTruoc = nguoi;
      if (tuyChon.boQuaCho) { choToi = 0; matQuyen = null; }
      if (matQuyen && matQuyen.nguoi === nguoi) return { daGui, tuChoi, conLai: (await cuaToi()).length, loi: 'mat_quyen', thuLaiSau: null, anhBo };
      if (now < choToi) {
        return { daGui, tuChoi, conLai: (await cuaToi()).length, loi: 'cho_lai', thuLaiSau: choToi - now, anhBo };
      }
      const deviceToken = (() => { try { return localStorage.getItem(ch.khoaThietBi); } catch { return null; } })();
      const loiTam = async (loi: string): Promise<KetQuaGui> => {
        const cho = thoiGianChoLai(lanThatBai, ngauNhien());
        lanThatBai++;
        choToi = Date.now() + cho;
        return { daGui, tuChoi, conLai: (await cuaToi()).length, loi, thuLaiSau: cho, anhBo };
      };
      // 403: dừng, giữ nguyên hàng đợi, không hẹn giờ thử lại
      const dungMatQuyen = (conLai: number): KetQuaGui => { matQuyen = { nguoi }; return { daGui, tuChoi, conLai, loi: 'mat_quyen', thuLaiSau: null, anhBo }; };
      for (;;) {
        const ds = await cuaToi();
        if (!ds.length) { lanThatBai = 0; return { daGui, tuChoi, conLai: 0, loi: null, thuLaiSau: null, anhBo }; }
        if (!deviceToken) return { daGui, tuChoi, conLai: ds.length, loi: 'dang_nhap_lai', thuLaiSau: null, anhBo };
        const lo = ds.slice(0, LO_TOI_DA);
        try {
          anhBo += await taiAnhCuaLo(lo, fetchImpl);
        } catch (e) {
          const st = (e as { status?: number }).status;
          if (st === 401) return { daGui, tuChoi, conLai: ds.length, loi: 'dang_nhap_lai', thuLaiSau: null, anhBo };
          if (st === 403) return dungMatQuyen(ds.length);
          if (st === 429) return loiTam('qua_tai');
          if (st !== undefined) return loiTam('loi_server');
          return loiTam('mat_mang');
        }
        const gui = lo.map(({ queuedAt: _q, ...e }) => e);
        let r: Response;
        try {
          r = await fetchImpl(ch.duongDan, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ch.auth() },
            body: JSON.stringify({ deviceToken, events: gui }),
          });
        } catch {
          return loiTam('mat_mang');
        }
        if (r.status === 401) return { daGui, tuChoi, conLai: ds.length, loi: 'dang_nhap_lai', thuLaiSau: null, anhBo };
        if (r.status === 403) return dungMatQuyen(ds.length);
        if (r.status === 429) return loiTam('qua_tai');
        if (!r.ok) return loiTam('loi_server');
        const body = await r.json().catch(() => null) as { saved?: string[]; rejected?: Array<{ id: string; reason: string }>; available?: boolean; [k: string]: unknown } | null;
        if (!body || body.available === false || !Array.isArray(body.saved)) return loiTam('loi_server');
        ch.sauLo?.(body as Record<string, unknown>);
        const theoId = new Map(lo.map(e => [e.id, e]));
        const xoa = [...body.saved, ...(body.rejected ?? []).map(x => x.id)].filter(id => theoId.has(id));
        for (const x of body.rejected ?? []) if (theoId.has(x.id)) tuChoi.push({ ...x, suKien: theoId.get(x.id) });
        await xoaIds(xoa);
        daGui += body.saved.filter(id => theoId.has(id)).length;
        lanThatBai = 0;
        // Server không trả gì về lô này (bất thường) => dừng để khỏi lặp vô hạn
        if (!xoa.length) return loiTam('loi_server');
      }
    })().finally(() => { dangGui = null; });
    return dangGui;
  }

  return { themSuKien, danhSachCho, soAnhCho, themAnh, tinhTrangHangDoi, guiHangDoi };
}

// Hàng đợi của app tổ trưởng (/api/xuong/events)
const macDinh = taoHangDoi({ dbName: DB_NAME, duongDan: '/api/xuong/events', khoaThietBi: XUONG_DEVICE_KEY, auth: authXuong, nguoiGui: idNguoiDangDung });
/** Ghi một lần bấm vào hàng đợi trên máy. Ném LoiLuuMay nếu không ghi được. */
export const themSuKien = macDinh.themSuKien;
/** Mọi sự kiện đang chờ gửi, cũ trước */
export const danhSachCho = macDinh.danhSachCho;
/** Số ảnh đang chờ tải lên */
export const soAnhCho = macDinh.soAnhCho;
/** Lưu một ảnh đã nén vào máy; trả id ảnh để gắn vào sự kiện (duLieu.anhCho). Ném LoiQuaNhieuAnh / LoiLuuMay. */
export const themAnh = macDinh.themAnh;
/** Số sự kiện chờ gửi và tuổi sự kiện cũ nhất (ms) — thanh trạng thái, cảnh báo đỏ khi quá 4 giờ */
export const tinhTrangHangDoi = macDinh.tinhTrangHangDoi;
/** Gửi hàng đợi. Gọi lúc mở app, khi có mạng lại, sau mỗi lần bấm. Gọi chồng nhau thì dùng chung một lượt. */
export const guiHangDoi = macDinh.guiHangDoi;
/** Nút "Gửi lại": gửi ngay, bỏ qua thời gian chờ và lần dừng vì mất quyền */
export const guiLaiNgay = () => macDinh.guiHangDoi(fetch, Math.random, { boQuaCho: true });


/** Xin trình duyệt giữ bộ nhớ lâu dài (không tự xoá khi máy đầy). null = trình duyệt không hỗ trợ. */
export async function xinLuuBen(): Promise<boolean | null> {
  try {
    const st = (navigator as Navigator & { storage?: StorageManager }).storage;
    if (!st?.persist) return null;
    if (await st.persisted?.()) return true;
    return await st.persist();
  } catch {
    return null;
  }
}

