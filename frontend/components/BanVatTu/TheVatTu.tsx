import React, { useState } from 'react';
import { AlertTriangle, Building2, Clock, Images, Warehouse } from 'lucide-react';
import { linkSources } from '../shared/LinkLightbox';
import { AnhNoiBoImg, NhanCanDuyet } from './AnhNoiBo';
import {
  anhCanDuyet, chuTat, dinhDangSoLuong, dinhDangTrieu, dsAnhHien, mauTheoNhom, NHAN_NGUON, nhanTuoi,
  type AnhHien, type DongBan, type GiaTriThuocTinh,
} from './xuLy';

// ============================================================================
// Thành phần nhỏ của trang Danh mục vật tư: ảnh thu nhỏ (chưa có ảnh => ô màu theo nhóm + chữ tắt), nhãn gán công
// trình, thẻ vật tư (chế độ Lưới) và 1 dòng bảng (chế độ Bảng).
// ============================================================================

/** Ảnh thu nhỏ: ảnh đầu tiên của mã; link không phải ảnh / tải lỗi => ô màu theo nhóm + chữ tắt */
function AnhVatTu({ url, nhom, ten, className, chuTo }: {
  url: string | undefined; nhom: string; ten: string; className: string; chuTo?: boolean;
}) {
  const [loi, setLoi] = useState<string | null>(null);
  const img = url ? linkSources(url).img : null;
  if (img && loi !== img) {
    return (
      <img src={img} alt={ten} loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onError={() => setLoi(img)} className={`${className} bg-slate-100 object-cover`} />
    );
  }
  return <OTrong nhom={nhom} ten={ten} className={className} chuTo={chuTo} />;
}

/** Ô màu theo nhóm + chữ tắt (chưa có ảnh / ảnh lỗi) */
function OTrong({ nhom, ten, className, chuTo }: { nhom: string; ten: string; className: string; chuTo?: boolean }) {
  return (
    <div className={`${className} flex select-none items-center justify-center`} style={{ background: mauTheoNhom(nhom) }} aria-hidden>
      <span className={`font-semibold tracking-wide text-white/90 ${chuTo ? 'text-3xl' : 'text-xs'}`}>{chuTat(ten)}</span>
    </div>
  );
}

/** Ảnh đại diện: link người dùng đã dán trước đây hoặc ảnh nội bộ sheet 03 (tải lười, có token); không có => ô màu + chữ tắt */
export function AnhDaiDien({ a, nhom, ten, className, chuTo }: {
  a: AnhHien | undefined; nhom: string; ten: string; className: string; chuTo?: boolean;
}) {
  if (a?.loai === 'noi_bo') {
    return <AnhNoiBoImg anh={a.anh} alt={ten} className={className}
      duPhong={<OTrong nhom={nhom} ten={ten} className={className} chuTo={chuTo} />} />;
  }
  return <AnhVatTu url={a?.url} nhom={nhom} ten={ten} className={className} chuTo={chuTo} />;
}

/** Giá trị thuộc tính; suy luận (từ tên / theo NCC) => chữ xám nhỏ kèm nguồn, rê chuột xem giải thích */
export function GiaTriTT({ v, nho }: { v: GiaTriThuocTinh | undefined; nho?: boolean }) {
  if (!v) return null;
  if (v.nguon === 'master') return <>{v.giaTri}</>;
  const n = NHAN_NGUON[v.nguon];
  return (
    <span title={n.giaiThich}>
      {v.giaTri}
      <span className={`ml-1 font-normal italic text-slate-400 ${nho ? 'text-[0.5625rem]' : 'text-[0.6875rem]'}`}>{n.chu}</span>
    </span>
  );
}

/** Nhãn "Đang gán CT …" (tên dài cắt bớt, rê chuột xem đủ) */
export function NhanGanCT({ d }: { d: DongBan }) {
  if (!d.ganCT) return null;
  const ten = d.tenCongTrinh ?? '';
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-indigo-700"
      title={`Đang gán công trình: ${ten}${d.maCongTrinh ? ` (${d.maCongTrinh})` : ''}`}>
      <Building2 size={11} className="shrink-0" />
      <span className="truncate">Đang gán CT {ten}</span>
    </span>
  );
}

