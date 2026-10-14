import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { xuongSetupApi, type KeHoachTuan as KhTuan, type KeHoachTuanDong, type BaoCaoXuong } from '../../services/xuongSetupApi';
import { gioVN, tenLyDo, hienSl } from '../../services/xuongModel';
import { BTN, KHUNG, TH, TD } from './xuongDesktopUi';
import { BieuDoKeHoach } from './BieuDoXuong';

// ============================================================================
// BÁO CÁO → KẾ HOẠCH TUẦN: kế hoạch tuần của xưởng (KHSX) đối chiếu nhập kho và tiến độ trong MRA.
// Cùng logic bảng "Kế hoạch – thực hiện tuần" / "Phân tích năng suất" của Dashboard, áp vào từng hạng mục:
//   - mỗi hạng mục kế hoạch: đã nhập kho? đang ở công đoạn nào? chưa triển khai / chưa tổ nhận / tạm ngưng / rớt?
//   - CẢNH BÁO để quản lý triển khai lại ngay (chưa triển khai, chưa nhận, tạm ngưng, quá ngày KHNK, rớt kế hoạch,
//     giờ công sản phẩm đổ vào hạng mục ngoài kế hoạch)
//   - năng suất: doanh số nhập kho / giờ công, / giờ công sản phẩm, / công nhân
// Tiền: triệu đồng (≥ 1.000 hiện tỷ). Tuần ISO (thứ Hai – Chủ nhật, cùng cách KHSX đánh số).
// ============================================================================

const ngayVN = (offset = 0) => gioVN(Date.now() + offset * 86_400_000).ngay;
const so = (n: number, le = 1) => n.toLocaleString('vi-VN', { maximumFractionDigits: le });
const tien = (trieu: number) => (Math.abs(trieu) >= 1000 ? `${so(trieu / 1000, 2)} tỷ` : `${so(trieu, 0)} tr`);
const ddmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

/** Tuần ISO của một ngày 'YYYY-MM-DD' */
export function tuanISO(ngay: string): { nam: number; tuan: number } {
  const d = new Date(`${ngay}T00:00:00Z`);
  const thu = (d.getUTCDay() + 6) % 7; // thứ Hai = 0
  d.setUTCDate(d.getUTCDate() - thu + 3); // thứ Năm cùng tuần quyết định năm
  const nam = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(nam, 0, 4));
  const tuan = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { nam, tuan };
}
const doiTuan = (t: { nam: number; tuan: number }, buoc: number) => {
  // thứ Năm của tuần t, cộng buoc tuần
  const jan4 = Date.UTC(t.nam, 0, 4);
  const thuHai1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000;
  const thuNam = thuHai1 + ((t.tuan - 1 + buoc) * 7 + 3) * 86_400_000;
  return tuanISO(new Date(thuNam).toISOString().slice(0, 10));
};

/** Mức: 0 xong · 1 đúng hướng · 2 cần để ý · 3 cảnh báo */
export type Muc = 0 | 1 | 2 | 3;
export interface TinhTrang { ma: string; ten: string; muc: Muc; chiTiet?: string }

/** Hạng mục đã nhập kho đủ giá trị đơn hàng (luỹ kế tới hết tuần) dù trong tuần không nhập đủ kế hoạch */
export const daNhapTruoc = (r: KeHoachTuanDong) =>
  r.nhapKho < r.kh * 0.98 && !!r.giaTriDon && r.giaTriDon > 0 && (r.nhapKhoLuyKe ?? 0) >= r.giaTriDon * 0.98;

/** Tuần đã qua VÀ nhập kho đã cập nhật tới hết tuần — chỉ khi đó mới kết luận "rớt" */
export const tuanDaChot = (kh: { den: string; nhapKhoMoiNhat: string | null }, homNay: string) =>
  kh.den < homNay && !!kh.nhapKhoMoiNhat && kh.nhapKhoMoiNhat >= kh.den;

