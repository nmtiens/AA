import { describe, it, expect } from 'vitest';
import { hieuTruyVan, moTaTruyVan, boDauGiu, nenTuTra, noiNguCanh, thucTheCua } from './hieuTruyVan';
import { hieuCauHoi } from './hieuCauHoi';
import type { BangDM, TuDien } from './truyVanApi';
import mau from './danhMuc.mau.json';
import tdMau from './tuDien.mau.json';

// Danh mục mẫu = bản chụp GET /api/hoi-dap/danh-muc (tài khoản ADMIN). Sửa danh mục ở máy chủ thì chụp lại.
const dm = mau as unknown as BangDM[];
const H = new Date(2026, 9, 19); // thứ Hai 19/10/2026
const hieu = (s: string) => hieuTruyVan(s, dm, H)!;

describe('hieuTruyVan', () => {
  it('bỏ dấu giữ độ dài', () => {
    const s = 'Tây Hồ View đ';
    expect(boDauGiu(s)).toBe('tay ho view d');
    expect(boDauGiu(s).length).toBe([...s].length);
  });

  it('bảng + phép tính + nhóm + kỳ', () => {
    const r = hieu('tổng giá trị nhập kho theo xưởng tháng 9');
    expect(r.tv).toMatchObject({ bang: 'nhap_kho', do: [{ ham: 'tong', cot: 'thanh_tien_nhap_kho' }], nhom: ['xuong_chinh'], tu: '2026-09-01', den: '2026-09-30' });
    expect(r.phuc).toBe(false);
    expect(hieu('nhập kho theo tuần quý 3').tv).toMatchObject({ nhom: ['date@tuan'], tu: '2026-07-01', den: '2026-09-30' });
  });

  it('đếm: số HEX, số hạng mục, trung bình', () => {
    expect(hieu('số hex nhập kho xưởng 4A tháng này').tv).toMatchObject({ do: [{ ham: 'dem_khac', cot: 'hex' }], loc: [{ cot: 'xuong_chinh', op: 'bang', gt: ['4A'] }] });
    expect(hieu('số hạng mục có giá trị còn lại lớn hơn 0,5 tỷ theo xưởng').tv).toMatchObject({
      bang: 'production_status_app', do: [{ ham: 'dem' }], nhom: ['xuong_chinh'], loc: [{ cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 500 }],
    });
    expect(hieu('trung bình số công nhân theo xưởng tháng này').tv).toMatchObject({ bang: 'diem_danh', do: [{ ham: 'tb', cot: 'so_luong_cong_nhan' }] });
    expect(hieu('ngày nhập kho mới nhất của 260816258').tv).toMatchObject({ do: [{ ham: 'max', cot: 'date' }], loc: [{ cot: 'hex', gt: ['260816258'] }] });
  });

  it('lọc số (tỷ), ngày, chữ, mã CT, giá trị cố định', () => {
    const r = hieu('đơn hàng trị giá trên 1 tỷ năm 2025');
    expect(r.tv).toMatchObject({ bang: 'dht', loc: [{ cot: 'tri_gia_don_hang_tong', op: 'lon_hon', gt: 1000 }], tu: '2025-01-01', den: '2025-12-31' });
    expect(hieu('hạng mục ngày cần giao trước 30/10 theo công trình').tv.loc).toEqual([{ cot: 'ngay_can_giao', op: 'nho_hon', gt: '2026-10-30' }]);
    expect(hieu('liệt kê vật tư nhà cung cấp chứa an phát').tv).toMatchObject({ kieu: 'dong', loc: [{ cot: 'nha_cung_cap', op: 'chua', gt: 'an phát' }] });
    expect(hieu('PR công trình CT26-110 theo trạng thái').tv).toMatchObject({ bang: 'vat_tu', nhom: ['trang_thai'], loc: [{ cot: 'ten_cong_trinh', gt: ['CT26-110'] }] });
    expect(hieu('xuất kho công trình tây hồ view theo tháng tất cả').tv).toMatchObject({ nhom: ['date@thang'], loc: [{ cot: 'ten_cong_trinh', op: 'chua', gt: 'tây hồ view' }] });
    expect(hieu('vướng mắc quá hạn theo người xử lý').tv).toMatchObject({ bang: 'vuong_mac', nhom: ['handler'], loc: [{ cot: 'qua_han', op: 'bang', gt: 'Quá hạn' }] });
  });

  it('kỳ: theo ngày + tuần này, kế hoạch lấy trọn kỳ, mặc định năm nay, hỏi 1 công trình xem trọn lịch sử', () => {
    const a = hieu('điểm danh xưởng 2A theo ngày tuần này').tv;
    expect(a.nhom).toEqual(['date@ngay']);
    expect(a.tu).toBe('2026-10-19');
    expect(hieu('dữ liệu kế hoạch năm theo xưởng').tv).toMatchObject({ bang: 'khsx_nam', tu: '2026-01-01', den: '2026-12-31' });
    expect(hieu('vướng mắc theo người xử lý').tv).toMatchObject({ tu: '2026-01-01', den: '2026-10-19' });
    expect(hieu('xuất kho công trình CT24-066 theo tháng').tv.tu).toBeUndefined();
    expect(hieu('tồn kho theo công trình top 10').tv).toMatchObject({ bang: 'ton_kho', gioiHan: 10 });
    expect(hieu('tồn kho theo công trình top 10').tv.tu).toBeUndefined();
  });

  it('câu mẫu đơn giản không bị coi là phức (để câu trả lời mẫu xử lý)', () => {
    expect(hieu('nhập kho tuần này').phuc).toBe(false);
    expect(hieu('tồn kho').phuc).toBe(false);
    expect(hieu('đơn hàng theo PM tháng trước').phuc).toBe(true);
    expect(hieu('vật tư theo nhóm vật tư').phuc).toBe(true);
    expect(hieuTruyVan('Emerald Raiya', dm, H)).toBeNull();
  });

  it('mô tả bằng lời', () => {
    expect(moTaTruyVan(hieu('số hex nhập kho xưởng 4A tháng này').tv, dm)).toBe('**Nhập kho** · số HEX · lọc: Xưởng = 4A · 01/10/2026 – 19/10/2026');
  });
});

