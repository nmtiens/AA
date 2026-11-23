"""Nạp DANH MỤC VẬT LIỆU của từng công trình (sheet 03_MATERIALS file Production Status) kèm ẢNH MẪU vào DB
=> mục "3. Danh mục vật liệu" trang Hồ sơ công trình (thẻ ảnh từng vật liệu đang dùng ở công trình).

Nguồn: G:\\Shared drives\\PPD-Production Planning Department\\005_PROJECT\\<năm | nhóm>\\<CT>\\02_SẢN XUẤT\\05_PRODUCTION STATUS\\*.xlsx|xlsm
  1 công trình nhiều file => lấy file sửa gần nhất. Đọc thẳng zip + XML (file có thể > 300 MB).
  Sheet 03_MATERIALS: dòng tiêu đề (<= 15) có ô "CODE VẬT LIỆU"; 1 dòng = 1 vật liệu (bỏ dòng không có code lẫn mô tả).
  Ảnh: cột "HÌNH MẪU VẬT LIỆU" (ảnh nổi neo ở cột đó ±1 và ảnh trong ô), tối đa 3 ảnh / dòng, cạnh dài <= 480 px,
  JPEG q=72; bỏ ảnh gốc < 2 KB / < 64 px / ảnh lặp >= 8 dòng (logo). Ảnh lưu 1 lần theo hash (dùng chung giữa công trình).
Đích (tạo bằng ct_vat_lieu.sql — tool tự chạy CREATE IF NOT EXISTS khi --ghi):
  ct_vl_file (1 dòng / công trình), ct_vl (1 dòng / vật liệu), ct_vl_anh (ảnh theo hash), ct_vl_anh_dong (dòng -> ảnh).

- MẶC ĐỊNH CHẠY KHÔ: không ghi DB, in số vật liệu / ảnh / dung lượng từng công trình.
- --ghi: mỗi công trình 1 giao dịch: xoá dòng cũ của công trình, ghi lại; ảnh (hash) mới mới INSERT; cuối cùng xoá ảnh
  không còn dòng nào dùng. Chỉ nạp lại công trình có file đổi (mtime / tên) so với lần trước, --tat-ca để nạp lại hết.
  File đọc lỗi => dữ liệu cũ của công trình giữ nguyên, ghi lỗi vào ct_vl_file.

Cách chạy (thư mục backend, hoặc thư mục tool trên Drive):
  python nap_danh_muc_vl.py --cong-trinh CT26-041            # chạy khô 1 công trình
  python nap_danh_muc_vl.py                                  # chạy khô toàn bộ (in dung lượng)
  python nap_danh_muc_vl.py --ghi                            # ghi DB thật
Cần: pip install pillow psycopg2-binary
"""
import argparse, datetime, hashlib, io, os, posixpath, re, sys, time, unicodedata, zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.dont_write_bytecode = True
sys.stdout.reconfigure(encoding='utf-8')

GOC_DU_AN = r'G:\Shared drives\PPD-Production Planning Department\005_PROJECT'
ENV_DRIVE = r'G:\Shared drives\PPD-Production Planning Department\003_PERSONAL\13_MR_TIEN\Code upload dữ liệu web\.env'
SHEET = '03_MATERIALS'
COT_MOC = 'CODE VẬT LIỆU'
COT_HINH = 'HÌNH MẪU VẬT LIỆU'
# (cột DB, tiêu đề sheet 03) — thiếu cột nào thì để trống
COT = [('nhom', 'NHÓM VẬT TƯ'), ('code', 'CODE VẬT LIỆU'), ('mo_ta', 'MÔ TẢ VẬT LIỆU'), ('tt_mau', 'TÌNH TRẠNG MẪU'),
       ('ngay_duyet', 'NGÀY DUYỆT MẪU'), ('nhu_cau', 'PHÂN LOẠI NHU CẦU ĐẶT MUA'), ('vi_tri', 'GHI CHÚ'),
       ('dvt_qs', 'ĐVT THEO QS'), ('sl_qs', 'SỐ LƯỢNG TỔNG THEO QS'), ('ma_sap', 'MÃ VẬT TƯ SAP'), ('ten_vt', 'TÊN VẬT TƯ'),
       ('tt_pr', 'TÌNH TRẠNG PR'), ('tt_vat_tu', 'TÌNH TRẠNG VẬT TƯ'), ('bop_m2', 'BOP-M2')]
