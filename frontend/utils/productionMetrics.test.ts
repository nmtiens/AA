import { describe, it, expect, beforeEach } from 'vitest';
import {
  isCancelledIpo, orderValue, doneValue, remainValue, isQtyComplete, isStocked, rowRemain, rowDone,
  parsePlanDate, deadlineOf, planAfterDue, setPlanMet, RAW_DEADLINE_KEYS,
  materialLineState, isMaterialPending, dwellBucket, DWELL_STUCK, DWELL_NONE,
  canonicalizeProjectNames, canonicalProjectName, projectMatchKey, normProjectName,
  BOP_STAGE_ORDER, stageIndex, stageRank,
} from './productionMetrics';
import type { ColumnDefinition, DataRow } from '../types';

// ============================================================================
// Quy tắc số liệu dùng chung — mọi trang (Tổng quan, Báo cáo tiến độ, BOT/BOP/BOM) đều đi qua các hàm này.
// Mỗi test ghi rõ quy tắc nghiệp vụ nó bảo vệ; đổi quy tắc thì phải đổi test có chủ đích.
// ============================================================================

describe('đơn hủy và giá trị đã nhập / còn lại', () => {
  it('nhận diện đơn HỦY qua cột Tình trạng IPO, không phân biệt hoa thường', () => {
    expect(isCancelledIpo('03. HỦY')).toBe(true);
    expect(isCancelledIpo('hủy đơn')).toBe(true);
    expect(isCancelledIpo('01. ĐANG SẢN XUẤT')).toBe(false);
    expect(isCancelledIpo(null)).toBe(false);
  });

  it('đơn hủy không tính trị giá, đã nhập, còn lại', () => {
    expect(orderValue(100, true)).toBe(0);
    expect(doneValue(100, 40, true)).toBe(0);
    expect(remainValue(100, 40, true)).toBe(0);
  });

  it('đã nhập = min(max(nhập kho lũy kế, 0), trị giá); còn lại = trị giá − đã nhập, không âm', () => {
    expect(doneValue(100, 40)).toBe(40);
    expect(doneValue(100, 130)).toBe(100);   // nhập vượt trị giá (lệch đơn giá) -> chặn ở trị giá
    expect(doneValue(100, -5)).toBe(0);
    expect(remainValue(100, 40)).toBe(60);
    expect(remainValue(100, 130)).toBe(0);
    expect(remainValue(100, -5)).toBe(100);
  });

  it('rowRemain / rowDone đọc đúng cột và áp quy tắc đơn hủy', () => {
    const k = { triGiaKey: 'tri_gia', nhapKhoKey: 'nk', ipoKey: 'ipo' };
    expect(rowRemain({ tri_gia: '100', nk: '30', ipo: '01. ĐANG SẢN XUẤT' }, k)).toBe(70);
    expect(rowDone({ tri_gia: '100', nk: '30', ipo: '01. ĐANG SẢN XUẤT' }, k)).toBe(30);
    expect(rowRemain({ tri_gia: '100', nk: '30', ipo: 'HỦY' }, k)).toBe(0);
  });
});

describe('đếm hạng mục đã nhập kho', () => {
  it('nhập đủ SỐ LƯỢNG đơn hàng là xong dù thành tiền nhập kho thấp hơn trị giá', () => {
    expect(isQtyComplete({ so_luong_don_hang_tong: 10, so_luong_nhap_kho_luy_ke: 10 })).toBe(true);
    expect(isQtyComplete({ so_luong_don_hang_tong: 10, so_luong_nhap_kho_luy_ke: 9.5 })).toBe(false);
    expect(isQtyComplete({ so_luong_don_hang_tong: 0, so_luong_nhap_kho_luy_ke: 0 })).toBe(false); // SL đơn 0 không xét
    expect(isStocked(100, 60, false, true)).toBe(true);   // tiền thiếu nhưng đủ SL
  });

  it('isStocked: đủ trị giá, hoặc đủ SL; đơn hủy và trị giá 0 chưa đủ SL thì không', () => {
    expect(isStocked(100, 100)).toBe(true);
    expect(isStocked(100, 99.99)).toBe(false);
    expect(isStocked(100, 100, true)).toBe(false);
    expect(isStocked(0, 0)).toBe(false);
  });
});

