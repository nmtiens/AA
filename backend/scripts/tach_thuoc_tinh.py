"""Tách thuộc tính vật tư từ TÊN (hàm thuần, không đọc file / DB) — dùng cho nap_ban_vat_tu.py.

Quy tắc lấy từ lần đo 14/11/2026 trên 5.088 mã tồn (docs/bo-sung-thuoc-tinh-anh-vat-tu-2026-11-14.md), có sửa các ca sai đã thấy:
  - "DA" (da thuộc) bị nhận nhầm thành "ĐÁ" (đá) vì so khớp sau khi bỏ dấu => nay khớp CÓ DẤU trước, chỉ khớp bỏ dấu
    khi tên viết không dấu, và nhóm SAP (Da / Đá) phân xử khi hai nghĩa trùng nhau.
  - "GỖ CAO SU" / "VÁN ... CAO SU" là loài gỗ, KHÔNG phải chất liệu cao su.
  - "LONG ĐEN_TRẮNG" ra màu ĐEN (chữ "ĐEN" thuộc tên chủng loại) => màu / chất liệu chỉ tìm SAU phần chủng loại.
  - Long đền "D8X12X2" = ĐK 8 × ĐK ngoài 12 × Dày 2 (trước đây bỏ sót do chữ D dính số).
  - "THANH NHÔM 10X10MM DÀI 3M" = Dày 10 × Rộng 10 × Dài 3000 (trước đây ra Rộng 10 × Dài 10).
  - Mã màu không lấy khổ vải "142CM".
  - Mã hàng Häfele thuộc dải Blum bán qua Häfele (342.20, 342.46, 342.52, 342.83, 356.04, 423.53, 423.54, 433.06)
    chỉ cho biết NHÀ CUNG CẤP => không suy thương hiệu.
  - Danh sách thương hiệu chọn tay (bỏ tên màu / bộ sưu tập mà cột thương hiệu MD đang ghi nhầm: CHAMPAGNE, FLAX, CANVAS…).
  - Thêm chủng loại GIẤY DÁN TƯỜNG (G.DÁN TƯỜNG, GDT, WALLCOVERING), SIMILY => SIMILI.
Rà soát 15/11/2026 sửa thêm:
  - Hậu tố "K" chỉ là kg với sơn / hoá chất, không dính sau "-": "LED 3000K" (nhiệt độ màu), "W-0070K" (mã sơn) không
    ra quy cách khối lượng; 1000–10000K luôn bỏ.
  - Mã màu bỏ số đứng sau "SỐ" ("VẢI TỒN SỐ 433" = số thứ tự hàng tồn) và mã nối bằng ":" ("238:001:20002",
    "TL90:0001-1" = mã sản phẩm); nhận trọn "YL-L14029", "42105-0002".
  - "BÓNG LED" = BÓNG ĐÈN (trước đây ra SƠN BÓNG do viết tắt "BÓNG").
  - Vải ghi khổ cuối tên dạng "...-1.4M" (không có chữ KHỔ) => Khổ 1400.
Vít / bu lông "5X25MM" = ĐK 5 × Dài 25 — dùng sua_quy_cach_ren() để sửa quy cách MP23/MP24 bị đảo của master.
"""
import re
import unicodedata

KHOA = ('chung_loai', 'quy_cach', 'mau', 'ma_mau', 'thuong_hieu', 'chat_lieu')


def bo_dau(s):
    s = (s or '').replace('Đ', 'D').replace('đ', 'd')
    return ''.join(ch for ch in unicodedata.normalize('NFD', s) if unicodedata.category(ch) != 'Mn').upper()


def norm(s):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', s or '').upper().replace('–', '-')).strip()


