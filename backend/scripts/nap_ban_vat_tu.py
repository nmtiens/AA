"""Nạp dữ liệu trang "Bán vật tư tồn kho" (/ban-vat-tu) vào DB: ban_vt_ton + ban_vt_master.

Nguồn:
  --ton     "BC ton kho vat tu dd.mm.yyyy.xlsx", sheet "Chi tiet tong ton kho" (1 dòng / mã + kho).
            Mặc định: file mới nhất THEO NGÀY TRONG TÊN ở thư mục THU_MUC_TON bên dưới.
  --master  MASTER DATA VẬT TƯ.xlsx (ZMM60, sheet Data): tên, đvt, nhóm SAP, loại, giá bình quân, màu, xuất xứ.
  --demo    file DEMO (tuỳ chọn): sheet DATA_ZMM60 bù mã master thiếu; sheet MD_MATERIAL_PROPERTIES thuộc tính MP00–MP99.
Đích: bảng tạo bằng backend/sql/2026-11-14_ban_vat_tu_ton.sql (người dùng tự chạy file SQL đó trước).

- MẶC ĐỊNH CHẠY KHÔ: chỉ đọc file + in thống kê (số dòng / mã, tổng triệu đồng, % khớp master, % có thuộc tính),
  KHÔNG kết nối DB. Thêm --ghi mới ghi: XOÁ HẾT ban_vt_ton + ban_vt_master rồi ghi lại trong 1 giao dịch
  (lỗi giữa chừng => dữ liệu cũ giữ nguyên), rồi bump table_versions('ban_vt') để cache API tính lại.
  Bảng ban_vt_thong_tin (giá bán / ảnh người dùng nhập) KHÔNG bị đụng.
- Mã vật tư đọc dạng CHUỖI, giữ nguyên (mã 11 số là mã thật — không thêm số 0). Bỏ dòng trống / dòng tổng.
- Total Value của file là ĐỒNG (cột Crcy = VND) => gia_tri lưu TRIỆU ĐỒNG (/1e6). Ô G3 (tổng lọc còn sót) bỏ qua.
- Ngày chốt lấy từ tên file (dd.mm.yyyy); tên file không có ngày thì phải truyền --ngay-chot YYYY-MM-DD.
- Ngày nhập 30/09/2024 = ngày chuyển SAP: lưu nguyên (giao diện hiện "từ trước 10/2024").
- ban_vt_master chỉ giữ các mã đang có trong file tồn (bảng nhỏ, DB gói free). Mã tồn không có ở master / DEMO
  vẫn có 1 dòng nguon='SUY_TEN' (ten_master = tên trong file tồn) để mang thuộc tính suy từ tên.
- Cột suy_tu_ten (JSONB, backend/sql/2026-11-15_ban_vat_tu_bo_sung.sql): thuộc tính TÁCH TỪ TÊN (scripts/tach_thuoc_tinh.py)
  CHỈ cho trường master đang trống — khoá chung_loai, quy_cach, mau, ma_mau, thuong_hieu, chat_lieu. KHÔNG đè ZMM60 / MD.
- Quy cách vít / bu lông dựng từ MP23/MP24 bị đảo ("VÍT INOX 5X25MM" ghi Dài 5 × ĐK 25) được sửa thành "ĐK 5 × Dài 25"
  khi chắc chắn (tach_thuoc_tinh.sua_quy_cach_ren); thuoc_tinh MPxx gốc giữ nguyên. Thống kê in số mã đã sửa.
- --tra-cuu <file> (mặc định TRA_CUU_THUOC_TINH_VAT_TU.xlsx cạnh file DEMO nếu có; scripts/tra_thuoc_tinh.py tạo):
  dòng DUYỆT = X được dùng NHƯ 1 DÒNG MD_MATERIAL_PROPERTIES cho mã CHƯA có dòng MD; dòng chưa duyệt bỏ qua.
  Mã được bù mang thêm khoá thuoc_tinh "NGUỒN THUỘC TÍNH" = "AI TRA CỨU (ĐÃ DUYỆT)" để về sau biết thuộc tính do AI tra.
  16/11/2026: --tra-cuu lặp được (nhiều file, nạp theo thứ tự); mặc định cả TRA_CUU_THUOC_TINH_VAT_TU.xlsx rồi
  TRA_CUU_PHIEU_ANH_VAT_TU.xlsx (tra_thuoc_tinh.py --doc-phieu-anh) nếu có — file sau chỉ bù ô còn trống.
- Đọc Excel bằng python-calamine (file DEMO > 400 MB, openpyxl quá chậm): pip install python-calamine

Cách chạy (từ thư mục backend):
  python scripts/nap_ban_vat_tu.py                                   # chạy khô với file mặc định
  python scripts/nap_ban_vat_tu.py --ton "<BC...xlsx>" --master "<MASTER...xlsx>" --demo "<DEMO.xlsx>"
  python scripts/nap_ban_vat_tu.py --demo "<DEMO.xlsx>" --ghi         # ghi DB thật
DATABASE_URL lấy từ biến môi trường, không có thì đọc backend/.env.
"""
import argparse, datetime, json, os, random, re, sys, time, unicodedata
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')
sys.dont_write_bytecode = True  # không để lại __pycache__ trong repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tach_thuoc_tinh as tach  # noqa: E402
import tra_thuoc_tinh as tra  # noqa: E402

