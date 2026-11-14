// ============================================================================
// BỘ NHỚ TẠM HẠN NGẮN TRONG 1 INSTANCE — cho dữ liệu KHÔNG có phiên bản bảng (vướng mắc đổi bất kỳ lúc nào)
// hoặc tra theo từng khoá nhỏ. Hàm thuần (không đụng DB) để test được; đồng hồ truyền vào được.
// CHỈ dùng cho kết quả không phụ thuộc người dùng (phần theo người dùng tính ở nơi gọi, mỗi request).
// ============================================================================

export interface NhoNgan<T> {
  /** Còn hạn thì trả bản nhớ; không thì gọi `tinh` (các lời gọi cùng khoá đến cùng lúc dùng chung 1 lượt tính) */
  lay(khoa: string, tinh: () => Promise<T>): Promise<T>;
  /** Xoá hết (gọi ngay sau thao tác ghi): lượt đang tính dở bắt đầu TRƯỚC lúc xoá không được ghi lại bản cũ */
  xoa(): void;
}

export const taoNhoNgan = <T>(ttlMs: number, toiDa = 8, now: () => number = Date.now): NhoNgan<T> => {
  const map = new Map<string, { at: number; v: T }>();
  const dangTinh = new Map<string, Promise<T>>();
  let doi = 0; // tăng mỗi lần xoa(): kết quả của lượt tính thuộc đời cũ không được lưu
  return {
    lay(khoa, tinh) {
      const hit = map.get(khoa);
      if (hit && now() - hit.at < ttlMs) return Promise.resolve(hit.v);
      const cho = dangTinh.get(khoa);
      if (cho) return cho;
      const doiLucDau = doi;
      const at = now(); // mốc = lúc BẮT ĐẦU đọc DB (dữ liệu không mới hơn mốc này)
      const p: Promise<T> = Promise.resolve().then(tinh).then(v => {
        if (doi === doiLucDau) {
          map.delete(khoa);
          map.set(khoa, { at, v });
          while (map.size > toiDa) {
            const cu = map.keys().next().value;
            if (cu === undefined) break;
            map.delete(cu);
          }
        }
        return v;
      }).finally(() => { if (dangTinh.get(khoa) === p) dangTinh.delete(khoa); });
      dangTinh.set(khoa, p);
      return p;
    },
    xoa() {
      doi++;
      map.clear();
      dangTinh.clear();
    },
  };
};

export interface NhoTheoKhoa<V> {
  /** Tách danh sách khoá: `co` = khoá còn hạn kèm giá trị, `thieu` = khoá phải đi hỏi DB */
  tach(khoa: string[]): { co: Map<string, V>; thieu: string[] };
  ghi(khoa: string, v: V): void;
}

/** Nhớ giá trị theo TỪNG khoá (vd. theo HEX), mỗi mục có hạn riêng; vượt `toiDa` thì bỏ mục cũ nhất */
export const taoNhoTheoKhoa = <V>(ttlMs: number, toiDa = 2000, now: () => number = Date.now): NhoTheoKhoa<V> => {
  const map = new Map<string, { at: number; v: V }>();
  return {
    tach(khoa) {
      const co = new Map<string, V>();
      const thieu: string[] = [];
      const t = now();
      for (const k of khoa) {
        const hit = map.get(k);
        if (hit && t - hit.at < ttlMs) co.set(k, hit.v);
        else thieu.push(k);
      }
      return { co, thieu };
    },
    ghi(khoa, v) {
      map.delete(khoa); // chèn lại cuối Map: mục vừa ghi không bị coi là cũ nhất
      map.set(khoa, { at: now(), v });
      while (map.size > toiDa) {
        const cu = map.keys().next().value;
        if (cu === undefined) break;
        map.delete(cu);
      }
    },
  };
};