# ------------------------------------------------------------------ CHỦNG LOẠI
# Giá trị MP01 đang có trong MD (đông cứng từ lần đo, bỏ giá trị rác như "CÁC LOẠI", "VẬT LIỆU", "BÓNG 10").
CL_BIET = [
    'ADPATER', 'BAS', 'BU LONG', 'BÁNH XE', 'BÓNG PU', 'BÓNG ĐÈN', 'BÔNG', 'BẠC ĐẠN', 'BẢN LỀ', 'BỘ CHUYỂN ĐỔI ĐIỆN',
    'BỘ CHỐNG LẬT', 'BỘ CO', 'BỘ KHÓA', 'BỘ NGUỒN', 'BỘ PHỤ KIỆN', 'BỘ RAY TRƯỢT', 'BỘ TAY NẮM', 'BỘ THÀNH HỘP', 'BỘ ĐIỆN',
    'BỘ ĐÓNG CỬA TỰ ĐỘNG', 'BỘ ỐC LIÊN KẾT', 'BỘT', 'BỘT TRÉT', 'CHÂN TỦ', 'CHẶN BÁNH XE', 'CHẶN CỬA', 'CHẶN GÓC', 'CHỈ',
    'CHỐNG ẨM', 'CHỐT', 'CON TÁN', 'COVER PLATE', 'CÔNG TẮC', 'CỤC NHỰA', 'DA', 'DECAL', 'DUNG MÔI', 'DURAFLEX', 'DÁN CẠNH',
    'DÂY', 'DÂY CÁP', 'DÂY NGUỒN', 'DÂY SẮT', 'DÂY XÍCH', 'DÂY ĐIỆN', 'DẦU', 'DẦU BÓNG', 'DẦU PHỦ', 'DỊCH THỂ', 'FLOOR SPRING',
    'GIÁ ĐỠ', 'GIÒ GÀ', 'GIẤY BÌA', 'GIẤY DÁN TƯỜNG', 'GÒN', 'GẠCH', 'GỖ', 'GỖ NHỰA', 'HDF', 'HÍT KÍNH', 'HÓA CHẤT', 'HỘP NỐI',
    'KE', 'KE GÓC', 'KEO', 'KHOEN', 'KHUNG MẶT BÀN', 'KHÓA', 'KHÓA RAY', 'KÍNH', 'LAMINATE', 'LED', 'LED DÂY', 'LONG ĐỀN',
    'LÒ XO', 'LÔNG VỊT', 'MDF', 'MFC', 'MGO', 'MICA', 'MINERAL CORE', 'MOUSSE', 'MÀU', 'MÂM XOAY', 'MÂY', 'MÚT', 'MẮT THẦN',
    'NAM CHÂM', 'NGUỒN', 'NHẤN MỞ', 'NÊM NHẤN', 'NÚM CAO SU', 'NÚM KÉO', 'NÚM TAY NẮM', 'NÚT', 'NẮP', 'NẮP CHỤP', 'NẮP ĐẬY',
    'NẸP', 'NỈ', 'NỈ DÁN', 'NỈ DÍNH', 'OKAL', 'PE', 'PHỤ GIA', 'PHỤ KIỆN', 'PHỤ KIỆN MÀN', 'PHỤ KIỆN SOFA', 'PHỦ PU',
    'PIT TONG', 'PVC', 'RAY', 'RAY HỘC', 'ROCKWOOL', 'RON', 'RUỘT KHÓA', 'RÈM', 'SIMILI', 'SOLID SURFACE', 'SƠN', 'SƠN 2K',
    'SƠN LÓT', 'SƠN MÀU', 'SƠN NƯỚC', 'SƠN SẦN', 'SƠN TRÉT', 'SƠN UV', 'SƠN ĐẶC CHỦNG', 'TASSEL', 'TAY CHỐNG CỬA TỦ', 'TAY NÂNG',
    'TAY NÂNG CỬA', 'TAY NÂNG PITONG', 'TAY NÂNG TỦ', 'TAY NẮM', 'THAN TRE', 'THANH', 'THANH NHÔM', 'THANH TREO', 'THÂN KHÓA',
    'THÂN ĐỠ', 'THẠCH CAO', 'THẢM', 'TINH MÀU', 'TIP-ON', 'TRE', 'TREO ÁO', 'TRÀM', 'TRỤ QUAY BẢN LỀ', 'TRỤC XOAY', 'TY HƠI',
    'TY REN', 'TYREN', 'TẤM', 'TẤM CHỐNG ĐỌNG SƯƠNG', 'TẤM LÓT', 'TẮC KÊ', 'VÁN', 'VÁN LẠNG', 'VÁN ÉP', 'VÍT', 'VÒNG', 'VẢI',
    'XI MĂNG', 'ĐINH', 'ĐIỀU CHỈNH', 'ĐIỀU CHỈNH CHÂN', 'ĐUÔI ĐÈN', 'ĐÁ', 'ĐÈN DÂY', 'ĐÈN LED', 'ĐÓNG CỬA TỰ ĐỘNG', 'ĐẦU ỐC',
    'ĐẾ BẢN LỀ', 'ĐẾ MÂM', 'ĐẾ NHẤN MỞ', 'ĐẾ NÊM', 'ĐẾ NÊM NHẤN', 'ĐẾ TANG ĐƠ', 'ĐẾ TIP-ON', 'ĐỆM KHÍ', 'ỐC CẤY', 'ỐC LIÊN KẾT',
    'Ổ KHÓA',
]
# Từ đầu tên => chủng loại (viết tắt, đồng nghĩa)
CL_THEM = {
    'BÙLON': 'BU LONG', 'BULON': 'BU LONG', 'BU LÔNG': 'BU LONG', 'VAI': 'VẢI', 'LÓT': 'SƠN LÓT', 'BÓNG': 'SƠN BÓNG',
    'PHỦ': 'SƠN PHỦ', 'THINNER': 'DUNG MÔI', 'NHŨ': 'NHŨ', 'BỘT MÀU': 'BỘT MÀU', 'CỨNG': 'CHẤT ĐÓNG RẮN',
    'ĐÓNG RẮN': 'CHẤT ĐÓNG RẮN', 'CHẤT ĐÓNG RẮN': 'CHẤT ĐÓNG RẮN', 'XỐP': 'XỐP', 'TEM': 'TEM', 'TÚI': 'TÚI', 'GIẤY': 'GIẤY',
    'NHÁM': 'GIẤY NHÁM', 'GIẤY NHÁM': 'GIẤY NHÁM', 'ĐÈN': 'ĐÈN', 'RUỘT': 'RUỘT KHÓA', 'PAT': 'BAS', 'ỐC': 'ỐC',
    'BỘ': 'BỘ PHỤ KIỆN', 'P.KIỆN': 'PHỤ KIỆN', 'KHUNG': 'KHUNG', 'CHẶN': 'CHẶN', 'KỆ': 'KỆ', 'CHÂN': 'CHÂN', 'NÊM': 'NÊM',
    'Ổ': 'Ổ CẮM', 'TIP ON': 'TIP-ON', 'KHAY': 'KHAY', 'MIẾNG': 'MIẾNG', 'LÕI': 'LÕI', 'CỌ': 'CỌ', 'BĂNG': 'BĂNG KEO',
    'GC': 'GIA CÔNG', 'G.CÔNG': 'GIA CÔNG', 'THÂN': 'THÂN', 'ĐẾ': 'ĐẾ', 'VENEER': 'VENEER', 'GƯƠNG': 'GƯƠNG', 'PHÀO': 'PHÀO',
    'THÙNG': 'THÙNG', 'CARTON': 'CARTON', 'BAO': 'BAO', 'MÀNG': 'MÀNG', 'NHỰA': 'NHỰA', 'DÂY KÉO': 'DÂY KÉO',
    'KHÓA KÉO': 'DÂY KÉO', 'P.GIA': 'PHỤ GIA', 'PHỤ GIÁ': 'PHỤ GIA', 'PHỤ': 'PHỤ GIA', 'D.MÔI': 'DUNG MÔI',
    'B.TRÉT': 'BỘT TRÉT', 'GIẤY DECAL': 'DECAL', 'TẤM NỈ': 'NỈ', 'SLAB WOOD': 'GỖ', 'SLABWOOD': 'GỖ', 'MÚT': 'MOUSSE',
    'SIMILY': 'SIMILI', 'G.DÁN TƯỜNG': 'GIẤY DÁN TƯỜNG', 'GDT': 'GIẤY DÁN TƯỜNG', 'WALLCOVERING': 'GIẤY DÁN TƯỜNG',
    'GIẤY DÁN TƯỜNG': 'GIẤY DÁN TƯỜNG', 'BÓNG LED': 'BÓNG ĐÈN',
}
_CL = {k: k for k in CL_BIET}
_CL.update(CL_THEM)
_CL_CO_DAU = sorted(_CL.items(), key=lambda x: -len(x[0]))
_CL_BO_DAU = sorted(((bo_dau(k), v) for k, v in _CL.items()), key=lambda x: -len(x[0]))
_SAU_TU = r'(?=$|[\s_\-.,/(0-9])'
NHOM_CL = {'Vải': 'VẢI', 'Da': 'DA', 'Đá': 'ĐÁ', 'Gỗ': 'GỖ', 'Keo': 'KEO', 'Mây, tre': 'MÂY', 'Kính': 'KÍNH', 'Sơn': 'SƠN',
           'Vật liệu dán cạnh': 'CHỈ', 'Gia công': 'GIA CÔNG'}