GOC = r'G:\Shared drives\PPD-Production Planning Department\000_MASTER_DATA'
THU_MUC_TON = os.path.join(GOC, r'13_TON_KHO_VAT_TU\01_DATA_TON_KHO_VAT_TU')
FILE_MASTER = os.path.join(GOC, r'18_ZMM60\MASTER DATA VẬT TƯ.xlsx')
# File DEMO của MR_NHA (người dùng chỉ ngày 14/11/2026) — thuộc tính MPxx + DATA_ZMM60 bù mã
FILE_DEMO = (r'G:\Shared drives\PPD-Production Planning Department\003_PERSONAL\02_MR_NHA\02_BÁO CÁO'
             r'\01_BÁO CÁO KHÁC\DEMO_BÁO CÁO VẬT TƯ.xlsx')
# kết quả điền thuộc tính bằng AI (scripts/tra_thuoc_tinh.py; mặc định KHÔNG tra web — NGUỒN 'AI (không tra web)'),
# người dùng duyệt X
FILE_TRA_CUU = tra.FILE_KQ
# kết quả đọc phiếu + ảnh (tra_thuoc_tinh.py --doc-phieu-anh) — nạp SAU file thuộc tính, chỉ bù ô còn trống
FILE_TRA_CUU_PHIEU = tra.FILE_PHIEU
SHEET_TON = 'Chi tiet tong ton kho'
TEN_TON = re.compile(r'^BC ton kho vat tu .*\.xlsx$', re.I)
NGAY_TEN = re.compile(r'(\d{1,2})\.(\d{1,2})\.(\d{4})')
NGAY_CHUYEN_SAP = datetime.date(2024, 9, 30)
EXCEL_GOC = datetime.date(1899, 12, 30)


# ---------------------------------------------------------------- tiện ích đọc ô
def chuan(v):
    """Tiêu đề chuẩn hoá: NFC, bỏ khoảng trắng thừa, chữ hoa."""
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(v if v is not None else ''))).strip().upper()


def chu(v):
    """Giá trị ô -> chuỗi gọn ('' nếu trống); số nguyên dạng float bỏ '.0'."""
    if v is None:
        return ''
    if isinstance(v, bool):
        return 'X' if v else ''
    if isinstance(v, float):
        if v != v:  # NaN
            return ''
        if v.is_integer():
            return str(int(v))
        return f'{v:.10g}'
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%d/%m/%Y')
    return unicodedata.normalize('NFC', str(v)).strip()


def ma(v):
    """Mã vật tư dạng chuỗi giữ nguyên (không zfill)."""
    s = chu(v)
    return s[:-2] if s.endswith('.0') and s[:-2].isdigit() else s


def so(v):
    if v is None or v == '':
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return None if v != v else float(v)
    s = str(v).strip().replace(',', '')
    try:
        return float(s)
    except ValueError:
        return None


def ngay(v):
    if v is None or v == '':
        return None
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    if isinstance(v, (int, float)):
        return EXCEL_GOC + datetime.timedelta(days=int(v)) if 1 < v < 100000 else None
    s = str(v).strip()
    for f in ('%d/%m/%Y', '%Y-%m-%d', '%d.%m.%Y', '%d-%m-%Y', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.datetime.strptime(s, f).date()
        except ValueError:
            pass
    return None


def ten_ct(v):
    """Tên công trình: bỏ khoảng trắng thừa từng dòng, giữ xuống dòng (1 ô ghi nhiều công trình)."""
    dong = [re.sub(r'[ \t]+', ' ', x).strip() for x in chu(v).splitlines()]
    return '\n'.join(x for x in dong if x)


def doc_sheet(duong_dan, ten_sheet):
    try:
        from python_calamine import CalamineWorkbook
    except ImportError:
        raise SystemExit('Thiếu thư viện: pip install python-calamine')
    wb = CalamineWorkbook.from_path(duong_dan)
    ten = next((s for s in wb.sheet_names if s.strip().lower() == ten_sheet.lower()), None)
    if not ten:
        raise SystemExit(f'"{os.path.basename(duong_dan)}" không có sheet "{ten_sheet}" (có: {wb.sheet_names})')
    return wb.get_sheet_by_name(ten).to_python(skip_empty_area=False)


def dong_tieu_de(rows, *can, toi_da=15):
    """Chỉ số dòng tiêu đề = dòng đầu (trong `toi_da` dòng) chứa đủ các ô `can` (đã chuẩn hoá)."""
    for i, r in enumerate(rows[:toi_da]):
        o = {chuan(v) for v in r}
        if all(c in o for c in can):
            return i
    raise SystemExit(f'Không thấy dòng tiêu đề có {can}')


def tim_cot(hdr, *tien_to, bat_buoc=True):
    """Cột đầu tiên có tiêu đề (chuẩn hoá) bằng hoặc bắt đầu bằng 1 trong các tiền tố."""
    h = [chuan(v) for v in hdr]
    for t in tien_to:
        t = chuan(t)
        for j, x in enumerate(h):  # khớp đúng trước, rồi mới tới khớp đầu chuỗi
            if x == t:
                return j
        for j, x in enumerate(h):
            if x.startswith(t):
                return j
    if bat_buoc:
        raise SystemExit(f'Không thấy cột {tien_to}')
    return None


def o(r, j):
    return r[j] if j is not None and j < len(r) else None


# ---------------------------------------------------------------- file tồn
def file_ton_moi_nhat(thu_muc):
    ds = []
    for t in os.listdir(thu_muc):
        if t.startswith('~$') or not TEN_TON.match(t):
            continue
        m = NGAY_TEN.search(t)
        if m:
            try:
                ds.append((datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1))), t))
            except ValueError:
                pass
    if not ds:
        raise SystemExit(f'Không có file "BC ton kho vat tu dd.mm.yyyy.xlsx" trong {thu_muc}')
    return os.path.join(thu_muc, max(ds)[1])


