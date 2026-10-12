import { lechLucBam, authXuong, XUONG_DEVICE_KEY } from './xuongClock';

// ============================================================================
// HÀNG ĐỢI SỰ KIỆN MỤC XƯỞNG TRÊN MÁY (nguyên tắc 5, R3, R13, C3 — docs/designs/xuong-checkin.md)
// - Mỗi lần bấm lưu vào IndexedDB TRƯỚC (giờ bấm + lệch đồng hồ lúc bấm), rồi mới gửi.
// - Gửi theo lô ≤ 200, server chống ghi trùng theo id. Chỉ xoá khỏi máy những id server trả về
//   (đã lưu hoặc bị từ chối hẳn); phần còn lại giữ nguyên để gửi lại.
// - 429 / lỗi server / mất mạng: chờ tăng dần có jitter (1 giây → tối đa 60 giây), không mất sự kiện.
// - 401 (token hết hạn / bị thu hồi): dừng, GIỮ hàng đợi, báo cần đăng nhập lại.
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

let dbPromise: Promise<IDBDatabase> | null = null;
function moDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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

/** Ghi một lần bấm vào hàng đợi trên máy. Ném LoiLuuMay nếu không ghi được. */
export async function themSuKien(input: SuKienNhap, userId: number | null): Promise<SuKienCho> {
  const { lechMs, sauDoiGio } = lechLucBam();
  const now = Date.now();
  const { lucXayRa, ...nhap } = input;
  const ev: SuKienCho = {
    ...nhap, id: uuid(), deviceTs: lucXayRa !== undefined && lucXayRa <= now ? lucXayRa : now,
    lechMs, sauDoiGio, userId, queuedAt: now,
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
export async function danhSachCho(): Promise<SuKienCho[]> {
  const db = await moDb();
  const all = await xong(db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<SuKienCho[]>);
  return all.sort((a, b) => a.queuedAt - b.queuedAt || (a.id < b.id ? -1 : 1));
}

interface AnhCho { id: string; blob: Blob; kieu: 'image/webp' | 'image/jpeg'; hex: string; queuedAt: number }

/** Số ảnh đang chờ tải lên */
export async function soAnhCho(): Promise<number> {
  const db = await moDb();
  return xong(db.transaction(STORE_ANH, 'readonly').objectStore(STORE_ANH).count());
}

/** Lưu một ảnh đã nén vào máy; trả id ảnh để gắn vào sự kiện (duLieu.anhCho). Ném LoiQuaNhieuAnh / LoiLuuMay. */
export async function themAnh(blob: Blob, kieu: AnhCho['kieu'], hex: string): Promise<string> {
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
async function taiAnhCuaLo(lo: SuKienCho[], fetchImpl: typeof fetch): Promise<void> {
  const can = lo.filter(e => Array.isArray(e.duLieu?.anhCho) && (e.duLieu!.anhCho as unknown[]).length);
  if (!can.length) return;
  const db = await moDb();
  for (const ev of can) {
    const ids = (ev.duLieu!.anhCho as string[]);
    const khoa: string[] = [];
    let tat = false;
    for (const id of ids) {
      const a = await xong(db.transaction(STORE_ANH, 'readonly').objectStore(STORE_ANH).get(id) as IDBRequest<AnhCho | undefined>);
      if (!a) continue;
      const r = await fetchImpl(`/api/xuong/anh?id=${encodeURIComponent(a.id)}&hex=${encodeURIComponent(a.hex)}`, {
        method: 'POST', headers: { 'Content-Type': a.kieu, ...authXuong() }, body: a.blob,
      });
      if (r.status === 401) throw Object.assign(new Error('401'), { status: 401 });
      if (!r.ok) throw new Error(`anh ${r.status}`);
      const b = await r.json() as { bat?: boolean; khoa?: string };
      if (!b.bat || !b.khoa) { tat = true; break; }
      khoa.push(b.khoa);
    }
    const { anhCho: _bo, ...conLai } = ev.duLieu as Record<string, unknown>;
    const moi: SuKienCho = { ...ev, duLieu: tat ? conLai : { ...conLai, anh: khoa } };
    const tx = db.transaction([STORE, STORE_ANH], 'readwrite');
    tx.objectStore(STORE).put(moi);
    for (const id of ids) tx.objectStore(STORE_ANH).delete(id);
    await xongTx(tx);
    Object.assign(ev, moi);
  }
}

/** Số sự kiện chờ gửi và tuổi sự kiện cũ nhất (ms) — thanh trạng thái, cảnh báo đỏ khi quá 4 giờ */
export async function tinhTrangHangDoi(now = Date.now()): Promise<{ soCho: number; tuoiCuNhatMs: number | null; canhBao: boolean }> {
  const ds = await danhSachCho();
  const tuoi = ds.length ? now - ds[0].queuedAt : null;
  return { soCho: ds.length, tuoiCuNhatMs: tuoi, canhBao: tuoi !== null && tuoi > CANH_BAO_SAU_MS };
}

async function xoaIds(ids: string[]) {
  if (!ids.length) return;
  const db = await moDb();
  const tx = db.transaction(STORE, 'readwrite');
  const st = tx.objectStore(STORE);
  for (const id of ids) st.delete(id);
  await xongTx(tx);
}

/** Thời gian chờ gửi lại sau lần thất bại thứ n (0-based): 1s, 2s, 4s … tối đa 60s, nhân jitter 0,5–1,5 */
export const thoiGianChoLai = (lanThatBai: number, ngauNhien: number): number =>
  Math.round(Math.min(60_000, 1000 * 2 ** Math.max(0, lanThatBai)) * (0.5 + Math.min(1, Math.max(0, ngauNhien))));

let lanThatBai = 0;
let choToi = 0;
let dangGui: Promise<KetQuaGui> | null = null;

export interface KetQuaGui {
  /** Số sự kiện server đã nhận (lưu mới hoặc đã có) */
  daGui: number;
  /** Bị server từ chối hẳn — đã bỏ khỏi máy, giao diện cần báo cho người bấm */
  tuChoi: Array<{ id: string; reason: string; suKien?: SuKienCho }>;
  conLai: number;
  /** 'mat_mang' | 'qua_tai' | 'dang_nhap_lai' | 'loi_server' | 'cho_lai' | null */
  loi: string | null;
  /** ms tới lần thử kế tiếp (khi lỗi tạm thời) */
  thuLaiSau: number | null;
}

/** Gửi hàng đợi. Gọi lúc mở app, khi có mạng lại, sau mỗi lần bấm. Gọi chồng nhau thì dùng chung một lượt. */
export function guiHangDoi(fetchImpl: typeof fetch = fetch, ngauNhien: () => number = Math.random): Promise<KetQuaGui> {
  if (dangGui) return dangGui;
  dangGui = (async (): Promise<KetQuaGui> => {
    const tuChoi: KetQuaGui['tuChoi'] = [];
    let daGui = 0;
    const now = Date.now();
    if (now < choToi) {
      return { daGui, tuChoi, conLai: (await danhSachCho()).length, loi: 'cho_lai', thuLaiSau: choToi - now };
    }
    const deviceToken = (() => { try { return localStorage.getItem(XUONG_DEVICE_KEY); } catch { return null; } })();
    const loiTam = async (loi: string): Promise<KetQuaGui> => {
      const cho = thoiGianChoLai(lanThatBai, ngauNhien());
      lanThatBai++;
      choToi = Date.now() + cho;
      return { daGui, tuChoi, conLai: (await danhSachCho()).length, loi, thuLaiSau: cho };
    };
    for (;;) {
      const ds = await danhSachCho();
      if (!ds.length) { lanThatBai = 0; return { daGui, tuChoi, conLai: 0, loi: null, thuLaiSau: null }; }
      if (!deviceToken) return { daGui, tuChoi, conLai: ds.length, loi: 'dang_nhap_lai', thuLaiSau: null };
      const lo = ds.slice(0, LO_TOI_DA);
      try {
        await taiAnhCuaLo(lo, fetchImpl);
      } catch (e) {
        if ((e as { status?: number }).status === 401) return { daGui, tuChoi, conLai: ds.length, loi: 'dang_nhap_lai', thuLaiSau: null };
        return loiTam('mat_mang');
      }
      const gui = lo.map(({ queuedAt: _q, ...e }) => e);
      let r: Response;
      try {
        r = await fetchImpl('/api/xuong/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authXuong() },
          body: JSON.stringify({ deviceToken, events: gui }),
        });
      } catch {
        return loiTam('mat_mang');
      }
      if (r.status === 401) return { daGui, tuChoi, conLai: ds.length, loi: 'dang_nhap_lai', thuLaiSau: null };
      if (r.status === 429) return loiTam('qua_tai');
      if (!r.ok) return loiTam('loi_server');
      const body = await r.json().catch(() => null) as { saved?: string[]; rejected?: Array<{ id: string; reason: string }>; available?: boolean } | null;
      if (!body || body.available === false || !Array.isArray(body.saved)) return loiTam('loi_server');
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

