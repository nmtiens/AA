"""Nạp biên bản họp (Shared Drive 002_REPORTS\\08_BIÊN BẢN HỌP) -> bảng bien_ban_hop, tách từng ý + gắn mã công trình.

Nguồn: mọi .xlsx trong 08_BIÊN BẢN HỌP (họp sản xuất hằng ngày gồm cả thư mục THÁNG xx, họp vật tư, kick off, BBH TKSX…).
Mẫu biên bản: dòng tiêu đề có "STT" + "NỘI DUNG"; cột CHỦ ĐỀ / NỘI DUNG / ĐỀ XUẤT - GIẢI PHÁP / NGƯỜI THỰC HIỆN /
NGÀY HOÀN THÀNH; đọc tới dòng "KẾT THÚC" / "KẾT LUẬN". Ô NỘI DUNG tách ý theo "1. … 2. …".

Gắn mã công trình cho từng ý (ghi cột khop để kiểm tra):
  1. mã CTxx-xxx / POxx-xxx ghi trong chữ (cả "CT24-067&066");
  2. tên gọi dài nhất khớp trọn từ (bỏ dấu, không phân biệt hoa thường): tên công trình trong bảng sản xuất (bỏ đuôi mã,
     cả đoạn trước "_" / " - ") + bảng biệt danh C:\\bien-ban-hop\\cong_trinh.txt (tên chính + tên trong ngoặc viết hoa).
     Cùng độ dài khớp nhiều mã (vd TIẾN BỘ PLAZA) => gắn cả, khop đánh dấu "≈".
  3. file kick off / TKSX: mã trong tên file áp cho mọi ý của file (và 1 dòng đại diện file).
Link Drive (xem trong app) lấy từ metadata Drive for Desktop.

Chạy:  python nap_bien_ban_hop.py --thu      (đọc + gắn + in thống kê, không ghi DB)
       python nap_bien_ban_hop.py            (tạo bảng nếu chưa có + thay nguyên dữ liệu, 1 giao dịch)
"""
import argparse, collections, datetime, glob, os, re, shutil, sqlite3, sys, tempfile, unicodedata, warnings

warnings.filterwarnings('ignore')
GOC = r'G:\Shared drives\PPD-Production Planning Department\002_REPORTS\08_BIÊN BẢN HỌP'
# Biệt danh công trình của tool biên bản họp: bản trên máy (C:\bien-ban-hop) hoặc bản trên Drive (máy trạm)
BIET_DANH = next((p for p in (r'C:\bien-ban-hop\cong_trinh.txt',
                              r'G:\Shared drives\PPD-Production Planning Department\003_PERSONAL\13_MR_TIEN\bien-ban-hop\cong_trinh.txt')
                  if os.path.exists(p)), r'C:\bien-ban-hop\cong_trinh.txt')
SQL_BANG = None  # tìm lúc chạy: file_sql()
MA = re.compile(r'\b(CT|PO)\s?(\d{2})-(\d{3})((?:\s*[&,]\s*\d{3})*)', re.I)
LOAI = [('4_HỌP SẢN XUẤT', 'HỌP SẢN XUẤT HÀNG NGÀY'), ('HỌP ĐỊNH KỲ VẬT TƯ', 'HỌP VẬT TƯ'), ('KICK OFF', 'KICK OFF'),
        ('BBH TKSX', 'BBH TKSX'), ('BÁM SÁT', 'BÁM SÁT DỰ ÁN')]


def bo_dau(s):
    s = unicodedata.normalize('NFD', str(s or '')).replace('đ', 'd').replace('Đ', 'D')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').upper()
    return ' '.join(re.sub(r'[^0-9A-Z]+', ' ', s).split())


def ma_trong(s):
    kq = []
    for m in MA.finditer(str(s or '')):
        dau = f'{m.group(1).upper()}{m.group(2)}'
        kq.append(f'{dau}-{m.group(3)}')
        for them in re.findall(r'\d{3}', m.group(4) or ''):
            kq.append(f'{dau}-{them}')
    return list(dict.fromkeys(kq))


