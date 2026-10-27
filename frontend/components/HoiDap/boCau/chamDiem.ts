import { hieuCauHoi } from '../hieuCauHoi';
import { hieuTruyVan, nenTuTra, boDauGiu, canNhoAI, apNguCanh, nguCanhSau, type NguCanh } from '../hieuTruyVan';
import type { BangDM, Loc, TruyVan, TuDien } from '../truyVanApi';
import type { CauMau } from './taoBoCau';
import { HOM_NAY } from './giaTri';
import { laLenhXuat } from '../baoCao/moHinh';

// ============================================================================
// CHẤM ĐIỂM bộ đọc câu trên bộ câu mẫu — đi đúng đường của cửa sổ Hỏi số liệu (HoiDapPopup):
//   câu trước (ngữ cảnh) → hieuCauHoi + hieuTruyVan → còn chữ chưa hiểu => nhờ AI → mẫu hay tự tra (nenTuTra).
// Kết quả mỗi câu: dung (trả lời đúng ý, tự tin) · nho_ai (còn chữ chưa hiểu => sẽ hỏi AI / báo "chưa hiểu") · sai.
// ============================================================================

const Y_DONG_CHAY: Record<string, string> = { nhap_kho: 'nhap_kho', xuat_kho: 'xuat_kho', don_hang: 'dht', trien_khai: 'tkbv_full', tinh_phieu: 'pthsp_full' };

export type KetQuaCau = { ketQua: 'dung' | 'nho_ai' | 'hoi_lai' | 'sai'; lyDo: string; duong: string; tv?: TruyVan; hoiThua?: boolean };

const chuan = (v: unknown) => boDauGiu(String(v)).toLowerCase().replace(/\s+/g, ' ').trim();
const khoaLoc = (l: Loc) => {
  const ds = l.gt === undefined ? [] : Array.isArray(l.gt) ? l.gt : [l.gt];
  return `${l.cot}|${l.op}|${ds.map(chuan).sort().join(',')}`;
};
const bangNhau = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
/** a = b bớt đúng 1 ký tự — biến thể "gõ sai 1 chữ" của bộ câu: lỗi gõ nằm trong phần câu hỏi kèm theo thì lệnh vẫn tách đúng */
const botMotChu = (a: string, b: string) => a.length === b.length - 1 && [...Array(b.length).keys()].some(i => b.slice(0, i) + b.slice(i + 1) === a);

/** So truy vấn đọc được với đáp án; trả lý do lệch đầu tiên (rỗng = khớp) */
export function soTruyVan(tv: TruyVan, kv: Extract<CauMau['kv'], { loai: 'tu_tra' }>): string {
  if (tv.bang !== kv.bang) return `bảng ${tv.bang} ≠ ${kv.bang}`;
  if ((kv.kieu ?? 'tong') !== tv.kieu) return `kiểu ${tv.kieu} ≠ ${kv.kieu ?? 'tong'}`;
  if (kv.do && !bangNhau(tv.do.map(d => `${d.ham}|${d.cot ?? ''}`), kv.do.map(d => `${d.ham}|${d.cot ?? ''}`))) {
    return `phép tính [${tv.do.map(d => `${d.ham}:${d.cot ?? ''}`)}] ≠ [${kv.do.map(d => `${d.ham}:${d.cot ?? ''}`)}]`;
  }
  if (kv.coDo && !tv.do.some(d => d.ham === kv.coDo!.ham && (d.cot ?? '') === (kv.coDo!.cot ?? ''))) return `thiếu phép tính ${kv.coDo.ham}:${kv.coDo.cot ?? ''}`;
  if (kv.kieu !== 'dong' && kv.nhom && !bangNhau(tv.nhom, kv.nhom)) return `chia [${tv.nhom}] ≠ [${kv.nhom}]`;
  if (kv.loc && !bangNhau(tv.loc.map(khoaLoc), kv.loc.map(khoaLoc))) return `lọc [${tv.loc.map(khoaLoc).join('; ')}] ≠ [${kv.loc.map(khoaLoc).join('; ')}]`;
  if (kv.ky === null && (tv.tu || tv.den)) return `có kỳ ${tv.tu}..${tv.den} (không được có)`;
  if (kv.ky && (tv.tu !== kv.ky.tu || tv.den !== kv.ky.den)) return `kỳ ${tv.tu}..${tv.den} ≠ ${kv.ky.tu}..${kv.ky.den}`;
  if (kv.soSanh && (tv.soSanh?.tu !== kv.soSanh.tu || tv.soSanh?.den !== kv.soSanh.den)) return `so sánh ${tv.soSanh?.tu}..${tv.soSanh?.den} ≠ ${kv.soSanh.tu}..${kv.soSanh.den}`;
  if ((kv.sapChenh ?? null) !== (tv.sapChenh ?? null)) return `xếp chênh ${tv.sapChenh} ≠ ${kv.sapChenh}`;
  if (kv.binhQuan && tv.binhQuan !== kv.binhQuan) return `bình quân ${tv.binhQuan} ≠ ${kv.binhQuan}`;
  if (kv.gioiHan && tv.gioiHan !== kv.gioiHan) return `top ${tv.gioiHan} ≠ ${kv.gioiHan}`;
  if (kv.sapTang && tv.sap?.giam !== false) return 'không xếp ít trước';
  return '';
}