/** Dòng phụ dưới tên: quy cách · màu · thương hiệu (đã gộp suy luận); giá trị suy luận chữ nghiêng, title giải thích */
function MoTaPhu({ d, className }: { d: DongBan; className: string }) {
  const ds = (['quyCach', 'mau', 'thuongHieu'] as const).map(k => d.tt[k]).filter((v): v is GiaTriThuocTinh => !!v);
  if (!ds.length) return null;
  const chu = ds.map(v => v.giaTri).join(' · ');
  const coSuy = ds.some(v => v.nguon !== 'master');
  return (
    <span className={className} title={coSuy ? `${chu}\nChữ nghiêng: máy suy (từ tên / theo NCC), MASTER DATA chưa có — có thể chưa đúng` : chu}>
      {ds.map((v, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' · '}
          <span className={v.nguon === 'master' ? '' : 'italic text-slate-400'}>{v.giaTri}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

export const TheVatTu = React.memo(function TheVatTu({ d, coGiaVon, homNay, onMo }: {
  d: DongBan; coGiaVon: boolean; homNay: string; onMo: (d: DongBan) => void;
}) {
  const anh = dsAnhHien(d);
  const dau = anh[0];
  return (
    <button type="button" onClick={() => onMo(d)}
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <AnhDaiDien a={dau} nhom={d.nhom} ten={d.tenHien} className="h-full w-full transition group-hover:scale-[1.02]" chuTo />
        {dau?.loai === 'noi_bo' && (
          <div className="absolute bottom-2 left-2"><NhanCanDuyet anh={dau.anh} nho /></div>
        )}
        {anh.length > 1 && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
            <Images size={11} /> {anh.length}
          </span>
        )}
        {d.chamLuanChuyen && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[0.625rem] font-medium text-amber-700" title="Chậm luân chuyển trên 3 tháng">
            <AlertTriangle size={10} /> Chậm LC
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900" title={d.tenHien}>{d.tenHien}</p>
        <p className="truncate font-mono text-[0.6875rem] text-slate-400">{d.ma}</p>
        <MoTaPhu d={d} className="block truncate text-xs text-slate-500" />
        <NhanGanCT d={d} />
        <div className="mt-auto space-y-1 pt-2 text-xs text-slate-600">
          <p className="flex items-center justify-between gap-2">
            <span className="whitespace-nowrap font-semibold tabular-nums text-slate-800">{dinhDangSoLuong(d.soLuong, d.dvt)}</span>
            <span className="inline-flex min-w-0 items-center gap-1 truncate text-slate-500"><Warehouse size={11} className="shrink-0" />{d.khoTen}</span>
          </p>
          <p className="flex items-center justify-between gap-2 text-slate-500">
            <span className="inline-flex items-center gap-1"><Clock size={11} />{nhanTuoi(d.ngayNhap, homNay)}</span>
            {/* Giá trị tồn (giá vốn) chỉ người có quyền xem giá thấy */}
            {coGiaVon && d.giaTri !== null && (
              <span className="whitespace-nowrap font-medium tabular-nums text-slate-700" title="Giá trị tồn (giá vốn)">{dinhDangTrieu(d.giaTri)}</span>
            )}
          </p>
        </div>
      </div>
    </button>
  );
});

export const DongBang = React.memo(function DongBang({ d, coGiaVon, homNay, onMo }: {
  d: DongBan; coGiaVon: boolean; homNay: string; onMo: (d: DongBan) => void;
}) {
  const dau = dsAnhHien(d)[0];
  const canDuyet = dau?.loai === 'noi_bo' && anhCanDuyet(dau.anh);
  return (
    <tr onClick={() => onMo(d)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
      <td className="px-3 py-1.5">
        <div className={`h-9 w-9 overflow-hidden rounded-md ${canDuyet ? 'ring-2 ring-amber-400' : ''}`}
          title={canDuyet ? 'Ảnh mẫu CT — cần duyệt (dòng sheet 03 có nhiều mã)' : undefined}>
          <AnhDaiDien a={dau} nhom={d.nhom} ten={d.tenHien} className="h-9 w-9" />
        </div>
      </td>
      <td className="max-w-[22rem] px-3 py-1.5">
        <button type="button" onClick={e => { e.stopPropagation(); onMo(d); }}
          className="block max-w-full truncate text-left font-medium text-slate-900 hover:underline" title={d.tenHien}>{d.tenHien}</button>
        <p className="truncate text-xs text-slate-500">
          <span className="font-mono text-slate-400">{d.ma}</span>
          {(d.tt.quyCach || d.tt.mau || d.tt.thuongHieu) && <> · <MoTaPhu d={d} className="" /></>}
        </p>
        {d.ganCT && <div className="mt-0.5"><NhanGanCT d={d} /></div>}
      </td>
      <td className="max-w-[12rem] truncate px-3 py-1.5 text-xs text-slate-600" title={d.nhom}>{d.nhom}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-800">{dinhDangSoLuong(d.soLuong, d.dvt)}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-600">{d.khoTen}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-600">
        {nhanTuoi(d.ngayNhap, homNay)}
        {d.chamLuanChuyen && <span className="ml-1 text-amber-600" title="Chậm luân chuyển trên 3 tháng">●</span>}
      </td>
      {coGiaVon && <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-700">{dinhDangTrieu(d.giaTri)}</td>}
    </tr>
  );
});
