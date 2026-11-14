import { useEffect, useState } from 'react';
import { API_BASE_URL } from './dataService';

// ============================================================================
// BOT hạng mục = NGÀY CẦN GIAO PC ĐỀ XUẤT của từng HEX theo file công trình (bảng bot_tong_hop do tool PC01 nạp;
// cùng nguồn với tab BOT). Cột "BOT hạng mục" của cửa sổ HEX (BOP / BOT x BOP). Tải 1 lần mỗi phiên, dùng chung.
// ============================================================================

export type NgayBotHex = Map<string, Date>;

let hua: Promise<NgayBotHex> | null = null;
let daCo: NgayBotHex | null = null;

export const taiBotHangMuc = (): Promise<NgayBotHex> => {
  if (!hua) {
    hua = fetch(`${API_BASE_URL}/bot-tong-hop/ngay-hex`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: { hex: string[]; ngay: string[] }) => {
        const m: NgayBotHex = new Map();
        d.hex.forEach((h, i) => { if (d.ngay[i]) m.set(h, new Date(`${d.ngay[i]}T00:00:00`)); });
        daCo = m;
        return m;
      })
      .catch(e => { hua = null; throw e; });   // lỗi => lần mở sau thử lại
  }
  return hua;
};

/** null = đang tải / không tải được */
export const useBotHangMuc = (): NgayBotHex | null => {
  const [m, setM] = useState<NgayBotHex | null>(daCo);
  useEffect(() => {
    if (daCo) return undefined;
    let bo = false;
    taiBotHangMuc().then(x => { if (!bo) setM(x); }).catch(() => { /* cột để trống */ });
    return () => { bo = true; };
  }, []);
  return m;
};