describe('ngày kế hoạch và hạn (BOT)', () => {
  beforeEach(() => setPlanMet({ tuan: [], thang: [] }));

  it('parsePlanDate hiểu "yyyy-mm-dd hh:mm:ss", ISO có múi giờ, dd/mm/yyyy; trả ngày địa phương không giờ', () => {
    expect(parsePlanDate('2026-09-26 00:00:00')?.getDate()).toBe(26);
    expect(parsePlanDate('26/09/2026')?.getMonth()).toBe(8);
    const iso = parsePlanDate('2026-09-25T17:00:00.000Z');
    expect(iso).not.toBeNull();
    expect(iso!.getHours()).toBe(0);
    expect(parsePlanDate('')).toBeNull();
    expect(parsePlanDate(null)).toBeNull();
  });

  const row = (over: DataRow): DataRow => ({
    hex: '260100001', ngay_khnk_tuan: '', ngay_khnk_thang: '', ngay_can_giao: '', ngay_can: '', bot_du_an: '', ...over,
  });

  it('hạn = KH tuần trước, không có thì KH tháng; ngày cần giao / ngày cần / BOT dự án chỉ tham khảo', () => {
    const d = deadlineOf(row({ ngay_khnk_tuan: '2026-10-10', ngay_khnk_thang: '2026-10-31', ngay_can_giao: '2026-09-01' }), RAW_DEADLINE_KEYS);
    expect(d.source).toBe('tuần');
    expect(d.date?.getDate()).toBe(10);
    const m = deadlineOf(row({ ngay_khnk_thang: '2026-10-31', ngay_can_giao: '2026-09-01', bot_du_an: '2026-08-01' }), RAW_DEADLINE_KEYS);
    expect(m.source).toBe('tháng');
    expect(m.date?.getDate()).toBe(31);
    const none = deadlineOf(row({ ngay_can_giao: '2026-09-01', ngay_can: '2026-09-01', bot_du_an: '2026-08-01' }), RAW_DEADLINE_KEYS);
    expect(none.date).toBeNull();
    expect(none.source).toBeNull();
    expect(none.canGiao?.getMonth()).toBe(8);
  });

  it('KH tuần của kỳ đã đạt SL (plan-met) bị bỏ qua, hạn chuyển sang KH tháng', () => {
    setPlanMet({ tuan: ['260100001'], thang: [] });
    const d = deadlineOf(row({ ngay_khnk_tuan: '2026-10-10', ngay_khnk_thang: '2026-10-31' }), RAW_DEADLINE_KEYS);
    expect(d.tuanMet).toBe(true);
    expect(d.source).toBe('tháng');
    expect(d.khnkTuan?.getDate()).toBe(10); // vẫn đọc ra để hiển thị
  });

  it('planAfterDue: KH đang dùng muộn hơn ngày cần giao', () => {
    expect(planAfterDue(deadlineOf(row({ ngay_khnk_tuan: '2026-10-20', ngay_can_giao: '2026-10-10' }), RAW_DEADLINE_KEYS))).toBe(true);
    expect(planAfterDue(deadlineOf(row({ ngay_khnk_tuan: '2026-10-05', ngay_can_giao: '2026-10-10' }), RAW_DEADLINE_KEYS))).toBe(false);
    expect(planAfterDue(deadlineOf(row({ ngay_can_giao: '2026-10-10' }), RAW_DEADLINE_KEYS))).toBe(false);
  });
});