# Hai chủng loại trùng nhau khi bỏ dấu: nhóm SAP phân xử
_TRUNG_BO_DAU = {frozenset(('DA', 'ĐÁ'))}
_NGHIA_BO_DAU = {}
for _k, _v in _CL.items():
    _NGHIA_BO_DAU.setdefault(bo_dau(_k), set()).add(_v)


def chung_loai(ten, nhom=None):
    """(chủng loại, nguồn 'tukhoa'|'nhom', độ dài phần tên đã dùng) — tìm từ khoá ở ĐẦU tên."""
    n = norm(ten).replace('_', ' ')
    for k, v in _CL_CO_DAU:  # 1) khớp có dấu
        if re.match(r'^' + re.escape(k) + _SAU_TU, n):
            nv = NHOM_CL.get(nhom or '')
            # "DA" không dấu có thể là "ĐÁ" viết thiếu dấu => nhóm SAP quyết; "ĐÁ" có dấu thì tin tên
            if nv and nv != v and bo_dau(k) == k and frozenset((nv, v)) in _TRUNG_BO_DAU:
                v = nv
            return v, 'tukhoa', len(k)
    b = bo_dau(n)
    for k, v in _CL_BO_DAU:  # 2) tên viết không dấu / sai dấu ("LONG DEN", "LONG ĐEN", "VAI")
        if re.match(r'^' + re.escape(k) + _SAU_TU, b):
            cac = _NGHIA_BO_DAU[k]
            if len(cac) > 1:  # "ĐA…" có thể là DA hoặc ĐÁ: chỉ nhận khi nhóm SAP chỉ rõ
                nv = NHOM_CL.get(nhom or '')
                if nv not in cac:
                    continue
                v = nv
            return v, 'tukhoa', len(k)
    if nhom in NHOM_CL:
        return NHOM_CL[nhom], 'nhom', 0
    return None, None, 0


