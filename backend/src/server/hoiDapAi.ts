import type { Bang } from './hoiDapDanhMuc.js';
import { VI_DU_AI } from './hoiDapViDu.js';

// ============================================================================
// HỎI SỐ LIỆU — TẦNG AI (miễn phí, tuỳ chọn). Chỉ dùng khi bộ đọc câu ở giao diện không hiểu hết câu.
// AI KHÔNG đọc dữ liệu: nó chỉ DỊCH câu hỏi thành truy vấn có cấu trúc theo danh mục bảng / cột; máy chủ kiểm
// quyền + kiểm từng cột rồi tự chạy truy vấn như khung Tự tra. Gửi đi: câu hỏi, tên bảng / cột, giá trị của các
// cột tình trạng / nhóm — KHÔNG gửi tên khách hàng, người, nhà cung cấp, tên công trình.
//
// Gọi theo chuẩn chung "OpenAI chat/completions" nên đổi nhà cung cấp chỉ cần đổi biến môi trường:
//   HOI_DAP_AI_KEY    khoá API (không có => tắt tầng AI, cửa sổ vẫn chạy như cũ)
//   HOI_DAP_AI_URL    mặc định Google Gemini: https://generativelanguage.googleapis.com/v1beta/openai
//                     Groq: https://api.groq.com/openai/v1 · OpenRouter: https://openrouter.ai/api/v1
//   HOI_DAP_AI_MODEL  mặc định gemini-flash-lite-latest (Groq: llama-3.3-70b-versatile)
//   HOI_DAP_AI_SUY_NGHI  mức suy nghĩ (reasoning_effort), mặc định low; đặt rỗng với model không hỗ trợ (vd. Groq llama)
//   HOI_DAP_AI_MAX_NGAY  số lần gọi tối đa / ngày / instance (mặc định 1000) — giữ trong hạn mức miễn phí
// ============================================================================

export const aiBat = () => !!process.env.HOI_DAP_AI_KEY;
const URL_AI = () => (process.env.HOI_DAP_AI_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '');
// Tên "…-latest" luôn trỏ bản mới: Google đóng model cũ với tài khoản mới (gemini-2.5-flash báo 404 từ 10/2026).
// Bản Lite: đo 20/10/2026 gói miễn phí — flash 35–70 giây/câu (hay quá 40 giây), flash-lite 1–5 giây, đọc câu vẫn đúng
const MODEL_AI = () => process.env.HOI_DAP_AI_MODEL || 'gemini-flash-lite-latest';
// Mức suy nghĩ của model (OpenAI reasoning_effort): 'low' đủ đúng mà nhanh hơn (đo 10/2026: 6–30 giây/câu); 'none' để tắt
const SUY_NGHI = () => process.env.HOI_DAP_AI_SUY_NGHI ?? 'low';
const MAX_NGAY = () => Number(process.env.HOI_DAP_AI_MAX_NGAY) || 1000;

/** Cột có giá trị là tên người / khách hàng / nhà cung cấp: không gửi danh sách giá trị cho AI */
const CO_TEN_RIENG = new Set(['ten_pm', 'ten_pc', 'khach_hang', 'handler', 'created_by', 'nguoi_yeu_cau', 'nguoi_tao', 'nguoi_trien_khai', 'nha_cung_cap', 'ten_cong_trinh', 'ma_cong_trinh']);

const THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const boDau = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const tuCua = (s: string) => new Set(boDau(s).split(/[^a-z0-9]+/).filter(w => w.length >= 2));

/**
 * Câu ví dụ gần câu hỏi nhất (bộ câu mẫu ~10.000 câu đã chấm, boCau/ghiViDu.test.ts) — chỉ ví dụ dùng bảng / cột
 * người hỏi được xem. Gần = nhiều chữ chung nhất (chia căn số chữ của ví dụ để câu dài không lấn), mỗi bảng tối đa 3.
 */