export function tinhTrang(r: KeHoachTuanDong, tuanDaQua: boolean, homNay: string): TinhTrang {
  const pct = r.kh > 0 ? r.nhapKho / r.kh : 0;
  if (r.kh > 0 && pct >= 0.98) return { ma: 'dat', ten: 'Đã nhập kho', muc: 0 };
  if (daNhapTruoc(r)) return { ma: 'dat_truoc', ten: 'Đã nhập đủ từ trước', muc: 0, chiTiet: 'Nhập kho đủ đơn hàng trước tuần kế hoạch' };
  const quaKhnk = !!r.ngayKhnk && r.ngayKhnk < homNay;
  const cd = r.congDoan;
  const dangO = cd.filter(c => c.trangThai === 'dang_lam').map(c => c.ten);
  const ngung = cd.filter(c => c.trangThai === 'tam_ngung');
  let t: TinhTrang;
  if (r.nhapKho > 0) t = { ma: 'mot_phan', ten: `Nhập kho ${Math.round(pct * 100)}%`, muc: tuanDaQua ? 3 : 1 };
  else if (tuanDaQua) t = { ma: 'rot', ten: 'Rớt kế hoạch', muc: 3 };
  else if (!r.trienKhai && cd.length === 0) t = { ma: 'chua_tk', ten: 'Chưa triển khai', muc: 3, chiTiet: 'Chưa triển khai cho tổ nào (cũng không có số liệu MRA cũ)' };
  else if (ngung.length) t = { ma: 'ngung', ten: 'Tạm ngưng', muc: 2, chiTiet: ngung.map(c => `${c.ten}: ${tenLyDo(c.ngung?.lyDo)}`).join(' · ') };
  else if (!cd.some(c => c.slNhan > 0)) t = { ma: 'chua_nhan', ten: 'Chưa tổ nào nhận', muc: 2, chiTiet: 'Đã triển khai, hàng chưa về tổ' };
  else if (dangO.length) t = { ma: 'dang_lam', ten: 'Đang làm', muc: 1, chiTiet: dangO.join(', ') };
  else if (cd.length && cd.every(c => c.slHoanThanh > 0 && c.slHoanThanh >= c.slNhan)) t = { ma: 'cho_nk', ten: 'Xong xưởng, chờ nhập kho', muc: 1 };
  else t = { ma: 'cho_chay', ten: 'Đã nhận, chưa chạy', muc: 2, chiTiet: cd.filter(c => c.slNhan > c.slHoanThanh).map(c => c.ten).join(', ') };
  if (quaKhnk && t.muc < 3 && t.ma !== 'dat') {
    t = { ...t, muc: Math.max(t.muc, 2) as Muc, chiTiet: [`Quá ngày KHNK ${ddmm(r.ngayKhnk!)}`, t.chiTiet].filter(Boolean).join(' · ') };
  }
  return t;
}

const MAU: Record<Muc, string> = {
  0: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  1: 'bg-sky-50 text-sky-800 border-sky-200',
  2: 'bg-amber-50 text-amber-800 border-amber-200',
  3: 'bg-red-50 text-red-800 border-red-200',
};