# ------------------------------------------------------------------ QUY CÁCH
NUM = r'(\d+(?:[.,]\d+)?)'
SEP = r'\s*[X×*]\s*'
CL_REN = ('VÍT', 'BU LONG', 'ĐINH', 'TẮC KÊ', 'ỐC', 'TYREN', 'TY REN', 'CHỐT', 'ỐC CẤY', 'CON TÁN', 'ỐC LIÊN KẾT')
_DON_VI_MM = {'M': 1000, 'CM': 10, 'MM': 1}


def _f(x):
    return float(x.replace(',', '.'))


def _g(x):
    v = _f(x) if isinstance(x, str) else float(x)
    return str(int(v)) if v == int(v) else str(v)


def quy_cach(ten, cl=None):
    u = norm(ten)
    if re.search(NUM + SEP + NUM + SEP + NUM + SEP + NUM, u):  # "40X40X1.2X2500MM" (4 số): không đoán chiều nào
        u = re.sub(NUM + r'(?:' + SEP + NUM + r')+', ' ', u)
    m = re.search(r'(?<![A-Z0-9.])(D|Ø|PHI)?\s*' + NUM + SEP + NUM + SEP + NUM + r'\s*(MM|CM|M)?(?![0-9])', u)
    if m:
        if m.group(1) or re.search(r'[DØ]\s*$', u[:m.start()]) or cl == 'LONG ĐỀN':
            return 'ĐK %s × ĐK ngoài %s × Dày %s' % tuple(_g(m.group(i)) for i in (2, 3, 4))
        return 'Dày %s × Rộng %s × Dài %s' % tuple(_g(m.group(i)) for i in (2, 3, 4))
    # "60X250G/M2" là định lượng, không phải kích thước
    m = re.search(r'(?<![A-Z0-9.])(M|Ø|D|PHI)?\s*' + NUM + SEP + NUM + r'\s*(MM|CM|M)?(?![0-9.])(?!\s*(?:G|GR|GSM|KG)\b)', u)
    if m:
        a, b = m.group(2), m.group(3)
        if m.group(1) or cl in CL_REN:
            return 'ĐK %s × Dài %s' % (_g(a), _g(b))
        d = re.search(r'DÀI\s*' + NUM + r'\s*(MM|CM|M)\b', u)
        if d:  # "10X10MM DÀI 3M" = tiết diện × chiều dài
            return 'Dày %s × Rộng %s × Dài %s' % (_g(a), _g(b), _g(_f(d.group(1)) * _DON_VI_MM[d.group(2)]))
        return 'Rộng %s × Dài %s' % (_g(a), _g(b))
    out = []
    m = re.search(r'KH[ỔO]\s*' + NUM + r'\s*(MM|CM|M)?', u)
    if m:
        v = _f(m.group(1))
        dv = m.group(2) or ('M' if v < 5 else 'CM' if v < 500 else 'MM')
        out.append('Khổ %d' % round(v * _DON_VI_MM[dv]))
    m = re.search(r'(?:Ø|PHI)\s*' + NUM, u)
    if m:
        out.append('ĐK %s' % _g(m.group(1)))
    m = re.search(r'(?<![A-Z0-9.])' + NUM + r'\s*(MM|CM)\b', u)
    if m and not out:
        out.append('%s %s' % (_g(m.group(1)), m.group(2).lower()))
    if cl == 'VẢI' and not out:  # "VẢI ...-1.4M": khổ ở cuối tên, không có chữ KHỔ
        m = re.search(r'-\s*(\d(?:[.,]\d+)?)\s*M$', u)
        if m:
            out.append('Khổ %d' % round(_f(m.group(1)) * 1000))
    m = None
    for m1 in re.finditer(r'(?<![A-Z0-9.:/])' + NUM + r'\s*(KG|K|LÍT|LIT|L|LV|G|GR|ML)\b', u):
        if m1.group(2) == 'K' and not _la_k_kg(u, m1, cl):
            continue
        m = m1
        break
    if m and 'KG/M3' not in u[m.start():m.end() + 4]:
        out.append('%s %s' % (_g(m.group(1)), {'K': 'kg', 'KG': 'kg', 'LV': 'lít', 'L': 'lít', 'LÍT': 'lít', 'LIT': 'lít',
                                               'G': 'g', 'GR': 'g', 'ML': 'ml'}[m.group(2)]))
    m = re.search(NUM + r'\s*KG/M3', u)
    if m:
        out.append('Tỷ trọng %s kg/m3' % _g(m.group(1)))
    return ' · '.join(out) or None


