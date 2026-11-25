import pg from 'pg';

// ============================================================================
// GHÉP THAM SỐ VÀO CÂU SQL (hàm thuần, KHÔNG chạm DB) — dùng cho tuỳ chọn gopThamSo của timedQuery (db.ts).
// DB ở Mỹ, ~260 ms mỗi lượt đi-về. Câu CÓ tham số phải đi giao thức extended => 3 lượt (mở giao dịch, chạy, COMMIT);
// ghép tham số thành hằng SQL thì cả giao dịch gửi chung 1 lệnh (simple-query) => 1 lượt.
//
// Chỉ dùng khi: câu SELECT / WITH chỉ đọc, chữ SQL do code viết (không ghép chữ người dùng vào), tham số qua params.
// Có gì không chắc => trả null, nơi gọi đi đường 3 lượt như cũ (không bao giờ đoán).
//
// - Mọi giá trị ghép dạng ('chữ'): hằng trong nháy chưa có kiểu ("unknown"), Postgres suy kiểu từ ngữ cảnh GIỐNG tham số
//   không khai kiểu mà pg gửi (pg cũng gửi mọi giá trị dạng chữ). Số cũng để trong nháy: 1 và '1' khác kiểu suy ra.
//   Ngoặc tròn để không dính với chữ đứng cạnh (date '…', 'a' xuống dòng 'b' nối chuỗi, số âm…).
// - $n chỉ thay ngoài chuỗi, định danh "…", chú thích; hiểu cả E''. Chuỗi thường có \ ngay trước nháy đóng => null để kết
//   quả tách không phụ thuộc standard_conforming_strings.
// - Tham số có 1 kiểu cho mọi chỗ dùng, còn hằng suy kiểu riêng từng chỗ: cùng $n mà ép kiểu ghi sau nó không giống hệt
//   nhau ($1::date và $1::text, hoặc chỗ ép chỗ không) => null. $n để trần hoặc CAST($n AS …) dùng nhiều chỗ: người bật
//   phải tự soát các chỗ đó cùng kiểu.
// - $n trong ORDER BY / GROUP BY / PARTITION BY / DISTINCT ON => null (hằng ở đó bị hiểu là số thứ tự cột / báo lỗi).
// - escapeLiteral nhân đôi ' và \, có \ thì thêm E'' => đúng với cả 2 giá trị của standard_conforming_strings.
//   Cần client_encoding UTF8 (pg luôn đặt UTF8).
// ============================================================================

/** Câu sau khi ghép dài hơn (byte UTF-8) => đi đường cũ */
export const GOP_TOI_DA_BYTE = 200 * 1024;

// prepareValue của pg = đúng chữ pg sẽ gửi cho tham số (mảng '{…}', ngày kèm múi giờ…); @types/pg không khai utils
const { prepareValue } = (pg as unknown as { utils: { prepareValue: (v: unknown) => unknown } }).utils;

/** Hằng SQL của 1 giá trị; null = không ghép được */
const hang = (v: unknown): string | null => {
  if (v === null) return '(NULL)';
  let hopLe = false;
  if (typeof v === 'string' || typeof v === 'boolean') hopLe = true;
  else if (typeof v === 'number') hopLe = Number.isFinite(v);
  else if (v instanceof Date) hopLe = !Number.isNaN(v.getTime());
  else if (Array.isArray(v)) {
    hopLe = true;
    for (let i = 0; i < v.length; i++) {
      const x: unknown = v[i];
      if (!(x === null || typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x)))) return null;
    }
  }
  if (!hopLe) return null;
  const chu = prepareValue(v);
  // Byte NUL: Postgres không nhận trong chữ, và giao thức simple-query cắt câu tại đó
  if (typeof chu !== 'string' || chu.includes('\0')) return null;
  return `(${pg.escapeLiteral(chu).trimStart()})`;
};