# .env: biến môi trường DATABASE_URL > backend/.env (chạy trong repo) > .env chung của tool trên Drive (máy trạm PC01)
ENV_DRIVE = r"G:\Shared drives\PPD-Production Planning Department\003_PERSONAL\13_MR_TIEN\Code upload dữ liệu web\.env"


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
        if kv.get('LB_HOST'):  # .env chung của tool trên Drive: LB_USER / LB_PASSWORD / LB_HOST / LB_PORT / LB_DB_NAME
            from urllib.parse import quote
            return (f"postgresql://{quote(kv.get('LB_USER', 'layerbase'))}:{quote(kv.get('LB_PASSWORD', ''))}@{kv['LB_HOST']}:"
                    f"{kv.get('LB_PORT', '5432')}/{kv.get('LB_DB_NAME', 'aa')}?sslmode=require")
    raise SystemExit('Không thấy DATABASE_URL')


def file_sql(ten):
    """file .sql tạo bảng: backend/sql/ (repo) hoặc cùng thư mục script (thư mục tool trên Drive)"""
    for p in (os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sql', ten),
              os.path.join(os.path.dirname(os.path.abspath(__file__)), ten)):
        if os.path.exists(p):
            return p
    raise SystemExit(f'Không thấy {ten}')


def ket_noi():
    import psycopg2
    url = doc_env()
    return psycopg2.connect(url if 'sslmode=' in url else url + ('&' if '?' in url else '?') + 'sslmode=require')


def bang_ten(cn):
    """(tên sản xuất: alias -> {mã}, biệt danh: alias -> {mã}, số HEX đang sản xuất theo mã)"""
    ten = collections.defaultdict(set)
    biet = collections.defaultdict(set)
    with cn.cursor() as c:
        c.execute('SET TRANSACTION READ ONLY')
        c.execute('SET LOCAL statement_timeout = 60000')
        c.execute("""SELECT DISTINCT UPPER(TRIM(ma_cong_trinh)), ten_cong_trinh FROM production_status_app
                      WHERE UPPER(TRIM(ma_cong_trinh)) ~ '^(CT|PO)[0-9]{2}-[0-9]{3}$' AND COALESCE(ten_cong_trinh, '') <> ''""")
        rows = c.fetchall()
        c.execute("""SELECT UPPER(TRIM(ma_cong_trinh)), count(*) FROM production_status_app
                      WHERE UPPER(COALESCE(tinh_trang_ipo, '')) LIKE '%ĐANG SẢN XUẤT%' GROUP BY 1""")
        dang = dict(c.fetchall())
    cn.rollback()
    for ma, t in rows:
        goc = re.sub(r'[\s_-]*(CT|PO)\d{2}-\d{3}\s*$', '', t, flags=re.I)
        doan = [x for x in re.split(r'_| - ', goc) if x.strip()]
        ung = {goc, doan[0], doan[-1]} if doan else {goc}
        for a in list(ung):  # tên gọi tắt trong họp: bỏ chữ chung ở đầu (PUBLIC APEC S3 -> APEC S3)
            ung.add(re.sub(r'^(PUBLIC|KS|KHÁCH SẠN|KHACH SAN|DỰ ÁN|DU AN|CĂN MẪU|CAN MAU)\s+', '', a.strip(), flags=re.I))
        for a in ung:
            a2 = bo_dau(a)
            if len(a2) >= 6 and not a2.startswith('NOI BO') and a2 not in ('DAI TRA', 'LOOSE', 'HTNT', 'MOCKUP', 'FIT OUT'):
                ten[a2].add(ma)
    if os.path.exists(BIET_DANH):
        for dong in open(BIET_DANH, encoding='utf-8'):
            if dong.startswith('#') or '|' not in dong:
                continue
            ma, rest = [x.strip() for x in dong.split('|', 1)]
            chinh = re.split(r'\s+—|\(', rest)[0]
            ds = [chinh] + [x for x in re.findall(r'\(([^)]*)\)', rest) if x[:1].isupper()]
            for a in ds:
                a2 = bo_dau(a)
                if len(a2) >= 5:
                    biet[a2].add(ma.upper())
    return ten, biet, dang


def khop_dai_nhat(t, bang):
    tot, dai = [], 0
    for a, ms in bang.items():
        if len(a) >= dai and f' {a} ' in t:
            if len(a) > dai:
                tot, dai = [], len(a)
            tot.append((a, ms))
    return tot


