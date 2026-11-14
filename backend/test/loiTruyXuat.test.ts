import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { accessTuDong, loadUserAccess, invalidateUserAccess, docUserDayDu } from '../src/server/permissions.js';
import { khoaPhienBan } from '../src/server/cache.js';
import { cachLamMoi } from '../src/server/workshopGroups.js';
import { giuHamSong, sqlDocChungTheoBang } from '../src/server/sharedCache.js';
import { napSomCho } from '../src/server/app.js';

// Chạy: npm test. KHÔNG kết nối DB: pool.query được thay bằng hàm giả, đếm số câu gửi đi.
type Dong = Record<string, unknown> | undefined;
const gia = (traVe: (id: number, sql: string) => Dong | Promise<Dong>) => {
  const cau: string[] = [];
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[]) => {
    cau.push(sql);
    const d = await traVe(Number(params[0]), sql);
    return { rows: d ? [d] : [] };
  };
  return cau;
};
const dong = (them: Record<string, unknown> = {}) => ({
  id: 1, username: 'a', email: null, role: 'USER', permissions: ['p1'], is_active: true,
  department: 'Phòng KH', full_name: 'Nguyễn A', token_version: 3, ...them,
});

describe('accessTuDong', () => {
  it('giữ trường cũ, thêm department / fullName', () => {
    const a = accessTuDong(dong());
    assert.equal(a.active, true);
    assert.equal(a.role, 'USER');
    assert.deepEqual([...a.perms], ['p1']);
    assert.equal(a.tokenVersion, 3);
    assert.equal(a.department, 'Phòng KH');
    assert.equal(a.fullName, 'Nguyễn A');
  });
  it('tài khoản khoá / không còn: không role, không quyền', () => {
    const khoa = accessTuDong(dong({ is_active: false }));
    assert.equal(khoa.active, false);
    assert.equal(khoa.role, '');
    assert.equal(khoa.perms.size, 0);
    const mat = accessTuDong(undefined);
    assert.deepEqual({ ...mat, perms: [...mat.perms] },
      { active: false, role: '', perms: [], tokenVersion: null, department: null, fullName: null });
  });
});

describe('loadUserAccess', () => {
  it('các lần gọi đồng thời dùng chung 1 câu, lần sau trúng cache', async () => {
    const cau = gia(async () => { await new Promise(r => setTimeout(r, 5)); return dong(); });
    invalidateUserAccess(101);
    const kq = await Promise.all([loadUserAccess(101), loadUserAccess('101'), loadUserAccess(101)]);
    assert.equal(cau.length, 1);
    assert.match(cau[0], /department, full_name/);
    assert.ok(kq.every(a => a.active && a.department === 'Phòng KH'));
    await loadUserAccess(101);
    assert.equal(cau.length, 1);
  });

  it('lỗi DB không bị giữ lại: lần gọi sau đọc lại', async () => {
    let lan = 0;
    const cau = gia(() => { lan++; if (lan === 1) throw new Error('DB bận'); return dong(); });
    invalidateUserAccess(102);
    await assert.rejects(loadUserAccess(102));
    assert.equal((await loadUserAccess(102)).active, true);
    assert.equal(cau.length, 2);
  });

  it('admin sửa user giữa lúc đang đọc: dòng đọc trước đó không vào cache', async () => {
    let active = true;
    let mo: () => void = () => {};
    const cho = new Promise<void>(r => { mo = r; });
    const cau = gia(async () => { const a = active; if (a) await cho; return dong({ is_active: a }); });
    invalidateUserAccess(103);
    const cu = loadUserAccess(103);       // đọc được dòng lúc còn hoạt động, chưa trả về
    active = false;
    invalidateUserAccess(103);            // admin khoá tài khoản
    mo();
    assert.equal((await cu).active, true);
    assert.equal((await loadUserAccess(103)).active, false); // phải đọc lại, không dùng dòng cũ
    assert.equal(cau.length, 2);
  });

  it('id không hợp lệ: không truy vấn', async () => {
    const cau = gia(() => dong());
    assert.equal((await loadUserAccess('abc')).active, false);
    assert.equal((await loadUserAccess(0)).active, false);
    assert.equal(cau.length, 0);
  });
});

describe('docUserDayDu (GET /api/auth/me)', () => {
  it('luôn đọc DB, trả cả dòng và làm nóng cache quyền', async () => {
    const cau = gia(id => dong({ id }));
    invalidateUserAccess(104);
    const a = await docUserDayDu(104);
    const b = await docUserDayDu(104);
    assert.equal(cau.length, 2);                    // không dùng cache
    assert.match(cau[0], /id, username, email/);
    assert.equal(a.row?.full_name, 'Nguyễn A');
    assert.equal(b.access.tokenVersion, 3);
    await loadUserAccess(104);
    assert.equal(cau.length, 2);                    // quyền đã có sẵn
  });
  it('admin sửa user giữa lúc /me đang đọc: dòng đọc trước đó không vào cache', async () => {
    let active = true;
    let mo: () => void = () => {};
    const cho = new Promise<void>(r => { mo = r; });
    const cau = gia(async () => { const a = active; if (a) await cho; return dong({ is_active: a }); });
    invalidateUserAccess(106);
    const cu = docUserDayDu(106);
    active = false;
    invalidateUserAccess(106);            // admin khoá tài khoản
    mo();
    assert.equal((await cu).access.active, true);
    assert.equal((await loadUserAccess(106)).active, false); // phải đọc lại DB
    assert.equal(cau.length, 2);
  });
  it('không còn tài khoản', async () => {
    gia(() => undefined);
    const a = await docUserDayDu(105);
    assert.equal(a.row, undefined);
    assert.equal(a.access.active, false);
  });
});

