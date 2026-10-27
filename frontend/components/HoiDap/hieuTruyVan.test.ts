import { describe, it, expect } from 'vitest';
import { hieuTruyVan, moTaTruyVan, boDauGiu, nenTuTra, noiNguCanh, thucTheCua, apNguCanh, nguCanhSau, type NguCanh } from './hieuTruyVan';
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
    expect(thua('hạng mục nào dự kiến giao trong 7 ngày tới')).toContain('du');
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

describe('chữ hai nghĩa => hỏi lại', () => {
  const td = tdMau as unknown as TuDien;
  const doc = (s: string) => hieuTruyVan(s, dm, H, td)!;
  it('"go" không dấu trong câu vật tư: hỏi lại, câu viết lại đọc đúng nhóm vật tư', () => {
    const r = doc('vat tu go chua ve');
    expect(r.moHo?.[0].chu).toBe('go');
    const lua = r.moHo![0].lua[0];
    const r2 = doc(lua.cau);
    expect(r2.moHo).toBeUndefined();
    expect(r2.tv.loc.some(l => l.cot === 'nhom_vt')).toBe(true);
  });
  it('"của" / "bản vẽ" / có dấu: không hỏi lại', () => {
    expect(doc('hang muc cua pm le viet tai chua nhap kho').moHo).toBeUndefined();
    expect(doc('ban ve trien khai thang 9').moHo).toBeUndefined();
    expect(doc('vật tư gỗ chưa về').moHo).toBeUndefined();
  });
});

describe('xếp theo mức chênh', () => {
  it('"giảm nhiều nhất so với tháng trước" => kỳ chính tháng này, so tháng trước, xếp giảm', () => {
    const r = hieu('xưởng nào giảm nhập kho nhiều nhất so với tháng trước');
    expect(r.tv).toMatchObject({ bang: 'nhap_kho', nhom: ['xuong_chinh'], tu: '2026-10-01', den: '2026-10-19', soSanh: { tu: '2026-09-01', den: '2026-09-30' }, sapChenh: 'giam' });
    expect(hieu('xưởng nào tăng nhập kho nhiều nhất tháng này').tv).toMatchObject({ soSanh: { tu: '2026-09-01', den: '2026-09-30' }, sapChenh: 'tang' });
  });
});

describe('ngữ cảnh không đè câu hỏi "X nào"', () => {
  it('câu trước lọc xưởng 8C, câu sau "xưởng nào…" => không lọc 8C', () => {
    const r = hieu('xưởng nào giảm nhập kho nhiều nhất so với tháng trước');
    expect(noiNguCanh(r, [{ cot: 'xuong_chinh', op: 'bang', gt: '8C' }], dm, 'xưởng nào giảm nhập kho nhiều nhất so với tháng trước')).toBeNull();
    expect(r.tv.loc.some(l => l.cot === 'xuong_chinh')).toBe(false);
  });
});

describe('hỏi nối tiếp nhiều lượt (lấy cả câu trước)', () => {
  const td = tdMau as unknown as TuDien;
  /** Hỏi lần lượt như cửa sổ; trả truy vấn câu cuối */
  const hoiChuoi = (...cau: string[]) => {
    let ngu: NguCanh | null = null;
    let cuoi = null as ReturnType<typeof apNguCanh> | null;
    cau.forEach(s => {
      cuoi = apNguCanh(hieuTruyVan(s, dm, H, td), ngu, dm, s, H, td);
      const moi = nguCanhSau(s, hieuCauHoi(s, H), cuoi.h);
      if (moi) ngu = moi;
    });
    return cuoi!;
  };
  it('đổi kỳ: "còn tháng 8?" giữ bảng + chia nhóm', () => {
    const r = hoiChuoi('nhập kho tháng 9', 'theo xưởng', 'ad ơi còn tháng 8 thì sao giúp mình');
    expect(r.noiCau).toBe(true);
    expect(r.h!.tv).toMatchObject({ bang: 'nhap_kho', nhom: ['xuong_chinh'], tu: '2026-08-01', den: '2026-08-31' });
  });
  it('đổi bảng: "xuất kho thì sao" giữ xưởng + kỳ', () => {
    const r = hoiChuoi('nhập kho xưởng 4A tháng 9', 'xuất kho thì sao');
    expect(r.h!.tv).toMatchObject({ bang: 'xuat_kho', tu: '2026-09-01', den: '2026-09-30' });
    expect(r.h!.tv.loc).toEqual([{ cot: 'xuong_chinh', op: 'bang', gt: ['4A'] }]);
  });
  it('đổi xưởng: "còn 3A?" thay lọc xưởng', () => {
    const r = hoiChuoi('nhập kho xưởng 4A tháng 9', 'còn 3A thì sao');
    expect(r.h!.tv).toMatchObject({ bang: 'nhap_kho', tu: '2026-09-01' });
    expect(r.h!.tv.loc).toEqual([{ cot: 'xuong_chinh', op: 'bang', gt: ['3A'] }]);
  });
  it('"so với cùng kỳ năm ngoái thì sao" sau câu lũy kế', () => {
    const r = hoiChuoi('nhập kho lũy kế', 'so với cùng kỳ năm ngoái thì sao');
    expect(r.h!.tv).toMatchObject({ bang: 'nhap_kho', tu: '2026-01-01', den: '2026-10-19', soSanh: { tu: '2025-01-01', den: '2025-10-19' } });
  });
  it('câu mới đủ ý không lấy lọc xưởng của câu trước', () => {
    const r = hoiChuoi('nhập kho xưởng 4A tháng 9', 'đơn hàng mới theo PM tháng này');
    expect(r.noiCau).toBe(false);
    expect(r.h!.tv.loc).toEqual([]);
  });
});

describe('đợt 3: cùng kỳ, sắp đến hạn, lũy kế, trung bình mỗi đơn, 2 kỳ đảo thứ tự', () => {
  const td = tdMau as unknown as TuDien;
  const doc = (s: string) => hieuTruyVan(s, dm, H, td)!;
  it('so với cùng kỳ năm ngoái', () => {
    expect(doc('nhập kho tháng 9 so với cùng kỳ năm ngoái').tv).toMatchObject({ tu: '2026-09-01', den: '2026-09-30', soSanh: { tu: '2025-09-01', den: '2025-09-30' } });
  });
  it('kỳ chính nói trước, kỳ "này" nói sau', () => {
    expect(doc('nhập kho tháng 8 so với tháng này').tv).toMatchObject({ tu: '2026-08-01', soSanh: { tu: '2026-10-01' } });
  });
  it('sắp đến hạn giao = ngày cần giao trong 14 ngày tới, chưa nhập đủ', () => {
    expect(doc('hạng mục sắp đến hạn giao').tv.loc).toEqual([
      { cot: 'ngay_can_giao', op: 'trong_khoang', gt: ['2026-10-19', '2026-11-02'] }, { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }]);
  });
  it('lũy kế = từ đầu năm; trung bình mỗi đơn hàng = trung bình trị giá', () => {
    expect(doc('nhập kho lũy kế').tv).toMatchObject({ tu: '2026-01-01', den: '2026-10-19' });
    expect(doc('trung bình mỗi đơn hàng bao nhiêu tiền tháng này').tv.do).toEqual([{ ham: 'tb', cot: 'tri_gia_don_hang_tong' }]);
  });
  it('số đi liền "ngày" là kỳ, không phải giá trị lọc', () => {
    expect(doc('số lượng nhập kho 30 ngày').tv.loc).toEqual([]);
  });
});

