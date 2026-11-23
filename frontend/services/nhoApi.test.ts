import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ngayVN, hopLe, catBot, nenGhi, duocNho, DUOC_NHO, napNho, docNho, goiNho, goiTruoc, boNho, trangThaiNho, theoDoiNho,
  baoMocDoi, theoDoiMoc, datLaiDeThu, type BanGhiNho, type KhoNho, type MucNho,
} from './nhoApi';

// ---- Kho giả (thay IndexedDB + localStorage) ----
const taoKho = () => {
  const k = {
    dia: undefined as BanGhiNho | undefined,
    gen: 0,
    mucV: 'thuong' as string | null,
    chuV: 'an' as string | null,
    soDoc: 0, soGhi: 0, soXoa: 0,
    chanDoc: null as Promise<void> | null, // đặt để làm chậm lần đọc đĩa
    kho: null as unknown as KhoNho,
  };
  k.kho = {
    doc: async () => { k.soDoc++; const v = k.dia ? JSON.parse(JSON.stringify(k.dia)) : undefined; if (k.chanDoc) await k.chanDoc; return v; },
    ghi: async (theHe, gop) => {
      await Promise.resolve();
      if (theHe !== k.gen) return;
      const v = gop(k.dia);
      if (v) { k.dia = v; k.soGhi++; }
    },
    xoa: async () => { k.soXoa++; k.dia = undefined; },
    theHe: () => k.gen,
    muc: () => k.mucV,
    chu: () => k.chuV,
    khiRanh: f => f(),
  };
  return k;
};

// ---- fetch giả ----
type TraLoi = { ok?: boolean; status?: number; s?: string; loiMang?: boolean; cho?: Promise<void> };
const mang = new Map<string, TraLoi>();
const daGoi: string[] = [];
const tinHieu: Array<AbortSignal | undefined> = []; // signal nhoApi gắn cho từng request (cùng thứ tự với daGoi)
const fetchGia = vi.fn(async (url: string, init?: { signal?: AbortSignal }) => {
  daGoi.push(url); tinHieu.push(init?.signal);
  const t = mang.get(url) ?? { ok: false, status: 404, s: '' };
  if (t.cho) await t.cho;
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (t.loiMang) throw new TypeError('Failed to fetch');
  return { ok: t.ok ?? true, status: t.status ?? 200, text: async () => t.s ?? '' };
});
const soLanGoi = (url: string) => daGoi.filter(u => u === url).length;
const chot = () => { let mo!: () => void; const p = new Promise<void>(r => { mo = r; }); return { p, mo }; };

const U1 = '/api/overview/summary?dateFrom=2026-11-13&dateTo=2026-11-13';
const U2 = '/api/trend?source=inventory&granularity=day&dateFrom=2026-11-07&dateTo=2026-11-13';
const GIO = new Date('2026-11-14T02:00:00Z'); // 09:00 ngày 14/11 giờ VN
const NGAY = '2026-11-14';
/** Cho hẹn giờ ghi (2 giây) chạy xong */
const xaGhi = () => vi.advanceTimersByTimeAsync(2500);