def gan(text, bang, ma_file):
    """[(ma, khop)] cho 1 ý. Ưu tiên: mã trong chữ > mã trong tên file > biệt danh > tên sản xuất (trùng nhiều mã thì
    giữ công trình còn hạng mục ĐANG SẢN XUẤT; vẫn nhiều => gắn cả, khop "≈")"""
    ten, biet, dang = bang
    mas = ma_trong(text)
    if mas:
        return [(m, m) for m in mas]
    if ma_file:
        return [(m, f'file {m}') for m in ma_file]
    t = f' {bo_dau(text)} '
    tb, tt = khop_dai_nhat(t, biet), khop_dai_nhat(t, ten)
    # biệt danh thắng khi dài bằng / hơn tên sản xuất (biệt danh do người soạn biên bản chốt mã)
    tot = tb if tb and (not tt or len(tb[0][0]) >= len(tt[0][0])) else tt
    if not tot:
        return []
    mas = sorted({m for _, ms in tot for m in ms})
    if len(mas) > 1:
        con = [m for m in mas if dang.get(m, 0) > 0]
        if con:
            mas = con
    dau = '≈' if len(mas) > 1 else ''
    return [(m, dau + tot[0][0]) for m in mas]


def drive_ids():
    """đường dẫn tương đối trong 08_BIÊN BẢN HỌP (bỏ dấu) -> mã file Drive"""
    goc = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Google', 'DriveFS')
    kq = {}
    for d in glob.glob(os.path.join(goc, '*')):
        if not os.path.isfile(os.path.join(d, 'metadata_sqlite_db')):
            continue
        tam = tempfile.mkdtemp(prefix='bbh_')
        try:
            for f in ('metadata_sqlite_db', 'metadata_sqlite_db-wal', 'metadata_sqlite_db-shm'):
                if os.path.exists(os.path.join(d, f)):
                    shutil.copy2(os.path.join(d, f), os.path.join(tam, f))
            c = sqlite3.connect(os.path.join(tam, 'metadata_sqlite_db'))
            items = {r[0]: r for r in c.execute('SELECT stable_id, id, local_title, is_folder, trashed FROM items')}
            con = collections.defaultdict(list)
            for i, p in c.execute('SELECT item_stable_id, parent_stable_id FROM stable_parents'):
                con[p].append(i)
            c.close()
            for s, r in items.items():
                if r[2] == '08_BIÊN BẢN HỌP' and r[3] and not r[4]:
                    st = [(s, '')]
                    while st:
                        x, duong = st.pop()
                        for k in con[x]:
                            it = items.get(k)
                            if not it or it[4]:
                                continue
                            dd = f'{duong}/{it[2]}' if duong else it[2]
                            if it[3]:
                                st.append((k, dd))
                            else:
                                kq[bo_dau(dd)] = it[1]
        finally:
            shutil.rmtree(tam, ignore_errors=True)
    return kq