export function chonViDu(cau: string, bangs: Array<{ b: Bang; cot: Bang['cot'] }>, sx: Bang['cot'], soVd = 8) {
  const duocXem = new Map(bangs.map(x => [x.b.id, new Set(x.cot.map(c => c.id))]));
  const sxXem = new Set(sx.map(c => `sx:${c.id}`));
  const q = tuCua(cau);
  const coCot = (bang: string, id: string | undefined) => !id || duocXem.get(bang)!.has(id.split('@')[0]) || sxXem.has(id);
  const hop = VI_DU_AI.filter(v => {
    const tv = v.tv as { bang: string; do: Array<{ cot?: string }>; nhom: string[]; loc: Array<{ cot: string }> };
    return duocXem.has(tv.bang) && tv.do.every(d => coCot(tv.bang, d.cot)) && tv.nhom.every(n => coCot(tv.bang, n)) && tv.loc.every(l => coCot(tv.bang, l.cot));
  }).map(v => {
    const w = tuCua(v.cau);
    let chung = 0;
    w.forEach(x => { if (q.has(x)) chung++; });
    // Câu hỏi gọi tên đúng bảng của ví dụ ("NHẬP KHO quý 3…") => ví dụ cùng bảng lên trước
    const b = bangs.find(x => x.b.id === String(v.tv.bang))?.b;
    const cungBang = b && [b.ten, ...b.dn].some(t => ` ${boDau(cau)} `.includes(` ${boDau(t)} `)) ? 1 : 0;
    return { v, diem: chung / Math.sqrt(w.size || 1) + cungBang };
  }).filter(x => x.diem > 0).sort((a, z) => z.diem - a.diem);
  const theoBang = new Map<string, number>();
  const out: typeof VI_DU_AI = [];
  for (const { v } of hop) {
    const b = String(v.tv.bang), n = theoBang.get(b) ?? 0;
    if (n >= 3) continue;
    theoBang.set(b, n + 1);
    out.push(v);
    if (out.length >= soVd) break;
  }
  return out;
}

/**
 * Lời dặn cho AI: cách viết truy vấn + danh mục bảng / cột người hỏi được xem.
 * `cot(b)` = cột người hỏi được xem; `sx` = cột chữ / ngày của bảng sản xuất (nối qua HEX), rỗng nếu không có quyền.
 */
