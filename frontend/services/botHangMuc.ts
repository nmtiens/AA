import { useEffect, useState } from 'react';
import { API_BASE_URL } from './dataService';
import { theoDoiMocBang } from './mocDuLieu';
import { useMocBang } from '../hooks/useMocBang';

// ============================================================================
// BOT hạng mục = NGÀY CẦN GIAO PC ĐỀ XUẤT của từng HEX theo file công trình (bảng bot_tong_hop do tool PC01 nạp;
// cùng nguồn với tab BOT). Cột "BOT hạng mục" của cửa sổ HEX (BOP / BOT x BOP). Tải 1 lần tới khi BOT đổi, dùng chung.
// ============================================================================

export type NgayBotHex = Map<string, Date>;

let hua: Promise<NgayBotHex> | null = null;
let daCo: NgayBotHex | null = null;
// BOT đổi: lần gọi sau tải lại (bản cũ vẫn hiện tới khi có bản mới). Đăng ký lúc nạp module => chạy trước các component
theoDoiMocBang(doi => { if (doi.has('bot')) hua = null; });

export const taiBotHangMuc = (): Promise<NgayBotHex> => {
  if (!hua) {
    const p: Promise<NgayBotHex> = fetch(`${API_BASE_URL}/bot-tong-hop/ngay-hex`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: { hex: string[]; ngay: string[] }) => {
        const m: NgayBotHex = new Map();
        d.hex.forEach((h, i) => { if (d.ngay[i]) m.set(h, new Date(`${d.ngay[i]}T00:00:00`)); });
        if (hua === p) daCo = m;
        return m;
      })
      .catch(e => { if (hua === p) hua = null; throw e; });   // lỗi => lần mở sau thử lại
    hua = p;
  }
  return hua;
};

/** null = đang tải / không tải được */
export const useBotHangMuc = (): NgayBotHex | null => {
  const [m, setM] = useState<NgayBotHex | null>(daCo);
  const moc = useMocBang(['bot']);
  useEffect(() => {
    let bo = false;
    taiBotHangMuc().then(x => { if (!bo) setM(x); }).catch(() => { /* cột để trống */ });
    return () => { bo = true; };
  }, [moc]);
  return m;
};
