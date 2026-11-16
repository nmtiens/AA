import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleHelp, Copy, ExternalLink, ShoppingBag, X, ZoomIn, ZoomOut } from 'lucide-react';
import { LinkLightbox, linkSources } from '../shared/LinkLightbox';
import type { HangKhach } from '../../services/cuaHangApi';
import { dinhDangSoLuong, tenDvt } from '../BanVatTu/xuLy';
import { AnhKhach, GiaKhach } from './TheHang';
import { dsAnhKhach, tenKhach, useAnhXepHopLe } from './hangKhach';
import { SoLuongChon } from './SoLuongChon';
import { useDongBangNutBack } from './nutBack';
import { BO_GOC, CHU_LOI, CHU_XAC_NHAN, LOP_LIEN_KET, VONG_FOCUS } from './kieu';
import {
  boTrungTen, BUOC_MUA, docSoLuong, dongNhanHang, hangCungLoai, mucPhongToiDa, nhomThongSo, PHONG_TOI_DA as TOI_DA, tenHienThi, thongSoHien,
} from './xuLyCuaHang';

/** "Cách mua" thu gọn thành nút nhỏ ở góc khối giá — bấm mới mở (người dùng 15/11/2026: chú thích ẩn ở góc, đọc khi cần) */
function CachMua({ lienHe }: { lienHe: boolean }) {
  const [mo, setMo] = useState(false);
  return (
    <div className="absolute right-3 top-3">
      <button type="button" onClick={() => setMo(v => !v)} aria-expanded={mo} aria-label="Cách mua"
        className={`relative inline-flex h-9 items-center gap-1 ${BO_GOC} px-2 text-[13px] font-medium transition-colors before:absolute before:-inset-1 sm:h-7 sm:text-xs ${VONG_FOCUS} ${mo ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'}`}>
        <CircleHelp size={14} /> Cách mua
      </button>
      {mo && (
        <div role="note" className={`absolute right-0 z-30 mt-1.5 w-72 ${BO_GOC} bg-white p-4 text-left shadow-lg ring-1 ring-stone-200`}>
          {lienHe && <p className="mb-3 text-sm text-stone-600">Gửi yêu cầu, nhân viên AA sẽ báo giá phù hợp cho quý khách.</p>}
          <ol className="space-y-2.5 text-sm text-stone-700">
            {BUOC_MUA.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-semibold text-white">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500">Ảnh mẫu thực tế, màu có thể chênh lệch theo lô. Xem hàng và giao nhận tại kho AA.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Cửa sổ chi tiết 1 mã (trang khách).
//   Máy tính: hộp lớn (≤ 1200px, cao 90vh) 2 cột — ảnh ~60% bên trái (bấm để xem toàn màn hình, phóng to), thông tin
//   bên phải cuộn riêng, ô số lượng + "Thêm vào yêu cầu" dính đáy cột phải.
//   Điện thoại: toàn màn hình, ảnh trên, thông tin dưới, nút "Thêm vào yêu cầu" dính đáy. Nút Back đóng ô xem ảnh lớn
//   (cửa sổ chi tiết: CuaHang gắn Back).
//   Ảnh công khai thường nhỏ (cạnh dài 230–600px): cột ảnh kéo tối đa 1,6 lần với ảnh < 400px (1,25 lần với ảnh lớn
//   hơn), ô xem lớn giới hạn mức phóng. Ảnh dẹt / quá nhỏ (dải nhãn 443×46) xếp xuống cuối.
// Thông số: thuocTinhDayDu (máy chủ mới) hoặc 7 thuộc tính cũ. Không hiện gì ngoài các trường trang khách được phép.
// ============================================================================

const soGon = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
/** Tiêu đề mục nhỏ in hoa giãn chữ (loại vật tư, Thông số, Mô tả, Vật tư cùng loại) */
const EYEBROW = 'text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-stone-500 md:text-[12px]';

/** Chép chữ vào bộ nhớ tạm (có cách dự phòng cho trình duyệt cũ / trang không https) */
const chepChu = async (s: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(s); return true; }
  } catch { /* thử cách cũ */ }
  try {
    const t = document.createElement('textarea');
    t.value = s;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch {
    return false;
  }
};

export function ChiTietHang({ h, slTrongGio, onDong, onThem, ds, onMo }: {
  h: HangKhach; slTrongGio: number; onDong: () => void; onThem: (h: HangKhach, soLuong: number) => void;
  /** Danh sách đã tải (để gợi ý vật tư cùng loại) — không truyền thì bỏ mục này */
  ds?: HangKhach[];
  onMo?: (h: HangKhach) => void;
}) {
  const anh = useAnhXepHopLe(dsAnhKhach(h));
  const linkKhac = h.anhNgoai.filter(u => !linkSources(u).img);
  const [idx, setIdx] = useState(0);
  const [xemLink, setXemLink] = useState(false);
  const [phongTo, setPhongTo] = useState<number | null>(null);
  const [daChep, setDaChep] = useState(false);
  const macDinh = Math.min(1, h.soLuong);
  const [slChu, setSlChu] = useState(soGon(macDinh));
  const sl = docSoLuong(slChu);
  const loiSl = sl === null || sl <= 0 ? 'Nhập số lượng lớn hơn 0'
    : sl > h.soLuong ? `Tối đa ${dinhDangSoLuong(h.soLuong, h.dvt)}` : null;
  const dvt = tenDvt(h.dvt);
  // Dòng loại luôn có tên danh mục (mọi cửa sổ cùng bố cục đầu: 'ĐÁ' trên 'Đá Calacatta…'); nhóm / chủng loại sau đó
  // bỏ nếu mọi từ đã có trong tên — chỉ thêm thông tin mới
  const nhan = useMemo(() => {
    const [dau, ...con] = dongNhanHang(h);
    return dau ? [dau, ...boTrungTen(con, tenKhach(h))] : [];
  }, [h]);
  // Bảng thông số hiện ĐỦ, kể cả giá trị đã có trong tên (người dùng 15/11/2026: lọc theo tên làm mất sạch thông số
  // của mã như 'Đá Calacatta Gold Marble' — bảng thông số là nơi khách đọc thuộc tính, không bỏ)
  const nhomTs = useMemo(() => nhomThongSo(thongSoHien(h)), [h]);
  const cungLoai = useMemo(() => (ds && onMo ? hangCungLoai(ds, h, 6) : []), [ds, onMo, h]);
  const khungRef = useRef<HTMLDivElement>(null);
  const hetGioChep = useRef<ReturnType<typeof setTimeout>>();
  const dongAnhLon = useCallback(() => setPhongTo(null), []);
  useDongBangNutBack(phongTo !== null, dongAnhLon, 'cuaHangAnh');

  useEffect(() => { khungRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => () => clearTimeout(hetGioChep.current), []);

  useEffect(() => {
    const phim = (e: KeyboardEvent) => {
      if (xemLink || phongTo !== null) return;
      if (e.key === 'Escape') onDong();
      else if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      else if (e.key === 'ArrowLeft' && anh.length > 1) setIdx(i => (i - 1 + anh.length) % anh.length);
      else if (e.key === 'ArrowRight' && anh.length > 1) setIdx(i => (i + 1) % anh.length);
    };
    window.addEventListener('keydown', phim);
    return () => window.removeEventListener('keydown', phim);
  }, [anh.length, onDong, xemLink, phongTo]);

  const tang = (d: number) => {
    const hien = sl ?? 0;
    const moi = Math.min(h.soLuong, Math.max(0, Math.round((hien + d) * 1000) / 1000));
    setSlChu(soGon(moi));
  };

  const chep = async () => {
    if (await chepChu(h.ma)) {
      setDaChep(true);
      clearTimeout(hetGioChep.current);
      hetGioChep.current = setTimeout(() => setDaChep(false), 1800);
    }
  };

  // Thanh số lượng + "Thêm vào yêu cầu" (vẽ ở 2 chỗ theo cỡ màn hình, cùng trạng thái — hàm vẽ, không phải component
  // lồng, để ô số lượng không bị gắn lại mỗi lần gõ)
  const thanhThem = (lop: string) => (
    <div className={`${lop} shrink-0 border-t border-stone-200 bg-white px-4 py-3 md:px-7`}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="flex items-stretch gap-2">
        {/* Đơn vị liền bộ chọn như trong giỏ yêu cầu (khách biết đang chọn 1 m², 1 m hay 1 ft²) */}
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-stone-700">
          <SoLuongChon value={slChu} onChange={setSlChu} onGiam={() => tang(-1)} onTang={() => tang(1)} cao="h-12"
            nhan={`Số lượng cần${dvt ? ` (${dvt})` : ''}`} coGiam={(sl ?? 0) > 1} coTang={(sl ?? 0) < h.soLuong} />
          {dvt && <span aria-hidden>{dvt}</span>}
        </span>
        {/* Nhãn ngắn, không cắt chữ (nút quan trọng nhất của trang) */}
        <button type="button" disabled={!!loiSl} onClick={() => { if (sl && !loiSl) onThem(h, sl); }}
          className={`inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap ${BO_GOC} bg-stone-900 px-3 text-[15px] font-semibold text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 ${VONG_FOCUS}`}>
          <ShoppingBag size={17} className="hidden shrink-0 min-[400px]:block" />
          Thêm vào yêu cầu
        </button>
      </div>
      {/* Chỉ hiện khi có lỗi / đã có trong yêu cầu; máy tính giữ chỗ nhỏ để thanh không nhảy */}
      {loiSl || slTrongGio > 0 ? (
        <p className={`mt-1.5 truncate text-xs ${loiSl ? CHU_LOI : CHU_XAC_NHAN}`}>
          {loiSl ?? `Đã có ${dinhDangSoLuong(slTrongGio, h.dvt)} trong yêu cầu — thêm sẽ cộng dồn.`}
        </p>
      ) : <div aria-hidden className="hidden h-[22px] md:block" />}
    </div>
  );

  const truoc = () => setIdx(i => (i - 1 + anh.length) % anh.length);
  const sau = () => setIdx(i => (i + 1) % anh.length);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-stone-950/70 backdrop-blur-[2px] md:items-center md:p-6"
      role="dialog" aria-modal="true" aria-label={h.ten}
      // Chỉ đóng khi bấm đúng nền tối (sự kiện từ ô xem ảnh lớn / LinkLightbox cũng nổi bọt lên đây qua cây React)
      onClick={e => { if (e.target === e.currentTarget) onDong(); }}>
      <div ref={khungRef} tabIndex={-1}
        className={`relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl outline-none md:h-[90vh] md:max-w-[1200px] md:rounded-lg`}>
        {/* Nút đóng nổi ở góc trên phải (không có thanh tiêu đề riêng — loại vật tư là dòng nhỏ trên tên) */}
        <button type="button" onClick={onDong} aria-label="Đóng"
          className={`absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-stone-700 shadow-sm ring-1 ring-stone-900/5 backdrop-blur hover:bg-white hover:text-stone-900 ${VONG_FOCUS}`}>
          <X size={20} />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:flex md:overflow-hidden">
          {/* ============ CỘT ẢNH: nền be ấm, ảnh như mẫu đặt trên giấy bồi (bóng rất nhẹ theo đúng khung ảnh) ============ */}
          <section aria-label="Hình ảnh" className="flex flex-col bg-[#F3EEE6] md:h-full md:w-[60%]">
            <div className="relative aspect-[4/3] w-full md:aspect-auto md:min-h-0 md:flex-1">
              {anh.length ? (
                <button type="button" onClick={() => setPhongTo(idx)} aria-label="Xem ảnh lớn"
                  className="group absolute inset-0 flex cursor-zoom-in items-center justify-center overflow-hidden px-6 pb-10 pt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-900 md:px-12 md:pb-16 md:pt-12">
                  {/* drop-shadow theo phần ảnh thật (vùng thừa của object-contain trong suốt) => viền mảnh + bóng nhẹ */}
                  <AnhKhach key={anh[idx]} nguon={[anh[idx]]} ten={tenKhach(h)} fit="contain" chuTo toiDaPhong={1.6}
                    className="relative h-full w-full [filter:drop-shadow(0_0_0.5px_rgba(28,25,23,.25))_drop-shadow(0_14px_24px_rgba(28,25,23,.14))]" />
                  <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-stone-700 shadow-sm transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                    <ZoomIn size={16} />
                  </span>
                </button>
              ) : (
                <AnhKhach nguon={[]} ten={h.ten} className="absolute inset-0 h-full w-full" chuTo />
              )}
              {anh.length > 1 && (
                <>
                  <button type="button" aria-label="Ảnh trước" onClick={truoc}
                    className={`absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-800 shadow-sm ring-1 ring-stone-900/5 hover:bg-white md:inline-flex ${VONG_FOCUS}`}>
                    <ChevronLeft size={20} />
                  </button>
                  <button type="button" aria-label="Ảnh sau" onClick={sau}
                    className={`absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-800 shadow-sm ring-1 ring-stone-900/5 hover:bg-white md:inline-flex ${VONG_FOCUS}`}>
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>
            {(anh.length > 1 || linkKhac.length > 0) && (
              <div className="shrink-0 space-y-2 px-4 pb-4 md:px-6">
                {anh.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 md:justify-center">
                    {anh.map((u, i) => (
                      <button key={u} type="button" onClick={() => setIdx(i)} aria-label={`Ảnh ${i + 1}`} aria-current={i === idx}
                        className={`relative h-14 w-14 shrink-0 overflow-hidden ${BO_GOC} bg-white transition md:h-16 md:w-16 ${VONG_FOCUS} ${i === idx ? 'ring-2 ring-stone-900' : 'ring-1 ring-stone-900/10 opacity-70 hover:opacity-100'}`}>
                        <AnhKhach nguon={[u]} ten={h.ten} fit="tu_dong" className="h-full w-full" />
                      </button>
                    ))}
                  </div>
                )}
                {linkKhac.length > 0 && (
                  <button type="button" onClick={() => setXemLink(true)}
                    className={`inline-flex items-center gap-1 rounded text-sm ${LOP_LIEN_KET} ${VONG_FOCUS}`}>
                    <ExternalLink size={14} /> Xem thêm hình ảnh ({linkKhac.length})
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ============ CỘT THÔNG TIN ============ */}
          <section aria-label="Thông tin vật tư" className="flex min-w-0 flex-col md:h-full md:w-[40%]">
            {/* Máy tính: thông tin cuộn riêng, thanh thêm nằm DƯỚI vùng cuộn (không đè lên nội dung); thanh cuộn mảnh */}
            <div className="flex flex-col gap-5 px-4 pb-6 pt-5 [scrollbar-color:#d6d3d1_transparent] [scrollbar-width:thin] md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:px-7 md:pt-7">
              {/* Loại (dòng nhỏ in hoa) + tên */}
              <header className="pr-12 md:pr-10">
                {nhan.length > 0 && <p className={`mb-2 ${EYEBROW}`}>{nhan.join(' · ')}</p>}
                <h2 className="break-words text-[20px] font-semibold leading-[26px] tracking-[-0.01em] [overflow-wrap:anywhere] text-stone-900 md:text-[24px] md:leading-[30px]" title={tenHienThi(h.ten)}>{tenKhach(h)}</h2>
              </header>

              {/* Giá + số lượng còn */}
              <div className={`relative ${BO_GOC} border border-stone-200 bg-stone-50 p-5`}>
                <CachMua lienHe={h.giaBanVnd === null} />
                <div className="pr-24"><GiaKhach h={h} to /></div>
                <p className="mt-1.5 text-sm text-stone-600">
                  Còn <span className="font-medium tabular-nums text-stone-900">{dinhDangSoLuong(h.soLuong, h.dvt)}</span>
                </p>
              </div>

              {/* Mã tham chiếu (hạ cấp: chữ nhỏ, nút chép chỉ biểu tượng) + Thông số */}
              <div>
                <div className="flex items-center gap-1.5 text-[12px] tabular-nums text-stone-500">
                  <span>Mã tham chiếu {h.ma}</span>
                  <button type="button" onClick={chep} aria-label={daChep ? 'Đã chép mã tham chiếu' : 'Chép mã tham chiếu'} title={daChep ? 'Đã chép' : 'Chép mã'}
                    className={`relative inline-flex h-5 w-5 items-center justify-center rounded transition-colors before:absolute before:-inset-2 ${VONG_FOCUS} ${daChep ? CHU_XAC_NHAN : 'text-stone-400 hover:text-stone-900'}`}>
                    {daChep ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  {daChep && <span role="status" className={CHU_XAC_NHAN}>Đã chép</span>}
                </div>
                {nhomTs.length > 0 && (
                  <div className="mt-4">
                    <h3 className={EYEBROW}>Thông số</h3>
                    <div className="mt-2 space-y-3">
                      {nhomTs.map((n, i) => (
                        <div key={n.ten ?? i}>
                          {n.ten && <p className="mb-1.5 text-xs font-medium text-stone-600">{n.ten}</p>}
                          <dl className={`divide-y divide-stone-100 overflow-hidden ${BO_GOC} border border-stone-200`}>
                            {n.dong.map(t => (
                              <div key={t.nhan} className="grid grid-cols-[minmax(7rem,40%)_1fr] gap-3 px-3.5 py-2 text-sm odd:bg-stone-50">
                                <dt className="text-stone-500">{t.nhan}</dt>
                                <dd className="min-w-0 break-words font-medium text-stone-900">{tenHienThi(t.giaTri)}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {h.moTa && (
                <div>
                  <h3 className={EYEBROW}>Mô tả</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-700">{h.moTa}</p>
                </div>
              )}

              {/* Vật tư cùng loại: ảnh + tên */}
              {cungLoai.length > 0 && onMo && (
                <div className="pb-2">
                  <h3 className={EYEBROW}>Vật tư cùng loại</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-3">
                    {cungLoai.map(x => (
                      <button key={x.ma} type="button" onClick={() => onMo(x)}
                        className={`group flex min-w-0 flex-col overflow-hidden ${BO_GOC} border border-stone-200 bg-white text-left transition-colors [@media(hover:hover)]:hover:border-stone-400 ${VONG_FOCUS}`}>
                        <span className="relative block aspect-square w-full overflow-hidden bg-[#F3EEE6] after:pointer-events-none after:absolute after:inset-0 after:ring-1 after:ring-inset after:ring-black/5">
                          <AnhKhach nguon={dsAnhKhach(x)} ten={tenKhach(x)} fit="tu_dong" viTri="50% 100%" className="h-full w-full" lopCat="origin-bottom scale-[1.15]" boAnhDet />
                        </span>
                        {/* Đệm ở thẻ bọc ngoài, cắt 2 dòng ở span trong: đệm đặt trên phần tử bị cắt làm lộ nửa dòng thứ 3 */}
                        <span className="block px-2 pb-2 pt-1.5">
                          <span className="line-clamp-2 text-[13px] font-medium leading-[18px] text-stone-900 md:text-xs md:leading-4" title={tenHienThi(x.ten)}>{tenKhach(x)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {thanhThem('hidden md:block')}
          </section>
        </div>
        {/* Điện thoại: thanh thêm ở đáy cửa sổ, ngoài vùng cuộn */}
        {thanhThem('md:hidden')}
      </div>
      {xemLink && <LinkLightbox urls={linkKhac} title={h.ten} onClose={() => setXemLink(false)} />}
      {phongTo !== null && anh.length > 0 && (
        <XemAnhLon ds={anh} batDau={phongTo} ten={h.ten} onDoiAnh={setIdx} onDong={dongAnhLon} />
      )}
    </div>
  );
}

// ============================================================================
// Xem ảnh toàn màn hình: bấm để phóng to / thu về tại chỗ bấm, cuộn chuột để phóng, kéo để di chuyển khi đang phóng,
// chụm 2 ngón trên điện thoại; ← → đổi ảnh, Esc đóng.
// Mức phóng tối đa theo ảnh: tới khi 1 điểm ảnh gốc ≈ 2 điểm màn hình (trong khoảng 1,5–5) — ảnh nhỏ không bị vỡ hạt.
// ============================================================================
const BAM_PHONG = 2.5;
interface Bien { s: number; x: number; y: number }
const GOC: Bien = { s: 1, x: 0, y: 0 };

function XemAnhLon({ ds, batDau, ten, onDoiAnh, onDong }: {
  ds: string[]; batDau: number; ten: string; onDoiAnh: (idx: number) => void; onDong: () => void;
}) {
  const [idx, setIdx] = useState(batDau);
  const [goc, setGoc] = useState<Record<string, { w: number; h: number }>>({});
  const [khung, setKhung] = useState({ w: 0, h: 0 });
  const [b, setB] = useState<Bien>(GOC);
  const [dangKeo, setDangKeo] = useState(false);
  const [loi, setLoi] = useState<Set<string>>(() => new Set());
  const khungRef = useRef<HTMLDivElement>(null);
  const bRef = useRef(b);
  bRef.current = b;
  const diem = useRef(new Map<number, { x: number; y: number }>());
  const batDauCham = useRef<{ x: number; y: number; dich: boolean; kc: number; b: Bien } | null>(null);
  const src = ds[idx];
  const kt = goc[src];
  const toiDa = kt ? mucPhongToiDa(kt.w, kt.h, khung.w, khung.h) : TOI_DA;
  const toiDaRef = useRef(toiDa);
  toiDaRef.current = toiDa;

  // Đồng bộ ảnh đang xem về cửa sổ chi tiết (đóng bằng Back cũng giữ đúng ảnh)
  useEffect(() => { onDoiAnh(idx); }, [idx, onDoiAnh]);

  // Kích thước khung (để tính mức phóng tối đa)
  useEffect(() => {
    const el = khungRef.current;
    if (!el) return;
    const do_ = () => setKhung({ w: el.clientWidth, h: el.clientHeight });
    do_();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', do_);
      return () => window.removeEventListener('resize', do_);
    }
    const ob = new ResizeObserver(do_);
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  /** Chặn để ảnh không trôi ra ngoài khung */
  const chan = useCallback((v: Bien): Bien => {
    const r = khungRef.current?.getBoundingClientRect();
    if (v.s <= 1.001 || !r) return GOC;
    const mx = ((v.s - 1) * r.width) / 2;
    const my = ((v.s - 1) * r.height) / 2;
    return { s: v.s, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
  }, []);

  /** Phóng tới s2 giữ nguyên điểm màn hình (qx, qy) */
  const phongTai = useCallback((v: Bien, s2: number, qx: number, qy: number): Bien => {
    const r = khungRef.current?.getBoundingClientRect();
    if (!r) return v;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const s = Math.max(1, Math.min(toiDaRef.current, s2));
    const ux = (qx - cx - v.x) / v.s;
    const uy = (qy - cy - v.y) / v.s;
    return chan({ s, x: qx - cx - s * ux, y: qy - cy - s * uy });
  }, [chan]);

  const doiAnh = useCallback((d: number) => {
    setIdx(i => (i + d + ds.length) % ds.length);
    setB(GOC);
  }, [ds.length]);

  useEffect(() => {
    const phim = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onDong(); }
      else if (e.key === 'ArrowLeft' && ds.length > 1) doiAnh(-1);
      else if (e.key === 'ArrowRight' && ds.length > 1) doiAnh(1);
      else if (e.key === '+' || e.key === '=') setB(v => phongTai(v, v.s * 1.5, window.innerWidth / 2, window.innerHeight / 2));
      else if (e.key === '-') setB(v => phongTai(v, v.s / 1.5, window.innerWidth / 2, window.innerHeight / 2));
    };
    window.addEventListener('keydown', phim);
    return () => window.removeEventListener('keydown', phim);
  }, [ds.length, onDong, doiAnh, phongTai]);

  // Cuộn chuột để phóng (listener không passive để chặn cuộn trang)
  useEffect(() => {
    const el = khungRef.current;
    if (!el) return;
    const cuon = (e: WheelEvent) => {
      e.preventDefault();
      setB(v => phongTai(v, v.s * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY));
    };
    el.addEventListener('wheel', cuon, { passive: false });
    return () => el.removeEventListener('wheel', cuon);
  }, [phongTai]);

  const khoangCach = () => {
    const [p1, p2] = [...diem.current.values()];
    return p1 && p2 ? Math.hypot(p1.x - p2.x, p1.y - p2.y) : 0;
  };
  const giua = () => {
    const ps = [...diem.current.values()];
    return { x: ps.reduce((t, p) => t + p.x, 0) / ps.length, y: ps.reduce((t, p) => t + p.y, 0) / ps.length };
  };

  const xuong = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    diem.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = giua();
    batDauCham.current = { x: g.x, y: g.y, dich: diem.current.size > 1, kc: khoangCach(), b: bRef.current };
    setDangKeo(true);
  };
  const di = (e: React.PointerEvent) => {
    if (!diem.current.has(e.pointerId)) return;
    diem.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const bd = batDauCham.current;
    if (!bd) return;
    const g = giua();
    if (Math.hypot(g.x - bd.x, g.y - bd.y) > 6) bd.dich = true;
    if (diem.current.size >= 2 && bd.kc > 0) {
      // Chụm: phóng theo tỉ lệ khoảng cách, giữ điểm giữa
      const s2 = bd.b.s * (khoangCach() / bd.kc);
      const v = phongTai(bd.b, s2, bd.x, bd.y);
      setB(chan({ s: v.s, x: v.x + (g.x - bd.x), y: v.y + (g.y - bd.y) }));
    } else if (bd.b.s > 1) {
      setB(chan({ s: bd.b.s, x: bd.b.x + (g.x - bd.x), y: bd.b.y + (g.y - bd.y) }));
    }
  };
  const len = (e: React.PointerEvent) => {
    const bd = batDauCham.current;
    const motNgon = diem.current.size === 1;
    diem.current.delete(e.pointerId);
    if (diem.current.size > 0) {
      // Còn 1 ngón sau khi chụm => bắt đầu lại mốc kéo
      const g = giua();
      batDauCham.current = { x: g.x, y: g.y, dich: true, kc: 0, b: bRef.current };
      return;
    }
    batDauCham.current = null;
    setDangKeo(false);
    if (bd && motNgon && !bd.dich && e.type === 'pointerup') {
      // Bấm (không kéo): phóng to tại chỗ bấm / thu về
      setB(v => (v.s > 1.05 ? GOC : phongTai(v, Math.min(BAM_PHONG, toiDaRef.current), e.clientX, e.clientY)));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={`Ảnh ${ten}`}>
      <div className="flex shrink-0 items-center gap-3 px-3 py-2 sm:px-4">
        <span className="text-sm tabular-nums text-white/80">{idx + 1} / {ds.length}</span>
        <p className="min-w-0 flex-1 truncate text-sm text-white/90">{ten}</p>
        <button type="button" aria-label="Thu nhỏ" onClick={() => setB(v => phongTai(v, v.s / 1.5, window.innerWidth / 2, window.innerHeight / 2))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40" disabled={b.s <= 1}>
          <ZoomOut size={18} />
        </button>
        <button type="button" aria-label="Phóng to" onClick={() => setB(v => phongTai(v, v.s * 1.5, window.innerWidth / 2, window.innerHeight / 2))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40" disabled={b.s >= toiDa - 0.001}>
          <ZoomIn size={18} />
        </button>
        <button type="button" aria-label="Đóng ảnh" onClick={onDong}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
          <X size={20} />
        </button>
      </div>
      <div ref={khungRef} className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden ${b.s > 1 ? (dangKeo ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
        onPointerDown={xuong} onPointerMove={di} onPointerUp={len} onPointerCancel={len}>
        {loi.has(src) ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Không tải được ảnh này</div>
        ) : (
          <img key={src} src={src} alt={ten} draggable={false} referrerPolicy="no-referrer" decoding="async"
            onError={() => setLoi(s => new Set(s).add(src))}
            onLoad={e => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; setGoc(g => (g[src] ? g : { ...g, [src]: { w, h } })); }}
            className="absolute inset-0 m-auto h-full w-full object-contain will-change-transform"
            style={{ transform: `translate(${b.x}px, ${b.y}px) scale(${b.s})`, transition: dangKeo ? 'none' : 'transform 180ms ease-out' }} />
        )}
        {ds.length > 1 && (
          <>
            <button type="button" aria-label="Ảnh trước" onPointerDown={e => e.stopPropagation()} onClick={() => doiAnh(-1)}
              className="absolute left-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 hover:bg-white/30 sm:left-4">
              <ChevronLeft size={24} />
            </button>
            <button type="button" aria-label="Ảnh sau" onPointerDown={e => e.stopPropagation()} onClick={() => doiAnh(1)}
              className="absolute right-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 hover:bg-white/30 sm:right-4">
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>
      {ds.length > 1 && (
        // Không justify-center trên khung cuộn (ảnh đầu bị đẩy ra ngoài mép trái, không cuộn tới được): căn giữa bằng hàng con w-max
        <div className="shrink-0 overflow-x-auto px-3 py-2">
          <div className="mx-auto flex w-max gap-2">
            {ds.map((u, i) => (
              <button key={u} type="button" onClick={() => { setIdx(i); setB(GOC); }} aria-label={`Ảnh ${i + 1}`}
                className={`h-12 w-12 shrink-0 overflow-hidden rounded-md ring-2 ${i === idx ? 'ring-white' : 'ring-transparent opacity-60 hover:opacity-100'}`}>
                <img src={u} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
