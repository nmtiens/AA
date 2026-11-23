import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, EyeOff, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { LinkLightbox } from '../shared/LinkLightbox';
import { useToast } from '../../context/ToastContext';
import {
  doiTrangThaiAnh, layLyLichMua, LoiBanVatTu,
  type AnhNoiBo, type LyLichMua, type TrangThaiAnh,
} from '../../services/banVatTuApi';
import { AnhDaiDien, GiaTriTT, NhanGanCT } from './TheVatTu';
import { AnhNoiBoImg, NhanCanDuyet, XemAnhNoiBo } from './AnhNoiBo';
import {
  anhCanDuyet, chuThichAnh, dinhDangDong, dinhDangSoLuong, dinhDangTrieu, DS_THUOC_TINH,
  NGAY_CHUYEN_SAP, NHAN_THUOC_TINH, nhanNgay, nhanNgayNhap, nhanTuoi, tenDvt,
  type AnhHien, type DongBan,
} from './xuLy';

// ============================================================================
// Cửa sổ chi tiết 1 mã vật tư (tra cứu tồn kho nội bộ): ảnh (bấm xem lớn), tồn từng kho, giá vốn (khi có quyền), lý
// lịch mua, thuộc tính master + MPxx.
// Ảnh = link đã dán trước đây (chỉ đọc) + ảnh mẫu sheet 03 (nội bộ; quyền 'ban_vat_tu_sua' duyệt "Đúng ảnh" / "Ẩn ảnh"
// — PUT /anh/:id); thuộc tính master trống => giá trị suy từ tên / theo NCC (ghi rõ nguồn); "Lý lịch mua" tải khi mở
// cửa sổ (GET /:ma/mua-hang).
// ============================================================================

function HangTT({ nhan, giaTri }: { nhan: string; giaTri: React.ReactNode }) {
  if (giaTri === null || giaTri === undefined || giaTri === '') return null;
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-slate-500">{nhan}</dt>
      <dd className="min-w-0 break-words text-slate-800">{giaTri}</dd>
    </div>
  );
}

function Muc({ tieuDe, children, phai }: { tieuDe: string; children: React.ReactNode; phai?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tieuDe}</h4>
        {phai}
      </div>
      {children}
    </section>
  );
}

const NHAN_DOI_ANH: Record<TrangThaiAnh, string> = { da_duyet: 'Đã xác nhận đúng ảnh', an: 'Đã ẩn ảnh', tu_dong: 'Đã bỏ duyệt ảnh' };

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.6875rem] text-slate-700">{children}</span>;
}

/**
 * LÝ LỊCH MUA: tải khi mở cửa sổ (GET /:ma/mua-hang). NCC, đơn giá gần nhất, bảng các lần mua chỉ hiện khi máy chủ
 * trả (người xem có quyền xem giá vật tư).
 */
