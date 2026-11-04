import { afterEach, describe, expect, it, vi } from 'vitest';
import { rongManThat } from './cheDoDienThoai';

const gia = (o: { w: number; h: number; sw: number; sh: number; camUng?: boolean; ep?: string | null }) => {
  const cam = o.camUng ?? true;
  vi.stubGlobal('window', {
    innerWidth: o.w, innerHeight: o.h, visualViewport: { scale: 1 },
    matchMedia: (q: string) => ({ matches: cam ? q.includes('coarse') || q.includes('none') : false }),
  });
  vi.stubGlobal('screen', { width: o.sw, height: o.sh });
  vi.stubGlobal('navigator', { maxTouchPoints: cam ? 5 : 0 });
  vi.stubGlobal('localStorage', { getItem: () => o.ep ?? null });
};

describe('rongManThat', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('điện thoại bật trang web cho máy tính, screen báo đúng: lấy bề rộng màn', () => {
    gia({ w: 980, h: 2000, sw: 412, sh: 915 });
    expect(rongManThat()).toBe(412);
  });
  it('điện thoại báo screen theo trang ép rộng: vẫn nhận ra nhờ màn dọc dài', () => {
    gia({ w: 980, h: 2100, sw: 980, sh: 2100 });
    expect(rongManThat()).toBe(412);
  });
  it('điện thoại bình thường: không can thiệp', () => {
    gia({ w: 412, h: 915, sw: 412, sh: 915 });
    expect(rongManThat()).toBeNull();
  });
  it('máy bảng dọc: giữ bố cục máy tính', () => {
    gia({ w: 820, h: 1180, sw: 820, sh: 1180 });
    expect(rongManThat()).toBeNull();
  });
  it('máy tính không cảm ứng, cửa sổ hẹp dài: giữ bố cục máy tính', () => {
    gia({ w: 900, h: 1600, sw: 1920, sh: 1080, camUng: false });
    expect(rongManThat()).toBeNull();
  });
  it('người dùng chọn Máy tính: không ép', () => {
    gia({ w: 980, h: 2100, sw: 980, sh: 2100, ep: '0' });
    expect(rongManThat()).toBeNull();
  });
});
