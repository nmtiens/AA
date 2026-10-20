import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquareText, X, Send, Loader2, ArrowUpRight, RotateCcw, SlidersHorizontal, Pencil, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hieuCauHoi } from './hieuCauHoi';
import { hieuTruyVan, moTaTruyVan, nenTuTra, noiNguCanh, thucTheCua } from './hieuTruyVan';
import { traLoi, QUYEN, TRO_GIUP, type TraLoi, type Bang } from './traLoi';
import { traLoiTruyVan } from './traLoiTruyVan';
import { taiDanhMuc, taiTuDien, xoaDanhMuc, coAI, hoiAI, type BangDM, type Loc, type TruyVan, type TuDien } from './truyVanApi';
import TuTra from './TuTra';

// ============================================================================
// Cửa sổ HỎI – ĐÁP SỐ LIỆU (nút tròn góc phải dưới), không dùng AI:
//  1. Câu quen thuộc (nhập kho tuần này, tồn kho, HEX, công trình…) -> câu trả lời mẫu (hieuCauHoi.ts + traLoi.ts).
//  2. Câu còn lại / có phép tính, nhóm, lọc theo cột -> tự tra theo danh mục bảng / cột của máy chủ
//     (hieuTruyVan.ts -> POST /api/hoi-dap/truy-van). Khung "Tự tra" cho chọn bảng / cột thay vì gõ.
// Chỉ trả lời phần người dùng có quyền xem (danh mục máy chủ đã lọc theo quyền).
// ============================================================================