def doc_file(duong):
    import openpyxl
    wb = openpyxl.load_workbook(duong, read_only=True, data_only=True)
    try:
        ws = next((wb[n] for n in wb.sheetnames if 'BIÊN' in n.upper()), wb.worksheets[0])
        hang = [list(r) for r in ws.iter_rows(min_row=1, max_row=400, values_only=True)]
    finally:
        wb.close()
    tieu = None
    for i, r in enumerate(hang):
        txt = [str(x or '').strip().upper() for x in r]
        if 'STT' in txt and any('NỘI DUNG' in x for x in txt):
            tieu = i
            break
    if tieu is None:
        return []
    txt = [str(x or '').strip().upper() for x in hang[tieu]]
    cot = lambda *k: next((j for j, x in enumerate(txt) if any(kk in x for kk in k)), None)
    c_cd, c_nd, c_dx, c_ng, c_han = cot('CHỦ ĐỀ'), cot('NỘI DUNG'), cot('ĐỀ XUẤT', 'GIẢI PHÁP'), cot('NGƯỜI'), cot('NGÀY HOÀN THÀNH', 'HẠN', 'THỜI HẠN')
    ra = []
    for i in range(tieu + 1, len(hang)):
        r = hang[i]
        lay = lambda j: (str(r[j]).strip() if j is not None and j < len(r) and r[j] not in (None, '') else '')
        gop = ' '.join(lay(j) for j in range(len(r)))
        if re.search(r'KẾT THÚC|KẾT LUẬN', gop.upper()) and not lay(c_nd):
            break
        nd, cd, dx = lay(c_nd), lay(c_cd), lay(c_dx)
        if not nd and dx:  # biên bản họp ngày: nội dung ghi ở cột ĐỀ XUẤT (ô gộp), cột NỘI DUNG trống
            nd, dx = dx, ''
        if not nd and not cd:
            continue
        han = r[c_han] if c_han is not None and c_han < len(r) else None
        han = han.strftime('%d/%m/%Y') if isinstance(han, (datetime.date, datetime.datetime)) else (str(han).strip() if han not in (None, '') else '')
        y = [x.strip() for x in re.split(r'(?m)^\s*(?=\d{1,2}[\.\)]\s)', nd) if x.strip()] or [nd]
        for k, noi in enumerate(y):
            ra.append((i + 1, k + 1, cd, noi, dx, lay(c_ng), han))
    return ra


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--thu', action='store_true', help='chỉ in thống kê, không ghi DB')
    ap.add_argument('--goc', default=GOC)
    a = ap.parse_args()
    cn = ket_noi()
    try:
        bang = bang_ten(cn)
        ids = drive_ids()
        files = []
        for thu_muc, _, ds in os.walk(a.goc):
            for f in ds:
                if f.lower().endswith('.xlsx') and not f.startswith('~$') and 'MẪU' not in f.upper() and 'TEMPLATE' not in f.upper():
                    files.append(os.path.join(thu_muc, f))
        dong, loi = [], []
        for p in sorted(files):
            rel = os.path.relpath(p, a.goc).replace('\\', '/')
            loai = next((v for k, v in LOAI if k in rel.upper()), 'KHÁC')
            m = re.match(r'(\d{2})(\d{2})(\d{2})', os.path.basename(p))
            try:
                ngay = datetime.date(2000 + int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None
            except ValueError:
                ngay = None
            ma_file = ma_trong(os.path.basename(p))
            did = ids.get(bo_dau(rel))
            try:
                y = doc_file(p)
            except Exception as e:  # file hỏng / đang mở
                loi.append(f'{rel}: {e}')
                y = []
            if ma_file:  # 1 dòng đại diện file cho kick off / TKSX (file chưa đọc được nội dung vẫn hiện)
                for mf in ma_file:
                    dong.append((loai, ngay, os.path.basename(p), did, f'{rel}#0', None, None, None, None, None, mf, f'file {mf}'))
            for (hg, k, cd, noi, dx, ng, han) in y:
                for ma, khop in gan(f'{cd}\n{noi}', bang, ma_file) or [(None, None)]:
                    dong.append((loai, ngay, os.path.basename(p), did, f'{rel}#{hg}#{k}', cd or None, noi or None, dx or None, ng or None, han or None, ma, khop))
        y_all = {d[4] for d in dong if not d[4].endswith('#0')}
        y_gan = {d[4] for d in dong if d[10] and not d[4].endswith('#0')}
        print(f'{len(files)} file · {len(y_all)} ý · gắn được mã {len(y_gan)} ý ({len(y_gan) * 100 // max(1, len(y_all))}%) · {len({d[10] for d in dong if d[10]})} công trình · {len(loi)} file lỗi')
        print('Theo loại:', dict(collections.Counter(d[0] for d in dong)))
        top = collections.Counter(d[10] for d in dong if d[10]).most_common(12)
        print('Nhiều ý nhất:', top)
        for d in [x for x in dong if x[10] in ('CT26-116', 'CT26-041') and x[6]][:6]:
            print(' ', d[10], d[1], '|', d[11], '|', (d[6] or '')[:110].replace('\n', ' '))
        for e in loi[:5]:
            print('LỖI', e)
        if a.thu:
            return
        from psycopg2.extras import execute_values
        with cn:
            with cn.cursor() as c:
                c.execute('SET LOCAL statement_timeout = 120000')
                c.execute(open(file_sql('2026-11-20_bien_ban_hop.sql'), encoding='utf-8').read())
                c.execute('DELETE FROM bien_ban_hop')
                execute_values(c, '''INSERT INTO bien_ban_hop (loai, ngay, ten_file, drive_id, y_id, chu_de, noi_dung, de_xuat, nguoi, han, ma_ct, khop)
                                      VALUES %s''', dong, page_size=2000)
        print(f'Đã ghi {len(dong)} dòng vào bien_ban_hop')
    finally:
        cn.close()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
