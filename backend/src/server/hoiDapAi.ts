import type { Bang } from './hoiDapDanhMuc.js';

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
//   HOI_DAP_AI_MODEL  mặc định gemini-flash-latest (Groq: llama-3.3-70b-versatile)
//   HOI_DAP_AI_SUY_NGHI  mức suy nghĩ (reasoning_effort), mặc định low; đặt rỗng với model không hỗ trợ (vd. Groq llama)
//   HOI_DAP_AI_MAX_NGAY  số lần gọi tối đa / ngày / instance (mặc định 1000) — giữ trong hạn mức miễn phí
// ============================================================================

export const aiBat = () => !!process.env.HOI_DAP_AI_KEY;
const URL_AI = () => (process.env.HOI_DAP_AI_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '');
// Tên "…-latest" luôn trỏ bản mới: Google đóng model cũ với tài khoản mới (gemini-2.5-flash báo 404 từ 10/2026)
const MODEL_AI = () => process.env.HOI_DAP_AI_MODEL || 'gemini-flash-latest';
// Mức suy nghĩ của model (OpenAI reasoning_effort): 'low' đủ đúng mà nhanh hơn (đo 10/2026: 6–30 giây/câu); 'none' để tắt
const SUY_NGHI = () => process.env.HOI_DAP_AI_SUY_NGHI ?? 'low';
const MAX_NGAY = () => Number(process.env.HOI_DAP_AI_MAX_NGAY) || 1000;

/** Cột có giá trị là tên người / khách hàng / nhà cung cấp: không gửi danh sách giá trị cho AI */
const CO_TEN_RIENG = new Set(['ten_pm', 'ten_pc', 'khach_hang', 'handler', 'created_by', 'nguoi_yeu_cau', 'nguoi_tao', 'nguoi_trien_khai', 'nha_cung_cap', 'ten_cong_trinh', 'ma_cong_trinh']);

const THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Lời dặn cho AI: cách viết truy vấn + danh mục bảng / cột người hỏi được xem.
 * `cot(b)` = cột người hỏi được xem; `sx` = cột chữ / ngày của bảng sản xuất (nối qua HEX), rỗng nếu không có quyền.
 */
export function taoLoiDan(bangs: Array<{ b: Bang; cot: Bang['cot'] }>, sx: Bang['cot'], gt: Record<string, Record<string, string[]>>, homNay: Date): string {
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
- sap: {"cot": số thứ tự cột kết quả (các cột nhom trước rồi tới các phép tính, bắt đầu từ 0), "giam": true|false}; gioiHan: số dòng tối đa (top N).
- gomHuy: true nếu muốn tính cả hạng mục đã hủy (mặc định bỏ).

Quy tắc:
- Chỉ dùng id bảng / cột có trong danh mục. Cột tiền tính bằng TRIỆU đồng: 1 tỷ = 1000.
- giai_thich: tiếng Việt đơn giản cho nhân viên nhà máy, KHÔNG dùng từ kỹ thuật (SQL, NOT IN, tập hợp, id cột…).
- Cột có danh sách giá trị: lọc op "bang" với đúng giá trị trong danh sách. Tên người, khách hàng, công trình, nhà cung cấp: op "chua" với chữ người dùng gõ.
- Xưởng (2A, 3A, 4A, 5A, 8AB, 8C, KHÁC): op "bang".
- "Quá hạn giao / trễ hạn" (hạng mục): bảng production_status_app, loc ngay_can_giao nho_hon hôm nay và gia_tri_con_lai lon_hon 0. "Chưa nhập kho / còn lại": gia_tri_con_lai lon_hon 0.
- PR "trễ hẹn": bảng vat_tu, loc ngay_du_kien_giao_hang_pmh_nhap nho_hon hôm nay và so_luong_con_lai lon_hon 0. "Chưa về": so_luong_con_lai lon_hon 0.
- "Doanh thu" = giá trị nhập kho (bảng nhap_kho).
- "X nào nhiều nhất / top N X": nhom theo X, sap giảm theo phép tính đầu, gioiHan N (không nói N thì 10).

Danh mục:
${dong.join('\n')}

Ví dụ:
Câu: "xưởng nào nhập kho ít nhất tháng 9" => {"loai":"truy_van","tv":{"bang":"nhap_kho","kieu":"tong","do":[{"ham":"tong","cot":"thanh_tien_nhap_kho"}],"nhom":["xuong_chinh"],"loc":[],"tu":"${homNay.getFullYear()}-09-01","den":"${homNay.getFullYear()}-09-30","sap":{"cot":1,"giam":false}},"giai_thich":"Tổng giá trị nhập kho tháng 9 theo xưởng, xếp ít trước"}
Câu: "đơn hàng trên 1 tỷ của PM tuấn" => {"loai":"truy_van","tv":{"bang":"dht","kieu":"dong","do":[],"nhom":[],"loc":[{"cot":"tri_gia_don_hang_tong","op":"lon_hon","gt":1000},{"cot":"ten_pm","op":"chua","gt":"tuấn"}]},"giai_thich":"Liệt kê đơn hàng trị giá trên 1 tỷ của PM có tên chứa tuấn"}
Câu: "TOWEL CABINET BF11" => {"loai":"tim_kiem"}`;
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