interface Tin { id: number; ai: 'nguoi' | 'may'; chu?: string; tra?: TraLoi; dang?: boolean; dangChu?: string }
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
  const nguCanh = useRef<{ cau: string; loc: Loc[] } | null>(null);
  const cuonRef = useRef<HTMLDivElement>(null);
  const oNhapRef = useRef<HTMLInputElement>(null);
  const admin = user?.role === 'ADMIN';
  const co = (id: string) => admin || hasPermission(id);

  useEffect(() => { cuonRef.current?.scrollTo({ top: cuonRef.current.scrollHeight, behavior: 'smooth' }); }, [tin, tuTra]);
  useEffect(() => { if (mo && !tuTra) setTimeout(() => oNhapRef.current?.focus(), 50); }, [mo, tuTra]);
  // Đổi tài khoản (đăng xuất / đăng nhập người khác không tải lại trang) => danh mục theo quyền người mới
  useEffect(() => { xoaDanhMuc(); setDm(null); setTd(null); }, [user?.id]);
  useEffect(() => { if (mo && !dm) taiDanhMuc().then(setDm).catch(() => { /* không có danh mục: chỉ dùng câu trả lời mẫu */ }); }, [mo, dm]);
  // Từ điển giá trị (tình trạng, khách hàng, tên công trình…) để hiểu câu chỉ nói giá trị
  useEffect(() => { if (mo && !td) taiTuDien().then(setTd).catch(() => { /* thiếu từ điển vẫn hỏi được theo tên cột */ }); }, [mo, td]);

  /** Câu gõ tay -> câu trả lời mẫu hoặc tự tra */
  const traLoiCau = async (s: string, bao: (chu: string) => void): Promise<TraLoi> => {
    const c = hieuCauHoi(s);
    const ds = dm ?? await taiDanhMuc().catch(() => null);
    const tdNay = td ?? await taiTuDien().catch(() => undefined);
    const h = ds ? hieuTruyVan(s, ds, new Date(), tdNay) : null;
    const truoc = nguCanh.current;
    // Câu nối tiếp không nói đối tượng => dùng lại đối tượng câu trước
    const keThua = h && ds && truoc ? noiNguCanh(h, truoc.loc, ds, s) : null;
    const ghiNgu = keThua ? [`Theo câu trước: ${keThua.join('; ')} — muốn hỏi chung thì thêm "tất cả"`] : [];
    const coMau = QUYEN[c.y](co, admin);
    // Mẫu trả lời không làm được phần này (phép tính / nhóm / lọc theo cột, bảng chưa có mẫu) => tự tra
    // Tầng AI (miễn phí, nếu máy chủ bật): câu còn chữ chưa hiểu, hoặc không nhận ra bảng và tìm tự do không ra gì
    const nhoAI = async (): Promise<TraLoi | null> => {
      if (!ds || !coAI()) return null;
      try {
        bao('AI đang đọc câu hỏi (có thể mất 10–30 giây)…');
        const r = await hoiAI(s, truoc?.cau);
        if (r.loai === 'truy_van' && r.tv) return await traLoiTruyVan(r.tv, ds, [], r.giaiThich);
        if (r.loai === 'khong_hieu' && r.giaiThich) return { chu: `Chưa trả lời được: ${r.giaiThich}\nThử bấm **Tự tra** để chọn bảng / cột.` };
      } catch { /* AI lỗi / hết lượt: dùng cách đọc câu thường */ }
      return null;
    };
    // Tra HEX / tra công trình: câu trả lời mẫu đã đủ, không cần AI
    if (h && h.thua.length && c.y !== 'tra_hex' && c.y !== 'cong_trinh') { const ai = await nhoAI(); if (ai) return ai; }
    const dungTV = nenTuTra(c, h, coMau);
    // Còn chữ chưa hiểu mà AI không giúp được: vẫn trả lời phần hiểu được nhưng NÓI RÕ, không để người hỏi tưởng đã đúng ý
    const chuaHieu = h?.thua.length ? [`chưa hiểu chữ "${h.thua.join(' ')}" — kết quả có thể chưa đúng ý, bấm Sửa điều kiện để thêm điều kiện`] : [];
    if (h && ds && (dungTV || chuaHieu.length)) return traLoiTruyVan(h.tv, ds, [...h.boQua, ...chuaHieu], undefined, ghiNgu);
    if (!coMau) return (await nhoAI()) ?? { chu: 'Tài khoản của bạn chưa có quyền xem số liệu này. Liên hệ quản trị để được cấp quyền trang tương ứng.' };
    const mau = await traLoi(c);
    if (mau.rong && !h) return (await nhoAI()) ?? mau;
    return mau;
  };

  const gui = async (hien: string, lay: (bao: (chu: string) => void) => Promise<TraLoi>) => {
    // Mỗi câu hỏi có id riêng: hỏi dồn nhiều câu thì câu trả lời vẫn thay đúng ô "đang lấy" của nó
    const id = ++dem;
    setTin(t => [...t, { id: -id, ai: 'nguoi', chu: hien }, { id, ai: 'may', dang: true }]);
    let tra: TraLoi;
    const bao = (chu: string) => setTin(t => t.map(m => (m.id === id && m.dang ? { ...m, dangChu: chu } : m)));
    try { tra = await lay(bao); }
    catch (e) { tra = { chu: `Không lấy được số liệu: ${e instanceof Error ? e.message : 'lỗi không rõ'}. Thử lại sau.` }; }
    // Gợi ý: chỉ giữ câu người dùng có quyền hỏi (mẫu có quyền, hoặc tự tra ra bảng được xem)
    if (tra.goiY) tra = { ...tra, goiY: tra.goiY.filter(g => QUYEN[hieuCauHoi(g).y](co, admin) || (dm ? !!hieuTruyVan(g, dm, new Date(), td ?? undefined) : false)) };
    setTin(t => t.map(m => (m.id === id ? { id, ai: 'may', tra } : m)));
  };

  const hoi = (cau: string) => {
    const s = cau.trim();
    if (!s) return;
    setQ('');
    void gui(s, async bao => {
      const tra = await traLoiCau(s, bao);
      // Nhớ đối tượng cho câu sau: câu có đối tượng thì thay; câu hỏi chung (không đối tượng) thì xoá ngữ cảnh
      if (tra.tv) nguCanh.current = { cau: s, loc: thucTheCua(tra.tv) };
      else {
        const c = hieuCauHoi(s);
        const loc: Loc[] = c.congTrinh ? [{ cot: 'ten_cong_trinh', op: 'chua', gt: c.congTrinh }] : c.hexList.length ? [{ cot: 'hex', op: 'bang', gt: c.hexList }] : [];
        if (loc.length || c.y !== 'tro_giup') nguCanh.current = { cau: s, loc };
      }
      return tra;
    });
  };
  const hoiTV = (tv: TruyVan) => {
    setTuTra(null);
    nguCanh.current = { cau: moTaTruyVan(tv, dm ?? []).replace(/\*\*/g, ''), loc: thucTheCua(tv) };
    if (!dm) return;
    void gui(`🔎 ${moTaTruyVan(tv, dm).replace(/\*\*/g, '')}`, () => traLoiTruyVan(tv, dm));
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
            {!tuTra && dm && dm.length > 0 && (
              <button type="button" onClick={() => setTuTra({})} title="Tự tra: chọn bảng / cột"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:border-slate-500 hover:bg-slate-50">
                <SlidersHorizontal size={14} /> Tự tra
              </button>
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
                        {(m.tra.link || m.tra.tv || m.tra.bang) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
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