describe('đợt 4: 6 thẻ × PC / công trình / hạng mục', () => {
  const td = tdMau as unknown as TuDien;
  const doc = (s: string) => hieuTruyVan(s, dm, H, td)!;
  it('"hạng mục" đi cùng tên bảng khác là cột tên hạng mục của bảng đó', () => {
    expect(doc('top 5 hạng mục nhập kho tuần trước').tv).toMatchObject({ bang: 'nhap_kho', nhom: ['ten_hang_muc'], gioiHan: 5 });
    expect(doc('hạng mục nào của CT26-041 đã xuất kho tháng 9').tv).toMatchObject({ bang: 'xuat_kho', kieu: 'dong' });
    expect(doc('hạng mục theo tình trạng triển khai bản vẽ').tv).toMatchObject({ bang: 'production_status_app', nhom: ['tinh_trang_trien_khai_ban_ve'] });
  });
  it('PC trên các thẻ: đơn hàng dùng cột PC của bảng, bảng khác nối qua HEX', () => {
    expect(doc('đơn hàng mới theo PC tháng này').tv.nhom).toEqual(['ten_pc']);
    expect(doc('nhập kho theo PC tháng này').tv.nhom).toEqual(['sx:ten_pc']);
    expect(doc('PC LÊ ANH QUANG phụ trách những công trình nào').tv).toMatchObject({ bang: 'production_status_app', nhom: ['ten_cong_trinh'] });
  });
});

describe('đợt 6: kế hoạch nhập kho, BOT, BOP, BOM', () => {
  const td = tdMau as unknown as TuDien;
  const doc = (s: string) => hieuTruyVan(s, dm, H, td)!;
  it('quá hạn KẾ HOẠCH (BOT) khác quá hạn GIAO', () => {
    expect(doc('hạng mục quá hạn kế hoạch nhập kho').tv.loc).toEqual([{ cot: 'nhom_bot', op: 'bang', gt: ['1. Quá hạn KH'] }]);
    expect(doc('hạng mục quá hạn giao').tv.loc.map(l => l.cot)).toEqual(['ngay_can_giao', 'gia_tri_con_lai']);
    expect(doc('hạng mục theo BOT').tv).toMatchObject({ bang: 'production_status_app', nhom: ['nhom_bot'] });
  });
  it('BOP: "đang ở bước nào", lọc mã bước', () => {
    expect(doc('công trình CT25-070 đang ở bước nào').tv.nhom).toEqual(['bop']);
    expect(doc('bao nhiêu hạng mục đang ở BOP P013').tv.loc).toEqual([{ cot: 'bop', op: 'bang', gt: ['P013'] }]);
  });
  it('kế hoạch nhập kho theo kỳ là bảng kế hoạch; BOM là bảng vật tư', () => {
    expect(doc('danh sách hex có kế hoạch nhập kho tháng này của CT25-070').tv).toMatchObject({ bang: 'khsx', kieu: 'dong', tu: '2026-10-01', den: '2026-10-31' });
    expect(doc('BOM công trình CT25-070').tv.bang).toBe('vat_tu');
  });
});

describe('đợt 7: câu nói tự nhiên', () => {
  const td = tdMau as unknown as TuDien;
  const doc = (s: string) => hieuTruyVan(s, dm, H, td)!;
  it('"trễ" đứng một mình = quá hạn giao; "sắp trễ" = sắp đến hạn giao', () => {
    expect(doc('hàng trễ bao nhiêu rồi').tv.loc.map(l => l.cot)).toEqual(['ngay_can_giao', 'gia_tri_con_lai']);
    expect(doc('xưởng nào trễ nhiều nhất').tv).toMatchObject({ nhom: ['xuong_chinh'] });
    expect(doc('mấy hạng mục sắp trễ hạn').tv.loc[0]).toMatchObject({ cot: 'ngay_can_giao', op: 'trong_khoang' });
  });
  it('"từ đầu tháng tới giờ" = tháng này (không phải "tất cả")', () => {
    expect(doc('từ đầu tháng tới giờ nhập bao nhiêu').tv).toMatchObject({ bang: 'nhap_kho', tu: '2026-10-01', den: '2026-10-19' });
  });
  it('từ đệm khẩu ngữ không thành chữ chưa hiểu; câu hỏi "tại sao" thì có', () => {
    expect(doc('nhập kho tháng này theo xưởng đi').thua).toEqual([]);
    expect(doc('sao tháng này nhập ít vậy').thua).toContain('tai sao');
  });
  it('4A tháng này sao rồi => câu trả lời mẫu nhập kho của xưởng', () => {
    const c = hieuCauHoi('4A tháng này sao rồi', H);
    expect(c.y).toBe('nhap_kho');
    expect(nenTuTra(c, doc('4A tháng này sao rồi'), true)).toBe(false);
  });
});

describe('câu có khái niệm riêng sau câu về bảng khác', () => {
  it('"hàng trễ bao nhiêu rồi" sau câu xuất kho vẫn là quá hạn giao của hạng mục', () => {
    const td = tdMau as unknown as TuDien;
    let ngu: NguCanh | null = null;
    let r = null as ReturnType<typeof apNguCanh> | null;
    for (const s of ['xuất kho xưởng 4A tháng 9', 'hàng trễ bao nhiêu rồi']) {
      r = apNguCanh(hieuTruyVan(s, dm, H, td), ngu, dm, s, H, td);
      const moi = nguCanhSau(s, hieuCauHoi(s, H), r.h);
      if (moi) ngu = moi;
    }
    expect(r!.h!.tv.bang).toBe('production_status_app');
    expect(r!.h!.thua).toEqual([]);
  });
});