export function taoLoiDan(bangs: Array<{ b: Bang; cot: Bang['cot'] }>, sx: Bang['cot'], gt: Record<string, Record<string, string[]>>, homNay: Date, cau = ''): string {
  const dong: string[] = [];
  bangs.forEach(({ b, cot }) => {
    dong.push(`## ${b.id} — ${b.ten} (cách gọi: ${b.dn.join(', ')}). Cột ngày chính: ${b.ngay}.${b.chot ? ' Ảnh chụp tồn theo ngày (không cộng nhiều ngày).' : ''}${b.noiSx && sx.length ? ' Dùng được cột sx:*.' : ''} Đếm: 1 dòng = 1 ${b.dong}.`);
    cot.forEach(c => {
      const ds = !CO_TEN_RIENG.has(c.id) ? (gt[b.id]?.[c.id] ?? c.gt ?? []).slice(0, 30) : [];
      dong.push(`- ${c.id}: ${c.ten}${c.dn?.length ? ` (gọi là: ${c.dn.join(', ')})` : ''} [${c.kieu}${c.tien ? ', tiền TRIỆU đồng' : ''}]${ds.length ? ` giá trị: ${ds.join(' | ')}` : ''}`);
    });
  });
  if (sx.length) {
    dong.push('## Cột sx:<id> — thông tin hạng mục từ bảng sản xuất, nối qua HEX (chỉ dùng để lọc / chia nhóm, không cộng)');
    sx.forEach(c => {
      const ds = !CO_TEN_RIENG.has(c.id) ? (gt.production_status_app?.[c.id] ?? []).slice(0, 30) : [];
      dong.push(`- sx:${c.id}: ${c.ten} [${c.kieu}]${ds.length ? ` giá trị: ${ds.join(' | ')}` : ''}`);
    });
  }
  const hn = iso(homNay);
  return `Bạn chuyển câu hỏi tiếng Việt về số liệu của nhà máy nội thất thành 1 truy vấn JSON theo danh mục bên dưới. Bạn KHÔNG có số liệu và KHÔNG trả lời số liệu — chỉ dịch câu.
Hôm nay: ${hn} (${THU[homNay.getDay()]}). Tuần bắt đầu thứ hai. "Tháng này" = từ ngày 1 tới hôm nay.

Trả về đúng 1 JSON object, một trong ba dạng:
{"loai":"truy_van","tv":{...},"giai_thich":"<1 câu tiếng Việt: bạn hiểu câu hỏi thế nào>"}
{"loai":"tim_kiem"}  — câu chỉ là mã / tên cần tra cứu (mã HEX, tên hạng mục, tên công trình…), không hỏi số liệu
{"loai":"khong_hieu","giai_thich":"<vì sao danh mục không trả lời được>"}

tv gồm:
- bang: id bảng.
- kieu: "tong" (tổng hợp số) hoặc "dong" (liệt kê từng dòng).
- do: [{"ham":..., "cot":...}]. ham: tong (cộng cột số) | dem (đếm dòng, không có cot) | dem_khac (đếm số giá trị khác nhau, vd. số HEX) | tb | max | min. Để [] = phép tính mặc định của bảng.
- nhom: tối đa 2 phần tử — id cột, hoặc "<id cột ngày>@ngay|tuan|thang|quy|nam" để chia theo thời gian.
- loc: [{"cot":..., "op":..., "gt":...}]. op: bang | khac | chua | khong_chua | lon_hon | lon_hon_bang | nho_hon | nho_hon_bang | trong_khoang | rong | co. gt: chuỗi, số, hoặc mảng (bang nhiều giá trị; trong_khoang [a,b]). Ngày dạng YYYY-MM-DD.
- tu, den: kỳ theo cột ngày chính của bảng (YYYY-MM-DD). Câu không nói kỳ thì bỏ tu, den.
- soSanh: {"tu":..., "den":...} — kỳ thứ hai khi hỏi so sánh hai kỳ.
- binhQuan: "ngay" | "tuan" | "thang" — khi hỏi bình quân mỗi ngày / tuần / tháng; khi đó nhom phải có "<cột ngày chính>@<mốc>".
- sapChenh: "giam" | "tang" — chỉ đi cùng soSanh: xếp các nhóm theo mức giảm / tăng giữa 2 kỳ.
- sap: {"cot": số thứ tự cột kết quả (các cột nhom trước rồi tới các phép tính, bắt đầu từ 0), "giam": true|false}; gioiHan: số dòng tối đa (top N).
- gomHuy: true nếu muốn tính cả hạng mục đã hủy (mặc định bỏ).

Quy tắc:
- Chỉ dùng id bảng / cột có trong danh mục. Cột tiền tính bằng TRIỆU đồng: 1 tỷ = 1000.
- giai_thich: tiếng Việt đơn giản cho nhân viên nhà máy, KHÔNG dùng từ kỹ thuật (SQL, NOT IN, tập hợp, id cột…).
- Cột có danh sách giá trị: lọc op "bang" với đúng giá trị trong danh sách. Tên người, khách hàng, công trình, nhà cung cấp: op "chua" với chữ người dùng gõ.
- Xưởng (2A, 3A, 4A, 5A, 8AB, 8C, KHÁC): op "bang".
- "Quá hạn giao / trễ hạn" (hạng mục): bảng production_status_app, loc ngay_can_giao nho_hon hôm nay và gia_tri_con_lai lon_hon 0. "Chưa nhập kho / còn lại": gia_tri_con_lai lon_hon 0.
- PR "trễ hẹn": bảng vat_tu, loc ngay_du_kien_giao_hang_pmh_nhap nho_hon hôm nay và so_luong_con_lai lon_hon 0. "Chưa về": so_luong_con_lai lon_hon 0.
- Kỳ đi kèm MỘT CỘT NGÀY KHÁC cột ngày chính ("PR hẹn về tuần này", "vật tư về thực tế tuần trước", "tồn kho nhập từ tháng 9"): lọc cột ngày đó op trong_khoang [đầu kỳ, cuối kỳ], KHÔNG đặt tu/den.
- Vướng mắc "về máy / về vật tư / do con người": cột category, gt đúng tên trong danh sách giá trị. "Tổ 4A" = xưởng 4A.
- "Doanh thu" = giá trị nhập kho (bảng nhap_kho).
- "BOT" = thời hạn kế hoạch nhập kho của hạng mục: cột nhom_bot (bảng production_status_app). "Quá hạn KH / trễ kế hoạch nhập kho": loc nhom_bot bang "1. Quá hạn KH" (KHÁC "quá hạn giao" theo ngày cần giao). "Sắp đến hạn KH": "2. ≤ 14 ngày". "Đạt KH kỳ": "5. Đạt KH kỳ, chờ KH tiếp".
- "BOP" = bước sản xuất (cột bop: P001…P025, GCVT). "BOM" = vật tư của công trình / hạng mục: bảng vat_tu.
- "Kế hoạch nhập kho" theo kỳ (tuần / tháng): bảng khsx; "đúng / rớt kế hoạch", "KH-TH": bảng phan_tich_kh_th.
- "X nào nhiều nhất / top N X": nhom theo X, sap giảm theo phép tính đầu, gioiHan N (không nói N thì 10).
- "X nào giảm / tăng nhiều nhất (so với kỳ trước)": nhom theo X, soSanh = kỳ trước (không nói thì kỳ liền trước), sapChenh "giam" / "tang"; KHÔNG dùng sap, gioiHan.

Danh mục:
${dong.join('\n')}

Ví dụ:
Câu: "xưởng nào nhập kho ít nhất tháng 9" => {"loai":"truy_van","tv":{"bang":"nhap_kho","kieu":"tong","do":[{"ham":"tong","cot":"thanh_tien_nhap_kho"}],"nhom":["xuong_chinh"],"loc":[],"tu":"${homNay.getFullYear()}-09-01","den":"${homNay.getFullYear()}-09-30","sap":{"cot":1,"giam":false}},"giai_thich":"Tổng giá trị nhập kho tháng 9 theo xưởng, xếp ít trước"}
Câu: "đơn hàng trên 1 tỷ của PM tuấn" => {"loai":"truy_van","tv":{"bang":"dht","kieu":"dong","do":[],"nhom":[],"loc":[{"cot":"tri_gia_don_hang_tong","op":"lon_hon","gt":1000},{"cot":"ten_pm","op":"chua","gt":"tuấn"}]},"giai_thich":"Liệt kê đơn hàng trị giá trên 1 tỷ của PM có tên chứa tuấn"}
Câu: "TOWEL CABINET BF11" => {"loai":"tim_kiem"}${vdGan(cau, bangs, sx)}`;
}