describe('trạng thái dòng vật tư (PR)', () => {
  const today = new Date(2026, 9, 9).getTime(); // 09/10/2026
  const line = (over: Record<string, unknown>) => ({ so_luong_con_lai: 5, so_luong_yeu_cau: 5, trang_thai: '2.ĐANG MUA', ...over });

  it('hủy > đã nhận đủ > PR đóng chưa nhận đủ > chưa mua > CCLD > kho báo về > trễ hẹn / chưa tới hẹn', () => {
    expect(materialLineState(line({ trang_thai: '4.HỦY' }), today)).toBe('cancelled');
    expect(materialLineState(line({ so_luong_con_lai: 0 }), today)).toBe('done');
    expect(materialLineState(line({ trang_thai: '3.ĐÃ NHẬP KHO' }), today)).toBe('closedShort');
    expect(materialLineState(line({ trang_thai_sap: 'ĐÓNG', team_pr_note: 'CCLD' }), today)).toBe('closedShort'); // đóng xét trước CCLD
    expect(materialLineState(line({ team_pr_note: 'hàng CCLD' }), today)).toBe('ccld');
    expect(materialLineState(line({ trang_thai: '1.CHƯA MUA' }), today)).toBe('notOrdered');
    expect(materialLineState(line({ trang_thai: '1.CHƯA MUA', team_pr_note: 'CCLD' }), today)).toBe('notOrdered'); // nhãn chưa mua xét trước CCLD
    expect(materialLineState(line({ sl_hang_ve_thuc_te: 5 }), today)).toBe('arrived');
    // kho ghi khác đơn vị (gỗ M3: PR 15 mà kho ghi 7249) => không tính là đã báo về
    expect(materialLineState(line({ so_luong_yeu_cau: 15, sl_hang_ve_thuc_te: '7249.0', ngay_du_kien_giao_hang_pmh_nhap: '2026-10-01' }), today)).toBe('late');
    expect(materialLineState(line({ ngay_du_kien_giao_hang_pmh_nhap: '2026-10-01' }), today)).toBe('late');
    // quá hẹn nhưng ghi chú về theo nhu cầu SX / dùng tồn kho trước => nhóm riêng, vẫn còn chờ
    expect(materialLineState(line({ ngay_du_kien_giao_hang_pmh_nhap: '2026-10-01', team_pr_note: 'VỀ THEO NHU CẦU SX' }), today)).toBe('deferred');
    expect(materialLineState(line({ ngay_du_kien_giao_hang_pmh_nhap: '2026-10-01', team_pr_note: 'DÙNG TRƯỚC TỒN KHO' }), today)).toBe('deferred');
    expect(materialLineState(line({ ngay_du_kien_giao_hang_pmh_nhap: '2026-10-01', ghi_chu_tinh_trang_po: 'ĐIỀU PHỐI HÀNG VỀ THEO NHU CẦU SẢN XUẤT' }), today)).toBe('deferred');
    expect(materialLineState(line({ ngay_du_kien_giao_hang_pmh_nhap: '2026-12-01', team_pr_note: 'VỀ THEO NHU CẦU SX' }), today)).toBe('onTrack');
    expect(isMaterialPending('deferred')).toBe(true);
    expect(materialLineState(line({ ngay_du_kien_giao_hang_pmh_nhap: '2026-10-20' }), today)).toBe('onTrack');
    expect(materialLineState(line({}), today)).toBe('onTrack'); // không có ngày dự kiến -> chưa tới hẹn
  });

  it('còn chờ = chưa mua / trễ / chưa tới hẹn', () => {
    expect(['notOrdered', 'late', 'onTrack'].every(s => isMaterialPending(s as any))).toBe(true);
    expect(['cancelled', 'done', 'ccld', 'closedShort', 'arrived'].some(s => isMaterialPending(s as any))).toBe(false);
  });
});