function LyLichMuaMuc({ ma, tenTon, dvtTon }: { ma: string; tenTon: string; dvtTon: string | null }) {
  const [kq, setKq] = useState<{ loai: 'dang_tai' } | { loai: 'loi'; thongBao: string } | { loai: 'xong'; ll: LyLichMua }>({ loai: 'dang_tai' });
  const [lan, setLan] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    setKq({ loai: 'dang_tai' });
    layLyLichMua(ma, ac.signal)
      .then(ll => setKq({ loai: 'xong', ll }))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setKq({ loai: 'loi', thongBao: e instanceof LoiBanVatTu ? e.message : 'Không tải được lý lịch mua' });
      });
    return () => ac.abort();
  }, [ma, lan]);

  if (kq.loai === 'dang_tai') {
    return <p className="flex items-center gap-1.5 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Đang tải lý lịch mua…</p>;
  }
  if (kq.loai === 'loi') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <AlertTriangle size={14} className="text-amber-500" /> {kq.thongBao}
        <button type="button" onClick={() => setLan(n => n + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <RefreshCw size={12} /> Thử lại
        </button>
      </div>
    );
  }
  const ll = kq.ll;
  if (ll.soDongPr === 0) return <p className="text-sm text-slate-500">Chưa thấy lần mua (PR) nào của mã này trong dữ liệu vật tư.</p>;
  const coGia = ll.nhaCungCap !== null;
  const dvtGia = tenDvt(ll.donGiaGanNhat?.dvt ?? dvtTon);
  return (
    <div>
      <dl>
        <HangTT nhan="Số lần mua" giaTri={`${ll.soDongPr.toLocaleString('vi-VN')} dòng PR`} />
        <HangTT nhan="PR gần nhất" giaTri={nhanNgay(ll.ngayPrCuoi)} />
        <HangTT nhan="Công trình" giaTri={ll.congTrinh.length ? <span className="flex flex-wrap gap-1">{ll.congTrinh.map(c => <Chip key={c}>{c}</Chip>)}</span> : null} />
        <HangTT nhan="Code vật liệu" giaTri={ll.codeVatLieu.length ? <span className="flex flex-wrap gap-1">{ll.codeVatLieu.map(c => <Chip key={c}>{c}</Chip>)}</span> : null} />
        <HangTT nhan="Nhóm vật tư" giaTri={ll.nhomVt} />
        <HangTT nhan="Tên trên PR" giaTri={ll.tenPr && ll.tenPr !== tenTon ? ll.tenPr : null} />
        {coGia && <HangTT nhan="Nhà cung cấp" giaTri={ll.nhaCungCap?.length ? ll.nhaCungCap.join(' · ') : 'Không rõ'} />}
        {coGia && (
          <HangTT nhan="Đơn giá mua gần nhất" giaTri={ll.donGiaGanNhat
            ? <>{dinhDangDong(ll.donGiaGanNhat.gia)}{dvtGia ? ` / ${dvtGia}` : ''}{ll.donGiaGanNhat.ngay ? <span className="text-slate-500"> · PR {nhanNgay(ll.donGiaGanNhat.ngay)}</span> : null}</>
            : 'Không có dòng PR nào có giá'} />
        )}
      </dl>
      {coGia && ll.lanMua.length > 0 && (
        <details className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">Các lần mua ({ll.lanMua.length}{ll.soDongPr > ll.lanMua.length ? ` / ${ll.soDongPr}` : ''})</summary>
          <div className="-mx-1 mt-1 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-1 py-1 text-left font-medium">Ngày PR</th>
                  <th className="px-1 py-1 text-left font-medium">Công trình</th>
                  <th className="px-1 py-1 text-right font-medium">Số lượng</th>
                  <th className="px-1 py-1 text-right font-medium">Đơn giá</th>
                  <th className="px-1 py-1 text-left font-medium">NCC</th>
                </tr>
              </thead>
              <tbody>
                {ll.lanMua.map((l, i) => (
                  <tr key={i} className="border-t border-slate-200/70">
                    <td className="whitespace-nowrap px-1 py-1 text-slate-700" title={l.soPr ? `PR ${l.soPr}` : undefined}>{nhanNgay(l.ngayPr) || '—'}</td>
                    <td className="whitespace-nowrap px-1 py-1 font-mono text-slate-600">{l.congTrinh ?? '—'}</td>
                    <td className="whitespace-nowrap px-1 py-1 text-right tabular-nums">{l.soLuong !== null ? dinhDangSoLuong(l.soLuong, l.dvt) : '—'}</td>
                    <td className="whitespace-nowrap px-1 py-1 text-right tabular-nums">{l.donGia !== null && l.donGia > 0 ? dinhDangDong(l.donGia) : '—'}</td>
                    <td className="max-w-[12rem] truncate px-1 py-1 text-slate-600" title={l.ncc ?? undefined}>{l.ncc ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {!coGia && <p className="mt-1 text-xs text-slate-400">Nhà cung cấp và giá mua chỉ người có quyền xem giá vật tư thấy.</p>}
    </div>
  );
}

export function ChiTietVatTu({ d, cungMa, coGiaVon, coQuyenSua, homNay, onDong, onDoiAnh }: {
  d: DongBan;
  /** Mọi dòng tồn của cùng mã (các kho) */
  cungMa: DongBan[];
  coGiaVon: boolean;
  /** Quyền 'ban_vat_tu_sua' — duyệt / ẩn ảnh mẫu */
  coQuyenSua: boolean;
  homNay: string;
  onDong: () => void;
  /** Sau khi duyệt / ẩn 1 ảnh nội bộ — trang cập nhật mọi dòng của mã (anhGoc: ảnh vừa bỏ ẩn, để thêm lại) */
  onDoiAnh: (ma: string, id: number, tt: TrangThaiAnh, anhGoc?: AnhNoiBo) => void;
}) {
  const { showToast } = useToast();
  const [xemAnh, setXemAnh] = useState<number | null>(null);
  const [xemNoiBo, setXemNoiBo] = useState<number | null>(null);
  const [dangDoiAnh, setDangDoiAnh] = useState<number | null>(null);
  /** Ảnh vừa ẩn (còn giữ trong bộ nhớ) => nút "Hoàn tác" trả về trạng thái cũ */
  const [vuaAn, setVuaAn] = useState<AnhNoiBo | null>(null);

  const tongSL = cungMa.reduce((s, x) => s + x.soLuong, 0);
  const tongGT = coGiaVon ? cungMa.reduce((s, x) => s + (x.giaTri ?? 0), 0) : null;
  const m = d.master;
  const dvt = tenDvt(d.dvt);
  const dsAnh = d.anhLink;
  // Ảnh hiện: link đã dán trước đây, rồi ảnh mẫu sheet 03 (nội bộ)
  const anhHien: AnhHien[] = useMemo(
    () => [...dsAnh.map(url => ({ loai: 'link' as const, url })), ...d.anh.map(a => ({ loai: 'noi_bo' as const, anh: a }))],
    [dsAnh, d.anh]);
  const tt = d.tt;
  const moAnh = (i: number) => {
    const a = anhHien[i];
    if (!a) return;
    if (a.loai === 'link') setXemAnh(dsAnh.indexOf(a.url));
    else setXemNoiBo(d.anh.findIndex(x => x.id === a.anh.id));
  };
  const dongXemNoiBo = useCallback(() => setXemNoiBo(null), []);

  const doiAnh = async (a: AnhNoiBo, moi: TrangThaiAnh) => {
    // Ẩn ảnh: giao diện không liệt kê ảnh đã ẩn => hỏi trước, sau khi ẩn còn nút Hoàn tác
    if (moi === 'an' && !window.confirm(`Ẩn ảnh "${chuThichAnh(a)}" khỏi mã ${d.ma}?
Chỉ ẩn khi ảnh KHÔNG phải của mã này.`)) return;
    setDangDoiAnh(a.id);
    try {
      const kq = await doiTrangThaiAnh(a.id, moi);
      onDoiAnh(d.ma, a.id, kq, kq === 'an' ? undefined : a);
      setVuaAn(kq === 'an' ? a : null);
      showToast(NHAN_DOI_ANH[kq], 'success');
    } catch (e) {
      showToast(e instanceof LoiBanVatTu ? e.message : 'Không đổi được trạng thái ảnh, hãy thử lại', 'error');
    } finally {
      setDangDoiAnh(null);
    }
  };

  const thuocTinhKhac = useMemo(() => Object.entries(m?.thuocTinh ?? {}).sort((a, b) => a[0].localeCompare(b[0], 'vi')), [m]);

  /** Hoàn tác ẩn: trả ảnh về trạng thái trước khi ẩn (đã duyệt giữ đã duyệt) */
  const hoanTacAn = async () => {
    const a = vuaAn;
    if (!a) return;
    setDangDoiAnh(a.id);
    try {
      const kq = await doiTrangThaiAnh(a.id, a.trangThai);
      onDoiAnh(d.ma, a.id, kq, a);
      setVuaAn(null);
      showToast('Đã hiện lại ảnh', 'success');
    } catch (e) {
      showToast(e instanceof LoiBanVatTu ? e.message : 'Không hoàn tác được, hãy thử lại', 'error');
    } finally {
      setDangDoiAnh(null);
    }
  };

  return (
    <ModalShell open onClose={onDong} labelledBy="bvt-chi-tiet-tieu-de" closeOnEsc={xemAnh === null && xemNoiBo === null}
      overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/50 p-2 sm:p-4"
      panelClassName="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-[#f5f6f8] shadow-2xl outline-none">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          {/* chủng loại máy suy: kèm chữ "suy từ tên" như mọi giá trị suy luận */}
          <p className="kpi-label">{d.nhom}{tt.chungLoai ? <> · <GiaTriTT v={tt.chungLoai} nho /></> : null}</p>
          <h3 id="bvt-chi-tiet-tieu-de" className="text-base font-semibold leading-snug text-slate-900 sm:text-lg">{d.tenHien}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-slate-500">{d.ma}</span>
            <NhanGanCT d={d} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={onDong} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Cột trái: ảnh + ảnh mẫu sheet 03 (duyệt / ẩn) */}
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button type="button" disabled={!anhHien.length} onClick={() => moAnh(0)}
                className="relative block w-full disabled:cursor-default" title={anhHien.length ? 'Bấm để xem ảnh lớn' : undefined}>
                <AnhDaiDien key={anhHien[0] ? (anhHien[0].loai === 'link' ? anhHien[0].url : `nb${anhHien[0].anh.id}`) : ''}
                  a={anhHien[0]} nhom={d.nhom} ten={d.tenHien} className="aspect-[4/3] w-full" chuTo />
                {anhHien[0]?.loai === 'noi_bo' && (
                  <span className="absolute bottom-2 left-2 flex flex-wrap gap-1">
                    <NhanCanDuyet anh={anhHien[0].anh} />
                  </span>
                )}
              </button>
              {anhHien[0]?.loai === 'noi_bo' && (
                <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">{chuThichAnh(anhHien[0].anh)}</p>
              )}
              {anhHien.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto p-2 custom-scrollbar">
                  {anhHien.map((a, i) => (
                    <button key={a.loai === 'link' ? a.url : `nb${a.anh.id}`} type="button" onClick={() => moAnh(i)}
                      title={a.loai === 'noi_bo' ? chuThichAnh(a.anh) : undefined}
                      className={`relative shrink-0 overflow-hidden rounded-md hover:ring-slate-400 ${a.loai === 'noi_bo' && anhCanDuyet(a.anh) ? 'ring-2 ring-amber-400' : 'ring-1 ring-slate-200'}`}>
                      <AnhDaiDien a={a} nhom={d.nhom} ten={d.tenHien} className="h-12 w-12" />
                    </button>
                  ))}
                </div>
              )}
              {!anhHien.length && <p className="px-3 py-2 text-xs text-slate-400">Chưa có ảnh</p>}
            </div>

            {vuaAn && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                <span className="min-w-0 truncate">Đã ẩn: {chuThichAnh(vuaAn)}</span>
                <button type="button" disabled={dangDoiAnh === vuaAn.id} onClick={hoanTacAn}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {dangDoiAnh === vuaAn.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Hoàn tác
                </button>
              </div>
            )}
            {d.anh.length > 0 && (
              <Muc tieuDe={`Ảnh mẫu từ sheet 03 · ${d.anh.length}`}>
                <p className="mb-2 text-xs text-slate-500">
                  Ảnh mẫu vật liệu đã duyệt ở file PRODUCTION STATUS công trình (sheet 03_MATERIALS) — chỉ dùng nội bộ.
                  {d.anh.some(anhCanDuyet) && ' Ảnh viền vàng lấy từ dòng có nhiều mã — có thể là ảnh của mã khác.'}
                </p>
                <ul className="space-y-1.5">
                  {d.anh.map((a, i) => (
                    <li key={a.id} className={`flex items-center gap-2 rounded-lg border p-1.5 ${anhCanDuyet(a) ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
                      <button type="button" onClick={() => setXemNoiBo(i)} className="shrink-0 overflow-hidden rounded" title="Xem ảnh lớn">
                        <AnhNoiBoImg anh={a} alt={chuThichAnh(a)} className="h-12 w-12"
                          duPhong={<div className="flex h-12 w-12 items-center justify-center bg-slate-100 text-[0.625rem] text-slate-400">Lỗi ảnh</div>} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-medium text-slate-700" title={chuThichAnh(a)}>{chuThichAnh(a)}</p>
                        <p className="text-[0.6875rem] text-slate-500">
                          {a.trangThai === 'da_duyet' ? <span className="text-emerald-700">Đã xác nhận đúng ảnh</span>
                            : anhCanDuyet(a) ? <span className="text-amber-700">Cần duyệt — dòng 03 nhiều mã</span> : 'Dòng 03 chỉ có mã này'}
                        </p>
                      </div>
                      {coQuyenSua && (
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          {a.trangThai !== 'da_duyet' && (
                            <button type="button" disabled={dangDoiAnh === a.id} onClick={() => doiAnh(a, 'da_duyet')} title="Xác nhận đây đúng là ảnh của mã này"
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-1.5 py-1 text-[0.6875rem] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                              {dangDoiAnh === a.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Đúng ảnh
                            </button>
                          )}
                          <button type="button" disabled={dangDoiAnh === a.id} onClick={() => doiAnh(a, 'an')} title="Ảnh không phải của mã này — ẩn khỏi trang"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[0.6875rem] font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">
                            <EyeOff size={12} /> Ẩn ảnh
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </Muc>
            )}
          </div>

          {/* Cột phải: tồn kho + giá vốn + lý lịch mua + thuộc tính */}
          <div className="space-y-4">
            <Muc tieuDe={`Tồn kho${cungMa.length > 1 ? ` · ${cungMa.length} kho` : ''}`}
              phai={<span className="text-sm font-semibold tabular-nums text-slate-800">{dinhDangSoLuong(tongSL, d.dvt)}</span>}>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="px-1 py-1 text-left font-medium">Kho</th>
                      <th className="px-1 py-1 text-right font-medium">Số lượng</th>
                      <th className="px-1 py-1 text-left font-medium">Nhập gần nhất</th>
                      <th className="px-1 py-1 text-left font-medium">Tuổi tồn</th>
                      {coGiaVon && <th className="px-1 py-1 text-right font-medium">Giá trị</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {cungMa.map(x => (
                      <tr key={x.khoa} className={`border-t border-slate-100 ${x.khoa === d.khoa ? 'bg-slate-50' : ''}`}>
                        <td className="px-1 py-1.5 text-slate-700">
                          {x.khoTen}
                          {x.chamLuanChuyen && <span className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[0.625rem] font-medium text-amber-700">Chậm LC</span>}
                          {x.ganCT && x.khoa !== d.khoa && <div className="mt-0.5"><NhanGanCT d={x} /></div>}
                        </td>
                        <td className="whitespace-nowrap px-1 py-1.5 text-right tabular-nums">{dinhDangSoLuong(x.soLuong, x.dvt)}</td>
                        <td className="whitespace-nowrap px-1 py-1.5 text-slate-600">{nhanNgayNhap(x.ngayNhap)}</td>
                        <td className="whitespace-nowrap px-1 py-1.5 text-slate-600">{nhanTuoi(x.ngayNhap, homNay)}</td>
                        {coGiaVon && <td className="whitespace-nowrap px-1 py-1.5 text-right tabular-nums">{dinhDangTrieu(x.giaTri)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.ganCT && (
                <p className="mt-2 text-xs text-slate-500">
                  Công trình: <span className="font-medium text-slate-700">{d.tenCongTrinh}</span>{d.maCongTrinh ? ` (${d.maCongTrinh})` : ''} — kiểm tra với công trình trước khi xuất dùng.
                </p>
              )}
            </Muc>

            {coGiaVon && (
              <Muc tieuDe="Giá vốn (chỉ người có quyền xem giá)">
                <dl>
                  <HangTT nhan="Giá trị tồn" giaTri={tongGT !== null ? `${dinhDangTrieu(tongGT)} (${dinhDangDong(tongGT * 1e6)})` : null} />
                  <HangTT nhan="Đơn giá vốn" giaTri={d.donGiaVon !== null ? `${dinhDangDong(d.donGiaVon)} / ${dvt || 'đvt'}` : null} />
                  {/* giaBinhQuan máy chủ đã chia price_unit => đồng / 1 đvt */}
                  <HangTT nhan="Giá bình quân SAP" giaTri={m?.giaBinhQuan !== null && m?.giaBinhQuan !== undefined ? `${dinhDangDong(m.giaBinhQuan)} / ${dvt || 'đvt'}` : null} />
                </dl>
              </Muc>
            )}

            <Muc tieuDe="Lý lịch mua">
              <LyLichMuaMuc ma={d.ma} tenTon={d.tenHien} dvtTon={d.dvt} />
            </Muc>

            <Muc tieuDe="Thuộc tính vật tư">
              {!m ? (
                <p className="text-sm text-slate-500">Mã chưa có trong MASTER DATA vật tư.</p>
              ) : (
                <dl>
                  {m.nguon === 'SUY_TEN' && (
                    <div className="mb-2 text-sm text-slate-500">Mã chưa có trong MASTER DATA vật tư — thuộc tính dưới đây máy suy từ tên.</div>
                  )}
                  <HangTT nhan="Tên master" giaTri={m.ten && m.ten !== d.tenHien ? m.ten : null} />
                  <HangTT nhan="Nhóm SAP" giaTri={[m.nhomSap, m.tenNhomSap].filter(Boolean).join(' · ')} />
                  <HangTT nhan="Loại vật tư" giaTri={m.loai} />
                  {/* Master nếu có, không thì giá trị máy suy (chữ xám "suy từ tên" / "theo NCC") */}
                  {DS_THUOC_TINH.map(k => <HangTT key={k} nhan={NHAN_THUOC_TINH[k]} giaTri={tt[k] ? <GiaTriTT v={tt[k]} /> : null} />)}
                  <HangTT nhan="Xuất xứ" giaTri={m.xuatXu} />
                  <HangTT nhan="Đơn vị tính" giaTri={d.dvt ? `${dvt} (${d.dvt})` : null} />
                  {thuocTinhKhac.length > 0 && (
                    <details className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium text-slate-600">Thuộc tính chi tiết ({thuocTinhKhac.length})</summary>
                      <div className="mt-1">
                        {thuocTinhKhac.map(([k, v]) => <HangTT key={k} nhan={k} giaTri={v} />)}
                      </div>
                    </details>
                  )}
                </dl>
              )}
            </Muc>
            {d.ngayNhap && <p className="px-1 text-xs text-slate-400">Ngày nhập kho gần nhất theo SAP: {nhanNgay(d.ngayNhap)}{d.ngayNhap <= NGAY_CHUYEN_SAP ? ' (ngày chuyển dữ liệu sang SAP — hàng có từ trước 10/2024)' : ''}</p>}
          </div>
        </div>
      </div>

      {xemAnh !== null && dsAnh.length > 0 && (
        <LinkLightbox urls={dsAnh} start={xemAnh} title={d.tenHien} onClose={() => setXemAnh(null)} />
      )}
      {xemNoiBo !== null && d.anh.length > 0 && (
        <XemAnhNoiBo ds={d.anh} start={xemNoiBo} ten={d.tenHien} coQuyenSua={coQuyenSua} dangDoi={dangDoiAnh}
          onDoi={doiAnh} onDong={dongXemNoiBo} />
      )}
    </ModalShell>
  );
}