def ngay_tu_ten(duong_dan):
    m = NGAY_TEN.search(os.path.basename(duong_dan))
    if not m:
        return None
    try:
        return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def doc_ton(duong_dan, ngay_chot):
    rows = doc_sheet(duong_dan, SHEET_TON)
    i = dong_tieu_de(rows, 'MATERIAL', 'SLOC NAME')
    hdr = rows[i]
    c = dict(
        ma=tim_cot(hdr, 'Material'), ten=tim_cot(hdr, 'Material Description'), kho=tim_cot(hdr, 'Sloc name'),
        sl=tim_cot(hdr, 'Unrestricted'), dvt=tim_cot(hdr, 'BUn'), gt=tim_cot(hdr, 'Total Value'),
        tien=tim_cot(hdr, 'Crcy', bat_buoc=False), ngay=tim_cot(hdr, 'Ngày nhập kho gần nhất'),
        clc=tim_cot(hdr, 'Chậm luân chuyển'), ten_ct=tim_cot(hdr, 'Tên CT'), ma_ct=tim_cot(hdr, 'Mã CT'),
    )
    out, bo, tien_te = [], Counter(), Counter()
    for r in rows[i + 1:]:  # các dòng trên tiêu đề (ô G3 tổng lọc, tên nhóm kho) bỏ qua
        m = ma(o(r, c['ma']))
        if not m:
            bo['trống'] += 1
            continue
        if not m[0].isdigit():  # dòng tổng / ghi chú
            bo[f'không phải mã: {m[:30]}'] += 1
            continue
        tt = chu(o(r, c['tien'])).upper()
        tien_te[tt or '(trống)'] += 1
        gt = so(o(r, c['gt']))
        out.append(dict(
            ma_vat_tu=m, ten_vat_tu=chu(o(r, c['ten'])) or None, dvt=chu(o(r, c['dvt'])) or None,
            so_luong=so(o(r, c['sl'])), gia_tri=None if gt is None else gt / 1e6,
            kho=chu(o(r, c['kho'])) or None, ngay_nhap_kho_gan_nhat=ngay(o(r, c['ngay'])),
            cham_luan_chuyen=chu(o(r, c['clc'])).upper() == 'X', ten_cong_trinh=ten_ct(o(r, c['ten_ct'])) or None,
            ma_cong_trinh=chu(o(r, c['ma_ct'])) or None, ngay_chot=ngay_chot,
            nguon_file=os.path.basename(duong_dan),
        ))
    khac_vnd = {k: v for k, v in tien_te.items() if k not in ('VND', '(trống)')}
    if khac_vnd:
        raise SystemExit(f'Cột Crcy có đơn vị khác VND: {khac_vnd} — không đổi sang triệu đồng được')
    return out, bo


# ---------------------------------------------------------------- master + demo
def doc_master(duong_dan):
    rows = doc_sheet(duong_dan, 'Data')
    i = dong_tieu_de(rows, 'MATERIAL NUMBER/ MÃ VẬT TƯ')
    hdr = rows[i]
    c = dict(
        ma=tim_cot(hdr, 'Material Number'), ten=tim_cot(hdr, 'Material Des. (Short Text)'),
        dvt=tim_cot(hdr, 'Base Unit of Measure'), nhom=tim_cot(hdr, 'Material Group/'),
        ten_nhom=tim_cot(hdr, 'Material Group Description'), loai=tim_cot(hdr, 'Material Type Des.'),
        gia=tim_cot(hdr, 'Periodic unit price'), pu=tim_cot(hdr, 'Price unit/'),
        mau=tim_cot(hdr, 'Color/', bat_buoc=False), xx=tim_cot(hdr, 'Country Origin', bat_buoc=False),
    )
    out = {}
    for r in rows[i + 1:]:
        m = ma(o(r, c['ma']))
        if not m or m in out:
            continue
        out[m] = dict(
            ten_master=chu(o(r, c['ten'])) or None, dvt=chu(o(r, c['dvt'])) or None,
            nhom_sap=chu(o(r, c['nhom'])) or None, ten_nhom_sap=chu(o(r, c['ten_nhom'])) or None,
            loai_vat_tu=chu(o(r, c['loai'])) or None, gia_binh_quan=so(o(r, c['gia'])),
            price_unit=so(o(r, c['pu'])), mau=chu(o(r, c['mau'])) or None, xuat_xu=chu(o(r, c['xx'])) or None,
        )
    return out


def doc_demo_zmm60(duong_dan):
    rows = doc_sheet(duong_dan, 'DATA_ZMM60')
    i = dong_tieu_de(rows, 'MATERIAL NUMBER/ MÃ VẬT TƯ')
    hdr = rows[i]
    c = dict(ma=tim_cot(hdr, 'Material Number'), ten=tim_cot(hdr, 'Material Des. (Short Text)'),
             nhom=tim_cot(hdr, 'Material Group/'), ten_nhom=tim_cot(hdr, 'Material Group Description'),
             dvt=tim_cot(hdr, 'Base Unit of Measure'))
    out = {}
    for r in rows[i + 1:]:
        m = ma(o(r, c['ma']))
        if m and m not in out:
            out[m] = dict(ten_master=chu(o(r, c['ten'])) or None, dvt=chu(o(r, c['dvt'])) or None,
                          nhom_sap=chu(o(r, c['nhom'])) or None, ten_nhom_sap=chu(o(r, c['ten_nhom'])) or None)
    return out