describe('hieuTruyVan — chọn mẫu hay tự tra', () => {
  it('câu của mẫu giữ cho mẫu; có phần mẫu không làm được thì tự tra', () => {
    expect(hieu('tiến độ kế hoạch năm').phuc).toBe(false);
    expect(hieu('công trình nào tồn kho nhiều nhất').phuc).toBe(true);
    const r = hieu('tính phiếu theo người duyệt');
    expect(r.phuc).toBe(true);
    expect(r.boQua[0]).toMatch(/không có cột "người duyệt"/);
  });
  it('"X nào … lớn nhất" là xếp hạng theo tổng', () => {
    expect(hieu('khách hàng nào có giá trị còn lại lớn nhất top 5').tv).toMatchObject({ nhom: ['khach_hang'], do: [{ ham: 'tong', cot: 'gia_tri_con_lai' }], gioiHan: 5 });
    expect(hieu('giá trị còn lại lớn nhất').tv.do).toEqual([{ ham: 'max', cot: 'gia_tri_con_lai' }]);
  });
});

describe('hieuTruyVan — giá trị, khái niệm, nối bảng sản xuất', () => {
  // Từ điển mẫu = bản chụp GET /api/hoi-dap/tu-dien
  const td = tdMau as unknown as TuDien;
  const h2 = (s: string) => hieuTruyVan(s, dm, H, td)!;
  const loc = (s: string) => h2(s).tv.loc;

  it('câu chỉ nói giá trị: chọn đúng bảng + cột', () => {
    expect(h2('có bao nhiêu hạng mục chưa triển khai').tv).toMatchObject({ bang: 'production_status_app', loc: [{ cot: 'tinh_trang', op: 'bang', gt: ['15. CHƯA TRIỂN KHAI'] }] });
    expect(loc('bàn ở công đoạn vecni')).toEqual(expect.arrayContaining([{ cot: 'tinh_trang', op: 'bang', gt: ['04. VECNI'] }, { cot: 'phan_loai_nhom_san_pham', op: 'bang', gt: ['01. BÀN'] }]));
    expect(h2('vật tư chưa mua theo công trình').tv).toMatchObject({ bang: 'vat_tu', nhom: ['ten_cong_trinh'], loc: [{ cot: 'trang_thai', gt: ['1.CHƯA MUA'] }] });
    expect(loc('đơn hàng của saudn tháng này')).toEqual([{ cot: 'ten_pm', op: 'bang', gt: ['saudn'] }]);
  });

  it('không bắt nhầm giá trị nằm trong tên bảng / cột / từ chung', () => {
    expect(loc('tồn kho của tây hồ view')).toEqual([{ cot: 'ten_cong_trinh', op: 'chua', gt: 'tây hồ view' }]);
    expect(h2('top 10 công trình đơn hàng nhiều nhất năm nay').tv).toMatchObject({ bang: 'dht', nhom: ['ten_cong_trinh'], loc: [], gioiHan: 10 });
    expect(loc('vật tư nhóm kính chưa về theo công trình').map(l => l.cot)).toEqual(['so_luong_con_lai', 'nhom_vt']);
  });

  it('nối sang bảng sản xuất qua HEX', () => {
    expect(h2('nhập kho của sun group tháng 9 theo xưởng').tv).toMatchObject({ bang: 'nhap_kho', nhom: ['xuong_chinh'], loc: [{ cot: 'sx:khach_hang', gt: ['SUN GROUP'] }] });
    expect(h2('xuất kho theo khách hàng năm nay').tv.nhom).toEqual(['sx:khach_hang']);
  });

  it('khái niệm nghiệp vụ', () => {
    expect(loc('có bao nhiêu hạng mục quá hạn giao')).toEqual([{ cot: 'ngay_can_giao', op: 'nho_hon', gt: '2026-10-19' }, { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }]);
    expect(h2('có bao nhiêu PR đang mua trễ hẹn').tv).toMatchObject({ bang: 'vat_tu' });
    expect(loc('có bao nhiêu PR đang mua trễ hẹn').map(l => l.cot)).toEqual(['ngay_du_kien_giao_hang_pmh_nhap', 'so_luong_con_lai', 'trang_thai']);
    expect(loc('tồn kho trên 6 tháng')).toEqual([{ cot: 'so_thang_ton_kho', op: 'lon_hon', gt: 6 }]);
    expect(h2('công trình nào còn nhiều giá trị chưa nhập kho nhất').tv).toMatchObject({ nhom: ['ten_cong_trinh'], do: [{ ham: 'tong', cot: 'gia_tri_con_lai' }] });
    expect(h2('những hex nào của CT26-110 chưa nhập kho').tv).toMatchObject({ bang: 'production_status_app', kieu: 'dong' });
  });

  it('tên công trình nói trống, so sánh 2 kỳ, bình quân, kỳ mẫu không đọc được', () => {
    expect(loc('dự án Nam Phương còn lại bao nhiêu')).toEqual([{ cot: 'ten_cong_trinh', op: 'chua', gt: 'Nam Phương' }]);
    expect(h2('nhập kho quý 3 so với quý 2').tv).toMatchObject({ tu: '2026-07-01', den: '2026-09-30', soSanh: { tu: '2026-04-01', den: '2026-06-30' } });
    expect(h2('trung bình mỗi ngày nhập kho bao nhiêu tháng này').tv).toMatchObject({ binhQuan: 'ngay', nhom: ['date@ngay'] });
    const c = hieuCauHoi('tổng giá trị đơn hàng năm 2025', H);
    expect(nenTuTra(c, h2('tổng giá trị đơn hàng năm 2025'), true)).toBe(true);
    expect(nenTuTra(hieuCauHoi('nhập kho tuần này', H), h2('nhập kho tuần này'), true)).toBe(false);
  });
});