export function chamCau(c: CauMau, dm: BangDM[], td: TuDien): KetQuaCau {
  const kq = chamCau0(c, dm, td);
  // Lệnh cửa sổ không đi qua bộ đọc câu => không có chuyện hỏi lại chữ hai nghĩa
  if (c.kv.loai === 'lenh') return kq;
  // Chữ hai nghĩa => cửa sổ hỏi lại người dùng trước khi trả lời: không phải trả lời sai.
  // "hỏi thừa" = không hỏi lại thì cũng đã đúng (làm phiền người hỏi)
  const h = hieuTruyVan(c.cau, dm, HOM_NAY, td);
  if (h?.moHo?.length) return { ...kq, ketQua: 'hoi_lai', lyDo: `hỏi lại: ${h.moHo.map(m => m.chu).join(', ')}`, hoiThua: kq.ketQua === 'dung' };
  return kq;
}

function chamCau0(c: CauMau, dm: BangDM[], td: TuDien): KetQuaCau {
  // Lệnh "xuất báo cáo …": cửa sổ nhận lệnh TRƯỚC khi đọc câu (HoiDapPopup.hoi) — chấm riêng, không đi bộ đọc câu
  const lenh = laLenhXuat(c.cau);
  if (c.kv.loai === 'lenh') {
    const duong = 'lệnh xuất báo cáo';
    if (!lenh) return { ketQua: 'sai', lyDo: 'không nhận ra lệnh xuất báo cáo', duong };
    if (lenh.dinhDang !== c.kv.dinhDang) return { ketQua: 'sai', lyDo: `định dạng ${lenh.dinhDang} ≠ ${c.kv.dinhDang}`, duong };
    if (c.kv.conLai !== undefined) {
      const co = chuan(lenh.conLai), can = chuan(c.kv.conLai);
      if (co !== can && !(c.bienThe === 'go_sai' && botMotChu(co, can))) {
        return { ketQua: 'sai', lyDo: `câu hỏi kèm theo "${lenh.conLai}" ≠ "${c.kv.conLai}"`, duong };
      }
    }
    return { ketQua: 'dung', lyDo: '', duong };
  }
  // Câu hỏi số liệu mà bị coi là lệnh => cửa sổ sẽ không trả lời số liệu: sai
  if (lenh) return { ketQua: 'sai', lyDo: 'nhận nhầm lệnh xuất báo cáo', duong: 'lệnh xuất báo cáo' };
  // Ngữ cảnh: chạy lần lượt các câu trước như cửa sổ (HoiDapPopup) — cùng hàm apNguCanh / nguCanhSau
  let ngu: NguCanh | null = null;
  (c.chuoi ?? (c.truoc ? [c.truoc] : [])).forEach(t => {
    const c0 = hieuCauHoi(t, HOM_NAY);
    const { h: h0 } = apNguCanh(hieuTruyVan(t, dm, HOM_NAY, td), ngu, dm, t, HOM_NAY, td);
    const moi = nguCanhSau(t, c0, h0);
    if (moi) ngu = moi;
  });
  const cau = hieuCauHoi(c.cau, HOM_NAY);
  const { h, noiCau } = apNguCanh(hieuTruyVan(c.cau, dm, HOM_NAY, td), ngu, dm, c.cau, HOM_NAY, td);
  const nhoAi = canNhoAI(cau, h);
  const tuTra = !!h && (noiCau || nenTuTra(cau, h, true));
  const duong = nhoAi ? `nhờ AI (chưa hiểu: ${h!.thua.join(' ')})` : tuTra ? 'tự tra' : `mẫu ${cau.y}`;

  if (c.kv.loai === 'chua_tra_loi') {
    // Không trả lời tự tin: không nhận ra gì (=> tìm tự do / AI) hoặc còn chữ chưa hiểu (=> AI / báo chưa hiểu)
    if (!h || nhoAi) return { ketQua: 'dung', lyDo: '', duong };
    return { ketQua: 'sai', lyDo: 'trả lời tự tin câu danh mục không có', duong, tv: h.tv };
  }
  if (nhoAi) return { ketQua: 'nho_ai', lyDo: `chưa hiểu: ${h!.thua.join(' ')}`, duong, tv: h!.tv };
  if (c.kv.loai === 'mau') {
    if (!tuTra && cau.y === c.kv.y) return { ketQua: 'dung', lyDo: '', duong };
    return { ketQua: 'sai', lyDo: tuTra ? `đi tự tra thay vì mẫu ${c.kv.y}` : `mẫu ${cau.y} ≠ ${c.kv.y}`, duong, tv: h?.tv };
  }
  if (!h) return { ketQua: 'sai', lyDo: 'không nhận ra bảng', duong };
  // Câu dòng chảy đơn giản (lọc / chia theo xưởng, công trình) đi câu trả lời mẫu đúng bảng cũng là đúng — mẫu làm được
  if (!tuTra && Y_DONG_CHAY[cau.y] === c.kv.bang && !soTruyVan(h.tv, c.kv)) return { ketQua: 'dung', lyDo: '', duong, tv: h.tv };
  // "công trình X còn lại bao nhiêu": tóm tắt công trình (mẫu) có sẵn "còn … tỷ"
  if (!tuTra && cau.y === 'cong_trinh' && c.kv.loc?.length === 1 && c.kv.loc[0].cot === 'ten_cong_trinh' && !c.kv.nhom?.length) return { ketQua: 'dung', lyDo: '', duong, tv: h.tv };
  if (!tuTra) return { ketQua: 'sai', lyDo: `đi mẫu ${cau.y} thay vì tự tra`, duong, tv: h.tv };
  const lech = soTruyVan(h.tv, c.kv);
  return lech ? { ketQua: 'sai', lyDo: lech, duong, tv: h.tv } : { ketQua: 'dung', lyDo: '', duong, tv: h.tv };
}