MP_COT = re.compile(r'^(.*?)\s*-\s*(MP\d{2})$')


def doc_demo_mp(duong_dan):
    """{mã: {"MP01 CHỦNG LOẠI": "VẢI", ...}} — chỉ ô khác rỗng; mã trùng thì gộp (dòng sau ghi đè ô có giá trị)."""
    rows = doc_sheet(duong_dan, 'MD_MATERIAL_PROPERTIES')
    i = dong_tieu_de(rows, 'MATERIAL', 'MATERIAL DESCRIPTION')
    hdr = rows[i]
    jm = tim_cot(hdr, 'Material')
    mp = []
    for j, v in enumerate(hdr):
        k = MP_COT.match(chuan(v))
        if k:
            mp.append((j, f'{k.group(2)} {k.group(1)}'))
    out = {}
    for r in rows[i + 1:]:
        m = ma(o(r, jm))
        if not m:
            continue
        d = out.setdefault(m, {})
        for j, k in mp:
            v = chu(o(r, j))
            if v:
                d[k] = v
    return out


def doc_tra_cuu(duong_dan):
    """{mã: {"MP01 CHỦNG LOẠI": …}} các dòng DUYỆT = X của file tra cứu (cùng khoá như doc_demo_mp)."""
    try:
        rows = doc_sheet(duong_dan, tra.SHEET_KQ)
    except SystemExit:
        raise
    except Exception as e:  # file hỏng (lưu dở / ổ mạng rớt): dừng rõ ràng, không nạp thiếu thuộc tính đã duyệt
        raise SystemExit(f'Không đọc được file tra cứu {duong_dan} ({type(e).__name__}: {str(e)[:150]}).\n'
                         f'  Khôi phục file (có thể từ bản .bak.xlsx cạnh nó) hoặc chạy với --tra-cuu "" để bỏ qua.')
    i = dong_tieu_de(rows, 'MATERIAL', 'MATERIAL DESCRIPTION')
    return tra.mp_da_duyet([chu(v) for v in rows[i]], rows[i + 1:])


GIA_TRI_AI_BU_O = 'AI TRA CỨU (ĐÃ DUYỆT) — BÙ Ô TRỐNG'


def bu_tra_cuu(mp, tc):
    """Bù dòng tra cứu đã duyệt vào mp, kèm khoá đánh dấu nguồn AI (tra.KHOA_AI) để về sau phân biệt / gỡ được:
    - mã CHƯA có dòng MD: thêm nguyên dòng (giá trị tra.GIA_TRI_AI);
    - mã ĐÃ có dòng MD (16/11/2026: 188/263 mã đang đăng có dòng MD nhưng thiếu màu): chỉ điền các cột MPxx đang
      TRỐNG — không bao giờ đè ô người điền tay (giá trị GIA_TRI_AI_BU_O).
    Trả số mã được bù (thêm dòng hoặc thêm ít nhất 1 ô)."""
    n = 0
    for m, tt in tc.items():
        if not tt:
            continue
        if m not in mp:
            mp[m] = {**tt, tra.KHOA_AI: tra.GIA_TRI_AI}
            n += 1
            continue
        goc = mp[m]
        them = {k: v for k, v in tt.items()
                if k != tra.KHOA_AI and not tach.la_trong(v) and tach.la_trong(lay_mp(goc, k.split(' ')[0]))}
        if them:
            mp[m] = {**goc, **them, tra.KHOA_AI: goc.get(tra.KHOA_AI) or GIA_TRI_AI_BU_O}
            n += 1
    return n


def ds_file_tra_cuu(tham_so, mac_dinh=None):
    """Danh sách file tra cứu theo thứ tự nạp. tham_so: list từ --tra-cuu (lặp được) hoặc None.
    - None: mặc định cả 2 file cạnh DEMO nếu có — file thuộc tính cũ trước, file phiếu ảnh sau;
    - có '' trong danh sách (--tra-cuu ""): bỏ qua tra cứu hoàn toàn."""
    if tham_so is None:
        mac_dinh = (FILE_TRA_CUU, FILE_TRA_CUU_PHIEU) if mac_dinh is None else mac_dinh
        return [f for f in mac_dinh if f and os.path.exists(f)]
    if any(not chuan(f) for f in tham_so):
        return []
    return list(dict.fromkeys(tham_so))


def nap_cac_tra_cuu(mp, ds_file):
    """Đọc lần lượt từng file (dòng DUYỆT = X) rồi bù vào mp — file trước bù trước, file sau chỉ bù ô còn trống.
    Trả [(file, số dòng duyệt, số mã được bù)]."""
    out = []
    for f in ds_file:
        tam = tra.ban_co_gio(f)
        if tam:
            print(f'CẢNH BÁO: có bản ghi tạm MỚI HƠN file tra cứu ({", ".join(os.path.basename(x) for x in tam)}) — dòng '
                  'X đánh ở đó CHƯA được nạp. Đóng file gốc rồi chạy tra_thuoc_tinh.py --chi-ghi-file để gộp vào file gốc.')
        tc = doc_tra_cuu(f)
        out.append((f, len(tc), bu_tra_cuu(mp, tc)))
    return out


def lay_mp(tt, ma_mp):
    return next((v for k, v in tt.items() if k.startswith(ma_mp + ' ')), None)


