"""Nạp ẢNH MẪU VẬT LIỆU từ sheet 03_MATERIALS của các file Production Status vào bảng ban_vt_anh (trang /ban-vat-tu).

Nguồn: G:\\Shared drives\\PPD-Production Planning Department\\005_PROJECT\\<năm | nhóm>\\<CT>\\02_SẢN XUẤT\\05_PRODUCTION STATUS\\*.xlsx|xlsm
  sheet 03_MATERIALS: ảnh ở cột "HÌNH MẪU VẬT LIỆU" — ảnh nổi (drawing anchor) và ảnh trong ô (richData, ô có vm=),
  ghép theo DÒNG với cột "MÃ VẬT TƯ SAP" (1 ô có thể ghi nhiều mã, cách xuống dòng / dấu phẩy).
  Đọc thẳng zip + XML (không mở openpyxl cả file 300 MB). Chỉ giữ mã đang có trong file BC tồn kho
  (đọc bằng doc_ton của nap_ban_vat_tu.py).
Ảnh: cạnh dài <= 1000 px, JPEG q=80 (Pillow); bỏ ảnh gốc < 2 KB, ảnh < 64 px, ảnh "logo" (1 ảnh lặp ở nhiều dòng 03).
  hash = sha1 ảnh ĐÃ NÉN. chac_chan = dòng 03 chỉ có 1 mã SAP; dòng nhiều mã => cần duyệt.
  Mỗi mã tối đa 6 ảnh, ưu tiên chac_chan rồi file sửa mới nhất.
Đích: bảng ban_vt_anh (backend/sql/2026-11-15_ban_vat_tu_bo_sung.sql — người dùng tự chạy file SQL trước).

- MẶC ĐỊNH CHẠY KHÔ: không kết nối DB; in thống kê (số mã, % mã, % giá trị, chắc chắn / cần duyệt, dung lượng)
  và nếu có --xem-truoc <thư mục> thì ghi ảnh đã nén + anh.csv + index.html vào đó để duyệt.
- --ghi: 1 giao dịch: XOÁ các dòng nguon='SHEET03' AND trang_thai='tu_dong', INSERT lại
  (ON CONFLICT (ma_vat_tu, hash) DO NOTHING => dòng đã 'da_duyet' / 'an' giữ nguyên), bump table_versions 'ban_vt'.
  Kết quả 0 ảnh thì KHÔNG ghi. Hàng rào (rà soát 15/11/2026):
    * --ghi KHÔNG đi cùng --cong-trinh (DELETE xoá ảnh tu_dong của mọi công trình, chỉ INSERT lại phần đã lọc).
    * Có file đọc LỖI (đang khoá / hỏng / Drive đọc dở) => chặn ghi; thêm --cho-phep-file-loi thì ghi nhưng KHÔNG
      xoá ảnh cũ của các file lỗi đó (giữ đến lần chạy sau).
    * Số dòng mới < 50% số dòng SHEET03 tu_dong đang có => chặn; muốn ghi thì thêm --cho-phep-giam.
    * Trước khi chọn 6 ảnh / mã: bỏ các cặp (mã, hash) đã 'an' / 'da_duyet' trong DB, ảnh 'da_duyet' trừ vào hạn mức.

Cách chạy (từ thư mục backend):
  python scripts/nap_anh_vat_tu.py --xem-truoc C:\\TEMP\\anh03                 # chạy khô toàn bộ (~vài phút)
  python scripts/nap_anh_vat_tu.py --cong-trinh CT26-041 --cong-trinh CT24-077  # chạy khô thử 1-2 công trình (không dùng với --ghi)
  python scripts/nap_anh_vat_tu.py --ghi                                        # ghi DB thật
Cần: pip install pillow python-calamine psycopg2-binary
"""
import argparse, csv, datetime, hashlib, html, io, os, posixpath, re, sys, time, unicodedata, zipfile

sys.dont_write_bytecode = True  # đặt TRƯỚC khi import nap_ban_vat_tu => không sinh __pycache__ trong repo
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nap_ban_vat_tu as nb  # noqa: E402  (dùng lại đọc tồn + kết nối DB, không chép)