describe('vòng 1 rà soát: viết tắt, từ đệm, liệt kê, sửa chính tả', () => {
  const td = tdMau as unknown as TuDien;
  const doc = (s: string) => hieuTruyVan(s, dm, H, td)!;
  it('viết tắt được mở, không còn chữ chưa hiểu; "kh" = kế hoạch, "kh-th" giữ nguyên', () => {
    const a = doc('ton kho tren 6 thang con bn tien');
    expect(a.thua).toEqual([]);
    expect(a.tv.loc).toEqual([{ cot: 'so_thang_ton_kho', op: 'lon_hon', gt: 6 }]);
    const hm = doc('hm nào của CT26-110 đang quá hạn giao');
    expect(hm.tv.kieu).toBe('dong');
    expect(hm.thua).toEqual([]);
    const b = doc('con bn tien chua nk cua capitaland');
    expect(b.tv.bang).toBe('production_status_app');
    expect(b.tv.do).toContainEqual({ ham: 'tong', cot: 'gia_tri_con_lai' });
    expect(b.tv.loc).toEqual(expect.arrayContaining([{ cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }, { cot: 'khach_hang', op: 'bang', gt: ['CAPITALAND'] }]));
    expect(b.thua).toEqual([]);
    // "rớt kh" => cột rớt kế hoạch (không phải giá trị RỚT)
    expect(doc('4A thang nay rot kh bn').tv.do).toContainEqual({ ham: 'tong', cot: 'rot_ke_hoach' });
    expect(doc('kh-th tuần 41 theo xưởng').tv).toMatchObject({ bang: 'phan_tich_kh_th', nhom: ['xuong_chinh'] });
  });
  it('từ đệm khẩu ngữ: "bên", "đưa xuống", "yếu nhất", "bao nhiêu dòng"', () => {
    expect(doc('CT25-070 ben 8AB con bn chua nhap').thua).toEqual([]);
    const y = doc('xưởng nào nhập kho yếu nhất tháng này');
    expect(y.thua).toEqual([]);
    expect(y.tv).toMatchObject({ nhom: ['xuong_chinh'], sap: { giam: false } });
    const d = doc('PM tailv tg này đưa xuống bao nhiêu đơn');
    expect(d.thua).toEqual([]);
    expect(d.tv).toMatchObject({ bang: 'dht', loc: [{ cot: 'ten_pm', op: 'bang', gt: ['tailv'] }], tu: '2026-10-01', den: '2026-10-19' });
    const e = doc('bom emerald raiya còn bao nhiêu dòng chưa mua');
    expect(e.thua).toEqual([]);
    expect(e.tv.do).toEqual([{ ham: 'dem' }]);
    // "bao nhiêu dòng" là từ đếm, không phải giá trị ĐÓNG
    expect(doc('pr tre hen bn dong').tv.loc.some(l => l.cot === 'tinh_trang_pr')).toBe(false);
    // "khi" lẻ vẫn là chữ chưa hiểu (câu nhờ nhắc việc không trả lời tự tin); "khi nào" là cụm hỏi
    expect(doc('nhắc tôi khi CT25-070 nhập kho xong nhé').thua.length).toBeGreaterThan(0);
    expect(doc('CT25-070 hạn giao gần nhất là khi nào').thua).toEqual([]);
  });
  it('sửa chính tả: chữ 3 ký tự gõ sót; không biến chữ thật thành tên người; chỉ sửa chỗ chưa hiểu', () => {
    const a = doc('đơn hàg trên 2 tỷ năm nay');
    expect(a.suaChu).toEqual(['hàg → hang']);
    expect(a.tv.loc).toEqual([{ cot: 'tri_gia_don_hang_tong', op: 'lon_hon', gt: 2000 }]);
    // chỉ nhận sửa 3 ký tự khi hiểu trọn câu: "lợi" (lợi nhuận) không thành "loại"
    expect(hieuTruyVan('lợi nhuận tháng 9 là bao nhiêu', dm, H, td)?.moHo).toBeUndefined();
    const k = doc('tháng 10 xuất cho khách bao nhiêu, theo khách hàng');
    expect(k.tv).toMatchObject({ bang: 'xuat_kho', nhom: ['sx:khach_hang'], loc: [] });
    expect(k.thua).toEqual([]);
    expect(doc('các hạng mục của 4A đang ở vecni cho khách sun group').tv.loc.some(l => l.cot === 'ten_pc')).toBe(false);
  });
  it('liệt kê: "đơn mới nào", "dòng … nào", "cái nào", "có … gì không", "làm tới đâu" có lọc, số PR / PO', () => {
    expect(doc('tháng 9 công trình st.regis có đơn mới nào ko').tv).toMatchObject({ bang: 'dht', kieu: 'dong' });
    expect(doc('dòng tồn kho nào trên 2 tỷ').tv).toMatchObject({ bang: 'ton_kho', kieu: 'dong', loc: [{ cot: 'gia_tri', op: 'lon_hon', gt: 2000 }] });
    expect(doc('hôm qua CT25-070 có nhập kho gì khong').tv).toMatchObject({ kieu: 'dong', tu: '2026-10-18' });
    expect(doc('cái nào trễ rồi').tv.kieu).toBe('dong');
    // "cái nào nhiều nhất" sau "theo công trình" là xếp hạng
    expect(doc('tồn kho theo cong trinh, cái nào nhiều nhất').tv).toMatchObject({ kieu: 'tong', nhom: ['ten_cong_trinh'] });
    const t = doc('tủ áo của tây hồ view bên 4A làm tới đâu rồi');
    expect(t.tv.kieu).toBe('dong');
    expect(t.thua).toEqual([]);
    // chỉ công trình / HEX => để câu trả lời mẫu (tổng)
    expect(doc('CT25-070 làm tới đâu rồi').tv.kieu).toBe('tong');
    expect(doc('hex 250812345 toi dau roi').tv.kieu).toBe('tong');
    expect(doc('số PR 1000234567 đến đâu rồi').tv).toMatchObject({ bang: 'vat_tu', kieu: 'dong', loc: [{ cot: 'so_pr', op: 'bang', gt: ['1000234567'] }] });
    const po = doc('PO 4500012345 ve chua');
    expect(po.tv).toMatchObject({ bang: 'vat_tu', kieu: 'dong', loc: [{ cot: 'so_po', op: 'bang', gt: ['4500012345'] }] });
    expect(po.thua).toEqual([]);
  });
});

