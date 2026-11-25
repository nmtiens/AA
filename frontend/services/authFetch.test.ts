import { describe, it, expect, vi, beforeEach } from 'vitest';

// Gửi trước (guiTruocTrang): trang gắn sau nhận lại đúng response, 1 lần, cùng token
describe('guiTruocTrang', () => {
  let goi: string[];
  beforeEach(() => {
    vi.resetModules();
    goi = [];
    const kho = new Map<string, string>([['app_token', 't1']]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => kho.get(k) ?? null, setItem: (k: string, v: string) => kho.set(k, v) });
    vi.stubGlobal('sessionStorage', { getItem: () => null });
    vi.stubGlobal('window', {
      location: { origin: 'http://x' }, dispatchEvent: () => true,
      fetch: async (u: string) => { goi.push(u); return new Response(`{"lan":${goi.length}}`, { status: 200 }); },
    });
  });
  const nap = async () => {
    const m = await import('./authFetch');
    m.installAuthFetch();
    return m;
  };
  it('nhận lại đúng 1 lần, lần sau gọi mạng', async () => {
    const m = await nap();
    m.guiTruocTrang(['/api/a?x=1', '/api/a?x=1']);
    expect(await (await window.fetch('/api/a?x=1')).json()).toEqual({ lan: 1 });
    expect(await (await window.fetch('/api/a?x=1')).json()).toEqual({ lan: 2 });
    expect(goi.length).toBe(2);
  });
  it('POST, đổi tài khoản hoặc đã huỷ: không dùng bản gửi trước', async () => {
    const m = await nap();
    m.guiTruocTrang(['/api/a']);
    await window.fetch('/api/a', { method: 'POST' });
    expect(goi.length).toBe(2);
    localStorage.setItem('app_token', 't2');
    await window.fetch('/api/a');
    expect(goi.length).toBe(3);
  });
  it('người nhận huỷ giữa chừng: báo AbortError', async () => {
    const m = await nap();
    m.guiTruocTrang(['/api/b']);
    const ac = new AbortController();
    const p = window.fetch('/api/b', { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow();
  });
});