describe('khoaPhienBan', () => {
  it('có / không có phiên bản bảng tên', () => {
    const v = { production: '1' };
    assert.equal(khoaPhienBan(v, 'x', 'abc'), '{"production":"1"}|x|abc');
    // dungBangTen = false: khoá không đổi khi bảng tên nạp xong
    assert.equal(khoaPhienBan(v, 'x', ''), khoaPhienBan(v, 'x', ''));
    assert.notEqual(khoaPhienBan(v, 'x', ''), khoaPhienBan(v, 'x', 'abc'));
  });
});

describe('cachLamMoi (setup gộp xưởng)', () => {
  const now = 10_000_000_000;
  it('chưa nạp / force: chờ', () => {
    assert.equal(cachLamMoi(false, 0, now), 'cho');
    assert.equal(cachLamMoi(true, now - 1000, now), 'cho');
  });
  it('dưới 5 phút: không nạp; 5–30 phút: nạp nền; quá 30 phút: chờ', () => {
    assert.equal(cachLamMoi(false, now - 4 * 60_000, now), 'khong');
    assert.equal(cachLamMoi(false, now - 6 * 60_000, now), 'nen');
    assert.equal(cachLamMoi(false, now - 31 * 60_000, now), 'cho');
  });
  it('nơi gọi không cho nạp nền (route tự gọi): quá 5 phút là chờ như trước', () => {
    assert.equal(cachLamMoi(false, now - 4 * 60_000, now, false), 'khong');
    assert.equal(cachLamMoi(false, now - 6 * 60_000, now, false), 'cho');
  });
});

describe('giuHamSong', () => {
  const khoa = Symbol.for('@vercel/request-context');
  const g = globalThis as Record<symbol, unknown>;
  it('không có ngữ cảnh Vercel: false', () => {
    const cu = g[khoa];
    delete g[khoa];
    try { assert.equal(giuHamSong(Promise.resolve()), false); } finally { if (cu !== undefined) g[khoa] = cu; }
  });
  it('có ngữ cảnh: đăng ký đúng promise', () => {
    const cu = g[khoa];
    const nhan: Promise<unknown>[] = [];
    g[khoa] = { get: () => ({ waitUntil: (p: Promise<unknown>) => { nhan.push(p); } }) };
    try {
      const p = Promise.resolve(1);
      assert.equal(giuHamSong(p), true);
      assert.equal(nhan[0], p);
    } finally { if (cu === undefined) delete g[khoa]; else g[khoa] = cu; }
  });
});

describe('sqlDocChungTheoBang', () => {
  it('1 câu không tham số, chỉ các bảng được nêu, khoá có tiền tố phiên bản tính', () => {
    const sql = sqlDocChungTheoBang("project-aliases", ['production_status_app', "a'b"]);
    assert.ok(!sql.includes('$1'));
    assert.match(sql, /table_name IN \('production_status_app', 'a''b'\)/);
    assert.match(sql, /c\.cache_key = 'r\d+:project-aliases' AND c\.versions = v\.v/);
    assert.match(sql, /LEFT JOIN api_result_cache/);
  });
});

describe('napSomCho', () => {
  it('API số liệu: kích cả gộp xưởng và phiên bản', () => {
    assert.deepEqual(napSomCho('/api/overview/summary'), { gopXuong: true, phienBan: true });
    assert.deepEqual(napSomCho('/api/trend-by-xuong'), { gopXuong: true, phienBan: true });
    assert.deepEqual(napSomCho('/api/khsx-nam/plan'), { gopXuong: true, phienBan: true });
  });
  it('all-data / check-versions: chỉ phiên bản', () => {
    assert.deepEqual(napSomCho('/api/all-data'), { gopXuong: false, phienBan: true });
    assert.deepEqual(napSomCho('/api/check-versions'), { gopXuong: false, phienBan: true });
  });
  it('đăng nhập / thông báo / máy trạm: không kích gì; mục Xưởng không hỏi phiên bản DB chính', () => {
    assert.deepEqual(napSomCho('/api/auth/me'), { gopXuong: false, phienBan: false });
    assert.deepEqual(napSomCho('/api/notifications'), { gopXuong: false, phienBan: false });
    assert.deepEqual(napSomCho('/api/xuong/tram/may/abc'), { gopXuong: false, phienBan: false });
    assert.deepEqual(napSomCho('/api/xuong/trien-khai'), { gopXuong: true, phienBan: false });
    assert.deepEqual(napSomCho('/api/users'), { gopXuong: true, phienBan: false });
    assert.deepEqual(napSomCho('/api/vuong-mac/all'), { gopXuong: true, phienBan: false });
    assert.deepEqual(napSomCho('/api/trendy'), { gopXuong: true, phienBan: false });
  });
});