describe('vòng 1 rà soát: ngữ cảnh (cụm 2) — nối câu có khái niệm, đổi bảng giữ đối tượng, thay phép tính', () => {
  const td = tdMau as unknown as TuDien;
  /** Hỏi lần lượt như cửa sổ (cùng cách chamDiem); trả kết quả câu cuối */
  const chuoi = (...cau: string[]) => {
    let ngu: NguCanh | null = null;
    let cuoi = null as ReturnType<typeof apNguCanh> | null;
    cau.forEach(s => {
      cuoi = apNguCanh(hieuTruyVan(s, dm, H, td), ngu, dm, s, H, td);
      const moi = nguCanhSau(s, hieuCauHoi(s, H), cuoi.h);
      if (moi) ngu = moi;
    });
    return cuoi!;
  };
  it('a) "chỉ lấy …" / "còn … thì sao" có khái niệm vẫn nối: giữ nhóm, khái niệm mới thay khái niệm cũ', () => {
    const t = chuoi('tồn kho theo công trình', 'chỉ lấy tồn trên 3 tháng');
    expect(t.h!.tv).toMatchObject({ bang: 'ton_kho', kieu: 'tong', nhom: ['ten_cong_trinh'], loc: [{ cot: 'so_thang_ton_kho', op: 'lon_hon', gt: 3 }] });
    expect(t.h!.tv.tu).toBeUndefined();
    expect(chuoi('tồn kho theo công trình', 'chỉ lấy tồn trên 6 tháng', 'top 5').h!.tv).toMatchObject({ nhom: ['ten_cong_trinh'], gioiHan: 5 });
    const qh = chuoi('hạng mục quá hạn kế hoạch', 'theo PM đi', 'còn quá hạn giao thì sao').h!.tv;
    expect(qh.nhom).toEqual(['ten_pm']);
    expect(qh.loc.map(l => l.cot).sort()).toEqual(['gia_tri_con_lai', 'ngay_can_giao']);
    // "theo nhóm vật tư": tên bảng chỉ nằm trong tên cột => vẫn nối, giữ "chưa về"
    const vt = chuoi('PR của CT25-070 chưa về hết chưa', 'theo nhóm vật tư').h!.tv;
    expect(vt).toMatchObject({ bang: 'vat_tu', kieu: 'tong', nhom: ['nhom_vt'] });
    expect(vt.loc.map(l => l.cot).sort()).toEqual(['so_luong_con_lai', 'ten_cong_trinh']);
  });
  it('b) khái niệm chung ("quá hạn", "trễ hẹn") sau câu về vướng mắc / vật tư: theo bảng câu trước, không về hạng mục', () => {
    const vm = chuoi('vướng mắc chưa xử lý của 4A', 'cái nào quá hạn');
    expect(vm.h!.tv).toMatchObject({ bang: 'vuong_mac', kieu: 'dong' });
    expect(vm.h!.tv.loc.map(l => l.cot).sort()).toEqual(['is_resolved', 'qua_han', 'xuong']);
    expect(vm.h!.tv.tu).toBeUndefined();
    const ai = chuoi('vướng mắc chưa xử lý của 4A', 'cái nào quá hạn', 'ai đang xử lý').h!;
    expect(ai.tv).toMatchObject({ bang: 'vuong_mac', kieu: 'tong', nhom: ['handler'] });
    expect(ai.thua).toEqual([]);
    const pr = chuoi('PR của CT25-070 chưa về hết chưa', 'theo nhóm vật tư', 'cái nào trễ hẹn rồi').h!.tv;
    expect(pr).toMatchObject({ bang: 'vat_tu', kieu: 'dong' });
    expect(pr.loc.map(l => l.cot).sort()).toEqual(['ngay_du_kien_giao_hang_pmh_nhap', 'so_luong_con_lai', 'ten_cong_trinh']);
    // vẫn giữ: "hàng trễ" sau câu xuất kho là quá hạn giao của hạng mục
    expect(chuoi('xuất kho xưởng 4A tháng 9', 'hàng trễ bao nhiêu rồi').h!.tv.bang).toBe('production_status_app');
  });
  it('c) câu đi tự tra không đổi bảng ngữ cảnh sang bảng mẫu: xưởng / công trình còn cho câu sau', () => {
    const r = chuoi('ct nam phương bên 4A làm tới đâu', 'còn bao nhiêu chưa nhập', 'cái nào trễ hạn giao').h!.tv;
    expect(r).toMatchObject({ bang: 'production_status_app', kieu: 'dong' });
    expect(r.loc.map(l => l.cot).sort()).toEqual(['gia_tri_con_lai', 'ngay_can_giao', 'ten_cong_trinh', 'xuong_chinh']);
    expect(chuoi('CT26-110 còn những hm nào chưa nhập kho', 'theo công đoạn đi').h!.tv).toMatchObject({ bang: 'production_status_app', kieu: 'tong', nhom: ['tinh_trang'] });
  });
  it('d) đổi bảng câu ngắn giữ xưởng; "của X thôi" thu hẹp câu trước; kỳ kế hoạch sang dòng chảy cắt tới hôm nay', () => {
    const nk = chuoi('kế hoạch tuần này của 8AB', 'nhập kho được bao nhiêu rồi');
    expect(nk.h!.tv).toMatchObject({ bang: 'nhap_kho', loc: [{ cot: 'xuong_chinh', op: 'bang', gt: ['8AB'] }] });
    expect(chuoi('kế hoạch tuần này của 8AB', 'nhập kho được bao nhiêu rồi', 'tuần trước thì sao').h!.tv).toMatchObject({ bang: 'nhap_kho', loc: [{ cot: 'xuong_chinh', gt: ['8AB'] }], tu: '2026-10-12', den: '2026-10-18' });
    const th = chuoi('vật tư kính chưa về', 'cái nào đang mua', 'của tây hồ view thôi').h!.tv;
    expect(th.loc.map(l => l.cot).sort()).toEqual(['nhom_vt', 'so_luong_con_lai', 'ten_cong_trinh', 'trang_thai']);
    const sg = chuoi('doanh thu năm nay theo khách hàng', 'top 3 thôi', 'sun group chi tiết theo công trình').h!.tv;
    expect(sg).toMatchObject({ bang: 'nhap_kho', kieu: 'tong', nhom: ['ten_cong_trinh'], loc: [{ cot: 'sx:khach_hang', gt: ['SUN GROUP'] }], tu: '2026-01-01', den: '2026-10-19' });
    const tt = chuoi('kế hoạch nhập kho tháng này của emerald raiya', 'thực tế nhập được bao nhiêu rồi').h!;
    expect(tt.tv).toMatchObject({ bang: 'nhap_kho', tu: '2026-10-01', den: '2026-10-19' });
    expect(tt.thua).toEqual([]);
  });
  it('e) nhắc cột số khác => thay phép tính; chép bình quân; "theo X" sau danh sách về tổng', () => {
    const tc = chuoi('hôm nay xưởng 8AB có bao nhiêu người đi làm', 'tăng ca bao nhiêu giờ', 'so với hôm qua').h!.tv;
    expect(tc).toMatchObject({ bang: 'diem_danh', do: [{ ham: 'tong', cot: 'gio_cong_tang_ca' }], tu: '2026-10-19', soSanh: { tu: '2026-10-18', den: '2026-10-18' } });
    expect(chuoi('tính phiếu quý 3 theo xưởng', 'chỉ 3A thôi', 'bình quân mỗi tuần').h!.tv).toMatchObject({ binhQuan: 'tuan', loc: [{ cot: 'xuong_chinh', gt: ['3A'] }], tu: '2026-07-01' });
    expect(chuoi('xưởng 4A đang có bao nhiêu hạng mục quá hạn kh', 'chi tiết đi', 'theo công trình đi').h!.tv).toMatchObject({ kieu: 'tong', nhom: ['ten_cong_trinh'] });
  });
  it('2 chuỗi thật trên giao diện: "tháng này sao rồi" sau danh sách quá hạn; "chỗ nào có vấn đề" sau chuỗi công trình', () => {
    const a = chuoi('hm nào của CT26-110 đang quá hạn giao', 'tháng này sao rồi');
    expect(a.noiCau).toBe(false);
    expect(a.h!.tv.loc.some(l => l.cot === 'ngay_can_giao')).toBe(false);
    const c = hieuCauHoi('tháng này sao rồi', H);
    expect(c.y).toBe('tien_do_thang');
    expect(nenTuTra(c, a.h!, true)).toBe(false);
    const b = chuoi('công trình CT26-110', 'còn bao nhiêu chưa nhập kho', 'theo xưởng đi', 'chỗ nào có vấn đề').h!.tv;
    expect(b.bang).toBe('vuong_mac');
    expect(b.tu).toBeUndefined();
    expect(b.loc).toEqual([{ cot: 'ten_cong_trinh', op: 'chua', gt: ['CT26-110'] }]);
  });
});