CANH_DAI, CHAT_LUONG, GOC_TOI_THIEU, PX_TOI_THIEU, ANH_MOI_DONG, LOGO_SO_DONG = 480, 72, 2048, 64, 3, 8
MA_CT = re.compile(r'\b((?:CT|PO)\d{2}-\d{3})\b', re.I)
NS = {
    'm': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
    'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'xlrd': 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata',
}
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
M = '{%s}' % NS['m']


def nfc(s):
    return unicodedata.normalize('NFC', s)


def chuan(v):
    return re.sub(r'\s+', ' ', nfc(str(v or ''))).strip().upper()


def doc_env():
    url = os.environ.get('DATABASE_URL')
    if url:
        return url
    for p in (os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'), ENV_DRIVE):
        if not os.path.exists(p):
            continue
        kv = {}
        for dong in open(p, encoding='utf-8'):
            if '=' in dong and not dong.lstrip().startswith('#'):
                k, v = dong.split('=', 1)
                kv[k.strip()] = v.strip().strip('"')
        if kv.get('DATABASE_URL'):
            return kv['DATABASE_URL']
        if kv.get('LB_HOST'):
            from urllib.parse import quote
            return (f"postgresql://{quote(kv.get('LB_USER', 'layerbase'))}:{quote(kv.get('LB_PASSWORD', ''))}@{kv['LB_HOST']}:"
                    f"{kv.get('LB_PORT', '5432')}/{kv.get('LB_DB_NAME', 'aa')}?sslmode=require")
    raise SystemExit('Không thấy DATABASE_URL')


def file_sql(ten):
    for p in (os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sql', ten),
              os.path.join(os.path.dirname(os.path.abspath(__file__)), ten)):
        if os.path.exists(p):
            return p
    raise SystemExit(f'Không thấy {ten}')


# ---------------------------------------------------------------- tìm file
def tim_file(goc, loc_ct=None):
    """{mã CT: (đường dẫn, mtime)} — file sửa gần nhất trong <goc>\\<nhóm>\\<CT>\\02_SẢN XUẤT\\05_PRODUCTION STATUS."""
    loc = [x.upper() for x in (loc_ct or [])]
    tat = defaultdict(list)
    for g in os.scandir(goc):
        if not g.is_dir():
            continue
        for ct in os.scandir(g.path):
            if not ct.is_dir() or (loc and not any(x in nfc(ct.name).upper() for x in loc)):
                continue
            sx = next((e.path for e in os.scandir(ct.path) if e.is_dir() and nfc(e.name).upper() == '02_SẢN XUẤT'), None)
            ps = sx and next((e.path for e in os.scandir(sx) if e.is_dir() and nfc(e.name).upper() == '05_PRODUCTION STATUS'), None)
            if not ps:
                continue
            for f in os.scandir(ps):
                if f.is_file() and f.name.lower().endswith(('.xlsx', '.xlsm')) and not f.name.startswith('~$'):
                    m = MA_CT.search(nfc(f.name)) or MA_CT.search(nfc(ct.name))
                    if m:
                        tat[m.group(1).upper()].append((f.path, f.stat().st_mtime))
    return {k: max(v, key=lambda x: x[1]) for k, v in tat.items()}


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
        out[r.get('Id')] = (r.get('Type').rsplit('/', 1)[-1], t[1:] if t.startswith('/') else posixpath.normpath(posixpath.join(d, t)))
    return out


def cot_so(ref):
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
    """vm (1-based) -> media của ảnh trong ô (richData _localImage)."""
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
        cau_truc = [(s.get('t'), [k.get('n') for k in s]) for s in ET.fromstring(z.read('xl/richData/rdrichvaluestructure.xml'))]
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


def ngay_chu(v):
    """Ô ngày: số serial Excel -> dd/mm/yyyy; chữ giữ nguyên."""
    s = (v or '').strip()
    if re.fullmatch(r'\d{5}(\.\d+)?', s):
        d = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(s)))
        return d.strftime('%d/%m/%Y')
    return s


