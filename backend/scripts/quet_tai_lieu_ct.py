"""Quét danh mục file thư mục dự án trên Shared Drive -> bảng cong_trinh_tai_lieu (trang Hồ sơ công trình).

Không đi qua ổ G: (chậm, file chưa tải về máy): đọc metadata của Google Drive for Desktop
(%LOCALAPPDATA%\\Google\\DriveFS\\<tài khoản>\\metadata_sqlite_db — có cây thư mục + MÃ FILE DRIVE để dựng link mở).
Chép DB metadata sang thư mục tạm rồi mới đọc (không khoá file Drive đang dùng).

Cây: 005_PROJECT\\NĂM 20xx\\<MÃ> <tên>\\...   (thư mục "CT26-013 & CT26-014 ..." => ghi cho cả 2 mã)
     005_PROJECT\\DỰ ÁN OEM-XUẤT KHẨU-HÀNG LẺ\\...\\<MÃ> <tên>  (tìm thư mục có mã ở cấp sâu hơn)

Chạy:  python quet_tai_lieu_ct.py --thu        (chỉ in số, không ghi DB)
       python quet_tai_lieu_ct.py              (tạo bảng nếu chưa có + thay nguyên dữ liệu, 1 giao dịch)
DATABASE_URL lấy từ biến môi trường, không có thì đọc backend/.env.
"""
import argparse, collections, datetime, glob, os, re, shutil, sqlite3, sys, tempfile

MA = re.compile(r'\b((?:CT|PO|EM|DM|NB|SP|XK)\d{2}-[0-9A-Z]{2,12})\b', re.I)
NAM = re.compile(r'^NĂM \d{4}$', re.I)
SQL_BANG = None  # tìm lúc chạy: file_sql()


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


def chep_metadata():
    goc = os.path.join(os.environ['LOCALAPPDATA'], 'Google', 'DriveFS')
    ds = [d for d in glob.glob(os.path.join(goc, '*')) if os.path.isfile(os.path.join(d, 'metadata_sqlite_db'))]
    if not ds:
        raise SystemExit(f'Không thấy metadata Drive for Desktop trong {goc}')
    tam = tempfile.mkdtemp(prefix='quet_tai_lieu_')
    kq = []
    for d in ds:
        dich = os.path.join(tam, os.path.basename(d))
        os.makedirs(dich)
        for f in ('metadata_sqlite_db', 'metadata_sqlite_db-wal', 'metadata_sqlite_db-shm'):
            if os.path.exists(os.path.join(d, f)):
                shutil.copy2(os.path.join(d, f), os.path.join(dich, f))
        kq.append(os.path.join(dich, 'metadata_sqlite_db'))
    return tam, kq


def quet(db):
    c = sqlite3.connect(db)
    items = {r[0]: r for r in c.execute(
        'SELECT stable_id, id, local_title, is_folder, mime_type, file_size, modified_date, trashed FROM items')}
    con = collections.defaultdict(list)
    for i, p in c.execute('SELECT item_stable_id, parent_stable_id FROM stable_parents'):
        con[p].append(i)
    c.close()
    # Gốc 005_PROJECT: thư mục có con "NĂM 20xx"
    goc = [s for s, r in items.items() if r[2] == '005_PROJECT' and r[3] and not r[7]
           and any(items.get(k) and NAM.match(items[k][2] or '') for k in con[s])]
    du_an = []  # (nam, ten thu muc, stable_id, [ma])

    def tim_du_an(s, nam, sau):
        for k in con[s]:
            it = items.get(k)
            if not it or not it[3] or it[7]:
                continue
            mas = sorted({m.upper() for m in MA.findall(it[2] or '')})
            if mas:
                du_an.append((nam, it[2], k, mas))
            elif sau > 0:
                tim_du_an(k, nam, sau - 1)

    for g in goc:
        for k in con[g]:
            it = items.get(k)
            if not it or not it[3] or it[7]:
                continue
            tim_du_an(k, it[2] if NAM.match(it[2] or '') else it[2], 0 if NAM.match(it[2] or '') else 2)
    dong = []

    def ms(v):
        if not v:
            return None
        try:
            return datetime.datetime.fromtimestamp(int(v) / 1000, datetime.timezone.utc)
        except (ValueError, OverflowError, OSError):
            return None

    def di(s, duong, nam, thu_muc, mas):
        for k in con[s]:
            it = items.get(k)
            if not it or it[7]:
                continue
            dd = f'{duong}/{it[2]}' if duong else it[2]
            nhom = '/'.join(dd.split('/')[:3]) if it[3] else '/'.join(dd.split('/')[:-1][:3])
            for m in mas:
                dong.append((m, thu_muc, nam, dd, nhom, it[2], bool(it[3]), it[1], it[4], it[5], ms(it[6])))
            if it[3]:
                di(k, dd, nam, thu_muc, mas)

    for nam, thu_muc, s, mas in du_an:
        goc_it = items[s]
        for m in mas:  # dòng của chính thư mục dự án (link mở thư mục gốc)
            dong.append((m, thu_muc, nam, '', '', thu_muc, True, goc_it[1], goc_it[4], None, ms(goc_it[6])))
        di(s, '', nam, thu_muc, mas)
    return du_an, dong


def ghi(dong):
    import psycopg2
    from psycopg2.extras import execute_values
    url = doc_env()
    cn = psycopg2.connect(url if 'sslmode=' in url else url + ('&' if '?' in url else '?') + 'sslmode=require')
    try:
        with cn:
            with cn.cursor() as c:
                c.execute('SET LOCAL statement_timeout = 120000')
                c.execute(open(file_sql('2026-11-20_cong_trinh_tai_lieu.sql'), encoding='utf-8').read())
                c.execute('DELETE FROM cong_trinh_tai_lieu')
                execute_values(c, '''INSERT INTO cong_trinh_tai_lieu
                    (ma_ct, thu_muc_ct, nam, duong_dan, nhom, ten, la_thu_muc, drive_id, mime, kich_thuoc, sua_luc) VALUES %s''',
                               dong, page_size=2000)
    finally:
        cn.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--thu', action='store_true', help='chỉ in số, không ghi DB')
    a = ap.parse_args()
    tam, dbs = chep_metadata()
    try:
        du_an, dong = [], []
        for db in dbs:
            d1, d2 = quet(db)
            du_an += d1
            dong += d2
    finally:
        shutil.rmtree(tam, ignore_errors=True)
    # cùng 1 mã + đường dẫn (2 tài khoản Drive cùng thấy) => giữ 1
    thay, gon = set(), []
    for d in dong:
        k = (d[0], d[1], d[3])
        if k not in thay:
            thay.add(k)
            gon.append(d)
    mas = {d[0] for d in gon}
    file = sum(1 for d in gon if not d[6])
    print(f'{len(du_an)} thư mục dự án · {len(mas)} mã công trình · {file} file · {len(gon) - file} thư mục')
    con = collections.Counter(d[4].split('/')[-1] for d in gon if not d[6] and '01_HỒ SƠ ĐẦU VÀO' in d[4])
    print('Hồ sơ đầu vào:', dict(con.most_common()))
    if a.thu:
        return
    ghi(gon)
    print(f'Đã ghi {len(gon)} dòng vào cong_trinh_tai_lieu')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
