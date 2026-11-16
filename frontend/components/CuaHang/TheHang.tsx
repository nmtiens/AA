import React, { useState } from 'react';
import { Check, Images, Plus } from 'lucide-react';
import type { HangKhach } from '../../services/cuaHangApi';
import { chuTat, dinhDangDong, dinhDangSoLuong, tenDvt } from '../BanVatTu/xuLy';
import { BO_GOC, VONG_FOCUS } from './kieu';
import { CHU_LIEN_HE, CHU_LIEN_HE_GON, dsAnhKhach, tenKhach, VI_TRI_CAT } from './hangKhach';
import { cachDatAnh, laAnhDet, nhomMauHang, tenChungLoai, tenHienThi, timNhomMau } from './xuLyCuaHang';

// ============================================================================
// Thành phần nhỏ của trang khách: ảnh (đang tải => nền be nhấp nháy; lỗi / chưa có => ô trung tính + chữ tắt), giá, thẻ vật tư.
// File chỉ export component (hàm thuần ở hangKhach.ts / xuLyCuaHang.ts) để Fast Refresh giữ trạng thái khi sửa.
// ============================================================================

/** Ô trống: chữ tắt giãn rộng trên nền be như nhãn mẫu vật liệu (không màu theo loại => lưới không loang màu) */
export function OTrongKhach({ ten, className, chuTo }: { ten: string; className: string; chuTo?: boolean }) {
  return (
    <div className={`${className} flex select-none items-center justify-center bg-[#E4DCCF]`} aria-hidden>
      <span className={`pl-[0.2em] font-medium tracking-[0.2em] text-stone-500 ${chuTo ? 'text-[22px] leading-none' : 'text-[11px]'}`}>{chuTat(ten)}</span>
    </div>
  );
}

/**
 * Ảnh: thử lần lượt các nguồn, tất cả lỗi => ô trống. Đang tải => khung xương (nền be trơn nhấp nháy nhẹ) phủ
 * khung cha — khung cha phải `relative`.
 * fit:
 *   'cover'   phủ kín khung (lopCat thêm khi phủ: phóng nhẹ / chuyển động rê).
 *   'contain' hiện trọn ảnh; toiDaPhong (vd 1.6) không kéo ảnh to quá n lần gốc (ảnh ≥ 400px: tối đa 1,25; < 200px: tới 2,5; khung cha nên căn giữa).
 *   'tu_dong' như cover, nhưng ảnh quá nhỏ so với khung / quá dẹt (443×46) => hiện trọn, không phóng to (object-scale-down).
 * boAnhDet: ảnh bìa — ảnh tải xong mà dẹt / quá nhỏ (laAnhDet) thì bỏ qua, lấy nguồn hợp lệ kế tiếp (hết nguồn => giữ).
 */
export function AnhKhach({ nguon, ten, className, lopCat = '', chuTo, fit = 'cover', toiDaPhong, viTri, style, boAnhDet }: {
  nguon: string[]; ten: string; className: string; lopCat?: string; chuTo?: boolean; fit?: 'cover' | 'contain' | 'tu_dong';
  toiDaPhong?: number; viTri?: string; style?: React.CSSProperties; boAnhDet?: boolean;
}) {
  const [loi, setLoi] = useState<Set<string>>(() => new Set());
  const [daTai, setDaTai] = useState<string | null>(null);
  const [goc, setGoc] = useState<{ src: string; w: number; h: number; dat: 'cat' | 'tron' } | null>(null);
  const src = nguon.find(u => !loi.has(u));
  if (!src) return <OTrongKhach ten={ten} className={className} chuTo={chuTo} />;
  const kt = goc && goc.src === src ? goc : null;
  const xong = (img: HTMLImageElement) => {
    if (boAnhDet && laAnhDet(img.naturalWidth, img.naturalHeight) && nguon.slice(nguon.indexOf(src) + 1).some(u => !loi.has(u))) {
      setLoi(s => new Set(s).add(src)); // ảnh dải nhãn / quá nhỏ: thử ảnh kế tiếp
      return;
    }
    setDaTai(src);
    setGoc({ src, w: img.naturalWidth, h: img.naturalHeight, dat: cachDatAnh(img.naturalWidth, img.naturalHeight, img.clientWidth, img.clientHeight) });
  };
  const dangTai = daTai !== src;
  const che = fit === 'cover' || (fit === 'tu_dong' && kt?.dat !== 'tron');
  // Ảnh lớn (cạnh dài ≥ 400px) kéo tối đa 1,25 lần dù toiDaPhong cao hơn; ảnh rất nhỏ (cạnh dài < 200px, vd 130×162)
  // được kéo tới 2,5 lần để không lọt thỏm giữa khung lớn của cửa sổ chi tiết
  const canhDai = kt ? Math.max(kt.w, kt.h) : 0;
  const phong = toiDaPhong && kt
    ? (canhDai >= 400 ? Math.min(toiDaPhong, 1.25) : canhDai < 200 ? Math.max(toiDaPhong, 2.5) : toiDaPhong)
    : toiDaPhong;
  const gioiHan = fit === 'contain' && phong && kt && kt.w > 0 && kt.h > 0
    ? { maxWidth: kt.w * phong, maxHeight: kt.h * phong } : undefined;
  const lopFit = che ? `object-cover ${lopCat}` : fit === 'contain' ? 'object-contain' : 'object-scale-down p-3';
  return (
    <>
      {dangTai && (
        <span aria-hidden className="pointer-events-none absolute inset-0 animate-pulse bg-[#EAE3D8] motion-reduce:animate-none" />
      )}
      <img src={src} alt={ten} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false}
        // Ảnh đã có trong bộ nhớ đệm có thể xong trước khi React gắn onLoad => kiểm tra complete khi gắn
        ref={el => { if (el && dangTai && el.complete && el.naturalWidth > 0) xong(el); }}
        onError={() => setLoi(s => new Set(s).add(src))}
        onLoad={e => xong(e.currentTarget)}
        style={{ ...gioiHan, ...(che && viTri ? { objectPosition: viTri } : null), ...style }}
        className={`${className} ${lopFit} transition-opacity duration-300 motion-reduce:transition-none ${dangTai ? 'opacity-0' : 'opacity-100'}`} />
    </>
  );
}

