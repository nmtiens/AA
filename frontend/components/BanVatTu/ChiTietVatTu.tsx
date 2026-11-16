import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ClipboardCopy, EyeOff, Globe, ImagePlus, Loader2, Pencil, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { LinkLightbox } from '../shared/LinkLightbox';
import { useToast } from '../../context/ToastContext';
import {
  doiCongKhaiAnh, doiTrangThaiAnh, DS_TRANG_THAI, layLyLichMua, LoiBanVatTu, luuThongTinBan,
  type AnhNoiBo, type LyLichMua, type ThongTinBan, type TrangThaiAnh, type TrangThaiBan,
} from '../../services/banVatTuApi';
import { AnhDaiDien, AnhVatTu, GiaTriTT, NhanGanCT, NhanTrangKhach, NhanTrangThai } from './TheVatTu';
import { AnhNoiBoImg, NhanAnhCongKhai, NhanCanDuyet, XemAnhNoiBo } from './AnhNoiBo';
import {
  anhCanDuyet, chuThichAnh, dinhDangDong, dinhDangSoLuong, dinhDangTrieu, docGiaNhap, DS_THUOC_TINH, giaChao, giaHien, hienTrenTrangKhach, kiemTraForm,
  TOI_DA_MO_TA_KHACH, TOI_DA_TEN_KHACH,
  NGAY_CHUYEN_SAP, NHAN_THUOC_TINH, NHAN_TRANG_THAI, nhanNgay, nhanNgayNhap, nhanTuoi, tachLinkAnh, tenCoCongTrinh, tenDvt, TOI_DA_ANH,
  type AnhHien, type DongBan, type GiaTriThuocTinh,
} from './xuLy';

// ============================================================================
// Cửa sổ chi tiết 1 mã vật tư: ảnh (bấm xem lớn), thông tin tồn từng kho, thuộc tính master + MPxx, giá vốn (khi có
// quyền), thông tin chào bán. Có quyền 'ban_vat_tu_sua' => sửa giá chào / ảnh / trạng thái / liên hệ / ghi chú (PUT).
// Ảnh = link người dùng dán + ảnh mẫu sheet 03 (nội bộ, duyệt "Đúng ảnh" / "Ẩn ảnh" — PUT /anh/:id); thuộc tính master trống
// => giá trị suy từ tên / theo NCC (ghi rõ nguồn); "Lý lịch mua" tải khi mở cửa sổ (GET /:ma/mua-hang).
// Trang khách (/#/cua-hang): công tắc "Đăng lên trang khách" (PUT { dangCongKhai } ngay), tên / mô tả cho khách trong form
// sửa, từng ảnh sheet 03 bật "Hiện cho khách" (mặc định tắt — ảnh hay có chữ viết tay / tên công trình).
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

const giaThanhChu = (v: number | null) => (v !== null && v > 0 ? v.toLocaleString('vi-VN') : '');

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

