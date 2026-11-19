// Nhóm sản phẩm (phan_loai_nhom_san_pham, vd "08. TƯỜNG") hiển thị dạng group: "G.08.Tường" — người dùng 19/11/2026.
// Chỉ đổi chữ hiển thị; mã gốc giữ nguyên để lọc / tra chi tiết.
const MA_GROUP = /^\s*(\d+)\s*[.\-)]\s*(.+?)\s*$/;

const chuDauHoa = (t: string) => {
  const s = t.toLocaleLowerCase('vi');
  return s ? s[0].toLocaleUpperCase('vi') + s.slice(1) : s;
};

/** "08. TƯỜNG" -> "G.08.Tường"; không có số group (vd "Chưa xác định") giữ nguyên */
export const tenGroup = (ten: string): string => {
  const m = MA_GROUP.exec(String(ten ?? ''));
  return m ? `G.${m[1].padStart(2, '0')}.${chuDauHoa(m[2])}` : String(ten ?? '');
};

/** Số group để sắp (không có số => cuối) */
const soGroup = (ten: string): number => {
  const m = MA_GROUP.exec(String(ten ?? ''));
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

/** Sắp theo số group tăng dần, nhóm không có số xếp cuối (theo tên) */
export const soSanhGroup = (a: string, b: string): number =>
  soGroup(a) - soGroup(b) || String(a).localeCompare(String(b), 'vi', { numeric: true });