# Chủng loại mà hậu tố "K" (25K, 7.00K) là kg: sơn / hoá chất
CL_K_KG = frozenset(('SƠN', 'SƠN LÓT', 'SƠN BÓNG', 'SƠN PHỦ', 'SƠN 2K', 'SƠN MÀU', 'SƠN NƯỚC', 'SƠN SẦN', 'SƠN TRÉT',
                     'SƠN UV', 'SƠN ĐẶC CHỦNG', 'MÀU', 'TINH MÀU', 'KEO', 'PHỤ GIA', 'NHŨ', 'CHẤT ĐÓNG RẮN', 'DUNG MÔI',
                     'BỘT MÀU', 'BỘT TRÉT', 'DẦU', 'DẦU BÓNG', 'DẦU PHỦ', 'HÓA CHẤT', 'PHỦ PU', 'BÓNG PU', 'DỊCH THỂ'))


def _la_k_kg(u, m, cl):
    """Số + "K" là kg? Chỉ với sơn / hoá chất; không dính sau "-" (mã sơn "W-0070K"); không phải nhiệt độ màu
    1000–10000K; không phải "SƠN 2K" (sơn 2 thành phần)."""
    if cl not in CL_K_KG:
        return False
    if m.start() > 0 and u[m.start() - 1] == '-':
        return False
    v = _f(m.group(1))
    if 1000 <= v <= 10000:
        return False
    if v == 2 and re.search(r'(?:SƠN|PU|NC)\s*$', u[:m.start()]):
        return False
    return True