const laKyTuTu = (c: string | undefined): boolean => c !== undefined && (/[A-Za-z0-9_$]/.test(c) || c.charCodeAt(0) >= 0x80);
/** Câu chỉ đọc: có các từ này (ngoài chuỗi / chú thích) thì không ghép */
const TU_CAM = new Set(['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'INTO', 'TRUNCATE', 'DROP', 'ALTER', 'CREATE', 'GRANT', 'COPY', 'CALL']);
/** Ép kiểu ::… ngay sau $n (chỉ để so các chỗ dùng cùng 1 tham số) */
const EP_KIEU = /\s*::\s*([\w".]+(?:\s+precision\b|\s+varying\b)?(?:\s*\([\d\s,]*\))?(?:\s+with(?:out)?\s+time\s+zone\b)?(?:\s*\[\s*\d*\s*\])*)/iy;
const epKieuSau = (text: string, i: number): string => {
  EP_KIEU.lastIndex = i;
  return (EP_KIEU.exec(text)?.[1] ?? '').toLowerCase().replace(/\s+/g, ' ');
};
/** Từ kết thúc danh sách ORDER BY / GROUP BY ở cùng cấp ngoặc */
const TU_HET_BY = new Set(['LIMIT', 'OFFSET', 'FETCH', 'HAVING', 'WINDOW', 'UNION', 'INTERSECT', 'EXCEPT', 'FOR', 'SELECT', 'FROM', 'WHERE']);

/** chatChe (ghép tự động, không ai soát từng câu): tham số để trần (không ép kiểu ::) chỉ được dùng 1 chỗ.
 *  Ghép params vào text; null = giữ đường truy vấn có tham số như cũ */
export const gopThamSo = (text: string, params: readonly unknown[], chatChe = false): string | null => {
  const dauCau = /^\s*(?:SELECT|WITH)/i.exec(text);
  if (!dauCau || laKyTuTu(text[dauCau[0].length]) || text.includes('\0')) return null;
  const n = text.length;
  const hangDa = new Map<number, string>(), epDa = new Map<number, string>();
  let ra = '', dau = 0, i = 0;
  // trongBy[cấp ngoặc] = đang trong danh sách BY / DISTINCT ON ở cấp đó (cấp con thừa hưởng)
  const trongBy: boolean[] = [false];
  let tuTruoc = '';
  while (i < n) {
    const c = text[i];
    if (c === '-' && text[i + 1] === '-') {
      while (i < n && text[i] !== '\n' && text[i] !== '\r') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let cap = 1;
      i += 2;
      while (i < n && cap > 0) {
        if (text[i] === '/' && text[i + 1] === '*') { cap++; i += 2; }
        else if (text[i] === '*' && text[i + 1] === '/') { cap--; i += 2; }
        else i++;
      }
      if (cap > 0) return null;
      continue;
    }
    // Chuỗi thường / định danh trong nháy kép
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= n) return null;
        if (text[j] !== c) { j++; continue; }
        if (c === "'" && text[j - 1] === '\\') return null;
        if (text[j + 1] === c) { j += 2; continue; }
        break;
      }
      i = j + 1;
      tuTruoc = '';
      continue;
    }
    if (c === '$') {
      let j = i + 1;
      while (j < n && text[j] >= '0' && text[j] <= '9') j++;
      // $$, $the$, '$' lẻ, $01, $1abc
      if (j === i + 1 || text[i + 1] === '0' || laKyTuTu(text[j])) return null;
      const so = Number(text.slice(i + 1, j));
      if (so > params.length || trongBy.some(Boolean)) return null;
      let h = hangDa.get(so);
      if (h === undefined) {
        const x = hang(params[so - 1]);
        if (x === null) return null;
        hangDa.set(so, h = x);
      }
      const ep = epKieuSau(text, j), epTruoc = epDa.get(so);
      if (epTruoc !== undefined && (epTruoc !== ep || (chatChe && ep === ''))) return null;
      epDa.set(so, ep);
      ra += text.slice(dau, i) + h;
      dau = i = j;
      tuTruoc = '';
      continue;
    }
    // Từ khoá / tên / số: đọc trọn. Có '$' bên trong (a$1 là tên, 1$1 là lỗi) => không ghép
    if (laKyTuTu(c)) {
      let j = i + 1;
      while (j < n && laKyTuTu(text[j])) j++;
      const tho = text.slice(i, j);
      if (tho.includes('$')) return null;
      const tu = tho.toUpperCase();
      i = j;
      if (tu === 'E' && text[i] === "'") {
        j = i + 1;
        for (;;) {
          if (j >= n) return null;
          if (text[j] === '\\') { j += 2; continue; }
          if (text[j] !== "'") { j++; continue; }
          if (text[j + 1] === "'") { j += 2; continue; }
          break;
        }
        i = j + 1;
        // Chuỗi nối dòng (E'a' xuống dòng 'b') vẫn theo luật E'' => không xét, đi đường cũ
        if (/^\s*('|--)/.test(text.slice(i))) return null;
        tuTruoc = '';
        continue;
      }
      if (TU_CAM.has(tu)) return null;
      if (tu === 'BY' || (tu === 'ON' && tuTruoc === 'DISTINCT')) trongBy[trongBy.length - 1] = true;
      // FROM của IS [NOT] DISTINCT FROM vẫn nằm trong danh sách BY
      else if (TU_HET_BY.has(tu) && !(tu === 'FROM' && tuTruoc === 'DISTINCT')) trongBy[trongBy.length - 1] = false;
      tuTruoc = tu;
      continue;
    }
    if (c === ';') return null;
    if (c === '(') trongBy.push(false);
    else if (c === ')') {
      if (trongBy.length === 1) return null;
      trongBy.pop();
    }
    if (!/\s/.test(c)) tuTruoc = '';
    i++;
  }
  // Ngoặc lệch, tham số thừa / thiếu: để Postgres báo lỗi ở đường cũ
  if (trongBy.length !== 1 || hangDa.size !== params.length) return null;
  ra += text.slice(dau);
  return Buffer.byteLength(ra, 'utf8') > GOP_TOI_DA_BYTE ? null : ra;
};