GOC_DU_AN = r'G:\Shared drives\PPD-Production Planning Department\005_PROJECT'
SHEET = '03_MATERIALS'
COT_SAP = 'MÃ VẬT TƯ SAP'
COT_HINH = 'HÌNH MẪU VẬT LIỆU'
COT_CODE = 'CODE VẬT LIỆU'
COT_MO_TA = 'MÔ TẢ VẬT LIỆU'
CANH_DAI = 1000
CHAT_LUONG = 80
GOC_TOI_THIEU = 2048       # byte ảnh gốc
PX_TOI_THIEU = 64          # cạnh dài
TOI_DA_MOI_MA = 6
LOGO_SO_DONG = 8           # 1 ảnh (cùng hash) lặp ở >= 8 dòng 03 khác nhau => logo / ảnh giữ chỗ, bỏ
                           # (KHÔNG xét số mã: 1 dòng 03 có thể ghi 28 mã SAP chung 1 ảnh mẫu)
MA_SAP = re.compile(r'(?<!\d)\d{10,12}(?!\d)')
MA_CT = re.compile(r'\b((?:CT|PO)\d{2}-\d{3})\b', re.I)

NS = {
    'm': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
    'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'xlrd': 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata',
    'rvr': 'http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel',
}
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
M = '{%s}' % NS['m']


# ---------------------------------------------------------------- tìm file
def nfc(s):
    return unicodedata.normalize('NFC', s)


def tim_file(goc, loc_ct=None):
    """[(đường dẫn, mtime)] các file Production Status: <goc>\\<nhóm>\\<CT>\\02_SẢN XUẤT\\05_PRODUCTION STATUS\\*.xlsx|xlsm."""
    loc = [x.upper() for x in (loc_ct or [])]
    out = []
    for g in os.scandir(goc):
        if not g.is_dir():
            continue
        for ct in os.scandir(g.path):
            if not ct.is_dir():
                continue
            if loc and not any(x in nfc(ct.name).upper() for x in loc):
                continue
            sx = next((e.path for e in os.scandir(ct.path) if e.is_dir() and nfc(e.name).upper() == '02_SẢN XUẤT'), None)
            if not sx:
                continue
            ps = next((e.path for e in os.scandir(sx) if e.is_dir() and nfc(e.name).upper() == '05_PRODUCTION STATUS'), None)
            if not ps:
                continue
            for f in os.scandir(ps):
                if f.is_file() and f.name.lower().endswith(('.xlsx', '.xlsm')) and not f.name.startswith('~$'):
                    out.append((f.path, f.stat().st_mtime))
    return out


def ma_cong_trinh(duong_dan):
    """Mã CT/PO trong tên file, không có thì trong đường dẫn; dự án OEM không có mã thì lấy tên thư mục dự án
    (…\\<dự án>\\02_SẢN XUẤT\\05_PRODUCTION STATUS\\file.xlsx)."""
    for phan in (os.path.basename(duong_dan), duong_dan):
        m = MA_CT.search(nfc(phan))
        if m:
            return m.group(1).upper()
    thu_muc = os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(duong_dan))))
    return nfc(thu_muc).strip() or None


# ---------------------------------------------------------------- đọc zip / xml
def rels(z, p, names):
    d, b = posixpath.split(p)
    rp = posixpath.join(d, '_rels', b + '.rels')
    if rp not in names:
        return {}
    out = {}
    for r in ET.fromstring(z.read(rp)).findall('rel:Relationship', NS):
        if r.get('TargetMode') == 'External':
            continue
        t = r.get('Target')
        out[r.get('Id')] = (r.get('Type').rsplit('/', 1)[-1],
                            t[1:] if t.startswith('/') else posixpath.normpath(posixpath.join(d, t)))
    return out


def cot_so(ref):
    """'AD12' -> (29, 12): cột 0-based, dòng 1-based."""
    m = re.match(r'([A-Z]+)(\d+)', ref)
    c = 0
    for ch in m.group(1):
        c = c * 26 + ord(ch) - 64
    return c - 1, int(m.group(2))


def doc_chuoi_chung(z, names):
    if 'xl/sharedStrings.xml' not in names:
        return []
    out = []
    for _, el in ET.iterparse(z.open('xl/sharedStrings.xml')):
        if el.tag == M + 'si':
            out.append(''.join(t.text or '' for t in el.iter(M + 't')))
            el.clear()
    return out