def sua_quy_cach_ren(qc, ten, cl, dai, dk):
    """Quy cách master của vít / bu lông bị đảo (MP23 Dài = 5, MP24 ĐK = 25 với tên "VÍT INOX 5X25MM").
    Trả quy cách đúng "ĐK 5 × Dài 25" CHỈ KHI chắc chắn: chủng loại thuộc nhóm ren, quy cách master đúng dạng
    "Dài a × ĐK b" (không có phần khác), a < b và tên ghi đúng "a X b". Không thì None (giữ nguyên)."""
    if cl not in CL_REN or not qc or dai is None or dk is None:
        return None
    try:
        a, b = _f(str(dai)), _f(str(dk))
    except ValueError:
        return None
    if not a < b or qc != 'Dài %s × ĐK %s' % (dai, dk):
        return None
    u = norm(ten)
    # "4X6F" (F = phân) không tính: sau số thứ hai chỉ được là MM hoặc hết từ
    for m in re.finditer(r'(?<![A-Z0-9.])(?:M|Ø|D)?\s*' + NUM + SEP + NUM + r'(?:\s*MM)?(?![0-9.A-Z])', u):
        if _f(m.group(1)) == a and _f(m.group(2)) == b:
            return 'ĐK %s × Dài %s' % (_g(a), _g(b))
    return None


# ------------------------------------------------------------------ MÀU
MAU_VN = ['TRẮNG', 'ĐEN', 'ĐỎ', 'XANH DƯƠNG', 'XANH LÁ', 'XANH NGỌC', 'XANH', 'VÀNG', 'NÂU', 'XÁM', 'GHI', 'BẠC', 'CAM', 'HỒNG',
          'TÍM', 'BE', 'KEM', '7 MÀU', '7MÀU', 'TRONG SUỐT', 'NÂU ĐẬM', 'NÂU NHẠT', 'VÀNG ĐỒNG', 'ĐEN MỜ', 'TRẮNG MỜ',
          'VÀNG ÁNH KIM', 'XI VÀNG']
MAU_EN = ['WHITE', 'BLACK', 'RED', 'GREY', 'GRAY', 'GREEN', 'BLUE', 'NAVY', 'BEIGE', 'CREAM', 'IVORY', 'TAUPE', 'CHARCOAL',
          'BROWN', 'YELLOW', 'GOLD', 'GOLDEN', 'SILVER', 'ORANGE', 'PINK', 'PURPLE', 'OLIVE', 'TEAL', 'SAND', 'LINEN', 'NATURAL',
          'BRONZE', 'CHAMPAGNE', 'JAUNE', 'BLANC', 'NOIR', 'ROUGE', 'VERT', 'BLEU', 'GRIS', 'ROYAL BLUE', 'OFF WHITE', 'SNOW',
          'STONE', 'SMOKE', 'GRAPHITE', 'ANTHRACITE', 'ESPRESSO', 'CHOCOLATE', 'MOCHA', 'CAMEL', 'RUST', 'SAGE', 'MINT', 'AQUA',
          'INDIGO', 'BURGUNDY', 'WINE', 'PEARL', 'SESAME', 'MUSHROOM', 'PEBBLE', 'PUTTY', 'FLAX', 'DUNE']
_MAUK = sorted(set(MAU_VN + MAU_EN), key=lambda x: -len(x))
TU_MAU = frozenset(MAU_VN + MAU_EN)


def tach_tu(n):
    return ' ' + re.sub(r'[_\-/().,:+]', ' ', norm(n)) + ' '


def mau(ten, cl=None, bo_dau_ten=0):
    """Màu đầu tiên xuất hiện SAU phần chủng loại (bo_dau_ten = số ký tự chủng loại ở đầu tên)."""
    if cl == 'GỖ':  # tên gỗ là loài gỗ (WALNUT, RED OAK…), không phải màu
        return None
    u = tach_tu(norm(ten)[bo_dau_ten:])
    best = None
    for k in _MAUK:
        i = u.find(' ' + k + ' ')
        if i < 0 or (k == 'BE' and cl not in ('VẢI', 'DA', 'SIMILI')):
            continue
        if k == 'BLANC' and ' MONT BLANC ' in u:
            continue
        if best is None or i < best[0]:
            best = (i, k)
    if not best:
        return None
    return '7 MÀU' if best[1] == '7MÀU' else best[1]


CL_MA_MAU = {'VẢI', 'DA', 'SIMILI', 'LAMINATE', 'CHỈ', 'MDF', 'MFC', 'HDF', 'VENEER', 'VÁN ÉP', 'ĐÁ', 'SƠN', 'SƠN LÓT',
             'SƠN BÓNG', 'SƠN PHỦ', 'MÀU', 'TINH MÀU', 'NHŨ', 'GIẤY DÁN TƯỜNG', 'PHÀO', 'TẤM'}