def so_chu(v):
    s = (v or '').strip()
    if re.fullmatch(r'-?\d+\.\d{6,}', s):  # 257.39999999999998
        s = f'{float(s):.6f}'.rstrip('0').rstrip('.')
    return s


def doc_file(duong_dan):
    """-> (dòng[], lỗi|None). Dòng: dict(dong, <cột COT>, media=[...])."""
    with zipfile.ZipFile(duong_dan) as z:
        names = set(z.namelist())
        wbx = ET.fromstring(z.read('xl/workbook.xml'))
        wr = rels(z, 'xl/workbook.xml', names)
        sh = [s for s in wbx.find('m:sheets', NS) if s.get('name', '').strip().upper().startswith(SHEET)]
        if not sh:
            return [], 'không có sheet 03_MATERIALS'
        spath = wr[sh[0].get(R + 'id')][1]
        ss = doc_chuoi_chung(z, names)
        vm_anh = anh_trong_o(z, names)
        o_vm, dong, hdr_dong, hdr = {}, {}, None, None
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
                if rn <= 15 and any(chuan(v) == COT_MOC for v in vals.values()):
                    hdr_dong, hdr = rn, {}
                    for c in sorted(vals):
                        hdr.setdefault(chuan(vals[c]), c)
                continue
            dong[rn] = vals
        if hdr is None:
            return [], f'không thấy cột {COT_MOC}'
        c_hinh = hdr.get(COT_HINH)
        anh = defaultdict(list)
        if c_hinh is not None:
            gan = {c_hinh - 1, c_hinh, c_hinh + 1}
            for _, (typ, tgt) in rels(z, spath, names).items():
                if typ != 'drawing' or tgt not in names:
                    continue
                dx = ET.fromstring(z.read(tgt))
                dr = rels(z, tgt, names)
                for anc in list(dx):
                    fr = anc.find('xdr:from', NS)
                    if fr is None:
                        continue
                    col, row = int(fr.find('xdr:col', NS).text), int(fr.find('xdr:row', NS).text) + 1
                    if col not in gan or row <= hdr_dong:
                        continue
                    for blip in anc.iter('{%s}blip' % NS['a']):
                        m = dr.get(blip.get(R + 'embed'), ('', ''))[1]
                        if m in names and m not in anh[row]:
                            anh[row].append(m)
            for (col, row), v in o_vm.items():
                m = vm_anh.get(v)
                if m and col in gan and row > hdr_dong and m not in anh[row]:
                    anh[row].append(m)
        out = []
        for rn in sorted(dong):
            vals = dong[rn]
            d = {k: (vals.get(hdr[t]) if hdr.get(t) is not None else None) for k, t in COT}
            d = {k: (str(v).strip() if v is not None else '') for k, v in d.items()}
            if not d['code'] and not d['mo_ta']:
                continue
            d['ngay_duyet'] = ngay_chu(d['ngay_duyet'])
            d['sl_qs'] = so_chu(d['sl_qs'])
            # ô nhiều dòng (mỗi PR 1 dòng): mã SAP / tên vật tư bỏ trùng, giữ thứ tự
            for k in ('ma_sap', 'ten_vt'):
                d[k] = '\n'.join(dict.fromkeys(x.strip() for x in d[k].split('\n') if x.strip() and x.strip() != '(rỗng)'))
            d['dong'] = rn
            d['media'] = anh.get(rn, [])
            out.append(d)
        return out, None


def nen_anh(raw):
    from PIL import Image, ImageOps
    if len(raw) < GOC_TOI_THIEU:
        return None
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except Exception:
        return None
    try:
        im = ImageOps.exif_transpose(im)
    except Exception:
        pass
    if max(im.size) < PX_TOI_THIEU:
        return None
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
    return b.getvalue(), im.size[0], im.size[1]