describe('thời gian ở công đoạn hiện tại', () => {
  it('gom nhãn gốc về 6 nhóm; từ 4 tuần trở lên là nghẽn', () => {
    expect(dwellBucket('<3 NGÀY')).toBe('<3 NGÀY');
    expect(dwellBucket('4-7 NGÀY')).toBe('4-7 NGÀY');
    expect(dwellBucket('2 TUẦN')).toBe('2 tuần');
    expect(dwellBucket('3 TUẦN')).toBe('3 tuần');
    expect(dwellBucket('5 TUẦN')).toBe(DWELL_STUCK);
    expect(dwellBucket('TỪ 8 TUẦN TRỞ LÊN')).toBe(DWELL_STUCK);
    expect(dwellBucket('0')).toBe(DWELL_NONE);
    expect(dwellBucket(null)).toBe(DWELL_NONE);
  });
});

describe('tên công trình chuẩn theo mã', () => {
  const columns: ColumnDefinition[] = [
    { key: 'ma_cong_trinh', label: 'MÃ CÔNG TRÌNH' } as ColumnDefinition,
    { key: 'ten_cong_trinh', label: 'TÊN CÔNG TRÌNH' } as ColumnDefinition,
  ];

  it('cách viết nhiều dòng nhất của cùng mã thành tên chuẩn; tên khác của cùng mã được gộp', () => {
    const rows: DataRow[] = [
      { ma_cong_trinh: 'CT24-066', ten_cong_trinh: 'TÂY HỒ VIEW-THÁP 4A' },
      { ma_cong_trinh: 'CT24-066', ten_cong_trinh: 'TÂY HỒ VIEW-THÁP 4A' },
      { ma_cong_trinh: 'CT24-066', ten_cong_trinh: 'Tay Ho View 4A' },
      { ma_cong_trinh: 'CT24-067', ten_cong_trinh: 'TÂY HỒ VIEW-THÁP 4B' },
    ];
    const out = canonicalizeProjectNames(rows, columns);
    expect(out[2].ten_cong_trinh).toBe('TÂY HỒ VIEW-THÁP 4A');
    expect(canonicalProjectName('Tay Ho View 4A')).toBe('TÂY HỒ VIEW-THÁP 4A');
    expect(projectMatchKey('  tây hồ view-tháp   4a ')).toBe(normProjectName('TÂY HỒ VIEW-THÁP 4A'));
    expect(out[3].ten_cong_trinh).toBe('TÂY HỒ VIEW-THÁP 4B');
  });

  it('một tên dùng cho nhiều mã thì chốt theo tên, không gộp', () => {
    const rows: DataRow[] = [
      { ma_cong_trinh: 'EM-01', ten_cong_trinh: 'ARHAUS' },
      { ma_cong_trinh: 'EM-02', ten_cong_trinh: 'ARHAUS' },
      { ma_cong_trinh: 'EM-02', ten_cong_trinh: 'ARHAUS LÔ 2' },
    ];
    canonicalizeProjectNames(rows, columns);
    expect(canonicalProjectName('ARHAUS')).toBe('ARHAUS');
    expect(canonicalProjectName('ARHAUS LÔ 2')).toBe('ARHAUS LÔ 2');
  });
});

describe('thứ tự công đoạn BOP', () => {
  it('đủ 12 công đoạn theo thứ tự chuyền, GCVT sau P013', () => {
    expect(BOP_STAGE_ORDER.length).toBe(12);
    expect(stageIndex('P001')).toBe(0);
    expect(stageIndex('GCVT')).toBe(stageIndex('P013') + 1);
    expect(stageIndex('P025')).toBe(11);
  });

  it('công đoạn lạ / trống: stageIndex = -1, stageRank = 999 (xếp cuối)', () => {
    expect(stageIndex('P999')).toBe(-1);
    expect(stageIndex(null)).toBe(-1);
    expect(stageRank('P999')).toBe(999);
    expect(stageRank(undefined)).toBe(999);
    expect(['P021', 'P001', 'XYZ', 'P012'].sort((a, b) => stageRank(a) - stageRank(b))).toEqual(['P001', 'P012', 'P021', 'XYZ']);
  });
});