describe('hieuTruyVan — chữ chưa hiểu (nhờ AI)', () => {
  const td = tdMau as unknown as TuDien;
  const thua = (s: string) => hieuTruyVan(s, dm, H, td)?.thua ?? null;
  it('câu đã hiểu hết: không còn chữ thừa', () => {
    ['đơn hàng theo PM tháng trước', 'trung bình mỗi ngày nhập kho bao nhiêu tháng này', 'vật tư nhóm kính chưa về theo công trình', '260816258 nhập kho chưa']
      .forEach(s => expect(thua(s)).toEqual([]));
  });
  it('câu còn ý chưa hiểu: báo chữ thừa', () => {
    expect(thua('hạng mục nào sắp tới hạn giao trong 7 ngày tới')).toEqual(['sap']);
    expect(thua('tỷ lệ nhập kho đúng kế hoạch tuần 41')).toContain('le');
  });
});

describe('hieuTruyVan — kế hoạch', () => {
  const td = tdMau as unknown as TuDien;
  it('"không có kế hoạch" (kể cả gõ thiếu "kế hoạc") = chưa nhập đủ, không có KH tháng lẫn tuần', () => {
    for (const s of ['có bao nhiêu hạng mục không có kế hoạch', 'CÓ BAO NHIÊU HẠNG MỤC KHÔNG CÓ KẾ HOẠC']) {
      const h = hieuTruyVan(s, dm, H, td)!;
      expect(h.tv).toMatchObject({ bang: 'production_status_app', do: [{ ham: 'dem' }] });
      expect(h.tv.loc).toEqual([{ cot: 'ngay_khnk_thang', op: 'rong' }, { cot: 'ngay_khnk_tuan', op: 'rong' }, { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }]);
      expect(h.thua).toEqual([]);
    }
  });
});