export function ChiTietVatTu({ d, cungMa, coGiaVon, coQuyenSua, homNay, onDong, onDaLuu, onDoiAnh, onDoiCongKhaiAnh }: {
  d: DongBan;
  /** Mọi dòng tồn của cùng mã (các kho) */
  cungMa: DongBan[];
  coGiaVon: boolean;
  coQuyenSua: boolean;
  homNay: string;
  onDong: () => void;
  onDaLuu: (ma: string, ban: ThongTinBan) => void;
  /** Sau khi duyệt / ẩn 1 ảnh nội bộ — trang cập nhật mọi dòng của mã (anhGoc: ảnh vừa bỏ ẩn, để thêm lại) */
  onDoiAnh: (ma: string, id: number, tt: TrangThaiAnh, anhGoc?: AnhNoiBo) => void;
  /** Sau khi bật / tắt "Hiện cho khách" của 1 ảnh nội bộ */
  onDoiCongKhaiAnh: (ma: string, id: number, congKhai: boolean) => void;
}) {
  const { showToast } = useToast();
  const ban = d.ban;
  const [dangSua, setDangSua] = useState(false);
  const [gia, setGia] = useState(giaThanhChu(ban.giaBanVnd));
  const [anh, setAnh] = useState<string[]>(ban.anhUrls);
  const [oDan, setODan] = useState('');
  const [trangThai, setTrangThai] = useState<TrangThaiBan>(ban.trangThai);
  const [lienHe, setLienHe] = useState(ban.lienHe ?? '');
  const [ghiChu, setGhiChu] = useState(ban.ghiChu ?? '');
  const [tenKhach, setTenKhach] = useState(ban.tenHienThi ?? '');
  const [moTaKhach, setMoTaKhach] = useState(ban.moTaCongKhai ?? '');
  /** Đang gửi PUT bật / tắt đăng trang khách */
  const [dangDoiDang, setDangDoiDang] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [xemAnh, setXemAnh] = useState<number | null>(null);
  const [xemNoiBo, setXemNoiBo] = useState<number | null>(null);
  const [dangDoiAnh, setDangDoiAnh] = useState<number | null>(null);
  /** Ảnh vừa ẩn (còn giữ trong bộ nhớ) => nút "Hoàn tác" trả về trạng thái cũ */
  const [vuaAn, setVuaAn] = useState<AnhNoiBo | null>(null);

  const tongSL = cungMa.reduce((s, x) => s + x.soLuong, 0);
  const tongGT = coGiaVon ? cungMa.reduce((s, x) => s + (x.giaTri ?? 0), 0) : null;
  const giaThe = giaHien({ donGiaVon: d.donGiaVon, ban: { giaBanVnd: d.ban.giaBanVnd } }, coGiaVon);
  const giaMotDvt = giaThe.loai === 'ban' ? (d.ban.giaBanVnd ?? 0) : giaThe.loai === 'von' ? (d.donGiaVon ?? 0) : 0;
  const m = d.master;
  const dvt = tenDvt(d.dvt);
  const dsAnh = dangSua ? anh : ban.anhUrls;
  // Ảnh hiện: link người dùng dán trước, rồi ảnh mẫu sheet 03 (nội bộ)
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

  const daDoi = dangSua && (
    gia !== giaThanhChu(ban.giaBanVnd) || anh.join('\n') !== ban.anhUrls.join('\n') || trangThai !== ban.trangThai
    || lienHe !== (ban.lienHe ?? '') || ghiChu !== (ban.ghiChu ?? '') || oDan.trim() !== ''
    || tenKhach !== (ban.tenHienThi ?? '') || moTaKhach !== (ban.moTaCongKhai ?? ''));

  const thuocTinhKhac = useMemo(() => Object.entries(m?.thuocTinh ?? {}).sort((a, b) => a[0].localeCompare(b[0], 'vi')), [m]);

  const themLink = () => {
    const moi = tachLinkAnh(oDan).filter(u => !anh.includes(u));
    if (!moi.length) { setODan(''); return; }
    setAnh(a => [...a, ...moi]);
    setODan('');
  };

  const huySua = () => {
    setGia(giaThanhChu(ban.giaBanVnd)); setAnh(ban.anhUrls); setODan(''); setTrangThai(ban.trangThai);
    setLienHe(ban.lienHe ?? ''); setGhiChu(ban.ghiChu ?? ''); setTenKhach(ban.tenHienThi ?? ''); setMoTaKhach(ban.moTaCongKhai ?? '');
    setLoi(null); setDangSua(false);
  };

  const luu = async () => {
    // Link còn trong ô dán mà chưa bấm "Thêm" cũng tính
    const dsAnhLuu = [...anh, ...tachLinkAnh(oDan).filter(u => !anh.includes(u))];
    const f = { gia, anh: dsAnhLuu, lienHe: lienHe.trim(), ghiChu: ghiChu.trim(), tenHienThi: tenKhach.trim(), moTaCongKhai: moTaKhach.trim() };
    const sai = kiemTraForm(f);
    if (sai) { setLoi(sai); return; }
    setDangLuu(true);
    setLoi(null);
    try {
      // Tên / mô tả cho khách chỉ gửi khi đổi: máy chủ chưa chạy SQL trang khách vẫn lưu được giá, trạng thái, liên hệ…
      // (gửi cột trang khách khi DB chưa có cột => 503 cả lần lưu)
      const tenMoi = f.tenHienThi || null;
      const moTaMoi = f.moTaCongKhai || null;
      const daLuu = await luuThongTinBan(d.ma, {
        giaBanVnd: docGiaNhap(gia), anhUrls: dsAnhLuu, trangThai, lienHe: f.lienHe || null, ghiChu: f.ghiChu || null,
        ...(tenMoi !== (ban.tenHienThi ?? null) ? { tenHienThi: tenMoi } : {}),
        ...(moTaMoi !== (ban.moTaCongKhai ?? null) ? { moTaCongKhai: moTaMoi } : {}),
      });
      onDaLuu(d.ma, daLuu);
      setAnh(daLuu.anhUrls); setODan(''); setGia(giaThanhChu(daLuu.giaBanVnd));
      setTenKhach(daLuu.tenHienThi ?? ''); setMoTaKhach(daLuu.moTaCongKhai ?? '');
      setDangSua(false);
      showToast('Đã lưu thông tin bán', 'success');
    } catch (e) {
      setLoi(e instanceof LoiBanVatTu ? e.message : 'Không lưu được, hãy thử lại');
    } finally {
      setDangLuu(false);
    }
  };

  /** Bật / tắt đăng mã lên trang khách — lưu ngay (không cần bấm Sửa); chỉ gửi đúng trường dangCongKhai */
  const doiDangTrangKhach = async () => {
    const bat = !ban.dangCongKhai;
    if (bat && !ban.tenHienThi && cungMa.some(x => tenCoCongTrinh(x)) && !window.confirm(
      `Tên "${d.tenHien}" có mã / tên công trình. Trang khách tự che phần đó, nhưng nên đặt "Tên hiển thị cho khách" trước.\nVẫn đăng mã ${d.ma}?`)) return;
    setDangDoiDang(true);
    try {
      const daLuu = await luuThongTinBan(d.ma, { dangCongKhai: bat });
      onDaLuu(d.ma, daLuu);
      showToast(daLuu.dangCongKhai ? 'Đã đăng lên trang khách' : 'Đã gỡ khỏi trang khách', 'success');
    } catch (e) {
      showToast(e instanceof LoiBanVatTu ? e.message : 'Không đổi được, hãy thử lại', 'error');
    } finally {
      setDangDoiDang(false);
    }
  };

  /** Bật / tắt "Hiện cho khách" của 1 ảnh sheet 03; bật thì hỏi trước (ảnh hay có chữ viết tay / dấu duyệt / tên công trình) */
  const doiCongKhai = async (a: AnhNoiBo, bat: boolean) => {
    const canhBao = anhCanDuyet(a) ? '\nẢnh này chưa duyệt — có thể là ảnh của mã khác.' : '';
    if (bat && !window.confirm(`Hiện ảnh "${chuThichAnh(a)}" cho khách xem?\nKiểm tra ảnh KHÔNG có chữ viết tay, dấu duyệt, tên công trình / khách hàng.\nẨn lại thì máy chủ chặn ngay, nhưng trình duyệt / Zalo của khách có thể còn giữ ảnh tới 5 phút; ảnh khách đã tải về thì không thu hồi được.${canhBao}`)) return;
    setDangDoiAnh(a.id);
    try {
      const kq = await doiCongKhaiAnh(a.id, bat);
      onDoiCongKhaiAnh(d.ma, a.id, kq);
      showToast(kq ? 'Ảnh đã hiện cho khách' : 'Đã ẩn ảnh khỏi trang khách', 'success');
    } catch (e) {
      showToast(e instanceof LoiBanVatTu ? e.message : 'Không đổi được ảnh, hãy thử lại', 'error');
    } finally {
      setDangDoiAnh(null);
    }
  };

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

  // Câu chào bán gọn để dán gửi khách (Zalo / email). Giá trị máy suy (từ tên / theo NCC) ghi "(tham khảo)" —
  // không đưa ra như dữ liệu MASTER DATA
  const saoChep = async () => {
    const chepTT = (nhan: string, v: GiaTriThuocTinh | undefined) =>
      v && `${nhan}: ${v.giaTri}${v.nguon === 'master' ? '' : ' (tham khảo)'}`;
    const dong = [
      ban.tenHienThi ?? d.tenHien,
      `Mã: ${d.ma}`,
      [chepTT('Quy cách', tt.quyCach), chepTT('Màu', tt.mau), chepTT('Thương hiệu', tt.thuongHieu)].filter(Boolean).join(' · '),
      `Số lượng: ${dinhDangSoLuong(tongSL, d.dvt)}`,
      `Giá chào: ${giaChao(ban.giaBanVnd)}${ban.giaBanVnd && dvt ? ` / ${dvt}` : ''}`,
      ban.lienHe ? `Liên hệ: ${ban.lienHe}` : '',
      ban.anhUrls.length ? `Ảnh: ${ban.anhUrls.join(' ')}` : '',
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(dong);
      showToast('Đã chép thông tin chào bán', 'success');
    } catch {
      showToast('Trình duyệt không cho chép — hãy bôi đen và chép tay', 'error');
    }
  };

  const giaXem = docGiaNhap(gia);

  // Nút X: đang có sửa chưa lưu thì hỏi lại trước khi đóng (ESC đã bị chặn khi có thay đổi — closeOnEsc bên dưới)
  const dongCoHoi = () => {
    if (daDoi && !window.confirm('Giá / ảnh / ghi chú đang sửa chưa lưu. Đóng và bỏ các thay đổi này?')) return;
    onDong();
  };

  return (
    <ModalShell open onClose={onDong} labelledBy="bvt-chi-tiet-tieu-de" closeOnEsc={!daDoi && xemAnh === null && xemNoiBo === null}
      overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/50 p-2 sm:p-4"
      panelClassName="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-[#f5f6f8] shadow-2xl outline-none">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          {/* chủng loại máy suy: kèm chữ "suy từ tên" như mọi giá trị suy luận */}
          <p className="kpi-label">{d.nhom}{tt.chungLoai ? <> · <GiaTriTT v={tt.chungLoai} nho /></> : null}</p>
          <h3 id="bvt-chi-tiet-tieu-de" className="text-base font-semibold leading-snug text-slate-900 sm:text-lg">{d.tenHien}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-slate-500">{d.ma}</span>
            <NhanTrangThai tt={ban.trangThai} />
            <NhanGanCT d={d} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={saoChep} title="Chép tên, số lượng, giá chào, liên hệ, link ảnh để gửi khách"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <ClipboardCopy size={14} /> <span className="hidden sm:inline">Chép chào bán</span>
          </button>
          <button type="button" onClick={dongCoHoi} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Cột trái: ảnh + chào bán + ảnh mẫu sheet 03 (duyệt / ẩn) */}
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button type="button" disabled={!anhHien.length} onClick={() => moAnh(0)}
                className="relative block w-full disabled:cursor-default" title={anhHien.length ? 'Bấm để xem ảnh lớn' : undefined}>
                <AnhDaiDien key={anhHien[0] ? (anhHien[0].loai === 'link' ? anhHien[0].url : `nb${anhHien[0].anh.id}`) : ''}
                  a={anhHien[0]} nhom={d.nhom} ten={d.tenHien} className="aspect-[4/3] w-full" chuTo />
                {anhHien[0]?.loai === 'noi_bo' && (
                  <span className="absolute bottom-2 left-2 flex flex-wrap gap-1">
                    <NhanCanDuyet anh={anhHien[0].anh} />
                    <NhanAnhCongKhai anh={anhHien[0].anh} />
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
                      {a.loai === 'noi_bo' && a.anh.congKhai && (
                        <span className="absolute bottom-0.5 left-0.5"><NhanAnhCongKhai anh={a.anh} nho /></span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {!anhHien.length && <p className="px-3 py-2 text-xs text-slate-400">Chưa có ảnh{coQuyenSua ? ' — bấm Sửa để dán link ảnh (Google Drive / link ảnh trực tiếp)' : ''}</p>}
            </div>

            <Muc tieuDe="Chào bán" phai={coQuyenSua && !dangSua ? (
              <button type="button" onClick={() => setDangSua(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                <Pencil size={12} /> Sửa
              </button>
            ) : null}>
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Globe size={14} className="text-sky-600" /> Đăng lên trang khách
                  </span>
                  {coQuyenSua ? (
                    <button type="button" role="switch" aria-checked={ban.dangCongKhai} aria-label="Đăng lên trang khách"
                      disabled={dangDoiDang} onClick={doiDangTrangKhach}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${ban.dangCongKhai ? 'bg-sky-600' : 'bg-slate-300'}`}>
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${ban.dangCongKhai ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}`} />
                      {dangDoiDang && <Loader2 size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-slate-600" />}
                    </button>
                  ) : (
                    ban.dangCongKhai ? <NhanTrangKhach ban={ban} /> : <span className="text-xs text-slate-500">Chưa đăng</span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                  {ban.dangCongKhai && !hienTrenTrangKhach(ban) && (
                    <p className="text-amber-700">Trang khách đang ẩn mã này vì trạng thái là "{NHAN_TRANG_THAI[ban.trangThai]}" — chỉ mã Đang bán mới hiện.</p>
                  )}
                  {!(ban.giaBanVnd !== null && ban.giaBanVnd > 0) && <p>Chưa có giá bán → khách thấy "Liên hệ báo giá" (giá vốn không bao giờ hiện cho khách).</p>}
                  <p>
                    Ảnh khách thấy: {ban.anhUrls.length ? `${ban.anhUrls.length} link ảnh dán` : 'không có link ảnh dán'}
                    {d.anh.length > 0 && ` · ${d.anh.filter(a => a.congKhai).length}/${d.anh.length} ảnh sheet 03 đã bật "Hiện cho khách"`}
                  </p>
                </div>
              </div>
              {!dangSua ? (
                <dl>
                  <div className="pb-2">
                    {/* Cùng quy tắc giá với thẻ: giá bán, chưa có => đơn giá vốn (chỉ người có quyền giá), còn lại "Liên hệ" */}
                    <p className={`text-2xl font-bold tabular-nums ${giaThe.loai === 'ban' ? 'text-emerald-700' : giaThe.loai === 'von' ? 'text-slate-700' : 'text-slate-400'}`}>
                      {giaThe.chu}
                      {giaThe.loai !== 'lien_he' && dvt ? <span className="text-sm font-normal text-slate-400"> / {dvt}</span> : null}
                      {giaThe.loai === 'von' && <span className="ml-2 align-middle text-xs font-medium text-amber-600">giá vốn — chưa nhập giá bán</span>}
                    </p>
                    {giaMotDvt > 0 && tongSL > 0 ? (
                      <p className="text-xs text-slate-500">Cả lô {dinhDangSoLuong(tongSL, d.dvt)} ≈ {dinhDangDong(giaMotDvt * tongSL)}</p>
                    ) : null}
                  </div>
                  {/* Số lượng tồn ngay trong ô chào bán (người dùng 14/11/2026) — cộng mọi kho của mã */}
                  <HangTT nhan="Số lượng tồn" giaTri={<span className="font-semibold tabular-nums text-slate-900">{dinhDangSoLuong(tongSL, d.dvt)}</span>} />
                  <HangTT nhan="Trạng thái" giaTri={NHAN_TRANG_THAI[ban.trangThai]} />
                  <HangTT nhan="Tên cho khách" giaTri={ban.tenHienThi} />
                  <HangTT nhan="Mô tả cho khách" giaTri={ban.moTaCongKhai && <span className="whitespace-pre-line">{ban.moTaCongKhai}</span>} />
                  <HangTT nhan="Liên hệ" giaTri={ban.lienHe && <span className="whitespace-pre-line">{ban.lienHe}</span>} />
                  <HangTT nhan="Ghi chú" giaTri={ban.ghiChu && <span className="whitespace-pre-line">{ban.ghiChu}</span>} />
                  <HangTT nhan="Cập nhật" giaTri={ban.updatedAt ? `${ban.updatedBy ?? ''}${ban.updatedBy ? ' · ' : ''}${new Date(ban.updatedAt).toLocaleString('vi-VN')}` : null} />
                </dl>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Giá chào (đồng / {dvt || 'đơn vị'}) — để trống = "Liên hệ"</span>
                    <input value={gia} inputMode="numeric" data-autofocus
                      onChange={e => setGia(e.target.value)}
                      onBlur={() => { const g = docGiaNhap(gia); if (g !== null && Number.isFinite(g)) setGia(giaThanhChu(g)); }}
                      placeholder="vd 1.250.000"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm tabular-nums outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
                    {giaXem !== null && Number.isFinite(giaXem) && giaXem > 0 && tongSL > 0 && (
                      <span className="mt-0.5 block text-xs text-slate-500">Cả lô ≈ {dinhDangDong(giaXem * tongSL)}
                        {coGiaVon && d.donGiaVon ? <> · giá vốn {dinhDangDong(d.donGiaVon)} / {dvt || 'đvt'}</> : null}
                      </span>
                    )}
                  </label>

                  <div>
                    <span className="text-xs font-medium text-slate-600">Trạng thái</span>
                    <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label="Trạng thái bán">
                      {DS_TRANG_THAI.map(t => (
                        <button key={t} type="button" onClick={() => setTrangThai(t)} aria-pressed={trangThai === t}
                          className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${trangThai === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                          {NHAN_TRANG_THAI[t]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-slate-600">Ảnh ({anh.length}/{TOI_DA_ANH}) — dán link, mỗi dòng 1 link</span>
                    {anh.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {anh.map((u, i) => (
                          <li key={u} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5">
                            <AnhVatTu url={u} nhom={d.nhom} ten={d.tenHien} className="h-8 w-8 shrink-0 rounded" />
                            <span className="min-w-0 flex-1 truncate text-xs text-slate-600" title={u}>{u}</span>
                            {i > 0 && (
                              <button type="button" onClick={() => setAnh(a => [u, ...a.filter(x => x !== u)])}
                                className="shrink-0 rounded px-1.5 py-0.5 text-[0.6875rem] text-slate-500 hover:bg-slate-100" title="Đặt làm ảnh đại diện">Lên đầu</button>
                            )}
                            <button type="button" onClick={() => setAnh(a => a.filter(x => x !== u))} aria-label="Bỏ ảnh này"
                              className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                              <Trash2 size={13} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-1 flex gap-1.5">
                      <textarea value={oDan} onChange={e => setODan(e.target.value)} rows={2}
                        placeholder="https://drive.google.com/file/d/…"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
                      <button type="button" onClick={themLink} disabled={!oDan.trim()}
                        className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        <ImagePlus size={13} /> Thêm
                      </button>
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Tên hiển thị cho khách — để trống = tên vật tư</span>
                    <input value={tenKhach} onChange={e => setTenKhach(e.target.value)} maxLength={TOI_DA_TEN_KHACH} placeholder={d.tenHien}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
                    {!tenKhach.trim() && cungMa.some(x => tenCoCongTrinh(x)) && (
                      <span className="mt-1 block text-xs text-amber-700">
                        Tên vật tư có mã / tên công trình — trang khách tự che phần đó; nên đặt tên rõ ràng cho khách.
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Mô tả cho khách (khách đọc được — không ghi giá vốn, tên công trình, NCC)</span>
                    <textarea value={moTaKhach} onChange={e => setMoTaKhach(e.target.value)} maxLength={TOI_DA_MO_TA_KHACH} rows={3}
                      placeholder="vd Hàng mới, còn nguyên kiện; phù hợp làm tủ bếp…"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Liên hệ (nội bộ)</span>
                    <input value={lienHe} onChange={e => setLienHe(e.target.value)} maxLength={2000} placeholder="Người phụ trách, số điện thoại"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Ghi chú (nội bộ)</span>
                    <textarea value={ghiChu} onChange={e => setGhiChu(e.target.value)} maxLength={2000} rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
                  </label>

                  {loi && (
                    <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      <AlertTriangle size={14} className="mt-px shrink-0" /> {loi}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={huySua} disabled={dangLuu}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Huỷ</button>
                    <button type="button" onClick={luu} disabled={dangLuu}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                      {dangLuu ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Lưu
                    </button>
                  </div>
                </div>
              )}
            </Muc>

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
                  Ảnh mẫu vật liệu đã duyệt ở file PRODUCTION STATUS công trình (sheet 03_MATERIALS). Mặc định chỉ nội bộ —
                  bật "Hiện cho khách" từng ảnh sau khi kiểm tra không có chữ viết tay / dấu duyệt / tên công trình.
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
                        {a.congKhai && <div className="mt-0.5"><NhanAnhCongKhai anh={a} /></div>}
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
                          <button type="button" disabled={dangDoiAnh === a.id} onClick={() => doiCongKhai(a, !a.congKhai)}
                            title={a.congKhai ? 'Thôi hiện ảnh này ở trang khách' : 'Hiện ảnh này ở trang khách — kiểm tra không có chữ viết tay / tên công trình'}
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[0.6875rem] font-medium disabled:opacity-50 ${a.congKhai ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50' : 'border-sky-200 bg-white text-sky-700 hover:bg-sky-50'}`}>
                            <Globe size={12} /> {a.congKhai ? 'Ẩn khỏi trang khách' : 'Hiện cho khách'}
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
                  Công trình: <span className="font-medium text-slate-700">{d.tenCongTrinh}</span>{d.maCongTrinh ? ` (${d.maCongTrinh})` : ''} — kiểm tra với công trình trước khi bán.
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
                  {ban.giaBanVnd && d.donGiaVon ? (
                    <HangTT nhan="Giá chào / giá vốn" giaTri={`${Math.round((ban.giaBanVnd / d.donGiaVon) * 100)}%`} />
                  ) : null}
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
          onDoi={doiAnh} onDoiCongKhai={coQuyenSua ? doiCongKhai : undefined} onDong={dongXemNoiBo} />
      )}
    </ModalShell>
  );
}