/** Giá bán / 1 đơn vị; chưa có giá => thẻ / ô nhỏ ghi CHU_LIEN_HE_GON, cửa sổ chi tiết (to) ghi CHU_LIEN_HE */
export function GiaKhach({ h, to }: { h: Pick<HangKhach, 'giaBanVnd' | 'dvt'>; to?: boolean }) {
  if (h.giaBanVnd === null) {
    if (to) return <span className="text-xl font-semibold text-stone-900">{CHU_LIEN_HE}</span>;
    return <span className="text-[13px] font-medium text-stone-700">{CHU_LIEN_HE_GON}</span>;
  }
  const dvt = tenDvt(h.dvt);
  return (
    <span className={`font-semibold tabular-nums text-stone-900 ${to ? 'whitespace-nowrap text-[26px] leading-8' : 'text-[15px] leading-5'}`}>
      <span className="whitespace-nowrap">{dinhDangDong(h.giaBanVnd)}</span>
      {dvt && <span className={`whitespace-nowrap font-normal text-stone-500 ${to ? 'text-sm' : 'text-xs'}`}> / {dvt}</span>}
    </span>
  );
}

export const TheHang = React.memo(function TheHang({ h, slTrongGio, onMo, onThem }: {
  h: HangKhach; slTrongGio: number;
  onMo: (h: HangKhach) => void; onThem: (h: HangKhach) => void;
}) {
  const anh = dsAnhKhach(h);
  const ten = tenKhach(h);
  const trongGio = slTrongGio > 0;
  const [nhay, setNhay] = useState(false);
  // Nhãn: chủng loại + nhóm màu (tiếng Việt); không có => bỏ
  const soCon = dinhDangSoLuong(h.soLuong, h.dvt);
  const nhan = [tenChungLoai(h.thuocTinh.chungLoai ?? ''), timNhomMau(nhomMauHang(h) ?? '')?.ten ?? ''].filter(Boolean);
  return (
    // Rê chuột chỉ khi thiết bị có chuột ([@media(hover:hover)]) — màn cảm ứng không giữ trạng thái rê sau khi chạm.
    // scroll-mt: cuộn tới thẻ không bị đầu trang dính (56–64px) che ảnh. Thẻ: tên · mã · nhãn + số lượng còn · giá (không dòng
    // mô tả phụ: chỉ vài mã có, lưới lộn xộn và hay lặp lại tên — quy cách / màu / thương hiệu xem ở cửa sổ chi tiết).
    <article className={`group relative flex min-w-0 scroll-mt-[72px] flex-col overflow-hidden ${BO_GOC} border bg-white transition-[border-color,box-shadow] duration-200 md:scroll-mt-20 [@media(hover:hover)]:hover:border-stone-300 [@media(hover:hover)]:hover:shadow-[0_1px_2px_rgba(28,25,23,.06),0_12px_28px_-14px_rgba(28,25,23,.22)] [&:has(.nut-xem:focus-visible)]:ring-2 [&:has(.nut-xem:focus-visible)]:ring-stone-900 [&:has(.nut-xem:focus-visible)]:ring-offset-2 ${trongGio ? 'border-stone-900/30' : 'border-stone-200/80'}`}>
      <button type="button" onClick={() => onMo(h)} title={tenHienThi(h.ten)}
        className="nut-xem flex min-w-0 flex-col text-left focus-visible:outline-none" aria-label={`Xem chi tiết ${ten}`}>
        {/* Viền mờ be ở 4 mép (after) che chữ viết tay / nhãn duyệt mẫu sát mép mà không phải phóng to ảnh nhiều */}
        <span className="relative block aspect-square w-full overflow-hidden bg-[#F3EEE6] after:pointer-events-none after:absolute after:inset-0 after:shadow-[inset_0_0_0_1px_rgba(0,0,0,.04),inset_0_0_28px_6px_rgba(243,238,230,.55)]">
          <AnhKhach nguon={anh} ten={ten} chuTo fit="tu_dong" viTri={VI_TRI_CAT} className="h-full w-full" boAnhDet
            lopCat="origin-bottom scale-[1.18] transition-transform duration-500 ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover:scale-[1.24] motion-reduce:[@media(hover:hover)]:group-hover:scale-[1.18]" />
          {anh.length > 1 && (
            <span aria-hidden className="absolute bottom-2 right-2 z-[1] inline-flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-[11px] font-medium leading-4 tabular-nums text-white transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
              <Images size={11} /> {anh.length}
            </span>
          )}
        </span>
        {/* Tên (luôn chiếm 2 dòng => mã / nhãn các thẻ thẳng hàng) + mã tham chiếu (mã SAP, chữ nhỏ đơn cách) */}
        <span className="flex min-w-0 flex-col px-3 pt-3 sm:px-4 sm:pt-3.5">
          <span className="line-clamp-2 min-h-[38px] text-[14px] font-medium leading-[19px] tracking-[-0.005em] text-stone-900 sm:min-h-10 sm:text-[15px] sm:leading-5">{ten}</span>
          <span className="mt-1 truncate font-mono text-[11px] leading-4 tracking-tight text-stone-400">{h.ma}</span>
        </span>
      </button>
      {/* Nhãn "#Chủng loại #Màu" (trái) + số lượng còn (phải) — như mẫu trang danh mục đá.
          Điện thoại (thẻ hẹp): hàng tự xuống dòng — nhãn + "Còn …" vừa một hàng thì chung hàng, không vừa thì "Còn …"
          xuống hàng dưới (căn phải), không bị cắt "…" khi số lượng dài (233,11 m²) */}
      <div className="mt-2 flex min-w-0 items-baseline gap-x-1.5 gap-y-0.5 px-3 text-[12px] leading-4 max-sm:flex-wrap sm:px-4">
        <span className="min-w-0 flex-1 truncate text-stone-500 max-sm:flex-auto" title={nhan.map(t => `#${t}`).join(' ') || undefined}>
          {nhan.map((t, i) => <span key={i} className="mr-1 last:mr-0">#{t}</span>)}
        </span>
        <span className="shrink-0 truncate text-right tabular-nums text-stone-500 max-sm:ml-auto max-sm:max-w-full sm:max-w-[60%]" title={`Còn ${soCon}`}>
          Còn <b className="font-semibold text-stone-900">{soCon}</b>
        </span>
      </div>
      {/* Giá (trái) + nút thêm (phải) luôn ở đáy thẻ (thẻ cùng hàng cao bằng nhau) */}
      <div className="mt-auto flex min-h-5 items-center gap-2 px-3 pb-3 pt-2 sm:min-h-9 sm:px-4 sm:pb-4">
        <span className="min-w-0 flex-1 truncate leading-5"><GiaKhach h={h} /></span>
        {/* Điện thoại: nút + nằm ở góc trên phải ảnh (thẻ hẹp); đã chọn => nền than có dấu check (dấu hiệu duy nhất) */}
        <button type="button"
          onClick={() => { onThem(h); setNhay(true); window.setTimeout(() => setNhay(false), 150); }}
          aria-label={trongGio ? `${ten}: đã có trong yêu cầu — thêm nữa` : `Thêm ${ten} vào yêu cầu báo giá`}
          title={trongGio ? 'Đã có trong yêu cầu — thêm nữa' : 'Thêm vào yêu cầu báo giá'}
          className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition duration-150 before:absolute before:-inset-1 motion-reduce:transition-none max-sm:absolute max-sm:right-2 max-sm:top-2 max-sm:z-[2] sm:border ${VONG_FOCUS} ${nhay ? 'scale-90 motion-reduce:scale-100' : ''} ${trongGio
            ? 'bg-stone-900 text-white sm:border-stone-900 [@media(hover:hover)]:hover:bg-stone-700'
            : 'bg-white/85 text-stone-800 backdrop-blur sm:border-stone-300/80 sm:bg-white [@media(hover:hover)]:hover:border-stone-900 [@media(hover:hover)]:hover:bg-stone-900 [@media(hover:hover)]:hover:text-white'}`}>
          {trongGio ? <Check size={17} /> : <Plus size={18} />}
        </button>
      </div>
    </article>
  );
});