function The({ ten, giaTri, phu, mau }: { ten: string; giaTri: string; phu?: ReactNode; mau?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm rsm:p-4">
      <p className="text-xs font-semibold text-slate-600">{ten}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums rsm:text-2xl ${mau ?? 'text-slate-900'}`}>{giaTri}</p>
      {phu && <p className="mt-0.5 text-xs text-slate-500">{phu}</p>}
    </div>
  );
}

export default function KeHoachTuan({ xuong }: { xuong: string }) {
  const homNay = ngayVN();
  const [t, setT] = useState(() => tuanISO(homNay));
  const [kh, setKh] = useState<KhTuan | null>(null);
  const [bc, setBc] = useState<BaoCaoXuong | null>(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  const [mo, setMo] = useState<string | null>(null);
  const lan = useRef(0);

  const tai = useCallback(async () => {
    const id = ++lan.current;
    setDang(true); setLoi(''); setBc(null);
    const r = await xuongSetupApi.keHoachTuan(xuong, t.nam, t.tuan);
    if (id !== lan.current) return;
    if (!r.ok) { setLoi(r.message); setKh(null); setDang(false); return; }
    setKh(r.data);
    // Giờ công / giờ công sản phẩm từng hạng mục trong tuần: báo cáo MRA cùng khoảng ngày (tới hôm nay)
    const den = r.data.den < homNay ? r.data.den : homNay;
    if (r.data.tu <= homNay) {
      for (let i = 0; i < 20; i++) {
        const b = await xuongSetupApi.baoCao(xuong, r.data.tu, den);
        if (id !== lan.current) return;
        if (!b.ok) break;
        setBc(b.data);
        if (!b.data.conThieu) break;
      }
    }
    setDang(false);
  }, [xuong, t, homNay]);
  useEffect(() => { tai(); }, [tai]);

  const phanTich = useMemo(() => {
    if (!kh) return null;
    const tuanDaQua = tuanDaChot(kh, homNay);
    // Tuần đã qua nhưng nhập kho chưa cập nhật hết tuần: chưa kết luận rớt
    const thieuDuLieu = kh.den < homNay && !tuanDaQua;
    const dong = kh.keHoach.map(r => ({ r, tt: tinhTrang(r, tuanDaQua, homNay) }))
      .sort((a, b) => b.tt.muc - a.tt.muc || b.r.kh - a.r.kh);
    const tongKh = kh.keHoach.reduce((a, r) => a + r.kh, 0);
    const nkTheoKh = kh.keHoach.reduce((a, r) => a + (daNhapTruoc(r) ? r.kh : Math.min(r.nhapKho, r.kh || r.nhapKho)), 0);
    const vuot = kh.keHoach.reduce((a, r) => a + Math.max(0, r.nhapKho - r.kh), 0);
    const conThieu = kh.keHoach.reduce((a, r) => a + (daNhapTruoc(r) ? 0 : Math.max(0, r.kh - r.nhapKho)), 0);
    const nkNgoai = kh.ngoaiKeHoach.reduce((a, r) => a + r.nhapKho, 0);
    const nkTong = kh.keHoach.reduce((a, r) => a + r.nhapKho, 0) + nkNgoai;
    // Giờ công (MRA) và giờ công sản phẩm theo hạng mục kế hoạch / ngoài kế hoạch
    const coKh = new Set(kh.keHoach.map(r => r.hex));
    const gioSp = new Map((bc?.hangMuc ?? []).map(h => [h.hex, h.gioCong]));
    const gioSpTong = (bc?.hangMuc ?? []).reduce((a, h) => a + h.gioCong, 0);
    const gioSpKh = (bc?.hangMuc ?? []).filter(h => coKh.has(h.hex)).reduce((a, h) => a + h.gioCong, 0);
    const ngoaiGio = (bc?.hangMuc ?? []).filter(h => !coKh.has(h.hex) && h.gioCong > 0).sort((a, b) => b.gioCong - a.gioCong);
    const ngays = (bc?.theoTo ?? []).flatMap(x => x.theoNgay);
    const gioCongApp = ngays.reduce((a, n) => a + n.gioNguoi, 0);
    const soNgay = new Set(ngays.map(n => n.ngay)).size;
    const cnApp = soNgay ? ngays.reduce((a, n) => a + (n.quanSo.chinh ?? 0), 0) / soNgay : 0;
    // Điểm danh cả xưởng (nếu có số liệu trong tuần) — đủ hơn số tổ đã dùng app
    const dd = bc?.chamCong?.theoNgay ?? [];
    const gioDd = dd.reduce((a, x) => a + x.gioHc + x.gioTc, 0);
    const cnDd = dd.length ? dd.reduce((a, x) => a + x.congNhan, 0) / dd.length : 0;
    // Độ phủ giờ công: điểm danh cả xưởng có đủ ngày không, bao nhiêu tổ dùng MRA
    const soTo = bc?.theoTo.length ?? 0;
    const soToMra = (bc?.theoTo ?? []).filter(x => x.theoNgay.length > 0).length;
    const canhBao = dong.filter(x => x.tt.muc === 3);
    const deY = dong.filter(x => x.tt.muc === 2);
    return {
      tuanDaQua, thieuDuLieu, soTo, soToMra, vuot, dong, tongKh, nkTheoKh, conThieu, nkNgoai, nkTong, gioSp, gioSpTong, gioSpKh, ngoaiGio,
      gioCongApp, cnApp, gioDd, cnDd, canhBao, deY,
      pctHt: tongKh > 0 ? Math.round((nkTheoKh / tongKh) * 100) : null,
      pctSpNgoai: gioSpTong > 0 ? Math.round(((gioSpTong - gioSpKh) / gioSpTong) * 100) : null,
    };
  }, [kh, bc, homNay]);

  const nhom = (ma: string) => phanTich?.dong.filter(x => x.tt.ma === ma) ?? [];
  const tuanNay = tuanISO(homNay);
  const laTuanNay = t.nam === tuanNay.nam && t.tuan === tuanNay.tuan;

  return (
    <div className="space-y-4">
      {/* Chọn tuần — tab này xem theo tuần kế hoạch, không theo khoảng ngày ở trên */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN} onClick={() => setT(x => doiTuan(x, -1))} aria-label="Tuần trước"><ChevronLeft size={14} /></button>
        <p className="text-sm font-semibold text-slate-800">
          Tuần {t.tuan}/{t.nam}{kh ? ` (${ddmm(kh.tu)} – ${ddmm(kh.den)})` : ''}
        </p>
        <button type="button" className={BTN} onClick={() => setT(x => doiTuan(x, 1))} aria-label="Tuần sau"><ChevronRight size={14} /></button>
        {!laTuanNay && <button type="button" className={BTN} onClick={() => setT(tuanNay)}>Tuần này</button>}
        <button type="button" className={`${BTN} ml-auto`} onClick={tai}><RefreshCw size={13} className={dang ? 'animate-spin' : ''} /> Tải lại</button>
      </div>
      <p className="text-xs text-slate-500">
        Xem theo tuần kế hoạch (KHSX), không theo khoảng ngày ở trên. Nhập kho có số liệu tới {kh?.nhapKhoMoiNhat ? ddmm(kh.nhapKhoMoiNhat) : '—'}.
      </p>

      {loi && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>}
      {!kh && !loi && <div className="flex justify-center py-10 text-slate-400"><RefreshCw className="animate-spin" size={18} /></div>}

      {kh && phanTich && kh.keHoach.length === 0 && (
        <div className={`${KHUNG} space-y-2 p-4 text-sm text-slate-700`}>
          <p>Chưa có kế hoạch tuần {t.tuan} của xưởng {xuong} trong KHSX.</p>
          <button type="button" className={BTN} onClick={() => setT(x => doiTuan(x, -1))}><ChevronLeft size={13} /> Xem tuần trước</button>
        </div>
      )}

      {kh && phanTich && kh.keHoach.length > 0 && (<>
        {phanTich.thieuDuLieu && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Nhập kho mới cập nhật tới {kh.nhapKhoMoiNhat ? ddmm(kh.nhapKhoMoiNhat) : '—'} (chưa hết tuần {kh.tuan}) — chưa kết luận rớt kế hoạch; số sẽ đổi khi nhập kho cập nhật.
          </p>
        )}
        {/* CẢNH BÁO — quản lý nắm nhanh để triển khai lại */}
        {(phanTich.canhBao.length > 0 || phanTich.deY.length > 0 || (phanTich.pctSpNgoai ?? 0) >= 30) ? (
          <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-800"><AlertTriangle size={16} /> Cần xử lý</p>
            <ul className="space-y-1 text-sm">
              {[
                ['chua_tk', 'hạng mục kế hoạch CHƯA TRIỂN KHAI cho tổ', 'text-red-800', 'Mở Triển khai hạng mục để giao cho tổ'],
                ['rot', 'hạng mục RỚT KẾ HOẠCH (tuần đã qua, chưa nhập kho)', 'text-red-800', 'Đưa vào kế hoạch tuần sau / báo kế hoạch'],
                ['mot_phan', 'hạng mục NHẬP KHO CHƯA ĐỦ (tuần đã qua)', 'text-red-800', 'Làm nốt phần còn lại, báo kế hoạch'],
                ['chua_nhan', 'hạng mục đã triển khai nhưng CHƯA TỔ NÀO NHẬN', 'text-amber-800', 'Hỏi tổ đầu tuyến / kiểm tra hàng đã về chưa'],
                ['ngung', 'hạng mục đang TẠM NGƯNG', 'text-amber-800', 'Xem lý do để gỡ (vật tư, bản vẽ…)'],
                ['cho_chay', 'hạng mục đã nhận nhưng CHƯA CHẠY', 'text-amber-800', 'Nhắc tổ bắt đầu'],
              ].map(([ma, cau, mau, goiY]) => {
                const ds = nhom(ma).filter(x => (ma === 'mot_phan' ? x.tt.muc === 3 : true));
                if (!ds.length || !cau) return null;
                return (
                  <li key={ma} className={mau}>
                    <b>{ds.length}</b> {cau} — {tien(ds.reduce((a, x) => a + Math.max(0, x.r.kh - x.r.nhapKho), 0))}
                    <span className="text-slate-600"> · {goiY}</span>
                    <span className="block text-xs text-slate-600">{ds.slice(0, 6).map(x => x.r.hex).join(', ')}{ds.length > 6 ? ` +${ds.length - 6}` : ''}</span>
                  </li>
                );
              })}
              {(() => {
                const ds = phanTich.dong.filter(x => x.tt.chiTiet?.startsWith('Quá ngày KHNK'));
                return ds.length ? <li className="text-amber-800"><b>{ds.length}</b> hạng mục đã QUÁ NGÀY KHNK mà chưa nhập kho đủ <span className="block text-xs text-slate-600">{ds.slice(0, 6).map(x => x.r.hex).join(', ')}</span></li> : null;
              })()}
              {(phanTich.pctSpNgoai ?? 0) >= 30 && (
                <li className="text-amber-800">
                  <b>{phanTich.pctSpNgoai}%</b> giờ công sản phẩm ({so(phanTich.gioSpTong - phanTich.gioSpKh)} giờ) dồn vào hạng mục NGOÀI kế hoạch tuần
                  <span className="text-slate-600"> · Kiểm tra ưu tiên: tổ có đang làm hàng không cần gấp?</span>
                </li>
              )}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
            <CheckCircle2 size={16} /> Kế hoạch tuần đang đúng hướng — không có hạng mục cần xử lý.
          </p>
        )}

        {/* Số kế hoạch – thực hiện + năng suất */}
        <div className="grid grid-cols-2 gap-3 rmd:grid-cols-3 rxl:grid-cols-6">
          <The ten="Kế hoạch tuần" giaTri={tien(phanTich.tongKh)} phu={`${kh.keHoach.length} hạng mục`} />
          <The ten="Nhập kho theo kế hoạch" giaTri={tien(phanTich.nkTheoKh)}
            phu={phanTich.pctHt === null ? '' : `${phanTich.pctHt}% kế hoạch`}
            mau={phanTich.pctHt === null ? undefined : phanTich.pctHt >= 80 ? 'text-emerald-700' : phanTich.pctHt >= 50 ? 'text-amber-700' : 'text-red-700'} />
          <The ten={phanTich.tuanDaQua ? 'Rớt kế hoạch' : 'Còn phải nhập kho'} giaTri={tien(phanTich.conThieu)}
            phu={`${phanTich.dong.filter(x => x.tt.muc !== 0).length} hạng mục chưa đủ`} mau={phanTich.tuanDaQua && phanTich.conThieu > 0 ? 'text-red-700' : undefined} />
          <The ten="Ngoài / vượt kế hoạch" giaTri={tien(phanTich.nkNgoai + phanTich.vuot)}
            phu={`${kh.ngoaiKeHoach.length} hạng mục ngoài KH${phanTich.vuot > 0 ? ` · vượt ${tien(phanTich.vuot)}` : ''}`} />
          <The ten="Doanh số / giờ công" giaTri={(() => {
            const g = phanTich.gioDd || phanTich.gioCongApp;
            return g > 0 ? `${so(phanTich.nkTong / g, 2)} tr` : '—';
          })()} mau={!phanTich.gioDd && phanTich.soToMra < phanTich.soTo ? 'text-amber-700' : undefined}
            phu={phanTich.gioDd ? `${so(phanTich.gioDd, 0)} giờ công (điểm danh cả xưởng)`
              : phanTich.gioCongApp ? `${so(phanTich.gioCongApp, 0)} giờ công — chỉ ${phanTich.soToMra}/${phanTich.soTo} tổ dùng MRA, số cao hơn thực tế` : 'chưa có giờ công'} />
          <The ten="Doanh số / công nhân" giaTri={(() => {
            const cn = phanTich.cnDd || phanTich.cnApp;
            return cn > 0 ? `${so(phanTich.nkTong / cn, 1)} tr` : '—';
          })()} phu={phanTich.gioSpTong > 0 ? `${so(phanTich.nkTong / phanTich.gioSpTong, 2)} tr / giờ công SP` : 'tổng nhập kho tuần ÷ công nhân bình quân'} />
        </div>
        <p className="text-xs text-slate-500">
          Doanh số = nhập kho trong tuần của xưởng (cả ngoài kế hoạch). Giờ công lấy từ Dữ liệu Điểm danh nếu có, không thì từ các tổ dùng MRA
          (chưa đủ tổ thì số này cao hơn thực tế). Giờ công SP: {so(phanTich.gioSpKh, 0)} giờ cho hạng mục kế hoạch, {so(phanTich.gioSpTong - phanTich.gioSpKh, 0)} giờ ngoài kế hoạch.
        </p>

        <BieuDoKeHoach tongKh={phanTich.tongKh} nkTheoKh={phanTich.nkTheoKh} conThieu={phanTich.conThieu} nkNgoai={phanTich.nkNgoai} vuot={phanTich.vuot} nkTong={phanTich.nkTong}
          dong={phanTich.dong} gioSpKh={phanTich.gioSpKh} gioSpNgoai={phanTich.gioSpTong - phanTich.gioSpKh}
          gioCho={Math.max(0, phanTich.gioCongApp - phanTich.gioSpTong)} theoNgay={kh.nhapKhoTheoNgay ?? []} tu={kh.tu} den={kh.den} />

        {/* Từng hạng mục kế hoạch — cần xử lý lên trước */}
        <div className={KHUNG}>
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Hạng mục kế hoạch tuần ({kh.keHoach.length})</p>
          <table className="w-full min-w-[52rem] rmd:min-w-0">
            <thead className="bg-slate-50"><tr>
              <th className={TH}>Hạng mục</th><th className={`${TH} text-right`}>Kế hoạch</th><th className={TH}>Ngày KHNK</th>
              <th className={`${TH} text-right`}>Nhập kho</th><th className={TH}>Tình trạng</th><th className={`${TH} text-right`}>Giờ công SP</th><th className={TH} />
            </tr></thead>
            <tbody>
              {phanTich.dong.map(({ r, tt }) => (
                <FragmentDong key={r.hex} r={r} tt={tt} gioSp={phanTich.gioSp.get(r.hex) ?? 0} mo={mo === r.hex} onMo={() => setMo(m => (m === r.hex ? null : r.hex))} homNay={homNay} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Ngoài kế hoạch: nhập kho + giờ công sản phẩm */}
        {(kh.ngoaiKeHoach.length > 0 || phanTich.ngoaiGio.length > 0) && (
          <div className="grid gap-3 rlg:grid-cols-2">
            {kh.ngoaiKeHoach.length > 0 && (
              <div className={KHUNG}>
                <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Nhập kho ngoài kế hoạch tuần ({kh.ngoaiKeHoach.length}) — {tien(phanTich.nkNgoai)}</p>
                <ul className="divide-y divide-slate-100 text-sm">
                  {kh.ngoaiKeHoach.slice(0, 10).map(x => (
                    <li key={x.hex} className="flex items-center justify-between gap-3 px-4 py-2">
                      <span className="min-w-0 truncate"><b className="tabular-nums">{x.hex}</b> {x.tenHangMuc ?? ''}</span>
                      <span className="shrink-0 tabular-nums text-slate-700">{tien(x.nhapKho)}</span>
                    </li>
                  ))}
                  {kh.ngoaiKeHoach.length > 10 && <li className="px-4 py-2 text-xs text-slate-500">+{kh.ngoaiKeHoach.length - 10} hạng mục khác</li>}
                </ul>
              </div>
            )}
            {phanTich.ngoaiGio.length > 0 && (
              <div className={KHUNG}>
                <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Giờ công SP cho hạng mục ngoài kế hoạch — {so(phanTich.gioSpTong - phanTich.gioSpKh)} giờ</p>
                <ul className="divide-y divide-slate-100 text-sm">
                  {phanTich.ngoaiGio.slice(0, 10).map(h => (
                    <li key={h.hex} className="flex items-center justify-between gap-3 px-4 py-2">
                      <span className="min-w-0 truncate"><b className="tabular-nums">{h.hex}</b> {h.tenHangMuc ?? ''}</span>
                      <span className="shrink-0 tabular-nums text-slate-700">{so(h.gioCong)} giờ</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </>)}
    </div>
  );
}

function FragmentDong({ r, tt, gioSp, mo, onMo, homNay }: {
  r: KeHoachTuanDong; tt: TinhTrang; gioSp: number; mo: boolean; onMo: () => void; homNay: string;
}) {
  return (<>
    <tr className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50" onClick={onMo}>
      <td className={TD}>
        <span className="font-semibold tabular-nums text-slate-900">{r.hex}</span> <span className="text-slate-800">{r.tenHangMuc ?? ''}</span>
        <div className="text-xs text-slate-500">{r.tenCongTrinh ?? ''}</div>
      </td>
      <td className={`${TD} text-right tabular-nums`}>{tien(r.kh)}{r.slKh ? <div className="text-xs text-slate-500">{hienSl(r.slKh)} {r.dvt ?? ''}</div> : null}</td>
      <td className={`${TD} tabular-nums ${r.ngayKhnk && r.ngayKhnk < homNay && tt.ma !== 'dat' ? 'font-medium text-red-700' : ''}`}>{r.ngayKhnk ? ddmm(r.ngayKhnk) : '—'}</td>
      <td className={`${TD} text-right tabular-nums`}>{r.nhapKho > 0 ? tien(r.nhapKho) : '—'}</td>
      <td className={TD}>
        <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${MAU[tt.muc]}`}>{tt.ten}</span>
        {tt.chiTiet && <div className="mt-0.5 text-xs text-slate-600">{tt.chiTiet}</div>}
      </td>
      <td className={`${TD} text-right tabular-nums`}>{gioSp > 0 ? so(gioSp) : '—'}</td>
      <td className={`${TD} text-slate-400`}>{r.congDoan.length ? (mo ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}</td>
    </tr>
    {mo && r.congDoan.length > 0 && (
      <tr className="bg-slate-50/60">
        <td colSpan={7} className="px-4 py-2">
          <ul className="flex flex-wrap gap-2 text-xs">
            {r.congDoan.map(c => (
              <li key={c.congDoanId} className="rounded border border-slate-200 bg-white px-2 py-1">
                <b>{c.ten}</b>{c.xuong ? ` · ${c.xuong}` : ''} — {({ cho_nhan: 'chờ nhận', da_nhan: 'đã nhận', dang_lam: 'đang chạy', tam_ngung: 'tạm ngưng', cho_giao: 'chờ giao', xong: 'xong' } as Record<string, string>)[c.trangThai] ?? c.trangThai}
                <span className="tabular-nums text-slate-500"> (nhận {hienSl(c.slNhan)} · xong {hienSl(c.slHoanThanh)} · giao {hienSl(c.slGiao)})</span>
              </li>
            ))}
          </ul>
        </td>
      </tr>
    )}
  </>);
}