/** Ví dụ gần câu hỏi, viết kèm câu (ngày trong ví dụ tính với hôm nay = 2026-10-19: đổi theo hôm nay thật) */
function vdGan(cau: string, bangs: Array<{ b: Bang; cot: Bang['cot'] }>, sx: Bang['cot']): string {
  const ds = cau ? chonViDu(cau, bangs, sx) : [];
  if (!ds.length) return '';
  return '\n\nVí dụ gần câu hỏi (các ví dụ này tính với hôm nay = 2026-10-19, thứ hai — câu thật phải tính kỳ theo hôm nay ở trên):\n'
    + ds.map(v => `Câu: "${v.cau}" => ${JSON.stringify({ loai: 'truy_van', tv: v.tv })}`).join('\n');
}

export interface KetQuaAI { loai: 'truy_van' | 'tim_kiem' | 'khong_hieu'; tv?: unknown; giai_thich?: string }

/** Đọc JSON AI trả (bỏ ```json … ``` nếu có) */
export function docKetQuaAI(text: string): KetQuaAI | null {
  const s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const dau = s.indexOf('{'), cuoi = s.lastIndexOf('}');
  if (dau < 0 || cuoi < dau) return null;
  try {
    const j = JSON.parse(s.slice(dau, cuoi + 1)) as KetQuaAI;
    return j && ['truy_van', 'tim_kiem', 'khong_hieu'].includes(j.loai) ? j : null;
  } catch {
    return null;
  }
}

// ---- Gọi AI: cache câu đã hỏi (1 ngày), giới hạn số lần / ngày ----
const cache = new Map<string, { at: number; kq: KetQuaAI }>();
let ngay = '', dem = 0;
export class LoiAI extends Error {}

export async function hoiAI(loiDan: string, cau: string, khoaCache: string): Promise<KetQuaAI> {
  const hit = cache.get(khoaCache);
  if (hit && Date.now() - hit.at < 86400000) return hit.kq;
  const hn = iso(new Date());
  if (hn !== ngay) { ngay = hn; dem = 0; }
  if (dem >= MAX_NGAY()) throw new LoiAI('Hết lượt hỏi AI hôm nay');
  dem++;
  const ctrl = new AbortController();
  const hen = setTimeout(() => ctrl.abort(), 40000);
  let r: Response;
  try {
    r = await fetch(`${URL_AI()}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.HOI_DAP_AI_KEY}` },
      body: JSON.stringify({
        model: MODEL_AI(),
        temperature: 0,
        ...(SUY_NGHI() ? { reasoning_effort: SUY_NGHI() } : {}),
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: loiDan }, { role: 'user', content: cau }],
      }),
    });
  } catch (e) {
    throw new LoiAI((e as Error).name === 'AbortError' ? 'AI trả lời quá lâu' : 'Không gọi được AI');
  } finally {
    clearTimeout(hen);
  }
  if (r.status === 429) throw new LoiAI('AI đang hết hạn mức miễn phí, thử lại sau');
  if (!r.ok) throw new LoiAI(`AI báo lỗi ${r.status}`);
  const j = (await r.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
  const kq = docKetQuaAI(j?.choices?.[0]?.message?.content ?? '');
  if (!kq) throw new LoiAI('AI trả lời không đúng dạng');
  cache.set(khoaCache, { at: Date.now(), kq });
  if (cache.size > 500) { const k = cache.keys().next().value; if (k !== undefined) cache.delete(k); }
  return kq;
}