describe('vòng 1 rà soát: mẫu hay tự tra (cụm 11, 14), hai nghĩa thật (cụm 12), ngoài dữ liệu (cụm 15)', () => {
  const td = tdMau as unknown as TuDien;
  const doc = (s: string) => hieuTruyVan(s, dm, H, td)!;
  it('xưởng ở bảng tồn kho = xưởng của hạng mục qua HEX (sx:xuong_chinh) => tự tra; vướng mắc lọc tình trạng không kỳ', () => {
    const t = doc('ad ơi cho e hỏi tồn kho 3A hiện giờ');
    expect(t.tv.loc).toEqual([{ cot: 'sx:xuong_chinh', op: 'bang', gt: ['3A'] }]);
    expect(t.boQua).toEqual([]);
    expect(t.thua).toEqual([]);
    expect(nenTuTra(hieuCauHoi('ad ơi cho e hỏi tồn kho 3A hiện giờ', H), t, true)).toBe(true);
    expect(doc('vướng mắc chưa xử lý theo xưởng').tv.tu).toBeUndefined();
    expect(doc('vướng mắc theo người xử lý').tv.tu).toBe('2026-01-01');
  });
  it('vướng mắc "đang mở / chưa xong": lọc trạng thái Mới + Đang xử lý (như trang), không kỳ; câu trần vẫn là câu trả lời mẫu', () => {
    const tuTra = (s: string) => nenTuTra(hieuCauHoi(s, H), hieuTruyVan(s, dm, H, td), true);
    const dangMo = { cot: 'status', op: 'bang', gt: ['Mới', 'Đang xử lý'] };
    const x = doc('vướng mắc đang mở theo xưởng');
    expect(x.tv).toMatchObject({ bang: 'vuong_mac', kieu: 'tong', nhom: ['xuong'], loc: [dangMo] });
    expect(x.tv.tu).toBeUndefined();
    expect(x.thua).toEqual([]);
    expect(tuTra('vướng mắc đang mở theo xưởng')).toBe(true);
    const ct = doc('vướng mắc chưa xong của CT25-070').tv;
    expect(ct.bang).toBe('vuong_mac');
    expect(ct.loc).toEqual(expect.arrayContaining([dangMo, { cot: 'ten_cong_trinh', op: 'chua', gt: ['CT25-070'] }]));
    expect(ct.loc).toHaveLength(2);
    expect(doc('còn bao nhiêu vướng mắc chưa đóng').tv).toMatchObject({ bang: 'vuong_mac', do: [{ ham: 'dem' }], loc: [dangMo] });
    // câu trần "vướng mắc đang mở" = đúng ý câu trả lời mẫu (đang mở · quá hạn · chờ xác nhận) => mẫu, không tự tra
    expect(doc('vướng mắc đang mở').thua).toEqual([]);
    expect(tuTra('vướng mắc đang mở')).toBe(false);
    // "đang xử lý" / "chưa xử lý" vẫn là giá trị cố định của cột (không đổi)
    expect(doc('vướng mắc đang xử lý theo công trình').tv.loc).toEqual([{ cot: 'status', op: 'bang', gt: 'Đang xử lý' }]);
    expect(doc('vướng mắc chưa xử lý theo xưởng').tv.loc).toEqual([{ cot: 'is_resolved', op: 'bang', gt: 'Chưa xử lý' }]);
  });
  it('mẫu: "hex … đang ở công đoạn nào" (tra HEX), "chỗ nào có vấn đề" (vướng mắc); "sl công nhân đi làm hôm nay" tự tra điểm danh', () => {
    expect(nenTuTra(hieuCauHoi('hex 250700123 đang ở cong đoạn nào', H), doc('hex 250700123 đang ở cong đoạn nào'), true)).toBe(false);
    expect(nenTuTra(hieuCauHoi('chỗ nào có vấn đề', H), doc('chỗ nào có vấn đề'), true)).toBe(false);
    expect(nenTuTra(hieuCauHoi('CT25-070 tổng đơn bao nhiêu, nhập kho được bao nhiêu rồi?', H), doc('CT25-070 tổng đơn bao nhiêu, nhập kho được bao nhiêu rồi?'), true)).toBe(false);
    const cn = doc('sl cong nhan di lam hom nay');
    expect(cn.tv).toMatchObject({ bang: 'diem_danh', tu: '2026-10-19', den: '2026-10-19' });
    expect(nenTuTra(hieuCauHoi('sl cong nhan di lam hom nay', H), cn, true)).toBe(true);
  });
  it('hai nghĩa thật => hỏi lại 2 cách hiểu, không đoán: "khách hàng nào lớn nhất", "4A đang kẹt gì"', () => {
    const kh = doc('khách hàng nào lớn nhất năm nay');
    expect(kh.moHo?.[0].chu).toBe('lớn nhất');
    expect(kh.moHo?.[0].lua).toHaveLength(2);
    expect(doc(kh.moHo![0].lua[0].cau).tv).toMatchObject({ bang: 'nhap_kho', nhom: ['sx:khach_hang'], tu: '2026-01-01', den: '2026-10-19' });
    const ket = doc('xuong 4A dang ket gi');
    expect(ket.moHo?.[0].lua.map(l => l.cau)).toEqual(['vướng mắc chưa xử lý xưởng 4A', 'điểm nghẽn xưởng 4A']);
    expect(ket.thua).toEqual([]);
    // chỉ số nói rõ thì không hỏi
    expect(doc('khách hàng nào có giá trị còn lại lớn nhất top 5').moHo).toBeUndefined();
  });
  it('câu dự báo / có kịp không: báo không trả lời được (còn chữ "du bao")', async () => {
    const { laCauTaiSao, laCauDuBao, cauSoLieuCua } = await import('./hieuTruyVan');
    expect(doc('dự báo tháng 11 có đạt kế hoạch không').thua).toContain('du bao');
    expect(laCauTaiSao('dự báo tháng 11 có đạt kế hoạch không')).toBe(true);
    expect(laCauDuBao('CT25-070 có kịp giao không')).toBe(true);
    expect(laCauDuBao('tháng này nhập được bao nhiêu')).toBe(false);
    expect(cauSoLieuCua('dự báo tháng 11 có đạt kế hoạch không')).toBe('tháng 11 có đạt kế hoạch không');
  });
});

