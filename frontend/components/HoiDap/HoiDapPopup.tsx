import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquareText, X, Send, Loader2, ArrowUpRight, RotateCcw, SlidersHorizontal, Pencil, Download, ThumbsUp, ThumbsDown, FileSpreadsheet, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { coTheXuat, dungBaoCao, laLenhXuat, type LenhXuat } from './baoCao/moHinh';
// xuatXlsx / xuatPdf import ĐỘNG lúc bấm tải (xem taiBaoCao): thư viện xlsx + pdfmake (~3 MB) không vào gói chính
import { hieuCauHoi } from './hieuCauHoi';
import { hieuTruyVan, moTaTruyVan, nenTuTra, mauLamDuoc, thucTheCua, canNhoAI, apNguCanh, laCauTaiSao, laCauDuBao, cauSoLieuCua, nguCanhSau, type HieuTV, type NguCanh } from './hieuTruyVan';
import { traLoi, QUYEN, TRO_GIUP, type TraLoi, type Bang } from './traLoi';
import { cauGanGiong } from './boCau/ganGiong';
import { traLoiTruyVan } from './traLoiTruyVan';
import { taiDanhMuc, taiTuDien, xoaDanhMuc, coAI, hoiAI, ghiNhatKy, danhGiaCau, xemNhatKy, type BangDM, type TruyVan, type TuDien } from './truyVanApi';
import TuTra from './TuTra';

// ============================================================================
// Cửa sổ HỎI – ĐÁP SỐ LIỆU (nút tròn góc phải dưới), không dùng AI:
//  1. Câu quen thuộc (nhập kho tuần này, tồn kho, HEX, công trình…) -> câu trả lời mẫu (hieuCauHoi.ts + traLoi.ts).
//  2. Câu còn lại / có phép tính, nhóm, lọc theo cột -> tự tra theo danh mục bảng / cột của máy chủ
//     (hieuTruyVan.ts -> POST /api/hoi-dap/truy-van). Khung "Tự tra" cho chọn bảng / cột thay vì gõ.
//  3. Hỏi xong, tick "Vào báo cáo" các câu cần, gõ "xuất báo cáo" (hoặc bấm nút đầu cửa sổ) => tải Excel / PDF làm ngay
//     trên trình duyệt từ số liệu đã có (baoCao/moHinh.ts, xuatXlsx.ts, xuatPdf.ts) — không gọi DB thêm, không có nhận xét AI.
// Chỉ trả lời phần người dùng có quyền xem (danh mục máy chủ đã lọc theo quyền).
// ============================================================================

interface Tin {
  id: number; ai: 'nguoi' | 'may'; chu?: string; tra?: TraLoi; dang?: boolean; dangChu?: string;
  /** Dòng nhật ký (POST /api/hoi-dap/nhat-ky) — có thì hiện 👍 / 👎 */
  nkId?: number; danhGia?: 1 | -1; moGopY?: boolean;
  /** Đưa câu trả lời này vào báo cáo (ô "Vào báo cáo") — mặc định tick khi câu trả lời có số liệu (coTheXuat) */
  chonBc?: boolean;
  /** Tin người dùng: câu hỏi THẬT (vào báo cáo / nhật ký) khi bong bóng là cả lệnh — "xuất báo cáo nhập kho tháng 10" => "nhập kho tháng 10" */
  cauBc?: string;
  /** Tin hỏi lại ý (có `chon`) của lệnh "xuất báo cáo …": chọn xong thì hỏi tiếp rồi mới mời tải định dạng này */
  xuatSau?: Pick<LenhXuat, 'dinhDang'>;
  /** Lời mời tải báo cáo: đang tạo file định dạng nào / lỗi lần tải vừa rồi */
  dangTai?: 'xlsx' | 'pdf'; loiTai?: string;
}
let dem = 0;

/** **đậm**, dòng _ghi chú_ chữ xám, xuống dòng */
const Chu: React.FC<{ s: string }> = ({ s }) => (
  <>
    {s.split('\n').map((dong, i) => {
      const ghi = /^_.*_$/.test(dong);
      const noi = ghi ? dong.slice(1, -1) : dong;
      return (
        <p key={i} className={`${i ? 'mt-1' : ''} ${ghi ? 'text-xs text-slate-500' : ''}`}>
          {noi.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith('**') ? <b key={j} className={`font-semibold ${ghi ? 'text-slate-700' : 'text-slate-900'}`}>{p.slice(2, -2)}</b> : <React.Fragment key={j}>{p}</React.Fragment>))}
        </p>
      );
    })}
  </>
);