let k: ReturnType<typeof taoKho>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(GIO);
  vi.stubGlobal('fetch', fetchGia);
  mang.clear(); daGoi.length = 0; tinHieu.length = 0; fetchGia.mockClear();
  k = taoKho();
  datLaiDeThu(k.kho);
});
afterEach(() => {
  datLaiDeThu();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('hàm thuần', () => {
  it('ngayVN đúng ở 23:30 và 00:30 giờ VN', () => {
    expect(ngayVN(new Date('2026-11-13T16:30:00Z'))).toBe('2026-11-13'); // 23:30 ngày 13 giờ VN
    expect(ngayVN(new Date('2026-11-13T17:30:00Z'))).toBe('2026-11-14'); // 00:30 ngày 14 giờ VN
    expect(ngayVN(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01');
  });

  it('hopLe: khác ngày, khác mức xem, khác tài khoản đều bỏ', () => {
    const bg: BanGhiNho = { ngay: NGAY, muc: 'thuong', chu: 'an', m: {} };
    expect(hopLe(bg, NGAY, 'thuong', 'an')).toBe(true);
    expect(hopLe(bg, '2026-11-15', 'thuong', 'an')).toBe(false);
    expect(hopLe(bg, NGAY, 'gia', 'an')).toBe(false);
    expect(hopLe(bg, NGAY, 'thuong', 'binh')).toBe(false);
    // Thiếu mức xem / tài khoản (chưa xác nhận) cũng không dùng
    expect(hopLe(bg, NGAY, null, 'an')).toBe(false);
    expect(hopLe(bg, NGAY, 'thuong', '')).toBe(false);
    expect(hopLe({ ...bg, muc: undefined }, NGAY, undefined, 'an')).toBe(false);
    // Bản ghi hỏng
    expect(hopLe(undefined, NGAY, 'thuong', 'an')).toBe(false);
    expect(hopLe(null, NGAY, 'thuong', 'an')).toBe(false);
    expect(hopLe('x', NGAY, 'thuong', 'an')).toBe(false);
    expect(hopLe({ ngay: NGAY, muc: 'thuong', chu: 'an' }, NGAY, 'thuong', 'an')).toBe(false);
  });

  it('catBot: quá số mục thì bỏ mục t cũ nhất', () => {
    const m: Record<string, MucNho> = {};
    for (let i = 1; i <= 45; i++) m[`/u${i}`] = { t: i, s: 'x' };
    const ra = catBot(m, 40, 1_500_000);
    expect(Object.keys(ra)).toHaveLength(40);
    expect(ra['/u45']).toBeDefined();
    expect(ra['/u6']).toBeDefined();
    expect(ra['/u5']).toBeUndefined();
    expect(ra['/u1']).toBeUndefined();
    expect(Object.keys(m)).toHaveLength(45); // không sửa đầu vào
  });

  it('catBot: quá tổng ký tự thì bỏ mục t cũ nhất', () => {
    const s = 'a'.repeat(100_000);
    const m: Record<string, MucNho> = {};
    for (let i = 1; i <= 20; i++) m[`/u${i}`] = { t: i, s };
    const ra = catBot(m, 40, 1_500_000);
    expect(Object.keys(ra)).toHaveLength(15);
    expect(ra['/u20']).toBeDefined();
    expect(ra['/u6']).toBeDefined();
    expect(ra['/u5']).toBeUndefined();
  });

  it('catBot: mục dài hơn 200 nghìn ký tự và mục hỏng không vào', () => {
    const ra = catBot({
      '/to': { t: 9, s: 'a'.repeat(200_001) },
      '/vua': { t: 1, s: 'a'.repeat(200_000) },
      '/hong': { t: 5 } as unknown as MucNho,
    }, 40, 1_500_000);
    expect(Object.keys(ra)).toEqual(['/vua']);
  });

  it('nenGhi: phản hồi của request bắt đầu sớm hơn không ghi đè', () => {
    expect(nenGhi(undefined, 100)).toBe(true);
    expect(nenGhi(null, 100)).toBe(true);
    expect(nenGhi({ t: 100 }, 101)).toBe(true);
    expect(nenGhi({ t: 100 }, 100)).toBe(true);
    expect(nenGhi({ t: 100 }, 99)).toBe(false);
  });

  it('duocNho: so đúng tên đường dẫn', () => {
    expect(duocNho(U1)).toBe(true);
    expect(duocNho('/api/overview/summary')).toBe(true);
    expect(duocNho(U2)).toBe(true);
    expect(duocNho('/api/trend-by-xuong?source=inventory')).toBe(false);
    expect(duocNho('/api/revenue/2026')).toBe(true);
    expect(duocNho('/api/revenue')).toBe(false);
    expect(duocNho('/api/revenue/2026/x')).toBe(false);
    expect(duocNho('/api/vuong-mac/by-project')).toBe(true);
    expect(duocNho('/api/vuong-mac/all?q=1')).toBe(false);
    expect(duocNho('/api/view-project-mapping')).toBe(false);
    expect(duocNho('/api/tong-quan/cong-trinh')).toBe(false);
    expect(DUOC_NHO).toContain('/api/khsx-nhapkho/summary');
  });
});

describe('goiNho', () => {
  it('chưa ai gọi napNho: docNho trả undefined, goiNho vẫn gọi mạng và trả object', async () => {
    mang.set(U1, { s: '{"a":1}' });
    expect(docNho(U1)).toBeUndefined();
    const v = await goiNho<{ a: number }>(U1);
    expect(v).toEqual({ a: 1 });
    expect(soLanGoi(U1)).toBe(1);
    expect(docNho(U1)).toBe(v); // trong phiên: đọc lại đúng object đó
    await xaGhi();
    expect(k.soDoc).toBe(0);
    expect(k.dia).toEqual({ ngay: NGAY, muc: 'thuong', chu: 'an', m: { [U1]: { t: GIO.getTime(), s: '{"a":1}' } } });
  });

  it('chữ giống bản lưu: trả ĐÚNG object cũ (===); chữ khác: object mới', async () => {
    mang.set(U1, { s: '{"a":1}' });
    const v1 = await goiNho(U1);
    const v2 = await goiNho(U1);
    expect(v2).toBe(v1);
    expect(soLanGoi(U1)).toBe(2);
    mang.set(U1, { s: '{"a":2}' });
    const v3 = await goiNho(U1);
    expect(v3).toEqual({ a: 2 });
    expect(v3).not.toBe(v1);
    expect(docNho(U1)).toBe(v3);
  });

  it('bản lưu nạp từ đĩa: docNho trả cùng 1 object mỗi lần, mạng trả chữ giống thì vẫn object đó', async () => {
    k.dia = { ngay: NGAY, muc: 'thuong', chu: 'an', m: { [U1]: { t: GIO.getTime() - 60_000, s: '{"a":1}' } } };
    await napNho('an');
    const cu = docNho(U1);
    expect(cu).toEqual({ a: 1 });
    expect(docNho(U1)).toBe(cu);
    mang.set(U1, { s: '{"a":1}' });
    expect(await goiNho(U1)).toBe(cu);
  });

  it('!ok trả null, bản lưu còn nguyên, trạng thái lỗi bật; gọi lại được thì tắt', async () => {
    mang.set(U1, { s: '{"a":1}' });
    const v1 = await goiNho(U1);
    await xaGhi();
    const diaTruoc = JSON.stringify(k.dia);
    const nghe = vi.fn();
    theoDoiNho(nghe);
    expect(trangThaiNho()).toEqual({ loi: false, t: null });

    vi.setSystemTime(new Date(GIO.getTime() + 60_000));
    mang.set(U1, { ok: false, status: 500, s: '{"error":"x"}' });
    expect(await goiNho(U1)).toBeNull();
    expect(docNho(U1)).toBe(v1);
    expect(trangThaiNho()).toEqual({ loi: true, t: GIO.getTime() });
    expect(nghe).toHaveBeenCalledTimes(1);
    await xaGhi();
    expect(JSON.stringify(k.dia)).toBe(diaTruoc);

    mang.set(U1, { s: '{"a":1}' });
    expect(await goiNho(U1)).toBe(v1);
    expect(trangThaiNho()).toEqual({ loi: false, t: null });
    expect(nghe).toHaveBeenCalledTimes(2);
  });

  it('lỗi mạng (fetch ném) và chữ không phải JSON: trả null, không đụng bản lưu', async () => {
    mang.set(U1, { s: '{"a":1}' });
    const v1 = await goiNho(U1);
    mang.set(U1, { loiMang: true });
    expect(await goiNho(U1)).toBeNull();
    expect(docNho(U1)).toBe(v1);
    expect(trangThaiNho().loi).toBe(true);
    mang.set(U1, { s: '<html>502</html>' });
    expect(await goiNho(U1)).toBeNull();
    expect(docNho(U1)).toBe(v1);
  });

  it('lỗi ở URL chưa có số lưu: trả null, không bật nhãn', async () => {
    mang.set(U1, { ok: false, status: 500 });
    expect(await goiNho(U1)).toBeNull();
    expect(trangThaiNho()).toEqual({ loi: false, t: null });
  });

  it('URL ngoài danh sách và khongLuu không được lưu', async () => {
    const NGOAI = '/api/trend-by-xuong?source=inventory';
    const TUAN = '/api/khsx-nhapkho/summary?nam=2026&mode=week&tuan=46';
    mang.set(NGOAI, { s: '[1]' });
    mang.set(TUAN, { s: '{"totalKh":1}' });
    expect(await goiNho(NGOAI)).toEqual([1]);
    expect(await goiNho(TUAN, { khongLuu: true })).toEqual({ totalKh: 1 });
    expect(docNho(NGOAI)).toBeUndefined();
    expect(docNho(TUAN)).toBeUndefined();
    await xaGhi();
    expect(k.dia).toBeUndefined();
    // Cùng đường dẫn nhưng không khongLuu (mode=month) thì lưu
    const THANG = '/api/khsx-nhapkho/summary?nam=2026&mode=month&thang=11';
    mang.set(THANG, { s: '{"totalKh":2}' });
    await goiNho(THANG);
    expect(docNho(THANG)).toEqual({ totalKh: 2 });
  });

  it('mục dài hơn 200 nghìn ký tự: trả object nhưng không lưu', async () => {
    const s = JSON.stringify({ a: 'x'.repeat(200_000) });
    mang.set(U1, { s });
    expect(await goiNho<{ a: string }>(U1)).toHaveProperty('a');
    expect(docNho(U1)).toBeUndefined();
    await xaGhi();
    expect(k.dia).toBeUndefined();
  });

  it('thế hệ cache đổi giữa chừng (clearDataCache): không lưu, vẫn trả object cho nơi gọi', async () => {
    const c = chot();
    mang.set(U1, { s: '{"a":1}', cho: c.p });
    const p = goiNho(U1);
    k.gen++; // đăng xuất / đổi mức xem
    c.mo();
    expect(await p).toEqual({ a: 1 });
    expect(docNho(U1)).toBeUndefined();
    await xaGhi();
    expect(k.dia).toBeUndefined();
  });

  it('boNho() giữa chừng: request đang bay không được ghi lại; bản lưu trên đĩa bị xoá', async () => {
    mang.set(U2, { s: '[2]' });
    await goiNho(U2);
    await xaGhi();
    expect(k.dia?.m[U2]).toBeDefined();

    const c = chot();
    mang.set(U1, { s: '{"a":1}', cho: c.p });
    const p = goiNho(U1);
    boNho();
    expect(docNho(U2)).toBeUndefined();
    c.mo();
    expect(await p).toEqual({ a: 1 });
    expect(docNho(U1)).toBeUndefined();
    await xaGhi();
    expect(k.soXoa).toBe(1);
    expect(k.dia).toBeUndefined();
  });

  it('thế hệ cache đổi sau khi đã có số trong RAM: docNho không trả số cũ, không ghi xuống kho mới', async () => {
    mang.set(U1, { s: '{"a":1}' });
    await goiNho(U1);
    k.gen++;
    k.dia = undefined;
    expect(docNho(U1)).toBeUndefined();
    await xaGhi();
    expect(k.dia).toBeUndefined();
  });

  it('2 lời gọi cùng URL đang bay chỉ 1 fetch, nhận cùng 1 object', async () => {
    const c = chot();
    mang.set(U1, { s: '{"a":1}', cho: c.p });
    const p1 = goiNho(U1), p2 = goiNho(U1);
    c.mo();
    const [v1, v2] = await Promise.all([p1, p2]);
    expect(soLanGoi(U1)).toBe(1);
    expect(v2).toBe(v1);
    // Xong rồi thì lời gọi sau gửi request mới (không giữ kết quả khi không phải gửi trước)
    await goiNho(U1);
    expect(soLanGoi(U1)).toBe(2);
  });

  it('huỷ signal: nơi gọi nhận AbortError, request chung vẫn chạy và vẫn lưu', async () => {
    const c = chot();
    mang.set(U1, { s: '{"a":1}', cho: c.p });
    const ac = new AbortController();
    const p1 = goiNho(U1, { signal: ac.signal });
    const p2 = goiNho(U1);
    const bat = p1.then(() => 'xong', (e: Error) => e.name);
    ac.abort();
    expect(await bat).toBe('AbortError');
    c.mo();
    expect(await p2).toEqual({ a: 1 });
    expect(soLanGoi(U1)).toBe(1);
    expect(docNho(U1)).toEqual({ a: 1 });
    // signal đã huỷ sẵn: không gửi gì
    await expect(goiNho(U2, { signal: ac.signal })).rejects.toHaveProperty('name', 'AbortError');
    expect(soLanGoi(U2)).toBe(0);
  });

  it('nơi gọi DUY NHẤT huỷ: request mạng bị huỷ theo (trả suất hàng đợi), không bật nhãn lỗi, lời gọi sau gửi request mới', async () => {
    mang.set(U1, { s: '{"a":"cu"}' });
    await goiNho(U1); // đang có số lưu của U1 => nếu coi là lỗi mạng thì nhãn sẽ bật
    const c = chot();
    mang.set(U1, { s: '{"a":"moi"}', cho: c.p });
    const ac = new AbortController();
    const bat = goiNho(U1, { signal: ac.signal }).then(() => 'xong', (e: Error) => e.name);
    ac.abort();
    expect(await bat).toBe('AbortError');
    expect(tinHieu[1]?.aborted).toBe(true);
    // Lời gọi sau không dùng lại request đã huỷ
    mang.set(U1, { s: '{"a":"moi2"}' });
    expect(await goiNho(U1)).toEqual({ a: 'moi2' });
    expect(soLanGoi(U1)).toBe(3);
    c.mo(); // request bị huỷ kết thúc muộn: không đè số mới, không báo lỗi
    await vi.advanceTimersByTimeAsync(0);
    expect(docNho(U1)).toEqual({ a: 'moi2' });
    expect(trangThaiNho().loi).toBe(false);
  });

  it('2 nơi gọi có signal, 1 nơi huỷ: request vẫn chạy cho nơi còn lại; cả 2 huỷ mới huỷ request', async () => {
    const c = chot();
    mang.set(U1, { s: '{"a":1}', cho: c.p });
    const ac1 = new AbortController(), ac2 = new AbortController();
    const b1 = goiNho(U1, { signal: ac1.signal }).then(() => 'xong', (e: Error) => e.name);
    const p2 = goiNho(U1, { signal: ac2.signal });
    ac1.abort();
    expect(await b1).toBe('AbortError');
    expect(tinHieu[0]?.aborted).toBe(false);
    c.mo();
    expect(await p2).toEqual({ a: 1 });
    expect(soLanGoi(U1)).toBe(1);

    const c2 = chot();
    mang.set(U2, { s: '[1]', cho: c2.p });
    const ac3 = new AbortController(), ac4 = new AbortController();
    const b3 = goiNho(U2, { signal: ac3.signal }).catch((e: Error) => e.name);
    const b4 = goiNho(U2, { signal: ac4.signal }).catch((e: Error) => e.name);
    ac3.abort(); ac4.abort();
    expect(await b3).toBe('AbortError');
    expect(await b4).toBe('AbortError');
    expect(tinHieu[1]?.aborted).toBe(true);
    c2.mo();
  });

  it('request gửi trước không bị huỷ khi component huỷ; component gắn lại nhận đúng request đó', async () => {
    const c = chot();
    mang.set(U1, { s: '{"a":1}', cho: c.p });
    goiTruoc([U1]);
    const ac = new AbortController();
    const bat = goiNho(U1, { signal: ac.signal }).then(() => 'xong', (e: Error) => e.name);
    ac.abort(); // StrictMode / gắn lại
    expect(await bat).toBe('AbortError');
    expect(tinHieu[0]?.aborted).toBe(false);
    const p = goiNho(U1, { signal: new AbortController().signal });
    c.mo();
    expect(await p).toEqual({ a: 1 });
    expect(soLanGoi(U1)).toBe(1);
  });

  it('phản hồi của request bắt đầu sớm hơn về sau không đè số mới trong bản lưu', async () => {
    const c = chot();
    mang.set(U1, { s: '{"a":"cu"}', cho: c.p });
    const pCu = goiNho(U1); // bắt đầu lúc GIO
    boNhoDangBay();
    vi.setSystemTime(new Date(GIO.getTime() + 1000));
    mang.set(U1, { s: '{"a":"moi"}' });
    expect(await goiNho(U1)).toEqual({ a: 'moi' });
    c.mo();
    await pCu;
    expect(docNho(U1)).toEqual({ a: 'moi' });
  });
});

/** Mô phỏng tín hiệu mốc đổi: lời gọi sau không dùng chung request đang bay (để tạo 2 request cùng URL chồng nhau) */
function boNhoDangBay() {
  baoMocDoi('m0');
  baoMocDoi(`m${Math.random()}`);
}

describe('napNho', () => {
  const banGhi = (them?: Partial<BanGhiNho>): BanGhiNho => ({
    ngay: NGAY, muc: 'thuong', chu: 'an',
    m: { [U1]: { t: GIO.getTime() - 3600_000, s: '{"a":1}' }, [U2]: { t: GIO.getTime() - 3000_000, s: '[2]' } },
    ...them,
  });

  it('cùng ngày, cùng mức, cùng tài khoản: nạp vào RAM; chỉ 1 lần mở kho dù gọi nhiều lần', async () => {
    k.dia = banGhi();
    const p = napNho('an');
    expect(docNho(U1)).toBeUndefined(); // chưa đọc xong thì chưa có
    expect(napNho('an')).toBe(p);
    await p;
    await napNho('an');
    expect(k.soDoc).toBe(1);
    expect(docNho(U1)).toEqual({ a: 1 });
    expect(docNho(U2)).toEqual([2]);
  });

  it('khác ngày: không hiện số hôm trước', async () => {
    k.dia = banGhi({ ngay: '2026-11-13' });
    await napNho('an');
    expect(docNho(U1)).toBeUndefined();
  });

  it('khác mức xem dữ liệu: bỏ', async () => {
    k.dia = banGhi({ muc: 'gia' });
    await napNho('an');
    expect(docNho(U1)).toBeUndefined();
    // Mức xem chưa xác nhận cũng bỏ
    datLaiDeThu(k.kho);
    k.dia = banGhi();
    k.mucV = null;
    await napNho('an');
    expect(docNho(U1)).toBeUndefined();
  });

  it('khác tài khoản: bỏ', async () => {
    k.dia = banGhi({ chu: 'binh' });
    await napNho('an');
    expect(docNho(U1)).toBeUndefined();
  });

  it('mục ngoài danh sách / hỏng trong bản ghi bị bỏ qua', async () => {
    k.dia = banGhi({ m: {
      [U1]: { t: 1, s: '{"a":1}' },
      '/api/all-data': { t: 2, s: '{}' },
      [U2]: { t: 3, s: 'không phải JSON' },
    } });
    await napNho('an');
    expect(docNho(U1)).toEqual({ a: 1 });
    expect(docNho('/api/all-data')).toBeUndefined();
    expect(docNho(U2)).toBeUndefined();
  });

  it('đĩa đọc xong SAU khi mạng đã trả lời: số mới không bị số cũ đè', async () => {
    k.dia = banGhi();
    const c = chot();
    k.chanDoc = c.p;
    mang.set(U1, { s: '{"a":"moi"}' });
    const pNap = napNho('an');
    const pGoi = goiNho(U1); // gửi ngay, không chờ đĩa
    await vi.advanceTimersByTimeAsync(0);
    expect(soLanGoi(U1)).toBe(1);
    c.mo();
    await pNap;
    expect(await pGoi).toEqual({ a: 'moi' });
    expect(docNho(U1)).toEqual({ a: 'moi' });
    expect(docNho(U2)).toEqual([2]); // mục khác vẫn nạp
  });

  it('đọc đĩa treo (IndexedDB không trả lời): quá 3 giây goiNho vẫn trả số mạng, bản đĩa về muộn bị bỏ', async () => {
    k.dia = banGhi();
    const c = chot();
    k.chanDoc = c.p; // không bao giờ mở trong 3 giây đầu
    mang.set(U1, { s: '{"a":"moi"}' });
    void napNho('an');
    let kq: unknown = 'chua';
    void goiNho(U1).then(v => { kq = v; });
    await vi.advanceTimersByTimeAsync(2900);
    expect(kq).toBe('chua'); // còn trong hạn chờ đĩa
    await vi.advanceTimersByTimeAsync(200);
    expect(kq).toEqual({ a: 'moi' });
    c.mo(); // đĩa trả lời muộn
    await vi.advanceTimersByTimeAsync(0);
    expect(docNho(U1)).toEqual({ a: 'moi' });
    expect(docNho(U2)).toBeUndefined(); // bản đĩa về muộn không được nạp
  });

  it('kho bị xoá / boNho trong lúc đang đọc đĩa: bản vừa đọc bị bỏ', async () => {
    k.dia = banGhi();
    const c = chot();
    k.chanDoc = c.p;
    const p = napNho('an');
    boNho();
    c.mo();
    await p;
    expect(docNho(U1)).toBeUndefined();

    datLaiDeThu(k.kho);
    k.dia = banGhi();
    const c2 = chot();
    k.chanDoc = c2.p;
    const p2 = napNho('an');
    k.gen++;
    c2.mo();
    await p2;
    expect(docNho(U1)).toBeUndefined();
  });

  it('tab mở qua nửa đêm giờ VN: số hôm trước không còn được trả', async () => {
    k.dia = banGhi();
    await napNho('an');
    expect(docNho(U1)).toEqual({ a: 1 });
    vi.setSystemTime(new Date('2026-11-14T17:00:01Z')); // 00:00:01 ngày 15 giờ VN
    expect(docNho(U1)).toBeUndefined();
  });

  it('đổi sang tài khoản khác: số nạp của người trước bị bỏ khỏi RAM', async () => {
    k.dia = banGhi();
    await napNho('an');
    expect(docNho(U1)).toEqual({ a: 1 });
    await napNho('binh');
    expect(docNho(U1)).toBeUndefined();
  });
});

describe('ghi xuống đĩa', () => {
  it('gom nhiều phản hồi vào 1 lần ghi; gộp với bản tab khác vừa ghi theo t', async () => {
    const t0 = GIO.getTime();
    const U3 = '/api/stock/dates';
    k.dia = { ngay: NGAY, muc: 'thuong', chu: 'an', m: {
      [U1]: { t: t0 + 5000, s: '{"a":"tab-khac-moi-hon"}' },
      [U3]: { t: t0 - 5000, s: '[3]' },
    } };
    mang.set(U1, { s: '{"a":"tab-nay"}' });
    mang.set(U2, { s: '[2]' });
    await Promise.all([goiNho(U1), goiNho(U2)]);
    await xaGhi();
    expect(k.soGhi).toBe(1);
    expect(k.dia.m[U1].s).toBe('{"a":"tab-khac-moi-hon"}'); // tab kia mới hơn: giữ
    expect(k.dia.m[U2].s).toBe('[2]');
    expect(k.dia.m[U3].s).toBe('[3]'); // mục chỉ tab kia có: giữ
  });

  it('bản trên đĩa của ngày / tài khoản khác thì thay hẳn', async () => {
    k.dia = { ngay: '2026-11-13', muc: 'thuong', chu: 'an', m: { '/api/stock/dates': { t: 1, s: '[9]' } } };
    mang.set(U1, { s: '{"a":1}' });
    await goiNho(U1);
    await xaGhi();
    expect(k.dia.ngay).toBe(NGAY);
    expect(Object.keys(k.dia.m)).toEqual([U1]);
  });

  it('hai lần ghi cách nhau ít nhất 2 giây', async () => {
    mang.set(U1, { s: '{"a":1}' });
    mang.set(U2, { s: '[2]' });
    await goiNho(U1);
    await vi.advanceTimersByTimeAsync(0); // lần ghi đầu chạy ngay
    expect(k.soGhi).toBe(1);
    await goiNho(U2);
    await vi.advanceTimersByTimeAsync(1900);
    expect(k.soGhi).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(k.soGhi).toBe(2);
  });

  it('chưa rõ mức xem / tài khoản thì chưa ghi; rõ rồi thì lần ghi sau có đủ', async () => {
    k.mucV = null;
    mang.set(U1, { s: '{"a":1}' });
    mang.set(U2, { s: '[2]' });
    await goiNho(U1);
    await xaGhi();
    expect(k.dia).toBeUndefined();
    k.mucV = 'gia';
    await goiNho(U2);
    await xaGhi();
    expect(k.dia?.muc).toBe('gia');
    expect(Object.keys(k.dia?.m ?? {}).sort()).toEqual([U1, U2].sort());
  });

  it('RAM đang giữ số nạp của tài khoản khác với người đang đăng nhập: không ghi', async () => {
    k.dia = { ngay: NGAY, muc: 'thuong', chu: 'an', m: { [U1]: { t: 1, s: '{"a":1}' } } };
    await napNho('an');
    k.chuV = 'binh'; // đăng nhập người khác mà chưa ai gọi boNho
    mang.set(U2, { s: '[2]' });
    await goiNho(U2);
    await xaGhi();
    expect(k.dia.chu).toBe('an');
    expect(k.dia.m[U2]).toBeUndefined();
  });

  it('tài khoản trong storage đổi mà KHÔNG ai gọi boNho: docNho không trả số của người trước (nạp từ đĩa lẫn số trong phiên)', async () => {
    k.dia = { ngay: NGAY, muc: 'thuong', chu: 'an', m: { [U1]: { t: 1, s: '{"a":1}' } } };
    await napNho('an');
    mang.set(U2, { s: '[2]' });
    await goiNho(U2);
    expect(docNho(U1)).toEqual({ a: 1 });
    expect(docNho(U2)).toEqual([2]);
    k.chuV = 'binh'; // vd. /auth/me từ chối rồi người khác đăng nhập, hoặc tab khác đăng nhập người khác
    expect(docNho(U1)).toBeUndefined();
    expect(docNho(U2)).toBeUndefined();
    // Hết phiên (storage trống) rồi chính người cũ đăng nhập lại: cũng không còn số trong RAM
    k.chuV = null;
    expect(docNho(U1)).toBeUndefined();
    k.chuV = 'an';
    expect(docNho(U1)).toBeUndefined();
  });

  it('request gửi dưới phiên người trước, về sau khi đã đổi tài khoản: trả object nhưng không vào bản lưu', async () => {
    const c = chot();
    mang.set(U1, { s: '{"a":"cua-an"}', cho: c.p });
    const p = goiNho(U1);
    k.chuV = 'binh';
    c.mo();
    expect(await p).toEqual({ a: 'cua-an' });
    expect(docNho(U1)).toBeUndefined();
    await xaGhi();
    expect(k.dia).toBeUndefined();
  });

  it('kết quả gửi trước của phiên người trước không được dùng lại sau khi đổi tài khoản', async () => {
    mang.set(U1, { s: '{"a":1}' });
    goiTruoc([U1]);
    await vi.advanceTimersByTimeAsync(0);
    k.chuV = 'binh';
    await goiNho(U1);
    expect(soLanGoi(U1)).toBe(2);
  });

  it('napNho của tài khoản không còn là người đang đăng nhập: không nạp', async () => {
    k.dia = { ngay: NGAY, muc: 'thuong', chu: 'an', m: { [U1]: { t: 1, s: '{"a":1}' } } };
    const c = chot();
    k.chanDoc = c.p;
    const p = napNho('an');
    k.chuV = 'binh';
    c.mo();
    await p;
    expect(docNho(U1)).toBeUndefined();
    k.chuV = 'an';
    expect(docNho(U1)).toBeUndefined();
  });

  it('RAM giữ tối đa 40 mục', async () => {
    for (let i = 0; i < 45; i++) {
      const u = `/api/overview/summary?dateFrom=2026-10-${String(i).padStart(2, '0')}`;
      mang.set(u, { s: `{"i":${i}}` });
      vi.setSystemTime(new Date(GIO.getTime() + i));
      await goiNho(u);
    }
    expect(docNho('/api/overview/summary?dateFrom=2026-10-00')).toBeUndefined();
    expect(docNho('/api/overview/summary?dateFrom=2026-10-04')).toBeUndefined();
    expect(docNho('/api/overview/summary?dateFrom=2026-10-05')).toEqual({ i: 5 });
    expect(docNho('/api/overview/summary?dateFrom=2026-10-44')).toEqual({ i: 44 });
    await xaGhi();
    expect(Object.keys(k.dia?.m ?? {})).toHaveLength(40);
  });
});

describe('goiTruoc', () => {
  it('component gọi cùng URL trong 10 giây nhận lại kết quả, không gửi thêm; quá 10 giây thì gửi mới', async () => {
    mang.set(U1, { s: '{"a":1}' });
    mang.set(U2, { s: '[2]' });
    goiTruoc([U1, U2]);
    goiTruoc([U1]); // gọi lặp không gửi thêm
    await vi.advanceTimersByTimeAsync(300);
    expect(soLanGoi(U1)).toBe(1);
    const v = await goiNho(U1);
    expect(v).toEqual({ a: 1 });
    expect(await goiNho(U1)).toBe(v);
    expect(soLanGoi(U1)).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await goiNho(U1);
    expect(soLanGoi(U1)).toBe(2);
  });

  it('gửi trước bị lỗi thì không giữ: component gọi lại mạng', async () => {
    mang.set(U1, { ok: false, status: 500 });
    goiTruoc([U1]);
    await vi.advanceTimersByTimeAsync(10);
    mang.set(U1, { s: '{"a":1}' });
    expect(await goiNho(U1)).toEqual({ a: 1 });
    expect(soLanGoi(U1)).toBe(2);
  });

  it('boNho hoặc mốc dữ liệu đổi: kết quả gửi trước đang giữ không được dùng lại', async () => {
    mang.set(U1, { s: '{"a":1}' });
    goiTruoc([U1]);
    await vi.advanceTimersByTimeAsync(10);
    boNho();
    await goiNho(U1);
    expect(soLanGoi(U1)).toBe(2);

    goiTruoc([U2]);
    mang.set(U2, { s: '[2]' });
    await vi.advanceTimersByTimeAsync(10);
    baoMocDoi('v1');
    baoMocDoi('v2');
    await goiNho(U2);
    expect(soLanGoi(U2)).toBe(2);
  });
});

describe('boNho và tín hiệu mốc', () => {
  it('boNho xoá RAM, xoá đĩa, tắt nhãn lỗi; sau đó vẫn lưu lại được', async () => {
    mang.set(U1, { s: '{"a":1}' });
    await goiNho(U1);
    await xaGhi();
    mang.set(U1, { ok: false, status: 500 });
    await goiNho(U1);
    expect(trangThaiNho().loi).toBe(true);
    boNho();
    expect(docNho(U1)).toBeUndefined();
    expect(trangThaiNho()).toEqual({ loi: false, t: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(k.dia).toBeUndefined();
    mang.set(U1, { s: '{"a":2}' });
    await goiNho(U1);
    await xaGhi();
    expect(k.dia?.m[U1].s).toBe('{"a":2}');
  });

  it('trangThaiNho trả cùng 1 object khi không đổi (dùng được với useSyncExternalStore)', () => {
    expect(trangThaiNho()).toBe(trangThaiNho());
  });

  it('baoMocDoi: lần đầu chỉ ghi mốc, chữ ký đổi mới báo; thôi nghe thì không báo nữa', () => {
    const nghe = vi.fn();
    const thoi = theoDoiMoc(nghe);
    baoMocDoi('a|2026-11-14');
    expect(nghe).not.toHaveBeenCalled();
    baoMocDoi('a|2026-11-14');
    expect(nghe).not.toHaveBeenCalled();
    baoMocDoi('b|2026-11-14');
    expect(nghe).toHaveBeenCalledTimes(1);
    baoMocDoi('b|2026-11-15');
    expect(nghe).toHaveBeenCalledTimes(2);
    thoi();
    baoMocDoi('c|2026-11-15');
    expect(nghe).toHaveBeenCalledTimes(2);
  });
});