def quy_cach(tt):
    phan = []
    for mp, nhan in (('MP20', 'Phách'), ('MP21', 'Dày'), ('MP22', 'Rộng'), ('MP23', 'Dài'), ('MP24', 'ĐK')):
        v = lay_mp(tt, mp)
        if v:  # ô đã ghi sẵn nhãn (vd "PHÁCH 26") thì không thêm nhãn nữa
            phan.append(v if chuan(v).startswith(chuan(nhan)) else f'{nhan} {v}')
    return ' × '.join(phan) or None


def dung_master(ma_ton, master, zmm60, mp, ten_ton=None):
    """ten_ton = {mã: tên trong file tồn} — tên dùng để tách thuộc tính (tên tồn trước, không có thì tên master).
    Mỗi dòng có thêm suy_tu_ten (dict) và _qc_cu (quy cách master trước khi sửa vít đảo; None nếu không sửa)."""
    ten_ton = ten_ton or {}
    out = []
    for m in sorted(ma_ton):
        if m in master:
            d, nguon = dict(master[m]), 'MASTER'
        elif m in zmm60:
            d, nguon = dict(zmm60[m]), 'DEMO_ZMM60'
        elif m in mp:
            d, nguon = {}, 'DEMO_MP'
        elif ten_ton.get(m):
            d, nguon = {'ten_master': ten_ton[m]}, 'SUY_TEN'  # không có ở master / DEMO: chỉ mang thuộc tính suy từ tên
        else:
            continue
        tt = mp.get(m, {})
        r = dict(
            ma_vat_tu=m, ten_master=d.get('ten_master'), dvt=d.get('dvt'), nhom_sap=d.get('nhom_sap'),
            ten_nhom_sap=d.get('ten_nhom_sap'), loai_vat_tu=d.get('loai_vat_tu'),
            gia_binh_quan=d.get('gia_binh_quan'), price_unit=d.get('price_unit'),
            chung_loai=lay_mp(tt, 'MP01'), chat_lieu=lay_mp(tt, 'MP35'), quy_cach=quy_cach(tt),
            mau=lay_mp(tt, 'MP15') or d.get('mau'), thuong_hieu=lay_mp(tt, 'MP12'),
            xuat_xu=lay_mp(tt, 'MP26') or d.get('xuat_xu'), thuoc_tinh=tt, nguon=nguon,
        )
        ten = ten_ton.get(m) or r['ten_master'] or ''
        # Vít / bu lông: MP23 (Dài) / MP24 (ĐK) nhập đảo — sửa quy_cach hiển thị khi chắc chắn; MPxx gốc giữ nguyên
        cl = r['chung_loai'] or tach.chung_loai(ten, r['ten_nhom_sap'])[0]
        qc = tach.sua_quy_cach_ren(r['quy_cach'], ten, cl, lay_mp(tt, 'MP23'), lay_mp(tt, 'MP24'))
        r['_qc_cu'] = r['quy_cach'] if qc else None
        if qc:
            r['quy_cach'] = qc
        r['suy_tu_ten'] = tach.suy_tu_ten(ten, r['ten_nhom_sap'], {k: gia_tri_master(r, k) for k in tach.KHOA})
        out.append(r)
    return out


def gia_tri_master(r, k):
    """Giá trị master của 1 thuộc tính (mã màu nằm ở MP16 trong thuoc_tinh); ô chỉ ghi '-' coi là trống."""
    v = lay_mp(r['thuoc_tinh'], 'MP16') if k == 'ma_mau' else r.get(k)
    return None if tach.la_trong(v) else v


# ---------------------------------------------------------------- thống kê
def la_dung_chung(t):
    """Tên CT trống hoặc BẮT ĐẦU bằng "DÙNG CHUNG" (bỏ dấu, gộp dấu cách / xuống dòng): "DÙNG CHUNG + CÔNG TRÌNH",
    "DÙNG CHUNG PX5", "DUNG CHUNG  (GỖ TRÒN XẺ SẤY)", "DÙNG CHUNG\nARHAUS" … đều là dùng chung.
    Cùng quy tắc laGanCongTrinh của frontend/components/BanVatTu/xuLy.ts."""
    s = unicodedata.normalize('NFD', t or '')
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn').replace('đ', 'd').replace('Đ', 'D')
    s = re.sub(r'\s+', ' ', s).strip().upper()
    return s == '' or re.match(r'^DUNG CHUNG(\b|$)', s) is not None