const taiCsv = (bang: Bang) => {
  const rows = [bang.cot, ...bang.dong, ...(bang.cuoi ? [bang.cuoi] : [])];
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `so-lieu-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/** Các câu đã tick đưa vào báo cáo, theo thứ tự hỏi. Câu hỏi = bong bóng người dùng cùng cặp (id âm của câu trả lời);
 *  dự phòng: tin người dùng liền trước. Bong bóng là cả lệnh ("xuất báo cáo nhập kho tháng 10") thì lấy câu hỏi thật (cauBc) */
const capBaoCao = (ds: Tin[]): Array<{ cauHoi: string; tra: TraLoi }> =>
  ds.flatMap((m, i) => {
    if (m.ai !== 'may' || !m.chonBc || !m.tra || !coTheXuat(m.tra)) return [];
    const nguoi = ds.find(x => x.ai === 'nguoi' && x.id === -m.id) ?? ds.slice(0, i).reverse().find(x => x.ai === 'nguoi');
    return [{ cauHoi: nguoi?.cauBc ?? nguoi?.chu ?? '', tra: m.tra }];
  });

/** Quản trị: tỷ lệ 👍 / 👎 theo đường trả lời + các câu bị 👎 (đem vào bộ câu mẫu boCau/ để sửa bộ đọc câu) */
async function xemDanhGia(ngay: number): Promise<TraLoi> {
  const d = await xemNhatKy(ngay);
  if (d.chuaCoBang) return { chu: 'Chưa tạo bảng nhật ký: chạy file **backend/sql/2026-10-20_hoi_dap_nhat_ky.sql** trên DB.' };
  const TEN: Record<string, string> = { mau: 'Câu trả lời mẫu', tu_tra: 'Tự tra', ai: 'AI', hoi_lai: 'Hỏi lại ý', khong_hieu: 'Không hiểu', bao_cao: 'Xuất báo cáo' };
  const tong = d.thongKe.reduce((a, x) => a + x.tong, 0);
  const tot = d.thongKe.reduce((a, x) => a + x.tot, 0), che = d.thongKe.reduce((a, x) => a + x.che, 0);
  const pt = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  return {
    chu: [
      `${ngay} ngày qua: **${tong} câu hỏi** · 👍 ${tot} · 👎 ${che} · đúng ý **${pt(tot, tot + che)}** trong các câu được đánh giá.`,
      ...d.thongKe.map(x => `_${TEN[x.duong] ?? x.duong}: ${x.tong} câu · 👍 ${x.tot} · 👎 ${x.che}_`),
      d.cau.length ? `**${d.cau.length} câu bị 👎** (mới nhất trước):` : 'Chưa có câu nào bị 👎.',
    ].join('\n'),
    ...(d.cau.length ? { bang: { cot: ['Ngày', 'Người hỏi', 'Câu hỏi', 'Máy hiểu là', 'Góp ý'], dong: d.cau.map(x => [
      new Date(x.created_at).toLocaleDateString('vi-VN'), x.username ?? '', x.cau, `${TEN[x.duong] ?? x.duong}: ${x.hieu ?? ''}`, x.ghi_chu ?? '']) } } : {}),
  };
}

const HoiDapPopup: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [mo, setMo] = useState(false);
  const [q, setQ] = useState('');
  const [tin, setTin] = useState<Tin[]>([{ id: 0, ai: 'may', tra: { ...TRO_GIUP, chu: `Chào ${user?.fullName ?? 'bạn'}! ${TRO_GIUP.chu}` } }]);
  const [dm, setDm] = useState<BangDM[] | null>(null);
  const [td, setTd] = useState<TuDien | null>(null);
  /** Khung Tự tra đang mở (kèm truy vấn điền sẵn nếu bấm "Sửa điều kiện") */
  const [tuTra, setTuTra] = useState<{ ban?: TruyVan } | null>(null);
  // Ngữ cảnh: câu hỏi trước + đối tượng của nó (công trình, HEX, xưởng…) cho câu hỏi nối tiếp
  const nguCanh = useRef<NguCanh | null>(null);
  const lanHoi = useRef(0);
  const cuonRef = useRef<HTMLDivElement>(null);
  const oNhapRef = useRef<HTMLInputElement>(null);
  // Bản mới nhất của cuộc hỏi cho nút Tải Excel / PDF (bấm sau khi tick / bỏ tick, không dùng closure cũ)
  const tinRef = useRef<Tin[]>(tin);
  const admin = user?.role === 'ADMIN';
  const co = (id: string) => admin || hasPermission(id);
  /** Số câu đã tick đưa vào báo cáo (nút "Xuất báo cáo (n)" đầu cửa sổ) */
  const soTick = capBaoCao(tin).length;

  useEffect(() => { tinRef.current = tin; }, [tin]);
  useEffect(() => { cuonRef.current?.scrollTo({ top: cuonRef.current.scrollHeight, behavior: 'smooth' }); }, [tin, tuTra]);
  useEffect(() => { if (mo && !tuTra) setTimeout(() => oNhapRef.current?.focus(), 50); }, [mo, tuTra]);
  // Đổi tài khoản (đăng xuất / đăng nhập người khác không tải lại trang) => danh mục theo quyền người mới
  useEffect(() => { xoaDanhMuc(); setDm(null); setTd(null); }, [user?.id]);
  useEffect(() => { if (mo && !dm) taiDanhMuc().then(setDm).catch(() => { /* không có danh mục: chỉ dùng câu trả lời mẫu */ }); }, [mo, dm]);
  // Từ điển giá trị (tình trạng, khách hàng, tên công trình…) để hiểu câu chỉ nói giá trị
  useEffect(() => { if (mo && !td) taiTuDien().then(setTd).catch(() => { /* thiếu từ điển vẫn hỏi được theo tên cột */ }); }, [mo, td]);

  /** Câu gõ tay -> câu trả lời mẫu hoặc tự tra */
  // `ra.h`: truy vấn bộ đọc câu đã hiểu ở CHÍNH câu này (kể cả khi trả lời bằng câu mẫu) — để câu sau nối tiếp.
  // Mỗi câu một biến riêng: hỏi dồn / bấm gợi ý khi câu trước chưa xong thì không lấy nhầm cách hiểu của câu kia
  const traLoiCau = async (s: string, bao: (chu: string) => void, giuNguyen = false, ra: { h: HieuTV | null } = { h: null }): Promise<TraLoi> => {
    const c = hieuCauHoi(s);
    const ds = dm ?? await taiDanhMuc().catch(() => null);
    const tdNay = td ?? await taiTuDien().catch(() => undefined);
    const h0 = ds ? hieuTruyVan(s, ds, new Date(), tdNay) : null;
    const truoc = nguCanh.current;
    // Chữ hai nghĩa ("tu" = TỦ hay "từ"): hỏi lại trước, không đoán — trả lời sai mà trông như đúng còn tệ hơn hỏi lại
    if (h0?.moHo?.length && !giuNguyen) {
      const m = h0.moHo[0];
      return {
        chu: `Chữ "**${m.chu}**" có thể hiểu nhiều cách — bạn muốn hỏi:`,
        chon: [...m.lua.map(l => ({ nhan: l.nhan, cau: l.cau })), { nhan: `Không — "${m.chu}" là chữ thường`, cau: s, giuNguyen: true }],
        nk: { duong: 'hoi_lai', hieu: `chữ hai nghĩa: ${h0.moHo.map(x => x.chu).join(', ')}` },
      };
    }
    // "Sao tháng này nhập ít vậy", "tại sao xuất kho giảm": số liệu không giải thích được nguyên nhân => nói rõ, trả số liệu
    // liên quan (câu đã bỏ phần "tại sao") + gợi ý so sánh / chia nhóm để người hỏi tự xem — không nhờ AI đoán
    if (laCauTaiSao(s)) {
      const goc = cauSoLieuCua(s);
      // "dự báo tháng 11 có đạt kế hoạch không": số liệu đã có không dự báo tương lai được
      const dan = laCauDuBao(s) ? 'Cửa sổ chỉ tra **số liệu đã có**, không **dự báo** được.' : 'Cửa sổ chỉ tra **số liệu**, chưa giải thích được **nguyên nhân**.';
      const goiY = goc ? [`${goc} so với tháng trước`, `${goc} theo xưởng`, `${goc} theo công trình`] : [];
      if (!goc || goc.split(' ').length < 2) return { chu: `${dan} Thử hỏi số liệu cụ thể, ví dụ "nhập kho tháng này so với tháng trước".`, goiY, nk: { duong: 'khong_hieu', hieu: 'câu hỏi tại sao' } };
      const t = await traLoiCau(goc, bao, true);
      return { ...t, chu: `${dan} Số liệu liên quan — "${goc}":\n${t.chu}`, goiY: [...new Set([...goiY, ...(t.goiY ?? [])])].slice(0, 5), nk: { duong: 'khong_hieu', hieu: `câu hỏi tại sao → ${goc}` } };
    }
    // Câu nối tiếp: thiếu ý ("còn tháng trước?", "xuất kho thì sao") => lấy cả truy vấn câu trước; không nói đối tượng
    // => lấy đối tượng câu trước (công trình, xưởng, HEX…)
    const { h, ghi: ghiNgu, noiCau } = ds ? apNguCanh(h0, truoc, ds, s, new Date(), tdNay) : { h: h0, ghi: [], noiCau: false };
    ra.h = h;
    const coMau = QUYEN[c.y](co, admin);
    // Mẫu trả lời không làm được phần này (phép tính / nhóm / lọc theo cột, bảng chưa có mẫu) => tự tra
    // Tầng AI (miễn phí, nếu máy chủ bật): câu còn chữ chưa hiểu, hoặc không nhận ra bảng và tìm tự do không ra gì
    const nhoAI = async (): Promise<TraLoi | null> => {
      if (!ds || !coAI()) return null;
      try {
        bao('AI đang đọc câu hỏi (có thể mất 10–30 giây)…');
        const r = await hoiAI(s, truoc?.cau);
        if (r.loai === 'truy_van' && r.tv) return { ...await traLoiTruyVan(r.tv, ds, [], r.giaiThich), nk: { duong: 'ai', hieu: r.giaiThich } };
        if (r.loai === 'khong_hieu' && r.giaiThich) return { chu: `Chưa trả lời được: ${r.giaiThich}\nThử bấm **Tự tra** để chọn bảng / cột.`, nk: { duong: 'khong_hieu', hieu: `AI: ${r.giaiThich}` } };
      } catch { /* AI lỗi / hết lượt: dùng cách đọc câu thường */ }
      return null;
    };
    // Tra HEX / tra công trình: câu trả lời mẫu đã đủ, không cần AI
    if (canNhoAI(c, h)) { const ai = await nhoAI(); if (ai) return ai; }
    // Đã lấy cả truy vấn câu trước: câu trả lời mẫu không biết phần lấy lại => tự tra
    const dungTV = noiCau || nenTuTra(c, h, coMau);
    // Còn chữ chưa hiểu mà AI không giúp được: vẫn trả lời phần hiểu được nhưng NÓI RÕ, không để người hỏi tưởng đã đúng ý
    // Chữ còn lại là chữ của câu trả lời mẫu ("phần trăm" của tóm tắt công trình) => không phải chưa hiểu
    const chuaHieu = h?.thua.length && (dungTV || !mauLamDuoc(c, h)) ? [`chưa hiểu chữ "${h.thua.join(' ')}" — kết quả có thể chưa đúng ý, bấm Sửa điều kiện để thêm điều kiện`] : [];
    // Chưa hiểu hết câu: gợi ý câu gần giống trong bộ câu mẫu (bấm để hỏi lại cho đúng ý)
    const kemGanGiong = (t: TraLoi): TraLoi => {
      const gy = cauGanGiong(s);
      return gy.length ? { ...t, goiY: [...gy, ...(t.goiY ?? [])].slice(0, 5) } : t;
    };
    if (h && ds && (dungTV || chuaHieu.length)) {
      const t = { ...await traLoiTruyVan(h.tv, ds, [...h.boQua, ...chuaHieu], undefined, ghiNgu), nk: { duong: 'tu_tra' as const, hieu: `${moTaTruyVan(h.tv, ds).replace(/\*\*/g, '')}${chuaHieu.length ? ` · chưa hiểu: ${h.thua.join(' ')}` : ''}` } };
      return chuaHieu.length ? kemGanGiong(t) : t;
    }
    if (!coMau) return (await nhoAI()) ?? { chu: 'Tài khoản của bạn chưa có quyền xem số liệu này. Liên hệ quản trị để được cấp quyền trang tương ứng.', nk: { duong: 'khong_hieu', hieu: `không có quyền mẫu ${c.y}` } };
    const mau = await traLoi(c);
    if (mau.rong && !h) return (await nhoAI()) ?? { ...kemGanGiong(mau), nk: { duong: 'khong_hieu', hieu: `tìm tự do không ra: ${c.tuKhoa ?? ''}` } };
    return { ...mau, nk: { duong: 'mau', hieu: `mẫu ${c.y}${c.ky ? ` · ${c.ky.ten}` : ''}` } };
  };

  /** Hiện bong bóng người dùng + ô "đang lấy", lấy câu trả lời rồi thay vào; trả lại câu trả lời cho người gọi (hoi() cần biết
   *  đã trả lời thật hay còn hỏi lại ý). `ghi` có => ghi nhật ký (câu gõ tay); `ghi.cauBc` = câu hỏi thật khi `hien` là cả lệnh */
  const gui = async (
    hien: string, lay: (bao: (chu: string) => void) => Promise<TraLoi>, ghi?: { truoc?: string; cauBc?: string; xuatSau?: Pick<LenhXuat, 'dinhDang'> },
  ): Promise<TraLoi> => {
    // Mỗi câu hỏi có id riêng: hỏi dồn nhiều câu thì câu trả lời vẫn thay đúng ô "đang lấy" của nó
    const id = ++dem;
    setTin(t => [...t, { id: -id, ai: 'nguoi', chu: hien, cauBc: ghi?.cauBc }, { id, ai: 'may', dang: true }]);
    let tra: TraLoi;
    const bao = (chu: string) => setTin(t => t.map(m => (m.id === id && m.dang ? { ...m, dangChu: chu } : m)));
    try { tra = await lay(bao); }
    catch (e) { tra = { chu: `Không lấy được số liệu: ${e instanceof Error ? e.message : 'lỗi không rõ'}. Thử lại sau.` }; }
    // Gợi ý: chỉ giữ câu người dùng có quyền hỏi (mẫu có quyền, hoặc tự tra ra bảng được xem)
    if (tra.goiY) tra = { ...tra, goiY: tra.goiY.filter(g => QUYEN[hieuCauHoi(g).y](co, admin) || (dm ? !!hieuTruyVan(g, dm, new Date(), td ?? undefined) : false)) };
    // Câu trả lời có số liệu: tick sẵn "Vào báo cáo" (người dùng bỏ tick câu không cần).
    // Còn hỏi lại ý mà câu gốc là lệnh xuất: nhớ định dạng để nút lựa chọn hỏi tiếp rồi mới mời tải
    setTin(t => t.map(m => (m.id === id ? { id, ai: 'may', tra, chonBc: coTheXuat(tra), xuatSau: tra.chon?.length ? ghi?.xuatSau : undefined } : m)));
    // Nhật ký câu gõ tay (để biết tỷ lệ đúng thật); có id thì hiện nút 👍 / 👎. Ghi câu hỏi thật, không ghi cả lệnh "xuất báo cáo …"
    if (ghi && tra.nk) {
      const nkId = await ghiNhatKy({ cau: ghi.cauBc ?? hien, truoc: ghi.truoc, duong: tra.nk.duong, hieu: tra.nk.hieu, tv: tra.tv });
      if (nkId && tra.nk.duong !== 'hoi_lai') setTin(t => t.map(m => (m.id === id ? { ...m, nkId } : m)));
    }
    return tra;
  };
  const danhGia = (id: number, nkId: number, tot: boolean, ghiChu?: string) => {
    setTin(t => t.map(m => (m.id === id ? { ...m, danhGia: tot ? 1 : -1, moGopY: !tot && ghiChu === undefined } : m)));
    void danhGiaCau(nkId, tot, ghiChu);
  };

  const datChonBc = (id: number, chon: boolean) => setTin(t => t.map(m => (m.id === id ? { ...m, chonBc: chon } : m)));

  /** Lời mời tải báo cáo (sau lệnh "xuất báo cáo"): liệt kê các câu đã tick + nút Tải Excel / PDF.
   *  `hien` = bong bóng người dùng (null khi câu hỏi kèm theo đã hiện rồi). Không đụng ngữ cảnh, không ghi nhật ký như câu hỏi. */
  const moiTai = (hien: string | null, dinhDang: 'xlsx' | 'pdf' | null) => {
    const id = ++dem;
    setTin(t => {
      const cap = capBaoCao(t);
      const tra: TraLoi = cap.length
        ? {
          chu: [`Báo cáo gồm **${cap.length}** câu đã tick:`, ...cap.map((c, i) => `${i + 1}. ${c.cauHoi}`),
            '_Bỏ tick câu nào không cần rồi bấm tải. File làm ngay trên máy bạn, không gửi đi đâu._'].join('\n'),
          baoCao: { soMuc: cap.length, dinhDang },
        }
        : { chu: 'Chưa có câu nào được tick để đưa vào báo cáo. Tick ô **Vào báo cáo** dưới câu trả lời rồi gõ lại "xuất báo cáo".' };
      return [...t, ...(hien !== null ? [{ id: -id, ai: 'nguoi' as const, chu: hien }] : []), { id, ai: 'may' as const, tra }];
    });
  };

  /** Bấm Tải Excel / Tải PDF trên lời mời: lấy các câu đã tick ở trạng thái HIỆN TẠI (qua ref), file làm trên trình duyệt */
  const taiBaoCao = async (id: number, dinhDang: 'xlsx' | 'pdf') => {
    const dat = (p: Partial<Tin>) => setTin(t => t.map(m => (m.id === id ? { ...m, ...p } : m)));
    const cap = capBaoCao(tinRef.current);
    if (!cap.length) { dat({ loiTai: 'Chưa có câu nào được tick để đưa vào báo cáo.' }); return; }
    dat({ dangTai: dinhDang, loiTai: undefined });
    try {
      const bc = dungBaoCao(cap, user?.fullName || user?.username || '');
      // pdfmake nạp lười (nặng) => chờ; Excel làm ngay
      if (dinhDang === 'xlsx') (await import('./baoCao/xuatXlsx')).taiXlsx(bc);
      else await (await import('./baoCao/xuatPdf')).taiPdf(bc);
      dat({ dangTai: undefined });
      // Nhật ký: ai xuất báo cáo gồm những câu nào (không chờ kết quả)
      void ghiNhatKy({ cau: 'xuất báo cáo', duong: 'bao_cao', hieu: `${dinhDang} · ${bc.muc.length} mục: ${bc.muc.map(x => x.cauHoi).join(' | ')}`.slice(0, 1000) });
    } catch (e) {
      dat({ dangTai: undefined, loiTai: `Không tạo được file: ${e instanceof Error ? e.message : 'lỗi không rõ'}` });
    }
  };

  /** Câu hỏi số liệu: `hien` = chữ hiện ở bong bóng người dùng, `s` = câu đưa vào bộ đọc câu (cũng là câu ghi nhật ký / vào báo cáo);
   *  `xuatSau` = câu nằm trong lệnh "xuất báo cáo …": nếu máy hỏi lại ý thì nút lựa chọn mang theo để hỏi xong mới mời tải */
  const hoiSoLieu = (hien: string, s: string, giuNguyen: boolean, xuatSau?: Pick<LenhXuat, 'dinhDang'>): Promise<TraLoi> => {
    const truocCau = nguCanh.current?.cau;
    const lan = ++lanHoi.current;
    return gui(hien, async bao => {
      const ra: { h: HieuTV | null } = { h: null };
      const tra = await traLoiCau(s, bao, giuNguyen, ra);
      // Đang hỏi lại ý: giữ ngữ cảnh câu trước cho câu người hỏi sắp chọn
      if (tra.nk?.duong === 'hoi_lai') return tra;
      // Nhớ cho câu sau: truy vấn đã chạy (hoặc đã hiểu) + đối tượng; câu chào / trợ giúp thì giữ ngữ cảnh cũ
      const moi = nguCanhSau(s, hieuCauHoi(s), ra.h, tra.tv);
      // Câu hỏi trước trả lời chậm hơn câu sau: không ghi đè ngữ cảnh của câu mới hơn
      if (moi && lan === lanHoi.current) nguCanh.current = moi;
      return tra;
    }, { truoc: truocCau, cauBc: s, xuatSau });
  };

  /** `xuatSau`: câu này là lựa chọn hỏi lại ý của một lệnh "xuất báo cáo …" (nút lựa chọn truyền vào) => trả lời xong mời tải */
  const hoi = (cau: string, giuNguyen = false, xuatSau?: Pick<LenhXuat, 'dinhDang'>) => {
    const s = cau.trim();
    if (!s) return;
    setQ('');
    // Lệnh "xuất báo cáo [câu hỏi]" nhận TRƯỚC bộ đọc câu: có câu hỏi kèm theo thì hỏi câu đó như thường (bong bóng vẫn là
    // nguyên chữ đã gõ), trả lời xong mới mời tải; không có thì mời tải ngay, không gọi máy chủ
    const lenh = laLenhXuat(s) ?? (xuatSau ? { dinhDang: xuatSau.dinhDang, conLai: s } : null);
    if (lenh) {
      if (!lenh.conLai) moiTai(s, lenh.dinhDang);
      // Máy còn hỏi lại ý (chữ hai nghĩa) => chưa mời tải: nút lựa chọn mang `xuatSau` sẽ hỏi tiếp rồi mới mời
      else void hoiSoLieu(s, lenh.conLai, giuNguyen, { dinhDang: lenh.dinhDang }).then(tra => { if (!tra.chon?.length) moiTai(null, lenh.dinhDang); });
      return;
    }
    void hoiSoLieu(s, s, giuNguyen);
  };
  const hoiTV = (tv: TruyVan, xuatSau?: Pick<LenhXuat, 'dinhDang'>) => {
    setTuTra(null);
    nguCanh.current = { cau: moTaTruyVan(tv, dm ?? []).replace(/\*\*/g, ''), loc: thucTheCua(tv), tv };
    if (!dm) return;
    void gui(`🔎 ${moTaTruyVan(tv, dm).replace(/\*\*/g, '')}`, () => traLoiTruyVan(tv, dm)).then(() => { if (xuatSau) moiTai(null, xuatSau.dinhDang); });
  };

  if (!user) return null;
  return (
    <>
      {!mo && (
        <button type="button" onClick={() => setMo(true)} title="Hỏi số liệu" aria-label="Mở cửa sổ hỏi số liệu"
          className="fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:scale-105 hover:bg-slate-700">
          <MessageSquareText size={24} />
        </button>
      )}
      {mo && (
        <div role="dialog" aria-label="Hỏi số liệu"
          className="fixed bottom-5 right-5 z-[70] flex h-[min(680px,calc(100vh-2.5rem))] w-[min(500px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white">
              {tuTra ? <SlidersHorizontal size={15} /> : <MessageSquareText size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{tuTra ? 'Tự tra số liệu' : 'Hỏi số liệu'}</p>
              <p className="truncate text-xs text-slate-500">{tuTra ? 'Chọn bảng, phép tính, cột chia và điều kiện lọc' : 'Gõ câu hỏi, hoặc bấm Tự tra để chọn bảng / cột'}</p>
            </div>
            {!tuTra && (
              <button type="button" onClick={() => hoi('xuất báo cáo')} aria-label={`Xuất báo cáo, ${soTick} câu đã tick`}
                title={soTick ? `Tải Excel / PDF ${soTick} câu đã tick` : 'Tick "Vào báo cáo" dưới câu trả lời rồi bấm để tải Excel / PDF'}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium ${soTick ? 'border-slate-300 text-slate-700 hover:border-slate-500 hover:bg-slate-50' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                <Download size={14} /> <span className="hidden sm:inline">Xuất báo cáo </span>({soTick})
              </button>
            )}
            {!tuTra && dm && dm.length > 0 && (
              <button type="button" onClick={() => setTuTra({})} title="Tự tra: chọn bảng / cột"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:border-slate-500 hover:bg-slate-50">
                <SlidersHorizontal size={14} /> Tự tra
              </button>
            )}
            {admin && !tuTra && (
              <button type="button" onClick={() => void gui('Thống kê đánh giá 30 ngày', () => xemDanhGia(30))} title="Quản trị: câu hỏi bị chê (👎) 30 ngày" aria-label="Xem đánh giá câu hỏi"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ThumbsDown size={16} /></button>
            )}
            {!tuTra && (
              <button type="button" onClick={() => { setTin(t => t.slice(0, 1)); nguCanh.current = null; }} title="Xoá cuộc hỏi" aria-label="Xoá cuộc hỏi"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><RotateCcw size={16} /></button>
            )}
            <button type="button" onClick={() => (tuTra ? setTuTra(null) : setMo(false))} title="Đóng" aria-label="Đóng"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
          </div>

          {tuTra && dm ? (
            <div className="min-h-0 flex-1"><TuTra dm={dm} ban={tuTra.ban} onChay={hoiTV} onDong={() => setTuTra(null)} /></div>
          ) : (
            <>
              <div ref={cuonRef} className="flex-1 space-y-3 overflow-y-auto bg-[#f5f6f8] px-3 py-3 custom-scrollbar">
                {tin.map(m => m.ai === 'nguoi' ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-3 py-2 text-sm text-white">{m.chu}</p>
                  </div>
                ) : (
                  <div key={m.id} className="max-w-[97%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                    {m.dang ? (
                      <span className="inline-flex items-center gap-2 text-slate-500"><Loader2 size={15} className="animate-spin" /> {m.dangChu ?? 'Đang lấy số liệu…'}</span>
                    ) : m.tra && (
                      <>
                        <Chu s={m.tra.chu} />
                        {m.tra.bang && m.tra.bang.dong.length > 0 && (
                          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                                <tr>{m.tra.bang.cot.map((c, j) => <th key={j} className={`whitespace-nowrap px-2 py-1.5 font-medium ${m.tra!.bang!.phai?.includes(j) ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {m.tra.bang.dong.map((d, r) => (
                                  <tr key={r}>{d.map((v, j) => <td key={j} className={`px-2 py-1.5 ${m.tra!.bang!.phai?.includes(j) ? 'whitespace-nowrap text-right tabular-nums' : 'max-w-[12rem] truncate'}`} title={String(v)}>{v}</td>)}</tr>
                                ))}
                              </tbody>
                              {m.tra.bang.cuoi && (
                                <tfoot className="sticky bottom-0 border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                                  <tr>{m.tra.bang.cuoi.map((v, j) => <td key={j} className={`px-2 py-1.5 ${m.tra!.bang!.phai?.includes(j) ? 'whitespace-nowrap text-right tabular-nums' : ''}`}>{v}</td>)}</tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        )}
                        {(m.tra.link || m.tra.tv || m.tra.bang || coTheXuat(m.tra)) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {coTheXuat(m.tra) && (
                              <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900" title="Đưa câu này vào file báo cáo (gõ &quot;xuất báo cáo&quot; để tải)">
                                <input type="checkbox" checked={!!m.chonBc} onChange={e => datChonBc(m.id, e.target.checked)} className="h-3.5 w-3.5 accent-slate-900" />
                                Vào báo cáo
                              </label>
                            )}
                            {m.tra.tv && dm && (
                              <button type="button" onClick={() => setTuTra({ ban: m.tra!.tv })}
                                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline">
                                <Pencil size={12} /> Sửa điều kiện
                              </button>
                            )}
                            {m.tra.bang && m.tra.bang.dong.length > 0 && (
                              <button type="button" onClick={() => taiCsv(m.tra!.bang!)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline">
                                <Download size={12} /> Tải CSV
                              </button>
                            )}
                            {m.tra.link && (
                              <button type="button" onClick={() => navigate(m.tra!.link!.to)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline">
                                {m.tra.link.ten} <ArrowUpRight size={13} />
                              </button>
                            )}
                          </div>
                        )}
                        {m.tra.baoCao && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {(['xlsx', 'pdf'] as const).map(dd => {
                              // Nổi bật nút trùng định dạng người dùng nói; không nói thì cả 2 đều nổi bật
                              const noiBat = !m.tra!.baoCao!.dinhDang || m.tra!.baoCao!.dinhDang === dd;
                              return (
                                <button key={dd} type="button" disabled={!!m.dangTai} onClick={() => void taiBaoCao(m.id, dd)}
                                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium disabled:opacity-60 ${noiBat ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-700' : 'border-slate-300 text-slate-700 hover:border-slate-500 hover:bg-slate-50'}`}>
                                  {m.dangTai === dd ? <Loader2 size={14} className="animate-spin" /> : dd === 'xlsx' ? <FileSpreadsheet size={14} /> : <FileText size={14} />}
                                  {m.dangTai === dd ? (dd === 'pdf' ? 'Đang tạo PDF…' : 'Đang tạo Excel…') : dd === 'xlsx' ? 'Tải Excel' : 'Tải PDF'}
                                </button>
                              );
                            })}
                            {m.loiTai && <p className="w-full text-xs text-red-600">{m.loiTai}</p>}
                          </div>
                        )}
                        {m.tra.chon && m.tra.chon.length > 0 && (
                          <div className="mt-2 flex flex-col items-start gap-1.5">
                            {m.tra.chon.map((x, j) => (
                              <button key={j} type="button" onClick={() => (x.tv ? hoiTV(x.tv, m.xuatSau) : x.cau && hoi(x.cau, x.giuNguyen, m.xuatSau))}
                                className={`rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium ${x.giuNguyen ? 'border-slate-300 text-slate-600 hover:border-slate-500' : 'border-slate-800 text-slate-900 hover:bg-slate-900 hover:text-white'}`}>
                                {x.nhan}
                              </button>
                            ))}
                          </div>
                        )}
                        {m.nkId && (
                          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                            {m.danhGia ? (
                              <span>{m.danhGia === 1 ? 'Cảm ơn bạn!' : m.moGopY ? '' : 'Đã ghi lại — sẽ sửa cho đúng.'}</span>
                            ) : (
                              <>
                                <span>Trả lời đúng ý chưa?</span>
                                <button type="button" onClick={() => danhGia(m.id, m.nkId!, true)} aria-label="Đúng ý" title="Đúng ý"
                                  className="rounded p-1 hover:bg-slate-100 hover:text-slate-900"><ThumbsUp size={14} /></button>
                                <button type="button" onClick={() => danhGia(m.id, m.nkId!, false)} aria-label="Chưa đúng ý" title="Chưa đúng ý"
                                  className="rounded p-1 hover:bg-slate-100 hover:text-slate-900"><ThumbsDown size={14} /></button>
                              </>
                            )}
                          </div>
                        )}
                        {m.moGopY && m.nkId && (
                          <form className="mt-1.5 flex gap-1.5" onSubmit={e => {
                            e.preventDefault();
                            const v = String(new FormData(e.currentTarget).get('gopY') ?? '').trim();
                            danhGia(m.id, m.nkId!, false, v);
                          }}>
                            <input name="gopY" autoFocus maxLength={500} placeholder="Đúng ra bạn muốn thấy gì? (không bắt buộc)"
                              className="h-8 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-xs focus:border-slate-500 focus:outline-none" />
                            <button type="submit" className="h-8 rounded-lg bg-slate-900 px-2.5 text-xs font-medium text-white hover:bg-slate-700">Gửi</button>
                          </form>
                        )}
                        {m.tra.goiY && m.tra.goiY.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {m.tra.goiY.map(g => (
                              <button key={g} type="button" onClick={() => hoi(g)}
                                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-slate-500 hover:bg-slate-50">{g}</button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={e => { e.preventDefault(); hoi(q); }} className="flex items-center gap-2 border-t border-slate-200 p-3">
                <input ref={oNhapRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Vd: đơn hàng theo PM tháng trước"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none" />
                <button type="submit" disabled={!q.trim()} aria-label="Gửi"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400">
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default HoiDapPopup;