def xu_ly(ma, duong_dan, mtime):
    """-> dict(ma, file, mtime, dong[], anh{hash: (data, w, h)}, loi, giay)"""
    t = time.time()
    kq = dict(ma=ma, file=os.path.basename(duong_dan), mtime=mtime, dong=[], anh={}, loi=None)
    try:
        dong, loi = doc_file(duong_dan)
        if loi:
            kq['loi'] = loi
            return kq
        dem = Counter(m for d in dong for m in set(d['media']))
        cache = {}
        with zipfile.ZipFile(duong_dan) as z:
            for d in dong:
                hs = []
                for m in d['media']:
                    if dem[m] >= LOGO_SO_DONG:
                        continue
                    if m not in cache:
                        cache[m] = nen_anh(z.read(m))
                    r = cache[m]
                    if r is None:
                        continue
                    h = hashlib.sha1(r[0]).hexdigest()
                    kq['anh'][h] = r
                    if h not in hs:
                        hs.append(h)
                    if len(hs) >= ANH_MOI_DONG:
                        break
                d['anh'] = hs
                del d['media']
        kq['dong'] = dong
    except Exception as e:
        kq['loi'] = f'LỖI ĐỌC {type(e).__name__}: {e}'
    kq['giay'] = time.time() - t
    return kq


# ---------------------------------------------------------------- ghi DB
def ghi(ds_kq):
    import psycopg2
    from psycopg2.extras import execute_values
    cn = psycopg2.connect(doc_env(), connect_timeout=30)
    cn.autocommit = False
    try:
        with cn.cursor() as c:
            c.execute("SET statement_timeout = '300s'")
            c.execute(open(file_sql('ct_vat_lieu.sql'), encoding='utf-8').read())
        cn.commit()
        for kq in ds_kq:
            with cn, cn.cursor() as c:
                if kq['loi']:
                    c.execute("""INSERT INTO ct_vl_file (ma_ct, ten_file, mtime, loi, nap_luc) VALUES (%s, %s, to_timestamp(%s), %s, now())
                                 ON CONFLICT (ma_ct) DO UPDATE SET loi = EXCLUDED.loi, nap_luc = now()""",
                              (kq['ma'], kq['file'], kq['mtime'], kq['loi']))
                    continue
                if kq['anh']:
                    c.execute('SELECT hash FROM ct_vl_anh WHERE hash = ANY(%s)', (list(kq['anh']),))
                    co = {r[0] for r in c.fetchall()}
                    moi = [(h, psycopg2.Binary(v[0]), v[1], v[2], len(v[0])) for h, v in kq['anh'].items() if h not in co]
                    for i in range(0, len(moi), 40):
                        execute_values(c, 'INSERT INTO ct_vl_anh (hash, data, rong, cao, kich_thuoc) VALUES %s ON CONFLICT (hash) DO NOTHING', moi[i:i + 40])
                c.execute('DELETE FROM ct_vl_anh_dong WHERE ma_ct = %s', (kq['ma'],))
                c.execute('DELETE FROM ct_vl WHERE ma_ct = %s', (kq['ma'],))
                cot = [k for k, _ in COT]
                execute_values(c, f'INSERT INTO ct_vl (ma_ct, dong, {", ".join(cot)}) VALUES %s',
                               [(kq['ma'], d['dong'], *[d[k] or None for k in cot]) for d in kq['dong']])
                lk = [(kq['ma'], d['dong'], i, h) for d in kq['dong'] for i, h in enumerate(d['anh'])]
                if lk:
                    execute_values(c, 'INSERT INTO ct_vl_anh_dong (ma_ct, dong, thu_tu, hash) VALUES %s', lk)
                c.execute("""INSERT INTO ct_vl_file (ma_ct, ten_file, mtime, so_dong, so_anh, loi, nap_luc)
                             VALUES (%s, %s, to_timestamp(%s), %s, %s, NULL, now())
                             ON CONFLICT (ma_ct) DO UPDATE SET ten_file = EXCLUDED.ten_file, mtime = EXCLUDED.mtime, so_dong = EXCLUDED.so_dong,
                               so_anh = EXCLUDED.so_anh, loi = NULL, nap_luc = now()""",
                          (kq['ma'], kq['file'], kq['mtime'], len(kq['dong']), len(lk)))
        with cn, cn.cursor() as c:
            c.execute('DELETE FROM ct_vl_anh a WHERE NOT EXISTS (SELECT 1 FROM ct_vl_anh_dong d WHERE d.hash = a.hash)')
            print(f'Xoá {c.rowcount} ảnh không còn dùng')
    finally:
        cn.close()