def thong_ke(ton, ds_master, bo):
    pt = lambda a, b: f'{(100.0 * a / b if b else 0):.1f}%'
    ma_ds = {r['ma_vat_tu'] for r in ton}
    tong = sum(r['gia_tri'] or 0 for r in ton)
    theo_ma = Counter()
    for r in ton:
        theo_ma[r['ma_vat_tu']] += r['gia_tri'] or 0
    ms = {d['ma_vat_tu']: d for d in ds_master}
    nguon = Counter(d['nguon'] for d in ds_master)
    co_master = {m for m, d in ms.items() if d['nguon'] == 'MASTER'}
    co_ten = {m for m, d in ms.items() if d['nguon'] in ('MASTER', 'DEMO_ZMM60')}
    co_tt = {m for m, d in ms.items() if d['thuoc_tinh']}
    gt = lambda tap: sum(v for m, v in theo_ma.items() if m in tap)
    print('\n=== THỐNG KÊ ===')
    print(f'Dòng tồn: {len(ton):,} · mã khác nhau: {len(ma_ds):,} · dòng bỏ: {dict(bo) or 0}')
    print(f'Tổng giá trị: {tong:,.3f} triệu đồng (= {tong / 1000:,.3f} tỷ)')
    print(f'Khớp MASTER (ZMM60): {len(co_master):,}/{len(ma_ds):,} mã = {pt(len(co_master), len(ma_ds))}'
          f' · theo giá trị {pt(gt(co_master), tong)}')
    print(f'Có tên/nhóm (MASTER + DEMO_ZMM60): {len(co_ten):,} = {pt(len(co_ten), len(ma_ds))}'
          f' · theo giá trị {pt(gt(co_ten), tong)}')
    print(f'Có thuộc tính MPxx: {len(co_tt):,} = {pt(len(co_tt), len(ma_ds))} · theo giá trị {pt(gt(co_tt), tong)}')
    print(f'Dòng ban_vt_master sẽ ghi: {len(ds_master):,} theo nguồn {dict(nguon)}; không có thông tin: {len(ma_ds - set(ms)):,} mã')
    for ten, tap in (('chung_loai', 'chung_loai'), ('quy_cach', 'quy_cach'), ('mau', 'mau'), ('thuong_hieu', 'thuong_hieu'),
                     ('xuat_xu', 'xuat_xu'), ('chat_lieu', 'chat_lieu')):
        n = sum(1 for d in ds_master if d[tap])
        print(f'  có {ten}: {n:,} = {pt(n, len(ma_ds))}')
    gan = [r for r in ton if not la_dung_chung(r['ten_cong_trinh'])]
    thong_ke_suy(ton, ds_master, theo_ma, tong)
    print(f'Đang gán công trình (Tên CT khác DÙNG CHUNG/trống): {len(gan):,} dòng · {sum(r["gia_tri"] or 0 for r in gan):,.3f} triệu')
    print(f'Chậm luân chuyển (X): {sum(1 for r in ton if r["cham_luan_chuyen"]):,} dòng')
    nn = [r['ngay_nhap_kho_gan_nhat'] for r in ton if r['ngay_nhap_kho_gan_nhat']]
    print(f'Ngày nhập: {min(nn) if nn else "-"} → {max(nn) if nn else "-"} · trống {len(ton) - len(nn):,}'
          f' · = 30/09/2024 (chuyển SAP) {sum(1 for x in nn if x == NGAY_CHUYEN_SAP):,}')
    print(f'Giá trị 0 / trống: {sum(1 for r in ton if not r["gia_tri"]):,} dòng · số lượng <= 0: {sum(1 for r in ton if (r["so_luong"] or 0) <= 0):,}')
    print('Đầu mã:', dict(Counter(r['ma_vat_tu'][:3] for r in ton).most_common()))
    print('Độ dài mã:', dict(Counter(len(r['ma_vat_tu']) for r in ton).most_common()))
    print('Theo kho (dòng · triệu đồng):')
    kho = Counter()
    for r in ton:
        kho[r['kho'] or '(trống)'] += r['gia_tri'] or 0
    dem = Counter(r['kho'] or '(trống)' for r in ton)
    for k, v in kho.most_common():
        print(f'  {k}: {dem[k]:,} · {v:,.3f}')
    return tong


def thong_ke_suy(ton, ds_master, theo_ma, tong, so_mau=20, seed=20261115):
    """Trước / sau tách thuộc tính từ tên: số mã, % mã, % giá trị cho từng thuộc tính + mẫu ngẫu nhiên để duyệt."""
    pt = lambda a, b: f'{(100.0 * a / b if b else 0):.1f}%'
    n_ma = len(theo_ma)
    gt = lambda tap: sum(v for m, v in theo_ma.items() if m in tap)
    print(f'\n--- Thuộc tính: TRƯỚC (master/MD) → SAU (+ suy từ tên, chỉ ô trống) — trên {n_ma:,} mã tồn')
    print(f'  {"thuộc tính":<12} {"trước: mã":>10} {"% mã":>7} {"% GT":>7} | {"sau: mã":>8} {"% mã":>7} {"% GT":>7} | {"thêm":>6}')
    for k in tach.KHOA:
        truoc = {d['ma_vat_tu'] for d in ds_master if gia_tri_master(d, k)}
        sau = truoc | {d['ma_vat_tu'] for d in ds_master if d['suy_tu_ten'].get(k)}
        print(f'  {k:<12} {len(truoc):>10,} {pt(len(truoc), n_ma):>7} {pt(gt(truoc), tong):>7} |'
              f' {len(sau):>8,} {pt(len(sau), n_ma):>7} {pt(gt(sau), tong):>7} | {len(sau) - len(truoc):>6,}')
    co_suy = [d for d in ds_master if d['suy_tu_ten']]
    print(f'Mã có ít nhất 1 thuộc tính suy từ tên: {len(co_suy):,} = {pt(len(co_suy), n_ma)}'
          f' · dòng nguon=SUY_TEN (không có master): {sum(1 for d in ds_master if d["nguon"] == "SUY_TEN"):,}')
    sua = [d for d in ds_master if d['_qc_cu']]
    print(f'Quy cách vít / bu lông đảo Dài ↔ ĐK đã sửa: {len(sua):,} mã' + (' — vd:' if sua else ''))
    for d in sua[:5]:
        print(f'    {d["ma_vat_tu"]} {d["ten_master"]!r}: {d["_qc_cu"]} → {d["quy_cach"]}')
    nghi = [d for d in ds_master if tach.thuong_hieu_nghi(d['thuong_hieu'], d['mau'])]
    print(f'Thương hiệu MD nghi là tên màu / bộ sưu tập / mã (KHÔNG xoá, chỉ báo): {len(nghi):,} mã'
          + (' — ' + ', '.join(sorted({d["thuong_hieu"] for d in nghi})[:15]) if nghi else ''))
    ten_ton = {}
    for r in ton:
        ten_ton.setdefault(r['ma_vat_tu'], r['ten_vat_tu'])
    mau = random.Random(seed).sample(co_suy, min(so_mau, len(co_suy)))
    print(f'Mẫu ngẫu nhiên {len(mau)} mã có suy từ tên (seed {seed}) để duyệt:')
    for d in sorted(mau, key=lambda x: x['ma_vat_tu']):
        print(f'  {d["ma_vat_tu"]} {(ten_ton.get(d["ma_vat_tu"]) or d["ten_master"] or "")!r} → '
              + ' · '.join(f'{k}={v}' for k, v in d['suy_tu_ten'].items()))