def anh_trong_o(z, names):
    """vm (1-based, thuộc tính ô) -> đường dẫn media của ảnh trong ô (richData _localImage)."""
    try:
        if 'xl/metadata.xml' not in names or 'xl/richData/rdrichvalue.xml' not in names:
            return {}
        md = ET.fromstring(z.read('xl/metadata.xml'))
        kieu = [t.get('name') for t in md.findall('m:metadataTypes/m:metadataType', NS)]
        fm = md.find("m:futureMetadata[@name='XLRICHVALUE']", NS)
        rvb = [bk.find('.//xlrd:rvb', NS) for bk in (fm.findall('m:bk', NS) if fm is not None else [])]
        vm = []
        for bk in md.findall('m:valueMetadata/m:bk', NS):
            rc = bk.find('m:rc', NS)
            ok = rc is not None and 0 < int(rc.get('t')) <= len(kieu) and kieu[int(rc.get('t')) - 1] == 'XLRICHVALUE'
            v = int(rc.get('v')) if ok else -1
            vm.append(int(rvb[v].get('i')) if 0 <= v < len(rvb) and rvb[v] is not None else None)
        cau_truc = []
        rs = ET.fromstring(z.read('xl/richData/rdrichvaluestructure.xml'))
        for s in rs:
            keys = [k.get('n') for k in s]
            cau_truc.append((s.get('t'), keys))
        rv = []
        for r in ET.fromstring(z.read('xl/richData/rdrichvalue.xml')):
            s = int(r.get('s'))
            t, keys = cau_truc[s] if s < len(cau_truc) else (None, [])
            vals = [v.text for v in r]
            idx = None
            if t == '_localImage' and '_rvRel:LocalImageIdentifier' in keys:
                k = keys.index('_rvRel:LocalImageIdentifier')
                idx = int(vals[k]) if k < len(vals) else None
            rv.append(idx)
        rel_ids = [e.get(R + 'id') for e in ET.fromstring(z.read('xl/richData/richValueRel.xml'))]
        rr = rels(z, 'xl/richData/richValueRel.xml', names)
        out = {}
        for i, rvi in enumerate(vm, start=1):
            if rvi is None or rvi >= len(rv) or rv[rvi] is None or rv[rvi] >= len(rel_ids):
                continue
            tg = rr.get(rel_ids[rv[rvi]])
            if tg and tg[1] in names:
                out[i] = tg[1]
        return out
    except (ET.ParseError, KeyError, ValueError, AttributeError, IndexError):
        return {}


def doc_file(duong_dan):
    """Đọc 1 file: (danh sách dòng có mã SAP, lỗi|None).
    Mỗi dòng: dict(dong, ma=[mã…], code, mo_ta, media=[đường dẫn trong zip…])."""
    z = zipfile.ZipFile(duong_dan)
    names = set(z.namelist())
    wbx = ET.fromstring(z.read('xl/workbook.xml'))
    wr = rels(z, 'xl/workbook.xml', names)
    sh = [s for s in wbx.find('m:sheets', NS) if s.get('name', '').strip().upper().startswith(SHEET)]
    if not sh:
        return [], 'không có sheet 03_MATERIALS'
    spath = wr[sh[0].get(R + 'id')][1]
    ss = doc_chuoi_chung(z, names)
    vm_anh = anh_trong_o(z, names)

    # --- đọc ô (chỉ giữ giá trị chuỗi/số + vm) ; dòng tiêu đề = dòng đầu (<=15) có ô "MÃ VẬT TƯ SAP"
    o_vm = {}          # (cột, dòng) -> vm
    dong = {}          # dòng -> {cột: giá trị}
    hdr_dong, hdr = None, None
    for _, el in ET.iterparse(z.open(spath)):
        if el.tag != M + 'row':
            continue
        rn = int(el.get('r')) if el.get('r') else (max(dong) + 1 if dong else 1)
        vals = {}
        for c in el.findall(M + 'c'):
            col, _ = cot_so(c.get('r'))
            if c.get('vm'):
                o_vm[(col, rn)] = int(c.get('vm'))
            t = c.get('t')
            if t == 'inlineStr':
                v = ''.join(x.text or '' for x in c.iter(M + 't'))
            else:
                ve = c.find(M + 'v')
                if ve is None or ve.text is None:
                    continue
                v = ve.text
                if t == 's':
                    v = ss[int(v)] if int(v) < len(ss) else ''
            vals[col] = v
        el.clear()
        if hdr is None:
            if rn <= 15 and any(nb.chuan(v) == COT_SAP for v in vals.values()):
                hdr_dong, hdr = rn, {}
                for c in sorted(vals):  # tiêu đề trùng: lấy cột đầu tiên
                    hdr.setdefault(nb.chuan(vals[c]), c)
            continue
        dong[rn] = vals
    if hdr is None:
        return [], 'không thấy cột MÃ VẬT TƯ SAP'
    c_sap, c_hinh = hdr.get(COT_SAP), hdr.get(COT_HINH)
    c_code, c_mt = hdr.get(COT_CODE), hdr.get(COT_MO_TA)
    if c_hinh is None:
        return [], 'không thấy cột HÌNH MẪU VẬT LIỆU'
    gan_hinh = {c_hinh - 1, c_hinh, c_hinh + 1}

    # --- ảnh theo dòng
    anh = defaultdict(list)
    for rid, (typ, tgt) in rels(z, spath, names).items():
        if typ != 'drawing' or tgt not in names:
            continue
        dx = ET.fromstring(z.read(tgt))
        dr = rels(z, tgt, names)
        for anc in list(dx):
            fr = anc.find('xdr:from', NS)
            if fr is None:
                continue
            col, row = int(fr.find('xdr:col', NS).text), int(fr.find('xdr:row', NS).text) + 1
            if col not in gan_hinh or row <= hdr_dong:
                continue
            for blip in anc.iter('{%s}blip' % NS['a']):
                m = dr.get(blip.get(R + 'embed'), ('', ''))[1]
                if m in names and m not in anh[row]:
                    anh[row].append(m)
    for (col, row), v in o_vm.items():
        m = vm_anh.get(v)
        if m and col in gan_hinh and row > hdr_dong and m not in anh[row]:
            anh[row].append(m)

    out = []
    for rn, vals in dong.items():
        raw = vals.get(c_sap)
        if raw is None:
            continue
        s = str(raw)
        if re.fullmatch(r'\d+\.0+|\d+(\.\d+)?[eE]\+?\d+', s):  # ô số
            try:
                s = str(int(float(s)))
            except ValueError:
                pass
        ma = list(dict.fromkeys(MA_SAP.findall(s)))
        if not ma:
            continue
        out.append(dict(dong=rn, ma=ma, code=(vals.get(c_code) or '').strip() if c_code is not None else '',
                        mo_ta=(vals.get(c_mt) or '').strip() if c_mt is not None else '', media=anh.get(rn, [])))
    z.close()
    return out, None