def da_nap():
    """{mã: (tên file, mtime epoch)} lần nạp trước (chưa có bảng => {})"""
    import psycopg2
    cn = psycopg2.connect(doc_env(), connect_timeout=30)
    try:
        with cn.cursor() as c:
            c.execute("SELECT to_regclass('ct_vl_file')")
            if c.fetchone()[0] is None:
                return {}
            c.execute('SELECT ma_ct, ten_file, extract(epoch FROM mtime) FROM ct_vl_file WHERE loi IS NULL')
            return {r[0]: (r[1], float(r[2] or 0)) for r in c.fetchall()}
    finally:
        cn.close()


def main():
    ap = argparse.ArgumentParser(description='Nạp danh mục vật liệu + ảnh mẫu sheet 03_MATERIALS')
    ap.add_argument('--goc', default=GOC_DU_AN)
    ap.add_argument('--cong-trinh', action='append', help='chỉ công trình chứa chuỗi này (lặp được)')
    ap.add_argument('--ghi', action='store_true', help='GHI DB thật; mặc định chạy khô')
    ap.add_argument('--tat-ca', action='store_true', help='nạp lại cả công trình có file không đổi')
    ap.add_argument('--luong', type=int, default=4)
    a = ap.parse_args()
    t0 = time.time()
    fs = tim_file(a.goc, a.cong_trinh)
    print(f'{len(fs)} công trình có file Production Status ({time.time() - t0:.0f}s)')
    if a.ghi and not a.tat_ca:
        cu = da_nap()
        bo = [m for m, (p, mt) in fs.items() if m in cu and cu[m][0] == os.path.basename(p) and abs(cu[m][1] - mt) < 2]
        for m in bo:
            del fs[m]
        print(f'Bỏ {len(bo)} công trình file không đổi, còn {len(fs)}')
    ds = []
    with ThreadPoolExecutor(a.luong) as ex:
        tl = [ex.submit(xu_ly, m, p, mt) for m, (p, mt) in fs.items()]
        for f in as_completed(tl):
            kq = f.result()
            ds.append(kq)
            kb = sum(len(v[0]) for v in kq['anh'].values()) / 1024
            co_anh = sum(1 for d in kq['dong'] if d.get('anh'))
            print(f"{kq['ma']:<10} {len(kq['dong']):>4} VL · {co_anh:>4} có ảnh · {len(kq['anh']):>4} ảnh {kb:>7.0f} KB"
                  f"{' · ' + kq['loi'] if kq['loi'] else ''}  ({kq.get('giay', 0):.0f}s)")
    tong = {h: v for kq in ds for h, v in kq['anh'].items()}
    print(f"TỔNG: {sum(len(k['dong']) for k in ds)} vật liệu · {len(tong)} ảnh khác nhau · "
          f"{sum(len(v[0]) for v in tong.values()) / 1048576:.1f} MB · lỗi {sum(1 for k in ds if k['loi'])} file · {time.time() - t0:.0f}s")
    if a.ghi:
        ghi(sorted(ds, key=lambda k: k['ma']))
        print('ĐÃ GHI DB')
    else:
        print('(chạy khô — thêm --ghi để ghi DB)')


if __name__ == '__main__':
    main()