# ---------------------------------------------------------------- ghi DB
def doc_env():
    url = os.environ.get('DATABASE_URL')
    if url:
        return url
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
    for dong in open(p, encoding='utf-8'):
        if dong.startswith('DATABASE_URL='):
            return dong.split('=', 1)[1].strip().strip('"')
    raise SystemExit('Không thấy DATABASE_URL')


def ket_noi():
    import psycopg2
    url = doc_env()
    cn = psycopg2.connect(url if 'sslmode=' in url else url + ('&' if '?' in url else '?') + 'sslmode=require')
    with cn.cursor() as c:
        c.execute('SET statement_timeout = 120000')
        c.execute('SET idle_in_transaction_session_timeout = 60000')
    cn.commit()
    return cn


COT_TON = ['ma_vat_tu', 'ten_vat_tu', 'dvt', 'so_luong', 'gia_tri', 'kho', 'ngay_nhap_kho_gan_nhat',
           'cham_luan_chuyen', 'ten_cong_trinh', 'ma_cong_trinh', 'ngay_chot', 'nguon_file']
COT_MASTER = ['ma_vat_tu', 'ten_master', 'dvt', 'nhom_sap', 'ten_nhom_sap', 'loai_vat_tu', 'gia_binh_quan', 'price_unit',
              'chung_loai', 'chat_lieu', 'quy_cach', 'mau', 'thuong_hieu', 'xuat_xu', 'thuoc_tinh', 'nguon', 'suy_tu_ten']
COT_JSON = ('thuoc_tinh', 'suy_tu_ten')


# Chặn ghi khi file đọc ra quá ít dòng (đổi định dạng cột Material, file chỉ còn hàng tổng…): DELETE + INSERT rỗng
# vẫn COMMIT được (execute_values với danh sách rỗng không chạy câu nào) => trang bán trống trơn.
TI_LE_GIAM_TOI_DA = 0.5


def kiem_tra_truoc_ghi(so_moi, so_cu, cho_phep_giam):
    """Lỗi (chuỗi) nếu không nên ghi; None nếu ghi được. so_cu = số dòng ban_vt_ton đang có trong DB."""
    if so_moi == 0:
        return 'File tồn đọc ra 0 dòng — KHÔNG ghi (kiểm tra sheet / cột Material của file)'
    if not cho_phep_giam and so_cu > 0 and so_moi < so_cu * TI_LE_GIAM_TOI_DA:
        return (f'File tồn chỉ có {so_moi:,} dòng, DB đang có {so_cu:,} dòng (giảm hơn {int(TI_LE_GIAM_TOI_DA * 100)}%) — '
                'KHÔNG ghi. Kiểm tra file; đúng là tồn giảm thật thì chạy lại với --cho-phep-giam')
    return None


def ghi(ton, ds_master, cho_phep_giam=False):
    from psycopg2.extras import execute_values
    loi = kiem_tra_truoc_ghi(len(ton), 0, True)
    if loi:
        raise SystemExit(loi)
    cn = ket_noi()
    try:
        with cn.cursor() as c:
            c.execute("SELECT to_regclass('ban_vt_ton'), to_regclass('ban_vt_master')")
            if None in c.fetchone():
                raise SystemExit('Chưa tạo bảng — chạy backend/sql/2026-11-14_ban_vat_tu_ton.sql trước')
            c.execute("SELECT 1 FROM information_schema.columns WHERE table_name = 'ban_vt_master' AND column_name = 'suy_tu_ten'")
            if not c.fetchone():
                raise SystemExit('Chưa có cột ban_vt_master.suy_tu_ten — chạy backend/sql/2026-11-15_ban_vat_tu_bo_sung.sql trước')
            c.execute('SELECT count(*) FROM ban_vt_ton')
            loi = kiem_tra_truoc_ghi(len(ton), c.fetchone()[0], cho_phep_giam)
            if loi:
                raise SystemExit(loi)
        cn.commit()
        with cn:  # 1 giao dịch: lỗi giữa chừng thì dữ liệu cũ giữ nguyên
            with cn.cursor() as c:
                c.execute('DELETE FROM ban_vt_ton')
                c.execute('DELETE FROM ban_vt_master')
                execute_values(c, f'INSERT INTO ban_vt_ton ({", ".join(COT_TON)}) VALUES %s',
                               [tuple(r[k] for k in COT_TON) for r in ton], page_size=1000)
                tpl = '(' + ', '.join('%s::jsonb' if k in COT_JSON else '%s' for k in COT_MASTER) + ')'
                execute_values(c, f'INSERT INTO ban_vt_master ({", ".join(COT_MASTER)}) VALUES %s',
                               [tuple(json.dumps(d[k], ensure_ascii=False) if k in COT_JSON else d[k] for k in COT_MASTER)
                                for d in ds_master], template=tpl, page_size=1000)
                # Bump phiên bản cache API (cachedByVersions(['ban_vt'])) — cùng cách ETL khác (ton_kho_vt.py)
                c.execute("UPDATE table_versions SET last_updated = now() WHERE table_name = 'ban_vt'")
                if c.rowcount == 0:
                    c.execute("INSERT INTO table_versions (table_name, last_updated) VALUES ('ban_vt', now())")
        print(f'ĐÃ GHI DB: ban_vt_ton {len(ton):,} dòng · ban_vt_master {len(ds_master):,} dòng · bump table_versions ban_vt')
    finally:
        cn.close()