_BO_SO = {'1220', '2440', '1830', '1200', '2400', '1400', '1450', '1500'}


def ma_mau(ten, cl=None):
    if cl not in CL_MA_MAU:
        return None
    u = norm(ten)
    for m in re.finditer(r'(?<![A-Z0-9.])([A-Z]{0,6}(?:-[A-Z]{1,6})?-?\d{3,}[A-Z0-9]*(?:[\-/]\d{1,4}[A-Z]?)?)(?![A-Z0-9])', u):
        s = m.group(1)
        # Mã nối bằng ":" ("238:001:20002", "TL90:0001-1") là mã sản phẩm, không phải mã màu
        if u[m.end():m.end() + 1] == ':' or (m.start() > 0 and u[m.start() - 1] == ':'):
            continue
        # "VẢI TỒN SỐ 433": số thứ tự hàng tồn, không phải mã màu
        if re.search(r'(?:^|[\s_\-])(?:SỐ|SO|NO\.?)\s*$', u[:m.start()]):
            continue
        if any(p in _BO_SO for p in re.split(r'[\-/]', s)) or re.fullmatch(r'\d+(?:CM|MM|M|KG|G|GR|ML)|\d+X\d+', s):  # khổ "142CM", kích thước "1220X3050"…
            continue
        if re.match(r'\s*[X×*]\s*\d', u[m.end():m.end() + 3]) or re.search(r'\d\s*[X×*]\s*$', u[:m.start()]):
            continue
        return s
    return None


# ------------------------------------------------------------------ THƯƠNG HIỆU
THUONG_HIEU = [
    'HAFELE', 'HÄFELE', 'BLUM', 'HETTICH', 'GRASS', 'SALICE', 'FGV', 'KESSEBOHMER', 'JOWAT', 'JOWATHERM', 'FORMICA',
    'WILSONART', 'ARBORITE', 'AICA', 'LAMITAK', 'ENCORE', 'JOTUN', 'DULUX', 'ICA', 'SAYERLACK', 'MILESI', 'AKZO', 'KVADRAT',
    'DEDAR', 'SUNBRELLA', 'JAB', 'DESIGNERS GUILD', 'ROMO', 'HARLEQUIN', 'OSBORNE', 'GOODRICH', 'TITEBOND', 'PHILIPS', 'EGGER',
    'KRONOSPAN', 'AN CƯỜNG', 'DTC', 'STAMSKIN', 'IMUNDEX', 'ARTBOX', 'MIROTONE', 'ALKANA', 'TEMAX', 'KUPP', 'VIETWOOD',
    'SUGATSUNE', 'DORMA', 'HEWI', 'ALTFIELD', 'ARCHITEX', 'WARWICK', 'MOORE&GILES', 'ORIX',
]
_THK = sorted(set(THUONG_HIEU), key=lambda x: -len(x))
# Mã Häfele thuộc các dải này là hàng Blum bán qua Häfele (14 mã đo 14/11) => mã chỉ cho biết NCC
_HAFELE_BAN_BLUM = ('342.20', '342.46', '342.52', '342.83', '356.04', '423.53', '423.54', '433.06')


def thuong_hieu(ten, cl=None):
    """(thương hiệu, nguồn 'tudien'|'ma_hafele'|'ma_blum')."""
    u = tach_tu(ten)
    for k in _THK:
        if ' ' + k + ' ' in u:
            return ('HAFELE' if k == 'HÄFELE' else k), 'tudien'
    uu = norm(ten)
    if 'TIP-ON' in uu or 'TIPON' in uu or re.search(r'\b7[0-9][BT]\d{3,4}', uu):
        return 'BLUM', 'ma_blum'
    m = re.search(r'(?<![\d.])(\d{3}\.\d{2})\.\d{3}(?![\d])', uu)
    if m and m.group(1) not in _HAFELE_BAN_BLUM:
        return 'HAFELE', 'ma_hafele'
    return None, None


def thuong_hieu_nghi(th, mau_md=None):
    """Giá trị cột thương hiệu MD nghi là tên màu / bộ sưu tập (CHAMPAGNE, FLAX, CANVAS…) — chỉ để báo, không xoá."""
    if not th:
        return False
    t = norm(th)
    if t in _THK or t == 'HÄFELE':
        return False
    if mau_md and norm(mau_md) == t:
        return True
    tu = set(re.split(r'[\s_\-/]+', t))
    return bool(tu & (TU_MAU | {'CANVAS', 'HARDWARE'})) or bool(re.search(r'\d', t))