# ---------------------------------------------------------------- nén ảnh
def nen_anh(raw):
    """bytes gốc -> (jpeg bytes, rộng, cao) hoặc (None, lý do)."""
    from PIL import Image, ImageOps
    if len(raw) < GOC_TOI_THIEU:
        return None, 'nhỏ < 2KB'
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except Exception:
        return None, 'không mở được'
    try:
        im = ImageOps.exif_transpose(im)
    except Exception:
        pass
    if max(im.size) < PX_TOI_THIEU:
        return None, f'nhỏ < {PX_TOI_THIEU}px'
    if im.mode in ('RGBA', 'LA', 'P', 'PA'):
        im = im.convert('RGBA')
        nen = Image.new('RGB', im.size, (255, 255, 255))
        nen.paste(im, mask=im.split()[-1])
        im = nen
    elif im.mode != 'RGB':
        im = im.convert('RGB')
    im.thumbnail((CANH_DAI, CANH_DAI), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=CHAT_LUONG, optimize=True, progressive=True)
    return (b.getvalue(), im.size[0], im.size[1]), None


LOI_DOC = 'LỖI ĐỌC '  # tiền tố lỗi đọc thật (khác các lý do bỏ file như "không có sheet 03_MATERIALS")


def xu_ly_file(duong_dan, mtime, ma_ton):
    """Đọc 1 file + nén ảnh của các dòng có mã đang tồn. -> (bản ghi[], thống kê dict, lỗi)."""
    t = time.time()
    tk = Counter()
    try:
        dong, loi = doc_file(duong_dan)
    except Exception as e:  # file hỏng / đang bị khoá
        return [], tk, f'{LOI_DOC}{type(e).__name__}: {e}', time.time() - t
    if loi:
        return [], tk, loi, time.time() - t
    ct = ma_cong_trinh(duong_dan)
    out, nen_cache = [], {}
    z = None
    try:
        for d in dong:
            tk['dong_co_ma'] += 1
            ma_giu = [m for m in d['ma'] if m in ma_ton]
            if not ma_giu:
                continue
            tk['dong_ma_ton'] += 1
            if not d['media']:
                continue
            tk['dong_ma_ton_co_anh'] += 1
            if z is None:
                z = zipfile.ZipFile(duong_dan)
            for media in d['media']:
                if media not in nen_cache:
                    kq, ly_do = nen_anh(z.read(media))
                    nen_cache[media] = kq
                    if kq is None:
                        tk[f'bo_anh: {ly_do}'] += 1
                kq = nen_cache[media]
                if kq is None:
                    continue
                data, w, h = kq
                hs = hashlib.sha1(data).hexdigest()
                for m in ma_giu:
                    out.append(dict(ma_vat_tu=m, hash=hs, data=data, rong=w, cao=h, kich_thuoc=len(data),
                                    cong_trinh=ct, code_vat_lieu=d['code'] or None, mo_ta=d['mo_ta'] or None,
                                    file_nguon=os.path.basename(duong_dan), dong_nguon=d['dong'],
                                    chac_chan=len(d['ma']) == 1, mtime=mtime))
    finally:
        if z is not None:
            z.close()
    return out, tk, None, time.time() - t


