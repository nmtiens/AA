import { describe, expect, it } from 'vitest';
import { getUniqueOptions, luaChonTuDanhSach } from './useDashboardOptions';

describe('luaChonTuDanhSach', () => {
  it('cùng kết quả với tính từ bảng: bỏ rỗng, bỏ trùng, sắp theo chuỗi', () => {
    const tuan = [10, 2, 2, null, ' 7 ', '', 45];
    const tuBang = getUniqueOptions(tuan.map(t => ({ tuan: t })) as never, 'tuan');
    expect(luaChonTuDanhSach(tuan.map(t => (t === null ? t : String(t))))).toEqual(tuBang);
    expect(tuBang).toEqual(['10', '2', '45', '7']);
  });
  it('chưa có dữ liệu máy chủ: rỗng', () => {
    expect(luaChonTuDanhSach(undefined)).toEqual([]);
  });
});