export interface BaoCao {
  tong: number; dung: number; nhoAi: number; hoiLai: number; hoiThua: number; sai: number;
  theoNhom: Record<string, { tong: number; dung: number; nhoAi: number }>;
  theoBienThe: Record<string, { tong: number; dung: number; nhoAi: number }>;
  theoMau: Record<string, { tong: number; dung: number; nhoAi: number; viDuSai: Array<{ cau: string; truoc?: string; lyDo: string }> }>;
}

export function chamBoCau(bo: CauMau[], dm: BangDM[], td: TuDien): BaoCao {
  const bc: BaoCao = { tong: 0, dung: 0, nhoAi: 0, hoiLai: 0, hoiThua: 0, sai: 0, theoNhom: {}, theoBienThe: {}, theoMau: {} };
  const cong = (o: Record<string, { tong: number; dung: number; nhoAi: number }>, k: string, kq: KetQuaCau['ketQua']) => {
    const x = o[k] ?? (o[k] = { tong: 0, dung: 0, nhoAi: 0 });
    x.tong++; if (kq === 'dung') x.dung++; if (kq === 'nho_ai') x.nhoAi++;
  };
  bo.forEach(c => {
    const kq = chamCau(c, dm, td);
    bc.tong++;
    if (kq.ketQua === 'dung') bc.dung++; else if (kq.ketQua === 'nho_ai') bc.nhoAi++; else if (kq.ketQua === 'hoi_lai') { bc.hoiLai++; if (kq.hoiThua) bc.hoiThua++; } else bc.sai++;
    cong(bc.theoNhom, c.nhom, kq.ketQua);
    cong(bc.theoBienThe, c.bienThe, kq.ketQua);
    const m = bc.theoMau[c.mau] ?? (bc.theoMau[c.mau] = { tong: 0, dung: 0, nhoAi: 0, viDuSai: [] });
    m.tong++; if (kq.ketQua === 'dung') m.dung++; if (kq.ketQua === 'nho_ai') m.nhoAi++;
    if (kq.ketQua !== 'dung' && m.viDuSai.length < 4) m.viDuSai.push({ cau: c.cau, truoc: c.truoc, lyDo: `${kq.ketQua === 'nho_ai' ? '[AI] ' : kq.ketQua === 'hoi_lai' ? `[HỎI LẠI${kq.hoiThua ? ' thừa' : ''}] ` : ''}${kq.lyDo}` });
  });
  return bc;
}