def chon_anh(ban_ghi, bo=frozenset(), da_dung=None):
    """Bỏ logo, gộp trùng (mã, hash), mỗi mã tối đa 6 ảnh ưu tiên chắc chắn rồi file mới nhất.
    bo: cặp (mã, hash) đang 'an' / 'da_duyet' trong DB => không làm ứng viên (INSERT sẽ bị ON CONFLICT bỏ, mất chỗ);
    da_dung: {mã: số ảnh da_duyet} => trừ vào hạn mức 6 ảnh của mã."""
    da_dung = da_dung or {}
    dong_theo_hash = defaultdict(set)
    for r in ban_ghi:
        dong_theo_hash[r['hash']].add((r['file_nguon'], r['dong_nguon']))
    logo = {h for h, s in dong_theo_hash.items() if len(s) >= LOGO_SO_DONG}
    theo_ma = defaultdict(dict)
    for r in sorted(ban_ghi, key=lambda r: (not r['chac_chan'], -r['mtime'], r['file_nguon'], r['dong_nguon'])):
        if r['hash'] in logo or (r['ma_vat_tu'], r['hash']) in bo:
            continue
        d = theo_ma[r['ma_vat_tu']]
        if r['hash'] not in d:
            d[r['hash']] = r
    out = []
    for m in sorted(theo_ma):
        out.extend(list(theo_ma[m].values())[:max(0, TOI_DA_MOI_MA - da_dung.get(m, 0))])
    return out, logo