# ------------------------------------------------------------------ CHẤT LIỆU
CLIEU = ['INOX 304', 'INOX 201', 'INOX', 'SẮT', 'THÉP', 'PVC', 'ABS', 'ACRYLIC', 'NHỰA', 'NHÔM', 'ĐỒNG', 'THAU', 'KẼM',
         'CAO SU', 'PP', 'PU', 'NC', 'UV', 'EPOXY', 'SILICON', 'GỖ', 'KÍNH', 'NỈ', 'TRE', 'MÂY', 'CÓI']
HOA_CHAT = ('SƠN', 'SƠN LÓT', 'SƠN BÓNG', 'SƠN PHỦ', 'MÀU', 'TINH MÀU', 'KEO', 'PHỤ GIA', 'NHŨ', 'CHẤT ĐÓNG RẮN', 'DUNG MÔI',
            'BỘT MÀU')
CL_GO = ('GỖ', 'VÁN', 'VÁN ÉP', 'VÁN LẠNG', 'VENEER', 'GIA CÔNG', 'MDF', 'HDF', 'MFC', 'OKAL', 'TẤM')


def chat_lieu(ten, cl=None, bo_dau_ten=0):
    u = tach_tu(norm(ten)[bo_dau_ten:])
    toan = tach_tu(ten)
    for k in CLIEU:
        i = u.find(' ' + k + ' ')
        if i < 0:
            continue
        if k in ('PU', 'NC', 'UV', 'EPOXY'):
            if cl not in HOA_CHAT:
                continue
            return 'HỆ ' + k
        if k == cl:
            continue
        if k == 'CAO SU' and (cl in CL_GO or ' GỖ CAO SU ' in toan or re.search(r' VÁN( \S+)? CAO SU ', toan)):
            continue  # "GỖ CAO SU" = loài gỗ
        if k == 'KÍNH' and re.search(r' (CỬA|VỊ|HÍT|KẸP|ĐỠ|D) $', u[:i + 1]):
            continue  # "TAY NẮM CỬA KÍNH" = dùng cho kính
        return k
    return None


# ------------------------------------------------------------------ gộp
def tach(ten, nhom=None):
    """Mọi thuộc tính tách được từ tên (chưa xét master): dict KHOA -> chuỗi | None, kèm 'nguon_cl', 'nguon_th'."""
    if not ten or not str(ten).strip():
        return dict({k: None for k in KHOA}, nguon_cl=None, nguon_th=None)
    cl, ncl, dai_cl = chung_loai(ten, nhom)
    th, nth = thuong_hieu(ten, cl)
    return dict(chung_loai=cl, quy_cach=quy_cach(ten, cl), mau=mau(ten, cl, dai_cl), ma_mau=ma_mau(ten, cl),
                thuong_hieu=th, chat_lieu=chat_lieu(ten, cl, dai_cl), nguon_cl=ncl, nguon_th=nth)


def suy_tu_ten(ten, nhom=None, hien_co=None):
    """Thuộc tính suy từ tên CHỈ cho trường đang trống trong `hien_co` (dict KHOA -> giá trị master).
    Trả {khoá: chuỗi} (không có khoá nào nếu không suy được) — ghi vào cột ban_vt_master.suy_tu_ten."""
    hien_co = hien_co or {}
    t = tach(ten, nhom)
    # Quy cách / màu của vít phụ thuộc chủng loại: master đã có chủng loại thì dùng chủng loại đó
    cl_md = hien_co.get('chung_loai')
    if cl_md and t['chung_loai'] != cl_md and ten:
        _, _, dai = chung_loai(ten, nhom)
        t['quy_cach'] = quy_cach(ten, cl_md)
        t['mau'] = mau(ten, cl_md, dai)
        t['ma_mau'] = ma_mau(ten, cl_md)
        t['chat_lieu'] = chat_lieu(ten, cl_md, dai)
    return {k: t[k] for k in KHOA if t[k] and la_trong(hien_co.get(k))}


def la_trong(v):
    """Ô master coi là trống: rỗng hoặc chỉ ghi gạch / N/A (71 mã MP16 MÃ MÀU ghi '-')."""
    return str(v if v is not None else '').strip().upper() in ('', '-', '--', 'N/A', 'NA')