def main():
    ap = argparse.ArgumentParser(description='Nạp tồn kho vật tư + thuộc tính cho trang Bán vật tư tồn kho')
    ap.add_argument('--ton', help=f'file BC ton kho vat tu dd.mm.yyyy.xlsx (mặc định: mới nhất theo tên ở {THU_MUC_TON})')
    ap.add_argument('--master', default=FILE_MASTER, help=f'MASTER DATA VẬT TƯ.xlsx (mặc định {FILE_MASTER})')
    ap.add_argument('--demo', default=FILE_DEMO if os.path.exists(FILE_DEMO) else None,
                    help=f'file DEMO (sheet DATA_ZMM60 + MD_MATERIAL_PROPERTIES; mặc định {FILE_DEMO} nếu có); không có = không có thuộc tính MPxx')
    ap.add_argument('--tra-cuu', action='append', default=None,
                    help=f'file kết quả tra cứu (scripts/tra_thuoc_tinh.py), lặp được, nạp theo thứ tự; mặc định cả '
                         f'{FILE_TRA_CUU} rồi {FILE_TRA_CUU_PHIEU} nếu có. Dòng DUYỆT = X dùng như dòng MD cho mã chưa '
                         'có MD, mã đã có MD chỉ bù ô trống; truyền "" để bỏ qua')
    ap.add_argument('--ngay-chot', help='YYYY-MM-DD khi tên file tồn không có ngày dd.mm.yyyy')
    ap.add_argument('--ghi', action='store_true', help='GHI DB (xoá hết ban_vt_ton / ban_vt_master rồi ghi lại); mặc định chạy khô')
    ap.add_argument('--cho-phep-giam', action='store_true',
                    help=f'cho ghi khi số dòng tồn mới ít hơn {int(TI_LE_GIAM_TOI_DA * 100)}%% số dòng đang có trong DB')
    a = ap.parse_args()

    t0 = time.time()
    f_ton = a.ton or file_ton_moi_nhat(THU_MUC_TON)
    nc = datetime.date.fromisoformat(a.ngay_chot) if a.ngay_chot else ngay_tu_ten(f_ton)
    if not nc:
        if a.ghi:
            raise SystemExit(f'Tên file "{os.path.basename(f_ton)}" không có ngày dd.mm.yyyy — truyền --ngay-chot YYYY-MM-DD')
        nc = datetime.date.fromtimestamp(os.stat(f_ton).st_mtime)
        print(f'CẢNH BÁO: tên file không có ngày, chạy khô tạm lấy ngày sửa file {nc}')
    print(f'Tồn:    {f_ton} (ngày chốt {nc})')
    ton, bo = doc_ton(f_ton, nc)
    print(f'Master: {a.master}')
    master = doc_master(a.master)
    zmm60, mp = {}, {}
    if a.demo:
        print(f'Demo:   {a.demo}')
        zmm60, mp = doc_demo_zmm60(a.demo), doc_demo_mp(a.demo)
    else:
        print('Demo:   (không truyền --demo — bỏ qua mã bù DATA_ZMM60 và thuộc tính MPxx)')
    print(f'Đọc: master {len(master):,} mã · DATA_ZMM60 {len(zmm60):,} mã · MD_MATERIAL_PROPERTIES {len(mp):,} mã'
          f' · {time.time() - t0:.1f}s')
    ds_tc = ds_file_tra_cuu(a.tra_cuu)
    if ds_tc:
        for f, n_dong, n_bu in nap_cac_tra_cuu(mp, ds_tc):
            print(f'Tra cứu: {f} — {n_dong:,} dòng đã duyệt X · bù {n_bu:,} mã (dòng mới hoặc ô trống)'
                  f' · {n_dong - n_bu:,} mã không có ô trống để bù')
    else:
        print('Tra cứu: (không có file tra cứu thuộc tính — bỏ qua)')

    ten_ton = {}
    for r in ton:
        if r['ten_vat_tu'] and not ten_ton.get(r['ma_vat_tu']):
            ten_ton[r['ma_vat_tu']] = r['ten_vat_tu']
    ds_master = dung_master({r['ma_vat_tu'] for r in ton}, master, zmm60, mp, ten_ton)
    thong_ke(ton, ds_master, bo)
    if a.ghi:
        ghi(ton, ds_master, a.cho_phep_giam)
    else:
        if not ton:
            print('\nCẢNH BÁO: đọc ra 0 dòng tồn — chạy --ghi sẽ bị chặn')
        print('\nCHẠY KHÔ — không kết nối / không ghi DB. Thêm --ghi để ghi.')
    print(f'Xong sau {time.time() - t0:.1f}s')


if __name__ == '__main__':
    main()