# ---------------------------------------------------------------- xem trước
def ghi_xem_truoc(thu_muc, ds, ten_ton, gia_tri):
    os.makedirs(os.path.join(thu_muc, 'anh'), exist_ok=True)
    da_ghi = set()
    for r in ds:
        if r['hash'] not in da_ghi:
            with open(os.path.join(thu_muc, 'anh', r['hash'] + '.jpg'), 'wb') as f:
                f.write(r['data'])
            da_ghi.add(r['hash'])
    cot = ['ma_vat_tu', 'ten_ton', 'gia_tri_trieu', 'chac_chan', 'cong_trinh', 'code_vat_lieu', 'mo_ta', 'file_nguon',
           'dong_nguon', 'rong', 'cao', 'kich_thuoc', 'hash', 'anh']
    with open(os.path.join(thu_muc, 'anh.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(cot)
        for r in sorted(ds, key=lambda r: (-gia_tri.get(r['ma_vat_tu'], 0), r['ma_vat_tu'])):
            w.writerow([r['ma_vat_tu'], ten_ton.get(r['ma_vat_tu'], ''), f'{gia_tri.get(r["ma_vat_tu"], 0):.3f}',
                        1 if r['chac_chan'] else 0, r['cong_trinh'] or '', r['code_vat_lieu'] or '', r['mo_ta'] or '',
                        r['file_nguon'], r['dong_nguon'], r['rong'], r['cao'], r['kich_thuoc'], r['hash'],
                        f'anh/{r["hash"]}.jpg'])
    # index.html: mỗi mã 1 dòng, ảnh "cần duyệt" viền cam — chỉ để người dùng xem nhanh
    theo_ma = defaultdict(list)
    for r in ds:
        theo_ma[r['ma_vat_tu']].append(r)
    e = html.escape
    dong = []
    for m in sorted(theo_ma, key=lambda m: -gia_tri.get(m, 0)):
        anh = ''.join(
            f'<figure class="{"" if r["chac_chan"] else "duyet"}"><img loading="lazy" src="anh/{r["hash"]}.jpg">'
            f'<figcaption>{e(r["cong_trinh"] or "")} {e(r["code_vat_lieu"] or "")}'
            f'{"" if r["chac_chan"] else " · cần duyệt"}</figcaption></figure>' for r in theo_ma[m])
        dong.append(f'<tr><td><b>{m}</b><br>{e(ten_ton.get(m, ""))}<br>{gia_tri.get(m, 0):,.1f} tr</td><td>{anh}</td></tr>')
    with open(os.path.join(thu_muc, 'index.html'), 'w', encoding='utf-8') as f:
        f.write('<!doctype html><meta charset="utf-8"><title>Ảnh sheet 03 xem trước</title><style>'
                'body{font:13px system-ui;margin:16px}td{vertical-align:top;border-top:1px solid #ddd;padding:6px}'
                'figure{display:inline-block;margin:0 6px 6px 0;width:160px}img{max-width:160px;max-height:160px}'
                'figure.duyet img{outline:3px solid #e8890c}figcaption{font-size:11px;color:#555}</style>'
                f'<p>{len(theo_ma)} mã · {len(ds)} ảnh — viền cam = dòng 03 nhiều mã SAP, cần duyệt</p><table>'
                + ''.join(dong) + '</table>')


# ---------------------------------------------------------------- ghi DB
COT = ['ma_vat_tu', 'nguon', 'hash', 'data', 'mime', 'rong', 'cao', 'kich_thuoc', 'cong_trinh', 'code_vat_lieu',
       'mo_ta', 'file_nguon', 'dong_nguon', 'chac_chan']


NGUONG_GIAM = 0.5  # số dòng mới < 50% số dòng tu_dong đang có => chặn ghi (trừ --cho-phep-giam)


def ghi(ban_ghi, file_loi=(), cho_phep_giam=False):
    """ban_ghi: mọi bản ghi đã đọc (chưa chọn); file_loi: tên file đọc lỗi => không xoá ảnh cũ của chúng."""
    import psycopg2
    from psycopg2.extras import execute_values
    if not chon_anh(ban_ghi)[0]:
        raise SystemExit('Kết quả 0 ảnh — KHÔNG ghi')
    cn = nb.ket_noi()  # đã SET statement_timeout ngay sau kết nối
    try:
        with cn.cursor() as c:
            c.execute("SELECT to_regclass('ban_vt_anh')")
            if c.fetchone()[0] is None:
                raise SystemExit('Chưa có bảng ban_vt_anh — chạy backend/sql/2026-11-15_ban_vat_tu_bo_sung.sql trước')
        cn.commit()
        with cn:  # 1 giao dịch
            with cn.cursor() as c:
                # Ảnh người dùng đã ẩn / đã duyệt: không chọn lại, ảnh đã duyệt chiếm chỗ trong hạn mức 6 ảnh
                c.execute("SELECT ma_vat_tu, hash, trang_thai FROM ban_vt_anh WHERE trang_thai <> 'tu_dong'")
                bo, da_dung = set(), Counter()
                for ma, hs, tt in c.fetchall():
                    bo.add((ma, hs))
                    if tt == 'da_duyet':
                        da_dung[ma] += 1
                ds, _ = chon_anh(ban_ghi, bo, da_dung)
                file_loi = sorted(set(file_loi))
                c.execute("SELECT count(*) FROM ban_vt_anh WHERE nguon = 'SHEET03' AND trang_thai = 'tu_dong'"
                          " AND NOT (file_nguon = ANY(%s))", (file_loi,))
                dang_co = c.fetchone()[0]
                print(f'Đang có {dang_co:,} ảnh tu_dong SHEET03 (ngoài file lỗi) · sẽ ghi {len(ds):,}'
                      f' (bỏ {len(bo):,} cặp mã-ảnh đã ẩn/duyệt)')
                if not ds:
                    raise SystemExit('Kết quả 0 ảnh sau khi bỏ ảnh đã ẩn/duyệt — KHÔNG ghi')
                if dang_co and len(ds) < NGUONG_GIAM * dang_co and not cho_phep_giam:
                    raise SystemExit(f'Số ảnh mới {len(ds):,} < {NGUONG_GIAM:.0%} số đang có {dang_co:,} — KHÔNG ghi '
                                     '(kiểm tra ổ G: / file lỗi; chắc chắn thì thêm --cho-phep-giam)')
                # file đọc lỗi: giữ ảnh cũ của chúng (file_nguon lưu tên file)
                c.execute("DELETE FROM ban_vt_anh WHERE nguon = 'SHEET03' AND trang_thai = 'tu_dong'"
                          " AND NOT (file_nguon = ANY(%s))", (file_loi,))
                xoa = c.rowcount
                rows = [(r['ma_vat_tu'], 'SHEET03', r['hash'], psycopg2.Binary(r['data']), 'image/jpeg', r['rong'], r['cao'],
                         r['kich_thuoc'], r['cong_trinh'], r['code_vat_lieu'], r['mo_ta'], r['file_nguon'],
                         r['dong_nguon'], r['chac_chan']) for r in ds]
                them = 0
                for i in range(0, len(rows), 50):  # lô nhỏ: mỗi ảnh ~100 KB
                    execute_values(c, f'INSERT INTO ban_vt_anh ({", ".join(COT)}) VALUES %s '
                                      'ON CONFLICT (ma_vat_tu, hash) DO NOTHING', rows[i:i + 50], page_size=50)
                    them += max(c.rowcount, 0)
                c.execute("UPDATE table_versions SET last_updated = now() WHERE table_name = 'ban_vt'")
                if c.rowcount == 0:
                    c.execute("INSERT INTO table_versions (table_name, last_updated) VALUES ('ban_vt', now())")
        print(f'ĐÃ GHI DB: xoá {xoa:,} ảnh tu_dong cũ · thêm {them:,}/{len(ds):,} ảnh '
              f'(còn lại trùng dòng đã duyệt/ẩn) · bump table_versions ban_vt')
    finally:
        cn.close()


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description='Nạp ảnh mẫu vật liệu sheet 03_MATERIALS vào ban_vt_anh')
    ap.add_argument('--goc', default=GOC_DU_AN, help=f'thư mục 005_PROJECT (mặc định {GOC_DU_AN})')
    ap.add_argument('--ton', help='file BC ton kho vat tu dd.mm.yyyy.xlsx (mặc định: mới nhất như nap_ban_vat_tu.py)')
    ap.add_argument('--cong-trinh', action='append', help='chỉ quét thư mục công trình chứa chuỗi này (lặp được)')
    ap.add_argument('--xem-truoc', help='thư mục ghi ảnh đã nén + anh.csv + index.html để duyệt (chạy khô)')
    ap.add_argument('--luong', type=int, default=6, help='số file đọc song song (mặc định 6)')
    ap.add_argument('--ghi', action='store_true', help='GHI DB thật; mặc định chạy khô')
    ap.add_argument('--cho-phep-file-loi', action='store_true',
                    help='vẫn --ghi khi có file đọc lỗi (ảnh cũ của file lỗi được giữ nguyên)')
    ap.add_argument('--cho-phep-giam', action='store_true',
                    help=f'vẫn --ghi khi số ảnh mới < {NGUONG_GIAM:.0%} số ảnh tu_dong đang có')
    a = ap.parse_args()
    if a.ghi and a.cong_trinh:
        raise SystemExit('--ghi không dùng cùng --cong-trinh: lệnh ghi xoá ảnh tu_dong của MỌI công trình rồi chỉ nạp lại '
                         'phần đã lọc. --cong-trinh chỉ để chạy khô thử.')
    try:
        import PIL  # noqa: F401
    except ImportError:
        raise SystemExit('Thiếu Pillow: pip install --user pillow')

    t0 = time.time()
    f_ton = a.ton or nb.file_ton_moi_nhat(nb.THU_MUC_TON)
    nc = nb.ngay_tu_ten(f_ton) or datetime.date.today()
    print(f'Tồn: {f_ton}')
    ton, _ = nb.doc_ton(f_ton, nc)
    gia_tri, ten_ton = Counter(), {}
    for r in ton:
        gia_tri[r['ma_vat_tu']] += r['gia_tri'] or 0
        ten_ton.setdefault(r['ma_vat_tu'], r['ten_vat_tu'] or '')
    ma_ton = set(gia_tri)
    tong_gt = sum(gia_tri.values())
    print(f'  {len(ma_ton):,} mã · {tong_gt:,.3f} triệu · {time.time() - t0:.1f}s')

    files = tim_file(a.goc, a.cong_trinh)
    print(f'File Production Status: {len(files)} ({sum(os.path.getsize(f) for f, _ in files) / 1e9:.2f} GB)'
          f' · {time.time() - t0:.1f}s')
    if not files:
        raise SystemExit('Không tìm thấy file nào')

    ban_ghi, tk, loi = [], Counter(), []
    with ThreadPoolExecutor(max_workers=max(1, a.luong)) as ex:
        tuong_lai = {ex.submit(xu_ly_file, f, mt, ma_ton): f for f, mt in files}
        for i, fu in enumerate(as_completed(tuong_lai), start=1):
            f = tuong_lai[fu]
            out, t, l, giay = fu.result()
            ban_ghi.extend(out)
            tk.update(t)
            if l:
                loi.append((f, l))
            print(f'  [{i}/{len(files)}] {giay:5.1f}s {len(out):4d} ảnh-mã {"LỖI " + l if l else ""} '
                  f'{os.path.basename(f)}', flush=True)

    ds, logo = chon_anh(ban_ghi)
    pt = lambda x, y: f'{(100.0 * x / y if y else 0):.1f}%'
    co_anh = {r['ma_vat_tu'] for r in ds}
    chac = {r['ma_vat_tu'] for r in ds if r['chac_chan']}
    duyet = co_anh - chac
    gt = lambda s: sum(gia_tri[m] for m in s)
    hash_ds = {r['hash']: r['kich_thuoc'] for r in ds}
    print('\n=== THỐNG KÊ ẢNH SHEET 03 ===')
    print(f'File quét: {len(files)} · lỗi/bỏ: {len(loi)}')
    for f, l in loi:
        print(f'  - {l}: {f}')
    print(f'Dòng 03 có mã SAP: {tk["dong_co_ma"]:,} · có mã đang tồn: {tk["dong_ma_ton"]:,}'
          f' · trong đó có ảnh: {tk["dong_ma_ton_co_anh"]:,}')
    for k, v in sorted(tk.items()):
        if k.startswith('bo_anh'):
            print(f'  {k}: {v:,} ảnh')
    print(f'Ảnh logo/giữ chỗ bỏ (1 ảnh lặp >= {LOGO_SO_DONG} dòng 03): {len(logo)}')
    print(f'MÃ CÓ ẢNH: {len(co_anh):,}/{len(ma_ton):,} = {pt(len(co_anh), len(ma_ton))} số mã'
          f' · {pt(gt(co_anh), tong_gt)} giá trị ({gt(co_anh):,.1f} triệu)')
    print(f'  chắc chắn (có >=1 ảnh từ dòng 1 mã): {len(chac):,} mã · {pt(gt(chac), tong_gt)} giá trị')
    print(f'  cần duyệt (chỉ có ảnh dòng nhiều mã): {len(duyet):,} mã · {pt(gt(duyet), tong_gt)} giá trị')
    print(f'Dòng ban_vt_anh sẽ ghi: {len(ds):,} (chắc chắn {sum(r["chac_chan"] for r in ds):,},'
          f' cần duyệt {sum(not r["chac_chan"] for r in ds):,}) · ảnh khác nhau {len(hash_ds):,}')
    so_anh = Counter(Counter(r['ma_vat_tu'] for r in ds).values())
    print(f'Số ảnh / mã: {dict(sorted(so_anh.items()))}')
    tong_b = sum(r['kich_thuoc'] for r in ds)
    print(f'Dung lượng: {tong_b / 1e6:,.1f} MB theo dòng ghi DB (ảnh khác nhau {sum(hash_ds.values()) / 1e6:,.1f} MB)'
          f' · trung bình {tong_b / max(1, len(ds)) / 1e3:,.0f} KB/ảnh')
    print('Công trình nhiều mã có ảnh nhất:',
          dict(Counter(r['cong_trinh'] or '?' for r in {(r['ma_vat_tu'], r['cong_trinh']): r for r in ds}.values())
               .most_common(10)))
    print('Top 10 mã giá trị lớn có ảnh:')
    for m in sorted(co_anh, key=lambda m: -gia_tri[m])[:10]:
        r0 = next(r for r in ds if r['ma_vat_tu'] == m)
        print(f'  {m} {ten_ton.get(m, "")[:40]:40s} {gia_tri[m]:>10,.1f} tr · {r0["cong_trinh"]} {r0["code_vat_lieu"] or ""}'
              f'{"" if m in chac else " · cần duyệt"}')

    if a.xem_truoc:
        ghi_xem_truoc(a.xem_truoc, ds, ten_ton, gia_tri)
        print(f'Xem trước: {os.path.join(a.xem_truoc, "index.html")} · anh.csv · thư mục anh\\')
    if a.ghi:
        file_loi = [os.path.basename(f) for f, l in loi if l.startswith(LOI_DOC)]
        if file_loi and not a.cho_phep_file_loi:
            raise SystemExit(f'{len(file_loi)} file đọc LỖI — KHÔNG ghi (ảnh cũ của chúng sẽ bị xoá mà không nạp lại). '
                             'Chạy lại khi file đọc được, hoặc thêm --cho-phep-file-loi để ghi mà giữ ảnh cũ của các file đó.')
        ghi(ban_ghi, file_loi, a.cho_phep_giam)
    else:
        if not ds:
            print('CẢNH BÁO: 0 ảnh — chạy --ghi sẽ bị chặn')
        print('\nCHẠY KHÔ — không kết nối / không ghi DB. Thêm --ghi để ghi.')
    print(f'Xong sau {time.time() - t0:.1f}s')


if __name__ == '__main__':
    main()