describe('hieuTruyVan — mã tắt, hỏi "ai là"', () => {
  const td = tdMau as unknown as TuDien;
  it('"CT070 ai là PC": mã tắt => mọi CTyy-070, chia theo công trình và PC, không cần AI', () => {
    const h = hieuTruyVan('CT070 AI LÀ PC', dm, H, td)!;
    expect(h.tv).toMatchObject({ bang: 'production_status_app', nhom: ['ten_cong_trinh', 'ten_pc'], loc: [{ cot: 'ten_cong_trinh', op: 'chua', gt: ['CT25-070', 'CT24-070'] }] });
    expect(h.thua).toEqual([]);
  });
  it('"PM của CT25-070 là ai" => chia theo PM', () => {
    const h = hieuTruyVan('PM của CT25-070 là ai', dm, H, td)!;
    expect(h.tv).toMatchObject({ nhom: ['ten_pm'], loc: [{ cot: 'ten_cong_trinh', gt: ['CT25-070'] }] });
    expect(h.thua).toEqual([]);
  });
});

describe('ngữ cảnh câu trước', () => {
  const td = tdMau as unknown as TuDien;
  it('câu nối tiếp không nói đối tượng => dùng đối tượng câu trước; "tất cả" => hỏi chung', () => {
    const truoc = hieuTruyVan('CT25070 AI LÀ PC', dm, H, td)!;
    const ngu = thucTheCua(truoc.tv);
    expect(ngu).toEqual([{ cot: 'ten_cong_trinh', op: 'chua', gt: ['CT25-070'] }]);
    const sau = hieuTruyVan('còn bao nhiêu hạng mục chưa nhập kho', dm, H, td)!;
    expect(noiNguCanh(sau, ngu, dm, 'còn bao nhiêu hạng mục chưa nhập kho')).toEqual(['Công trình chứa CT25-070']);
    expect(sau.tv.loc).toContainEqual({ cot: 'ten_cong_trinh', op: 'chua', gt: ['CT25-070'] });
    const chung = hieuTruyVan('tất cả còn bao nhiêu hạng mục chưa nhập kho', dm, H, td)!;
    expect(noiNguCanh(chung, ngu, dm, 'tất cả còn bao nhiêu hạng mục chưa nhập kho')).toBeNull();
    // Câu tự nói đối tượng khác => không lấy câu trước
    const khac = hieuTruyVan('xưởng 4A còn bao nhiêu hạng mục chưa nhập kho', dm, H, td)!;
    expect(noiNguCanh(khac, ngu, dm, 'xưởng 4A còn bao nhiêu hạng mục chưa nhập kho')).toBeNull();
    // Đổi bảng: công trình vẫn áp được cho nhập kho
    const nk = hieuTruyVan('nhập kho tháng này', dm, H, td)!;
    expect(noiNguCanh(nk, ngu, dm, 'nhập kho tháng này')).toEqual(['Công trình chứa CT25-070']);
  });
});