describe('câu hỏi "tại sao"', () => {
  it('nhận ra câu hỏi lý do; "sao rồi" không phải', async () => {
    const { laCauTaiSao, cauSoLieuCua } = await import('./hieuTruyVan');
    expect(laCauTaiSao('sao tháng này nhập ít vậy')).toBe(true);
    expect(laCauTaiSao('tại sao xuất kho giảm')).toBe(true);
    expect(laCauTaiSao('4A tháng này sao rồi')).toBe(false);
    expect(laCauTaiSao('CT25-070 sao rồi')).toBe(false);
    expect(cauSoLieuCua('sao tháng này nhập ít vậy')).toBe('tháng này nhập');
    expect(cauSoLieuCua('tại sao xuất kho giảm')).toBe('xuất kho');
    // câu số liệu liên quan đọc được
    expect(hieu('tháng này nhập so với tháng trước').tv).toMatchObject({ bang: 'nhap_kho', tu: '2026-10-01', soSanh: { tu: '2026-09-01' } });
  });
});

describe('vòng 1 rà soát: kế hoạch (cụm 3) — bảng kế hoạch theo kỳ, KH-TH, BOT, "tháng sau"', () => {
  const td = tdMau as unknown as TuDien;
  const doc = (s: string) => hieuTruyVan(s, dm, H, td)!;
  const tuTra = (s: string) => nenTuTra(hieuCauHoi(s, H), hieuTruyVan(s, dm, H, td), true);
  const chuoi = (...cau: string[]) => {
    let ngu: NguCanh | null = null;
    let cuoi = null as ReturnType<typeof apNguCanh> | null;
    cau.forEach(s => {
      cuoi = apNguCanh(hieuTruyVan(s, dm, H, td), ngu, dm, s, H, td);
      const moi = nguCanhSau(s, hieuCauHoi(s, H), cuoi.h);
      if (moi) ngu = moi;
    });
    return cuoi!;
  };
  it('"kế hoạch" + kỳ tháng / tuần = bảng kế hoạch trọn kỳ; tháng chưa tới thì tự tra, tháng này / tuần N vẫn là câu trả lời mẫu', () => {
    const t11 = doc('kế hoạch tháng 11 bao nhiêu');
    expect(t11.tv).toMatchObject({ bang: 'khsx', tu: '2026-11-01', den: '2026-11-30' });
    expect(t11.thua).toEqual([]);
    expect(tuTra('kế hoạch tháng 11 bao nhiêu')).toBe(true);
    expect(tuTra('kế hoạch tháng 10')).toBe(false);
    expect(tuTra('kế hoạch tuần 42')).toBe(false);
    expect(tuTra('kế hoạch tuần này của 8AB')).toBe(false);
    expect(doc('công trình nào có kế hoạch tuần này').tv).toMatchObject({ bang: 'khsx', nhom: ['ten_cong_trinh'], tu: '2026-10-19', den: '2026-10-25' });
    // kỳ nói trước "có kế hoạch nhập kho" => vẫn là bảng kế hoạch của kỳ đó, không phải hạng mục "có kế hoạch"
    expect(doc('tháng 11 có kế hoạch nhập kho những công trình nào').tv).toMatchObject({ bang: 'khsx', nhom: ['ten_cong_trinh'], loc: [], tu: '2026-11-01' });
    expect(doc('kh thang 10 theo ct').tv).toMatchObject({ bang: 'khsx', nhom: ['ten_cong_trinh'], tu: '2026-10-01', den: '2026-10-31' });
    expect(doc('kế hoạch tháng 11 của tây hồ view').tv).toMatchObject({ bang: 'khsx', loc: [{ cot: 'ten_cong_trinh', op: 'chua', gt: 'tây hồ view' }] });
    // "không có kế hoạch" vẫn là khái niệm của hạng mục
    expect(doc('có bao nhiêu hạng mục không có kế hoạch').tv.bang).toBe('production_status_app');
  });
  it('"kế hoạch nhập kho tháng này", "tuần 43 xưởng 8AB phải nhập bao nhiêu": gọi rõ bảng kế hoạch => tự tra, không dùng mẫu nhập kho', () => {
    expect(doc('kế hoạch nhập kho tháng này').tv).toMatchObject({ bang: 'khsx', tu: '2026-10-01', den: '2026-10-31' });
    expect(tuTra('kế hoạch nhập kho tháng này')).toBe(true);
    // câu trần tháng đã qua: trọn tháng 9 (máy chủ lấy KH THÁNG — đối chiếu trang Kế hoạch nhập kho 161,01 tỷ), không phải mẫu nhập kho tháng 9
    const t9 = doc('kế hoạch nhập kho tháng 9');
    expect(t9.tv).toMatchObject({ bang: 'khsx', loc: [], tu: '2026-09-01', den: '2026-09-30' });
    expect(t9.thua).toEqual([]);
    expect(tuTra('kế hoạch nhập kho tháng 9')).toBe(true);
    expect(tuTra('kế hoạch nhập kho tháng 9 theo xưởng')).toBe(true);
    const pn = doc('tuần 43 xưởng 8AB phải nhập bao nhiêu');
    expect(pn.tv).toMatchObject({ bang: 'khsx', loc: [{ cot: 'xuong_chinh', op: 'bang', gt: ['8AB'] }], tu: '2026-10-19', den: '2026-10-25' });
    expect(tuTra('tuần 43 xưởng 8AB phải nhập bao nhiêu')).toBe(true);
    // "còn phải nhập" = còn lại, không phải kế hoạch
    expect(doc('CT25-070 còn phải nhập bao nhiêu').tv.bang).not.toBe('khsx');
    // câu trả lời mẫu dòng chảy vẫn giữ khi bảng đúng
    expect(tuTra('nhập kho tuần này')).toBe(false);
    expect(tuTra('260816258 nhập kho chưa')).toBe(false);
  });
  it('"tháng sau thì sao" / "tháng sau kế hoạch bao nhiêu": kỳ kế tiếp trọn tháng, giữ chia nhóm / công trình câu trước', () => {
    const a = chuoi('kế hoạch nhập kho tháng này', 'theo xưởng đi', 'tháng sau thì sao').h!;
    expect(a.tv).toMatchObject({ bang: 'khsx', nhom: ['xuong_chinh'], tu: '2026-11-01', den: '2026-11-30' });
    expect(a.thua).toEqual([]);
    const b = chuoi('kế hoạch nhập kho tháng này của emerald raiya', 'thực tế nhập được bao nhiêu rồi', 'tháng sau kế hoạch bao nhiêu').h!;
    expect(b.tv).toMatchObject({ bang: 'khsx', loc: [{ cot: 'ten_cong_trinh', op: 'chua', gt: 'emerald raiya' }], tu: '2026-11-01', den: '2026-11-30' });
    expect(b.thua).toEqual([]);
  });
  it('KH-TH: "so với kế hoạch", "đạt bao nhiêu % kế hoạch", "vượt / nhập kho ngoài kế hoạch", "đúng kế hoạch hay rớt"', () => {
    const so = doc('nhập kho thực tế so với kế hoạch tháng 9 ntn');
    expect(so.tv).toMatchObject({ bang: 'phan_tich_kh_th', tu: '2026-09-01', den: '2026-09-30' });
    expect(so.tv.do).toContainEqual({ ham: 'tong', cot: 'nhap_kho_tuan' });
    expect(so.thua).toEqual([]);
    expect(tuTra('nhập kho thực tế so với kế hoạch tháng 9 ntn')).toBe(true);
    expect(doc('nk thang nay dat bn % ke hoach').tv).toMatchObject({ bang: 'phan_tich_kh_th', tu: '2026-10-01', den: '2026-10-31' });
    expect(doc('vượt kế hoạch tuần 41 bao nhiêu').tv).toMatchObject({ bang: 'phan_tich_kh_th', do: [{ ham: 'tong', cot: 'vuot_ke_hoach' }], tu: '2026-10-05', den: '2026-10-11' });
    expect(doc('nhập kho ngoài kế hoạch tháng 9 theo công trình').tv).toMatchObject({ bang: 'phan_tich_kh_th', do: [{ ham: 'tong', cot: 'nhap_kho_ngoai_ke_hoach' }], nhom: ['ten_cong_trinh'] });
    expect(doc('ti le dat ke hoach tuan truoc').tv.do).toContainEqual({ ham: 'tong', cot: 'dung_ke_hoach' });
    // "hạng mục ngoài kế hoạch" vẫn là hạng mục không có KH
    expect(doc('bao nhiêu hạng mục ngoài kế hoạch').tv.bang).toBe('production_status_app');
    const hay = doc('CT26-110 tuần trước đúng kế hoạch hay rớt').tv;
    expect(hay).toMatchObject({ bang: 'phan_tich_kh_th', nhom: ['tinh_trang_thuc_hien_ke_hoach'], tu: '2026-10-12', den: '2026-10-18' });
    expect(hay.loc).toEqual([{ cot: 'ten_cong_trinh', op: 'chua', gt: ['CT26-110'] }]);
    // "đạt kế hoạch chưa" vẫn là câu trả lời mẫu kế hoạch tuần; câu kỳ NĂM ("năm nay còn thiếu … so với kế hoạch",
    // "doanh thu năm nay đạt bao nhiêu kế hoạch") vẫn là mẫu tiến độ năm, không phải KH-TH
    expect(tuTra('tuần này đạt kế hoạch chưa')).toBe(false);
    expect(tuTra('năm nay còn thiếu bao nhiêu so với kế hoạch')).toBe(false);
    expect(tuTra('doanh thu năm nay đạt bao nhiêu kế hoạch')).toBe(false);
    expect(doc('doanh thu năm nay đạt bao nhiêu kế hoạch').tv.bang).not.toBe('phan_tich_kh_th');
    // "dữ LIỆU kế hoạch năm" không phải câu "liệu có đạt" (dự báo)
    expect(doc('dữ liệu kế hoạch năm theo xưởng').thua).toEqual([]);
  });
  it('BOT: "quá hạn BOT" = nhóm 1; "phải nhập trong 2 tuần tới" = nhóm 2 (không phải "2 TUẦN" ở công đoạn)', () => {
    const qh = doc('CT25-070 có bao nhiêu hạng mục quá hạn BOT').tv;
    expect(qh.loc).toEqual([{ cot: 'nhom_bot', op: 'bang', gt: ['1. Quá hạn KH'] }, { cot: 'ten_cong_trinh', op: 'chua', gt: ['CT25-070'] }]);
    expect(qh.nhom).toEqual([]);
    expect(chuoi('CT25-070 có bao nhiêu hạng mục quá hạn BOT', 'liệt kê ra', 'xưởng nào nhiều nhất').h!.tv).toMatchObject({ kieu: 'tong', nhom: ['xuong_chinh'], loc: qh.loc });
    const pn = doc('hang 4A phai nhap trong 2 tuan toi');
    expect(pn.tv).toMatchObject({ bang: 'production_status_app', loc: [{ cot: 'nhom_bot', op: 'bang', gt: ['2. ≤ 14 ngày'] }, { cot: 'xuong_chinh', op: 'bang', gt: ['4A'] }] });
    expect(pn.tv.tu).toBeUndefined();
    expect(pn.thua).toEqual([]);
  });
});

describe('vòng 1 rà soát: khái niệm (cụm 4) — chọn bảng & cột theo cách nói nghiệp vụ', () => {
  const td = tdMau as unknown as TuDien;
  const doc = (s: string) => hieuTruyVan(s, dm, H, td)!;
  it('"chưa triển khai BẢN VẼ" = cột tình trạng bản vẽ của hạng mục (thắng tên bảng triển khai bản vẽ); "chưa triển khai" vẫn là công đoạn', () => {
    const bv = { cot: 'tinh_trang_trien_khai_ban_ve', op: 'bang', gt: ['CHƯA TRIỂN KHAI'] };
    expect(doc('còn bao nhiêu hạng mục chưa triển khai bản vẽ').tv).toMatchObject({ bang: 'production_status_app', do: [{ ham: 'dem' }], loc: [bv] });
    expect(doc('ban ve chua trien khai cua 3A con may cai').tv).toMatchObject({ bang: 'production_status_app', loc: [bv, { cot: 'xuong_chinh', op: 'bang', gt: ['3A'] }] });
    expect(doc('ban ve chua trien khai cua 3A con may cai').tv.tu).toBeUndefined();
    expect(doc('có bao nhiêu hạng mục chưa triển khai').tv.loc).toEqual([{ cot: 'tinh_trang', op: 'bang', gt: ['15. CHƯA TRIỂN KHAI'] }]);
  });
  it('bảng dòng chảy gọi tên + khái niệm / cột số của hạng mục => hạng mục: "đơn nào sắp đến hạn giao", "trị giá đơn còn lại", "xuất kho lũy kế" của 1 công trình', () => {
    const don = doc('đơn nào sắp đến hạn giao mà chưa nhập kho');
    expect(don.tv).toMatchObject({ bang: 'production_status_app', kieu: 'dong' });
    expect(don.tv.loc.map(l => l.cot)).toEqual(['ngay_can_giao', 'gia_tri_con_lai']);
    expect(don.thua).toEqual([]);
    expect(doc('đơn hàng quá hạn giao').tv).toMatchObject({ bang: 'production_status_app', loc: [{ cot: 'ngay_can_giao', op: 'nho_hon', gt: '2026-10-19' }, { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }] });
    const cl = doc('trị giá đơn còn lại của PM LÊ MINH TUẤN').tv;
    expect(cl.bang).toBe('production_status_app');
    expect(cl.do).toContainEqual({ ham: 'tong', cot: 'gia_tri_con_lai' });
    expect(cl.loc).toEqual([{ cot: 'ten_pm', op: 'bang', gt: ['LÊ MINH TUẤN'] }]);
    // tên bảng dòng chảy + cột chữ nối qua HEX ("khách hàng") vẫn là bảng dòng chảy
    expect(doc('tháng 10 xuất cho khách bao nhiêu, theo khách hàng').tv.bang).toBe('xuat_kho');
    expect(doc('hạng mục nào của CT26-041 đã xuất kho tháng 9').tv.bang).toBe('xuat_kho');
    const lk = doc('capella xuất kho lũy kế bao nhiêu rồi').tv;
    expect(lk).toMatchObject({ bang: 'production_status_app', do: [{ ham: 'tong', cot: 'thanh_tien_xuat_kho_luy_ke' }], loc: [{ cot: 'ten_cong_trinh', op: 'chua', gt: 'capella' }] });
    expect(lk.tu).toBeUndefined();
    expect(doc('nhập kho lũy kế').tv).toMatchObject({ bang: 'nhap_kho', tu: '2026-01-01', den: '2026-10-19' });
  });
  it('thời gian ở công đoạn "hơn N tuần" = các bậc ≥ N+1; tồn "trên 1 năm" = > 12 tháng; PR "quá 30 ngày rồi" = tuổi PR', () => {
    const cd = doc('hạng mục nào ở 8AB nằm ở công đoạn hơn 4 tuần rồi').tv;
    expect(cd).toMatchObject({ kieu: 'dong', loc: [{ cot: 'so_ngay_cd_hien_tai', op: 'bang', gt: ['5 TUẦN', '6 TUẦN', '7 TUẦN', 'TỪ 8 TUẦN TRỞ LÊN'] }, { cot: 'xuong_chinh', op: 'bang', gt: ['8AB'] }] });
    expect(cd.tu).toBeUndefined();
    expect(doc('hm nào của CT24-066 nằm ở công đoạn trên 8 tuần rồi').tv.loc).toContainEqual({ cot: 'so_ngay_cd_hien_tai', op: 'bang', gt: ['TỪ 8 TUẦN TRỞ LÊN'] });
    const ton = doc('ad ơi hàng tồn lâu trên 1 năm còn bao nhiêu');
    expect(ton.tv).toMatchObject({ bang: 'ton_kho', kieu: 'tong', loc: [{ cot: 'so_thang_ton_kho', op: 'lon_hon', gt: 12 }] });
    expect(ton.thua).toEqual([]);
    expect(doc('hàng tồn lâu nhất').tv.kieu).toBe('dong');
    const pr = doc('PR chưa mua quá 30 ngày rồi').tv;
    expect(pr.loc).toEqual(expect.arrayContaining([{ cot: 'ngay_pr', op: 'nho_hon', gt: '2026-09-19' }, { cot: 'trang_thai', op: 'bang', gt: ['1.CHƯA MUA'] }]));
    expect(pr.tu).toBeUndefined();
  });
  it('"xuất bao nhiêu phiếu" = đếm số phiếu xuất; "sl còn thiếu" = cộng cột còn thiếu; "định biên" = trung bình; "hạn giao gần nhất" = sớm nhất còn lại', () => {
    expect(doc('tuần 41 xuất bao nhiêu phiếu').tv).toMatchObject({ bang: 'xuat_kho', do: [{ ham: 'dem_khac', cot: 'so_phieu' }], tu: '2026-10-05', den: '2026-10-11' });
    expect(doc('sl còn thiếu của vật tư da').tv).toMatchObject({ bang: 'vat_tu', do: [{ ham: 'tong', cot: 'so_luong_con_lai' }], loc: [{ cot: 'nhom_vt', op: 'bang', gt: ['107 - Da'] }] });
    expect(doc('xưởng 5A định biên bao nhiêu người').tv.do).toEqual([{ ham: 'tb', cot: 'dinh_bien' }]);
    const hg = doc('CT25-070 hạn giao gần nhất là khi nào').tv;
    expect(hg.do).toEqual([{ ham: 'min', cot: 'ngay_can_giao' }]);
    expect(hg.loc).toContainEqual({ cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 });
    const sx = doc('khách hàng SUN GROUP còn bao nhiêu hạng mục đang sản xuất').tv;
    expect(sx.loc).toEqual(expect.arrayContaining([{ cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }, { cot: 'khach_hang', op: 'bang', gt: ['SUN GROUP'] }]));
    expect(sx.do).toContainEqual({ ham: 'dem' });
  });
  it('"kẹt ở mộc" = đang ở công đoạn (không còn chữ chưa hiểu); "đang kẹt gì" vẫn hỏi lại; "PR trễ hẹn còn bao nhiêu dòng" tự tra đếm dòng', () => {
    const ket = doc('công trình nào đang kẹt ở mộc nhiều nhất');
    expect(ket.tv).toMatchObject({ nhom: ['ten_cong_trinh'], loc: [{ cot: 'tinh_trang', op: 'bang', gt: ['05. MỘC'] }] });
    expect(ket.thua).toEqual([]);
    expect(ket.moHo).toBeUndefined();
    expect(doc('xuong 4A dang ket gi').moHo).toHaveLength(1);
    const pr = doc('PR trễ hẹn còn bao nhiêu dòng');
    expect(pr.tv).toMatchObject({ bang: 'vat_tu', do: [{ ham: 'dem' }] });
    expect(pr.thua).toEqual([]);
    expect(nenTuTra(hieuCauHoi('PR trễ hẹn còn bao nhiêu dòng', H), pr, true)).toBe(true);
  });
  it('"chỉ tiêu nhập kho tuần 43 của 8AB" = kế hoạch tuần 43 (không còn chữ chưa hiểu, tự tra); "chỉ tiêu" lẻ vẫn là mẫu tiến độ năm', () => {
    const ct = doc('chỉ tiêu nhập kho tuần 43 của 8AB');
    expect(ct.tv).toMatchObject({ bang: 'khsx', loc: [{ cot: 'xuong_chinh', op: 'bang', gt: ['8AB'] }], tu: '2026-10-19', den: '2026-10-25' });
    expect(ct.thua).toEqual([]);
    expect(nenTuTra(hieuCauHoi('chỉ tiêu nhập kho tuần 43 của 8AB', H), ct, true)).toBe(true);
    // không có xưởng: chữ "chỉ tiêu" là của mẫu tiến độ năm, nhưng hỏi kế hoạch tuần => vẫn tự tra bảng kế hoạch
    const tn = doc('chỉ tiêu nhập kho tuần này');
    expect(tn.tv.bang).toBe('khsx');
    expect(nenTuTra(hieuCauHoi('chỉ tiêu nhập kho tuần này', H), tn, true)).toBe(true);
    expect(doc('chỉ tiêu quý 4').tv).toMatchObject({ bang: 'khsx', tu: '2026-10-01', den: '2026-12-31' });
    // không kèm tuần / tháng: chỉ tiêu = kế hoạch năm, câu trả lời mẫu tiến độ năm làm được (không còn chữ "tiêu" chưa hiểu)
    const nam = 'chỉ tiêu năm nay còn thiếu bao nhiêu';
    expect(doc(nam).tv.bang).toBe('khsx_nam');
    expect(nenTuTra(hieuCauHoi(nam, H), doc(nam), true)).toBe(false);
  });
});
