"""Test hàm thuần của tra_thuoc_tinh.py (không gọi mạng, không đọc DB).

Chạy (từ thư mục backend):  python -B -m unittest scripts/test_tra_thuoc_tinh.py
"""
import os
import sys
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tra_thuoc_tinh as T  # noqa: E402

HDR = ['A', 'Material', 'Material Description', 'NHÓM VẬT TƯ-MP00', 'CHỦNG LOẠI-MP01', 'THƯƠNG HIỆU-MP12',
       'MÃ MÀU-MP16', 'MÃ SẢN PHẨM NCC-MP18', 'QUY CÁCH PHÁCH-MP20', 'QUY CÁCH RỘNG-MP22', 'ĐƠN VỊ TÍNH-MP36',
       'NHÀ CUNG CẤP-MP37', 'LEADTIME SẢN XUẤT-MP38', 'CHÚ THÍCH THÊM-MP99']
MP = {k for _, k, _ in T.cot_mp(HDR)}


def dong(ma, ten, **mp):
    r = [''] * len(HDR)
    r[1], r[2] = ma, ten
    for j, k, _ in T.cot_mp(HDR):
        if k in mp:
            r[j] = mp[k]
    return r


MD = T.doc_md_rows(HDR, [
    dong('1', 'VẢI LOREAL 02-KHỔ 1.4M', MP00='106 -Vải', MP01='VẢI', MP12='LOREAL', MP16='02', MP22='1400', MP36='M'),
    dong('2', 'VẢI_DH1502C-4', MP00='106 -Vải', MP01='VẢI', MP16='4', MP36='M'),
    dong('3', 'VẢI HARLEQUIN COL 14', MP00='106 -Vải', MP01='VẢI', MP12='HARLEQUIN', MP16='COL 14', MP36='M'),
    dong('4', 'GIẤY DÁN TƯỜNG WDD', MP00='106', MP01='GIẤY DÁN TƯỜNG', MP36='M2'),  # chỉ 1 cột => không làm ví dụ
    dong('5', 'CHỐT CÀI CỬA 245.55.913-HAFELE', MP00='115 -Phụ kiện', MP01='CHỐT', MP12='HAFELE', MP18='245.55.913'),
    dong('6', 'VẢI LINEN KHỔ 1.4M', MP00='108 -NVL phụ', MP01='VẢI', MP22='1400'),
    dong('', 'dòng không mã', MP01='VẢI', MP12='X'),
])


class CotMd(unittest.TestCase):
    def test_cot_mp(self):
        c = T.cot_mp(HDR)
        self.assertEqual(c[0], (3, 'MP00', 'NHÓM VẬT TƯ'))
        self.assertIn((13, 'MP99', 'CHÚ THÍCH THÊM'), c)

    def test_nhom_khoa(self):
        self.assertEqual(T.nhom_khoa('106 -Vải'), '106')
        self.assertEqual(T.nhom_khoa(112.0), '112')
        self.assertEqual(T.nhom_khoa(''), '')

    def test_doc_md_bo_dong_khong_ma(self):
        self.assertEqual([d['ma'] for d in MD], ['1', '2', '3', '4', '5', '6'])
        self.assertEqual(MD[0]['nhom'], '106')
        self.assertEqual(MD[0]['mp']['MP22'], '1400')


class ViDu(unittest.TestCase):
    def test_cung_nhom_giong_ten(self):
        vd = T.chon_vi_du(MD, '106', 'VẢI HARLEQUIN COL 22')
        self.assertEqual(vd[0]['ma'], '3')  # cùng từ đầu + chung chữ HARLEQUIN, COL
        self.assertTrue(all(d['nhom'] == '106' for d in vd))
        self.assertNotIn('4', [d['ma'] for d in vd])  # dòng chỉ có 1 cột không làm ví dụ

    def test_thieu_thi_lay_nhom_khac_cung_tu_dau(self):
        vd = T.chon_vi_du(MD, '999', 'VẢI ABC', toi_thieu=3)
        self.assertTrue(vd and all(T.tach.norm(d['ten']).startswith('VẢI') for d in vd))

    def test_toi_da(self):
        self.assertLessEqual(len(T.chon_vi_du(MD, '106', 'VẢI X', n=2)), 2)

    def test_bo_dong_cua_chinh_ma(self):
        # tra lại mã đã có bản tay (để đo): dòng MD của chính mã không được làm ví dụ (AI sẽ chép đáp án)
        self.assertEqual(T.chon_vi_du(MD, '106', 'VẢI HARLEQUIN COL 14')[0]['ma'], '3')
        vd = T.chon_vi_du(MD, '106', 'VẢI HARLEQUIN COL 14', bo_ma='3')
        self.assertNotIn('3', [d['ma'] for d in vd])

    def test_bo_ten_trung_khi_do(self):
        md = MD + T.doc_md_rows(HDR, [dong('7', 'VẢI HARLEQUIN COL 14', MP00='106', MP01='VẢI', MP12='HARLEQUIN')])
        self.assertIn('7', [d['ma'] for d in T.chon_vi_du(md, '106', 'VẢI HARLEQUIN COL 14', bo_ma='3')])
        vd = T.chon_vi_du(md, '106', 'VẢI HARLEQUIN COL 14', bo_ma='3', bo_ten_trung=True)
        self.assertFalse({'3', '7'} & {d['ma'] for d in vd})


class Prompt(unittest.TestCase):
    def test_khong_gui_ncc_gia_ct(self):
        vt = dict(ma='100000013325', ten='VẢI_HN-CUZ-MG01_KHỔ 1.42M', nhom_sap='106', ten_nhom_sap='Vải', dvt='M',
                  kho='KVT vải,da,SF', loai_vat_tu=None, gia_tri=955.2, ten_cong_trinh='CT26-001 ABC')
        p = T.dung_prompt(vt, T.tach.tach(vt['ten'], 'Vải'), T.chon_vi_du(MD, '106', vt['ten']), T.cot_mp(HDR))
        self.assertIn('VẢI_HN-CUZ-MG01_KHỔ 1.42M', p)
        self.assertIn('106 Vải', p)
        self.assertIn('LOREAL', p)  # ví dụ điền tay
        self.assertNotIn('955', p)
        self.assertNotIn('CT26-001', p)
        self.assertNotIn('MP37:', p)
        self.assertNotIn('MP38:', p)
        self.assertNotIn('NHÀ CUNG CẤP', p)


class Json(unittest.TestCase):
    def test_khoi_code(self):
        self.assertEqual(T.tach_json('Kết quả:\n```json\n{"MP01": "VẢI", "nguon": []}\n```'), {'MP01': 'VẢI', 'nguon': []})

    def test_ngoac_long_nhau(self):
        self.assertEqual(T.tach_json('x {"a": {"b": 1}} y {"c": 2}'), {'a': {'b': 1}})

    def test_hong(self):
        self.assertEqual(T.tach_json('không có json'), {})
        self.assertEqual(T.tach_json('{sai}'), {})


class ChuanHoa(unittest.TestCase):
    def test_chu_hoa_bo_rac(self):
        kq = T.chuan_ket_qua({'MP01': 'vải', 'MP12': 'N/A', 'MP16': 'không rõ', 'MP99': 'chống cháy'}, MP)
        self.assertEqual(kq['mp'], {'MP01': 'VẢI', 'MP99': 'CHỐNG CHÁY'})

    def test_khong_dien_ncc_leadtime_va_cot_sap(self):
        kq = T.chuan_ket_qua({'MP37': 'ABC', 'MP38': '30', 'MP00': '106', 'MP36': 'M', 'MP77': 'x', 'MP01': 'VẢI'}, MP)
        self.assertEqual(kq['mp'], {'MP01': 'VẢI'})

    def test_khoa_co_ten(self):
        self.assertEqual(T.chuan_ket_qua({'MP01 CHỦNG LOẠI': 'da'}, MP)['mp'], {'MP01': 'DA'})

    def test_quy_cach_so(self):
        self.assertEqual(T.chuan_gia_tri('MP22', '1.4M'), '1400')
        self.assertEqual(T.chuan_gia_tri('MP22', '142 cm'), '1420')
        self.assertEqual(T.chuan_gia_tri('MP22', '1,400'), '1400')
        self.assertEqual(T.chuan_gia_tri('MP21', '0.8'), '0.8')
        self.assertEqual(T.chuan_gia_tri('MP21', '18mm'), '18')
        self.assertIsNone(T.chuan_gia_tri('MP22', 'khổ lớn'))
        self.assertIsNone(T.chuan_gia_tri('MP23', '0'))
        self.assertIsNone(T.chuan_gia_tri('MP23', '999999'))

    def test_phach(self):
        self.assertEqual(T.chuan_gia_tri('MP20', '76'), 'PHÁCH 76')
        self.assertEqual(T.chuan_gia_tri('MP20', 'phách 50'), 'PHÁCH 50')
        self.assertIsNone(T.chuan_gia_tri('MP20', 'dày'))

    def test_cat_chuoi_dai(self):
        self.assertEqual(len(T.chuan_gia_tri('MP99', 'a' * 500)), T.DAI_TOI_DA)

    def test_danh_sach_gop(self):
        self.assertEqual(T.chuan_gia_tri('MP15', ['xanh', 'trắng']), 'XANH, TRẮNG')

    REDIR = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC'
    TEN = 'CHỐT CÀI CỬA 245.55.913-HAFELE'

    def test_do_tin_cay(self):
        cao = {'MP01': 'CHỐT', 'do_tin_cay': 'Cao'}
        # trang grounding có tên miền chứa thương hiệu trong tên => giữ "cao"
        kq = T.chuan_ket_qua(cao, MP, trang=[{'uri': self.REDIR, 'title': 'hafele.com.vn'}], ten=self.TEN)
        self.assertEqual(kq['do_tin_cay'], 'cao')
        # có tìm Google nhưng trang không liên quan tên => hạ "vừa" + ghi chú
        kq = T.chuan_ket_qua(cao, MP, trang=[{'uri': self.REDIR, 'title': 'shopee.vn'}], ten=self.TEN)
        self.assertEqual(kq['do_tin_cay'], 'vừa')
        self.assertIn('hạ cao', kq['ghi_chu'])
        # link AI tự viết (không có trang grounding cùng tên miền) không đủ để giữ "cao"
        kq = T.chuan_ket_qua({**cao, 'nguon': ['https://hafele.com/245.55.913']}, MP, ten=self.TEN)
        self.assertEqual(kq['do_tin_cay'], 'vừa')
        # link AI ghi có tên miền trùng trang grounding + đường dẫn chứa mã => giữ "cao"
        kq = T.chuan_ket_qua({**cao, 'nguon': ['https://www.abc.vn/p/245-55-913']}, MP,
                             trang=[{'uri': self.REDIR, 'title': 'abc.vn'}], ten=self.TEN)
        self.assertEqual(kq['do_tin_cay'], 'cao')
        self.assertEqual(T.chuan_ket_qua({'MP01': 'VẢI', 'do_tin_cay': 'rất cao'}, MP)['do_tin_cay'], 'thấp')
        self.assertEqual(T.chuan_ket_qua({'do_tin_cay': 'cao', 'nguon': ['https://a']}, MP)['do_tin_cay'], 'thấp')  # không cột

    def test_nguon_chi_url_danh_dau_link_ai(self):
        kq = T.chuan_ket_qua({'nguon': ['https://a.vn', 'google', 'https://a.vn', 'http://b.com']}, MP)
        self.assertEqual(kq['nguon'], ['(AI ghi, chưa kiểm) https://a.vn', '(AI ghi, chưa kiểm) http://b.com'])
        kq = T.chuan_ket_qua({'nguon': 'https://x.vn/1, https://y.vn'}, MP,
                             trang=[{'uri': self.REDIR, 'title': 'x.vn'}, {'uri': 'https://z.vn/a', 'title': ''}])
        # link thật (khớp tên miền grounding) trước, rồi trang grounding kèm tiêu đề, link AI chưa kiểm cuối
        self.assertEqual(kq['nguon'], ['https://x.vn/1', 'x.vn — ' + self.REDIR, 'https://z.vn/a',
                                       '(AI ghi, chưa kiểm) https://y.vn'])

    def test_khoa_ten(self):
        ma, tu = T.khoa_ten(self.TEN)
        self.assertIn('24555913', ma)
        self.assertEqual(tu, {'HAFELE'})
        self.assertEqual(T.khoa_ten('VẢI_HN-CUZ-MG01_KHỔ 1.42M')[0], {'HNCUZMG01', 'MG01'})
        self.assertEqual(T.khoa_ten('SOLID SURFACE _PC842_12X760X3680'), ({'PC842'}, set()))

    def test_bo_cong_thuc(self):
        self.assertIsNone(T.chuan_gia_tri('MP12', '=HYPERLINK("http://x","A")'))
        self.assertIsNone(T.chuan_gia_tri('MP99', ' =cmd|x'))
        self.assertNotIn('MP12', T.chuan_ket_qua({'MP12': '=1+1', 'MP01': 'VẢI'}, MP)['mp'])

    def test_tu_dien_sap(self):
        self.assertEqual(T.tu_dien_sap(dict(nhom_sap='106', ten_nhom_sap='Vải', dvt='m')), {'MP00': '106 -Vải', 'MP36': 'M'})
        self.assertEqual(T.tu_dien_sap({}), {})


class Api(unittest.TestCase):
    RESP = {'candidates': [{'content': {'parts': [{'text': 'nghĩ', 'thought': True}, {'text': '{"MP01": "VẢI"}'}]},
                            'groundingMetadata': {'groundingChunks': [{'web': {'uri': 'https://g/1', 'title': 'a.vn'}},
                                                                      {'web': {'uri': 'https://g/1'}}, {'x': 1}]}}]}

    def test_van_ban_bo_phan_nghi(self):
        self.assertEqual(T.van_ban_tra_loi(self.RESP), '{"MP01": "VẢI"}')
        self.assertEqual(T.van_ban_tra_loi({}), '')

    def test_grounding(self):
        self.assertEqual(T.url_grounding(self.RESP), ['https://g/1'])
        self.assertEqual(T.trang_grounding(self.RESP), [{'uri': 'https://g/1', 'title': 'a.vn'}])

    def test_429_phut(self):
        err = {'error': {'code': 429, 'details': [
            {'@type': 'type.googleapis.com/google.rpc.QuotaFailure',
             'violations': [{'quotaId': 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier'}]},
            {'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '37s'}]}}
        self.assertEqual(T.phan_tich_429(err), (False, 37.0))

    def test_429_ngay(self):
        err = {'error': {'code': 429, 'details': [
            {'@type': 'type.googleapis.com/google.rpc.QuotaFailure',
             'violations': [{'quotaId': 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]}]}}
        self.assertEqual(T.phan_tich_429(err)[0], True)

    def test_429_doc_message(self):
        self.assertEqual(T.phan_tich_429({'error': {'message': 'Please retry in 12.5s.'}}), (False, 12.5))


class FileKetQua(unittest.TestCase):
    CMP = T.cot_mp(HDR)

    def test_dong_excel_dung_thu_tu(self):
        muc = dict(ma='9', ten='VẢI X', mp={'MP01': 'VẢI', 'MP36': 'M'}, nguon=['https://a', 'https://b'],
                   do_tin_cay='vừa', ghi_chu='gc', ngay_tra='15/11/2026')
        r = T.dong_excel(muc, HDR, self.CMP, 'AI TRA CỨU')
        self.assertEqual(len(r), len(HDR) + len(T.COT_THEM))
        self.assertEqual(r[:3], ['AI TRA CỨU', '9', 'VẢI X'])
        self.assertEqual(r[4], 'VẢI')
        self.assertEqual(r[10], 'M')
        self.assertEqual(r[len(HDR):], ['https://a\nhttps://b', 'vừa', 'gc', '15/11/2026', ''])

    def test_giu_dong_da_duyet(self):
        hdr = HDR + T.COT_THEM
        cu = [dong('9', 'VẢI X', MP01='VẢI SỬA TAY') + ['', 'cao', '', '', 'X'],
              dong('8', 'VẢI Y', MP01='VẢI') + ['', 'thấp', '', '', ''],
              dong('7', 'VẢI Z', MP01='VẢI') + ['', 'vừa', '', '', 'x']]
        duyet = T.dong_da_duyet(hdr, cu)
        self.assertEqual(sorted(duyet), ['7', '9'])
        moi = [T.dong_excel(dict(ma=m, ten='t', mp={'MP01': 'AI'}), HDR, self.CMP, 'AI') for m in ('9', '8')]
        out = T.gop_dong(moi, duyet, 1)
        self.assertEqual([r[1] for r in out], ['9', '8', '7'])
        self.assertEqual(out[0][4], 'VẢI SỬA TAY')  # không ghi đè dòng đã duyệt
        self.assertEqual(out[1][4], 'AI')

    def test_mp_da_duyet_cho_loader(self):
        hdr = HDR + T.COT_THEM
        rows = [dong('9', 'VẢI X', MP01='VẢI', MP22='1400', MP36='M') + ['', 'cao', '', '', 'X'],
                dong('8', 'VẢI Y', MP01='VẢI') + ['', 'thấp', '', '', ''],
                dong(9.0, 'số dạng float', MP01='DA') + ['', '', '', '', 'X']]
        out = T.mp_da_duyet(hdr, rows)
        self.assertEqual(list(out), ['9'])
        self.assertEqual(out['9'], {'MP01 CHỦNG LOẠI': 'DA'})  # cùng mã thì dòng sau thắng như MD
        rows2 = rows[:2]
        self.assertEqual(T.mp_da_duyet(hdr, rows2)['9'],
                         {'MP01 CHỦNG LOẠI': 'VẢI', 'MP22 QUY CÁCH RỘNG': '1400', 'MP36 ĐƠN VỊ TÍNH': 'M'})
        self.assertEqual(T.mp_da_duyet(HDR, rows2), {})  # file không có cột DUYỆT => không dùng dòng nào


class GhiFile(unittest.TestCase):
    CMP = T.cot_mp(HDR)
    MUC = dict(ma='9', ten='VẢI X', mp={'MP01': 'VẢI'}, nguon=[], do_tin_cay='vừa', ghi_chu='', ngay_tra='1', gia_tri=1)

    def setUp(self):
        import contextlib
        import io
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.p = os.path.join(self.tmp.name, T.TEN_FILE_KQ)
        self.im = contextlib.redirect_stdout(io.StringIO())  # thông báo tiếng Việt (console cp1252 không in được)
        self.im.__enter__()

    def tearDown(self):
        self.im.__exit__(None, None, None)
        self.tmp.cleanup()

    def doc(self, p=None):
        import openpyxl
        wb = openpyxl.load_workbook(p or self.p)
        out = [[(c.value, c.data_type) for c in r] for r in wb[T.SHEET_KQ].iter_rows(min_row=2)]
        wb.close()
        return out

    def danh_x(self, gia_tri, luu_vao=None):
        import openpyxl
        wb = openpyxl.load_workbook(self.p)
        ws = wb[T.SHEET_KQ]
        ws.cell(2, len(HDR) + 5).value = 'X'
        ws.cell(2, 5).value = gia_tri
        wb.save(luu_vao or self.p)
        wb.close()

    def test_khong_ghi_cong_thuc(self):
        cache = {'9': dict(ma='9', ten='=SUM(1,2)', mp={'MP12': '=1+1', 'MP01': '+VẢI'}, nguon=[], do_tin_cay='thấp',
                           ghi_chu='=cmd|x', ngay_tra='15/11/2026', gia_tri=1)}
        T.ghi_excel(self.p, cache, HDR, self.CMP)
        r = self.doc()[0]
        self.assertFalse([x for x in r if x[1] == 'f'])  # không ô nào là công thức
        self.assertEqual(r[2], ('=SUM(1,2)', 's'))
        self.assertEqual(r[5], ('=1+1', 's'))
        self.assertEqual(r[len(HDR) + 2], ('=cmd|x', 's'))

    def test_ghi_nguyen_tu_giu_duyet_va_bak(self):
        T.ghi_excel(self.p, {'9': self.MUC}, HDR, self.CMP)
        self.danh_x('VẢI SỬA TAY')
        T.ghi_excel(self.p, {'9': dict(self.MUC, mp={'MP01': 'AI MỚI'})}, HDR, self.CMP)
        self.assertEqual(self.doc()[0][4][0], 'VẢI SỬA TAY')
        self.assertTrue(os.path.exists(self.p[:-5] + '.bak.xlsx'))
        self.assertFalse(os.path.exists(self.p + '.tmp'))

    def test_file_hong_khong_ghi_de(self):
        with open(self.p, 'wb') as f:
            f.write(b'hong')
        with self.assertRaises(T.FileKqHong):
            T.doc_kq_cu(self.p)
        p2, _, _ = T.ghi_excel(self.p, {}, HDR, self.CMP)
        self.assertNotEqual(p2, self.p)
        with open(self.p, 'rb') as f:
            self.assertEqual(f.read(), b'hong')  # file gốc giữ nguyên để khôi phục

    def test_gop_duyet_tu_ban_ghi_tam(self):
        import time
        T.ghi_excel(self.p, {'9': self.MUC}, HDR, self.CMP)
        tam = self.p[:-5] + '_20261115_101010.xlsx'
        self.danh_x('DUYỆT Ở BẢN TẠM', tam)
        os.utime(tam, (time.time() + 5, time.time() + 5))
        self.assertEqual(T.ban_co_gio(self.p), [tam])
        T.ghi_excel(self.p, {'9': self.MUC}, HDR, self.CMP)
        self.assertEqual(self.doc()[0][4][0], 'DUYỆT Ở BẢN TẠM')


VT_LO = [
    dict(ma='3', ten='VẢI HARLEQUIN COL 14', nhom_sap='106', ten_nhom_sap='Vải', dvt='M', kho='KVT vải', gia_tri=955.2,
         ten_cong_trinh='CT26-001 ABC', nha_cung_cap='NCC XYZ'),
    dict(ma='100', ten='VẢI LOREAL 05-KHỔ 1.4M', nhom_sap='106', ten_nhom_sap='Vải', dvt='M', gia_tri=1.5),
    dict(ma='200', ten='CHỐT CÀI CỬA 245.55.914-HAFELE', nhom_sap='115', ten_nhom_sap='Phụ kiện', dvt='CÁI'),
]


class KhongWeb(unittest.TestCase):
    """Chế độ mặc định: KHÔNG tra Google, gom nhiều mã / lượt."""

    def test_mac_dinh(self):
        self.assertEqual(T.MODEL_MAC_DINH, 'gemini-flash-lite-latest')
        self.assertGreater(T.MOI_LUOT_MAC_DINH, 1)

    def test_than_yeu_cau(self):
        b = T.than_yeu_cau('p', False)
        self.assertNotIn('tools', b)
        self.assertEqual(b['generationConfig']['responseMimeType'], 'application/json')
        b = T.than_yeu_cau('p', True)
        self.assertEqual(b['tools'], [{'google_search': {}}])
        self.assertNotIn('generationConfig', b)

    def test_vi_du_bo_moi_ma_trong_luot(self):
        # mã '3' (đã có dòng MD, đang đo) cùng lượt với '100': ví dụ của '100' không được chứa đáp án tay của '3'
        md = MD + T.doc_md_rows(HDR, [dong('7', 'VẢI HARLEQUIN COL 14', MP00='106', MP01='VẢI', MP12='HARLEQUIN')])
        self.assertIn('3', [d['ma'] for d in T.chon_vi_du(md, '106', 'VẢI LOREAL 05-KHỔ 1.4M')])
        cb = T.chuan_bi_lo(VT_LO, md, ma_md={'3'})
        for vt, _, vd in cb:
            ma_vd = {d['ma'] for d in vd}
            self.assertFalse(ma_vd & {'3', '100', '200'}, vt['ma'])
            self.assertNotIn('7', ma_vd, vt['ma'])  # trùng tên mã đang đo
        vd100 = cb[1][2]
        # vẫn ví dụ cùng nhóm trước (thiếu mới lấy dòng cùng từ đầu "VẢI" ở nhóm khác)
        self.assertEqual([d['ma'] for d in vd100 if d['nhom'] == '106'], ['1', '2'])
        self.assertEqual([d['nhom'] for d in vd100][:2], ['106', '106'])
        self.assertIn('5', [d['ma'] for d in cb[2][2]])  # nhóm 115: ví dụ HAFELE cùng nhóm

    def test_chon_vi_du_bo_ma_dang_chuoi_va_tap(self):
        self.assertNotIn('3', [d['ma'] for d in T.chon_vi_du(MD, '106', 'VẢI HARLEQUIN', bo_ma='3')])
        vd = T.chon_vi_du(MD, '106', 'VẢI HARLEQUIN', bo_ma={'3', '1'})
        self.assertFalse({'1', '3'} & {d['ma'] for d in vd})
        vd = T.chon_vi_du(MD, '106', 'VẢI X', bo_ten=['vải loreal 02-khổ 1.4m'.upper()])
        self.assertNotIn('1', [d['ma'] for d in vd])

    def test_prompt(self):
        cb = T.chuan_bi_lo(VT_LO, MD, ma_md=set())
        p = T.dung_prompt_khong_web(cb, T.cot_mp(HDR))
        self.assertIn('KHÔNG CÓ GOOGLE', p)
        self.assertIn('KHÔNG CHẮC THÌ ĐỂ TRỐNG', p)
        self.assertIn('Häfele', p)
        self.assertIn('MẢNG JSON đúng 3 phần tử', p)
        for vt in VT_LO:
            self.assertIn(f'- ma: {vt["ma"]}', p)
            self.assertIn(vt['ten'], p)
        self.assertNotIn('HÃY DÙNG GOOGLE', p)
        self.assertNotIn('nguon', p)
        self.assertNotIn('955', p)
        self.assertNotIn('CT26-001', p)
        self.assertNotIn('NCC XYZ', p)
        self.assertNotIn('MP37:', p)
        self.assertNotIn('NHÀ CUNG CẤP', p)

    def test_tach_json_mang(self):
        self.assertEqual(T.tach_json_mang('[{"ma": "1"}, {"ma": "2"}]'), [{'ma': '1'}, {'ma': '2'}])
        self.assertEqual(T.tach_json_mang('```json\n[{"ma": "1"}, 3]\n```'), [{'ma': '1'}])
        self.assertEqual(T.tach_json_mang('{"ket_qua": [{"ma": "1"}]}'), [{'ma': '1'}])
        self.assertEqual(T.tach_json_mang('{"ma": "1", "MP01": "VẢI"}'), [{'ma': '1', 'MP01': 'VẢI'}])
        self.assertEqual(T.tach_json_mang('rác [1, 2] {"x": 1}'), [])
        self.assertEqual(T.tach_json_mang(''), [])

    def test_ghep_ket_qua(self):
        out = T.ghep_ket_qua([{'ma': 200}, {'ma': '3'}, {'ma': '999'}, {'ma': '3', 'MP01': 'sau'}], ['3', '100', '200'])
        self.assertEqual(sorted(out), ['200', '3'])
        self.assertNotIn('MP01', out['3'])  # phần tử đầu thắng
        self.assertEqual(T.ghep_ket_qua([{'MP01': 'a'}, {'MP01': 'b'}], ['1', '2']), {'1': {'MP01': 'a'}, '2': {'MP01': 'b'}})
        self.assertEqual(T.ghep_ket_qua([{'MP01': 'a'}], ['1', '2']), {})  # thiếu phần tử, không mã => không đoán

    def test_chuan_khong_web(self):
        raw = {'MP01': 'chốt', 'MP12': 'hafele', 'MP18': '245.55.914', 'do_tin_cay': 'cao', 'ghi_chu': 'mã Häfele',
               'nguon': ['https://hafele.com/x']}
        kq = T.chuan_ket_qua(raw, MP, ten='CHỐT', tra_web=False)
        self.assertEqual(kq['do_tin_cay'], 'vừa')  # không bao giờ 'cao'
        self.assertEqual(kq['nguon'], ['AI (không tra web)'])  # link AI tự viết bị bỏ
        self.assertEqual(kq['ghi_chu'], 'mã Häfele')
        self.assertEqual(kq['mp'], {'MP01': 'CHỐT', 'MP12': 'HAFELE', 'MP18': '245.55.914'})
        for d in ('high', 'rất cao', None):
            self.assertIn(T.chuan_ket_qua({**raw, 'do_tin_cay': d}, MP, tra_web=False)['do_tin_cay'], T.DTC_KHONG_WEB)

    def test_de_trong_nhieu_ghi_ly_do(self):
        kq = T.chuan_ket_qua({'MP01': 'VẢI', 'do_tin_cay': 'vừa'}, MP, tra_web=False)
        self.assertTrue(kq['ghi_chu'].startswith('Để trống nhiều (điền 1 cột): '))
        self.assertIn('không tra web', kq['ghi_chu'])
        kq = T.chuan_ket_qua({'ghi_chu': 'tên chỉ có mã nội bộ'}, MP, tra_web=False)
        self.assertEqual(kq['do_tin_cay'], 'thấp')
        self.assertEqual(kq['ghi_chu'], 'Để trống nhiều (điền 0 cột): tên chỉ có mã nội bộ')

    def test_chia_lo(self):
        ds = [dict(ma=str(i), nhom_sap=n) for i, n in enumerate(['106', '115', '106', '115', '106', '120', '106'])]
        lo = T.chia_lo(ds, 3)
        self.assertEqual([[v['ma'] for v in x] for x in lo], [['0', '2', '4'], ['1', '3', '5'], ['6']])
        self.assertEqual([len(x) for x in T.chia_lo(ds, 1)], [1] * 7)
        self.assertEqual(sum(len(x) for x in T.chia_lo(ds, 0)), 7)

    def test_tra_lo_khong_goi_mang(self):
        class ApiGia:
            model = 'gia'

            def __init__(self):
                self.goi_ = []

            def goi(self, prompt, tra_google=True):
                self.goi_.append((prompt, tra_google))
                text = ('[{"ma": "200", "MP01": "chốt", "MP12": "hafele", "MP18": "245.55.914", "do_tin_cay": "cao",'
                        ' "nguon": ["https://bia.vn"]}, {"ma": "3", "MP01": "vải"}]')
                return {'candidates': [{'content': {'parts': [{'text': text}]}, 'finishReason': 'STOP'}]}

        api = ApiGia()
        out = T.tra_lo_khong_web(api, VT_LO, MD, T.cot_mp(HDR), ma_md={'3'})
        self.assertEqual(len(api.goi_), 1)  # 3 mã / 1 lượt
        self.assertIs(api.goi_[0][1], False)  # không gửi tools google_search
        self.assertEqual([m['ma'] for m in out], ['3', '100', '200'])
        m3, m100, m200 = out
        self.assertEqual(m200['mp'], {'MP00': '115 -Phụ kiện', 'MP36': 'CÁI', 'MP01': 'CHỐT', 'MP12': 'HAFELE',
                                      'MP18': '245.55.914'})
        self.assertEqual((m200['do_tin_cay'], m200['nguon'], m200['che_do']), ('vừa', ['AI (không tra web)'], 'khong_web'))
        self.assertNotIn('loi', m3)
        self.assertIn('Để trống nhiều', m3['ghi_chu'])
        self.assertIn('loi', m100)  # AI bỏ sót mã => lỗi, chạy lại sẽ tra lại
        self.assertNotIn('gia_tri', api.goi_[0][0])


class GoiApi(unittest.TestCase):
    """Gemini.goi với urlopen giả: không tools, 503 thì chờ rồi thử lại (không gọi mạng thật)."""

    def setUp(self):
        import contextlib
        import io
        self.im = contextlib.redirect_stdout(io.StringIO())
        self.im.__enter__()

    def tearDown(self):
        self.im.__exit__(None, None, None)

    def test_khong_tools_va_503_thu_lai(self):
        import io
        import json
        import urllib.error
        from unittest import mock
        than, lan = [], [0]

        class Resp(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def urlopen(req, timeout=None):
            than.append(json.loads(req.data.decode('utf-8')))
            self.assertNotIn('key=', req.full_url)  # khoá đi qua header, không nằm trong URL
            lan[0] += 1
            if lan[0] == 1:
                raise urllib.error.HTTPError(req.full_url, 503, 'x', {}, io.BytesIO(b'{"error": {"message": "busy"}}'))
            return Resp(b'{"candidates": []}')

        api = T.Gemini('khoa-gia', 'gemini-flash-lite-latest', rpm=6000)
        with mock.patch.object(T.urllib.request, 'urlopen', urlopen), mock.patch.object(T.time, 'sleep'):
            self.assertEqual(api.goi('p', tra_google=False), {'candidates': []})
        self.assertEqual(lan[0], 2)
        self.assertEqual(api.loi_khac, 1)
        self.assertTrue(all('tools' not in b for b in than))

    def test_429_khong_retry_delay_dung(self):
        import io
        import urllib.error
        from unittest import mock

        def urlopen(req, timeout=None):
            raise urllib.error.HTTPError(req.full_url, 429, 'x', {}, io.BytesIO(b'{"error": {"message": "quota"}}'))

        api = T.Gemini('khoa-gia', 'm', rpm=6000)
        with mock.patch.object(T.urllib.request, 'urlopen', urlopen), mock.patch.object(T.time, 'sleep'):
            with self.assertRaises(T.HetHanMuc) as cm:
                api.goi('p', tra_google=False)
        self.assertIn('không tools', str(cm.exception))


class Loader(unittest.TestCase):
    def test_bu_chi_ma_chua_co_md(self):
        import nap_ban_vat_tu as N
        mp = {'1': {'MP01 CHỦNG LOẠI': 'VẢI'}}
        n = N.bu_tra_cuu(mp, {'1': {'MP01 CHỦNG LOẠI': 'AI'}, '2': {'MP12 THƯƠNG HIỆU': 'JAB'}, '3': {}})
        self.assertEqual(n, 1)
        self.assertEqual(mp['1'], {'MP01 CHỦNG LOẠI': 'VẢI'})
        self.assertEqual(mp['2'], {'MP12 THƯƠNG HIỆU': 'JAB', T.KHOA_AI: T.GIA_TRI_AI})  # đánh dấu nguồn AI
        self.assertNotIn('3', mp)

    def test_bu_o_trong_cua_ma_da_co_md(self):
        # 16/11/2026: mã đã có dòng MD nhưng thiếu màu => chỉ điền ô trống ('-' coi là trống), không đè ô điền tay
        import nap_ban_vat_tu as N
        mp = {'1': {'MP01 CHỦNG LOẠI': 'ĐÁ', 'MP15 MÀU SẮC': '-'}, '2': {'MP15 MÀU SẮC': 'GOLD'}}
        n = N.bu_tra_cuu(mp, {'1': {'MP01 CHỦNG LOẠI': 'GỖ', 'MP15 MÀU SẮC': 'TRẮNG'}, '2': {'MP15 MÀU SẮC': 'ĐEN'}})
        self.assertEqual(n, 1)
        self.assertEqual(mp['1']['MP01 CHỦNG LOẠI'], 'ĐÁ')
        self.assertEqual(mp['1']['MP15 MÀU SẮC'], 'TRẮNG')
        self.assertEqual(mp['1'][T.KHOA_AI], N.GIA_TRI_AI_BU_O)
        self.assertEqual(mp['2'], {'MP15 MÀU SẮC': 'GOLD'})


class MauTuAnh(unittest.TestCase):
    """--mau-tu-anh: thân yêu cầu kèm ảnh, đọc JSON màu, chỉ điền MP15 khi trống, không đè dòng duyệt."""
    HDR15 = HDR[:-1] + ['MÀU SẮC-MP15', HDR[-1]]

    def setUp(self):
        import contextlib
        import io
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.im = contextlib.redirect_stdout(io.StringIO())
        self.im.__enter__()

    def tearDown(self):
        self.im.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_than_co_inline_data(self):
        import base64
        b = T.than_yeu_cau_anh('hỏi', [('image/jpeg', b'\xff\xd8abc'), (None, memoryview(b'xyz'))])
        parts = b['contents'][0]['parts']
        self.assertEqual(parts[0], {'text': 'hỏi'})
        self.assertEqual(parts[1]['inline_data']['mime_type'], 'image/jpeg')
        self.assertEqual(base64.b64decode(parts[1]['inline_data']['data']), b'\xff\xd8abc')
        self.assertEqual(parts[2]['inline_data']['mime_type'], 'image/jpeg')  # thiếu mime => jpeg
        self.assertEqual(base64.b64decode(parts[2]['inline_data']['data']), b'xyz')
        self.assertNotIn('tools', b)
        self.assertEqual(b['generationConfig']['responseMimeType'], 'application/json')

    def test_prompt_chi_ten_va_chung_loai(self):
        pr = T.dung_prompt_mau('DA 217-PEATMOOS', 'DA', 2)
        self.assertIn('DA 217-PEATMOOS', pr)
        self.assertIn('Chủng loại: DA', pr)
        self.assertIn('giấy nhãn trắng', pr)
        self.assertIn('KEM / BE', pr)
        self.assertIn('XANH DƯƠNG', pr)

    def test_doc_mau(self):
        r = T.doc_mau(T.tach_json('```json\n{"nhom": "nâu", "mo_ta": "nâu đất.", "do_tin_cay": "cao"}\n```'))
        self.assertEqual(r, {'nhom': 'NÂU', 'mo_ta': 'NÂU ĐẤT', 'do_tin_cay': 'vừa'})  # không bao giờ 'cao'
        self.assertEqual(T.doc_mau({'nhom': 'Kem/Be', 'mo_ta': 'KEM NHẠT'})['nhom'], 'KEM / BE')
        self.assertEqual(T.doc_mau({'nhom': 'XANH DUONG'})['nhom'], 'XANH DƯƠNG')
        self.assertEqual(T.doc_mau({'nhom': 'BẠC', 'mo_ta': 'BẠC'}), {'nhom': '', 'mo_ta': '', 'do_tin_cay': 'thấp'})
        self.assertEqual(T.doc_mau({'nhom': '', 'mo_ta': 'XÁM'})['nhom'], '')
        self.assertEqual(T.doc_mau({'nhom': 'ĐỎ', 'mo_ta': '=HYPERLINK(1)'})['mo_ta'], '')
        self.assertEqual(T.doc_mau(None)['nhom'], '')
        self.assertEqual(T.doc_mau({'nhom': ['ĐỎ']})['nhom'], '')

    def test_gia_tri_mp15(self):
        self.assertEqual(T.gia_tri_mp15({'nhom': 'NÂU', 'mo_ta': 'NÂU ĐẤT'}), 'NÂU ĐẤT')
        self.assertEqual(T.gia_tri_mp15({'nhom': 'XÁM', 'mo_ta': 'XÁM VÂN TRẮNG'}), 'XÁM VÂN TRẮNG')
        self.assertEqual(T.gia_tri_mp15({'nhom': 'KEM / BE', 'mo_ta': 'BE NHẠT'}), 'BE NHẠT')
        self.assertEqual(T.gia_tri_mp15({'nhom': 'XANH LÁ', 'mo_ta': 'XANH RÊU'}), 'XANH RÊU')
        # mô tả lệch nhóm (trang khách sẽ xếp sai) => ghi tên nhóm
        self.assertEqual(T.gia_tri_mp15({'nhom': 'NÂU', 'mo_ta': 'VÀNG NÂU'}), 'NÂU')
        self.assertEqual(T.gia_tri_mp15({'nhom': 'XANH LÁ', 'mo_ta': 'XANH'}), 'XANH LÁ')
        self.assertEqual(T.gia_tri_mp15({'nhom': 'ĐỎ', 'mo_ta': ''}), 'ĐỎ')
        self.assertEqual(T.gia_tri_mp15({'nhom': '', 'mo_ta': 'XÁM'}), '')

    MUC = dict(ma='9', ten='DA 217-PEATMOOS', mp={'MP00': '106 -Vải', 'MP01': 'DA', 'MP16': '217'},
               nguon=['AI (không tra web)'], do_tin_cay='thấp', ghi_chu='Chỉ đọc được từ tên.', ngay_tra='16/11/2026',
               gia_tri=1)

    def test_ap_mau_dien_khi_trong(self):
        kq = {'nhom': 'NÂU', 'mo_ta': 'NÂU ĐẤT', 'do_tin_cay': 'vừa'}
        m = T.ap_mau(self.MUC, kq, 'mdl', 2, ngay='16/11/2026')
        self.assertEqual(m['mp']['MP15'], 'NÂU ĐẤT')
        self.assertEqual({k: v for k, v in m['mp'].items() if k != 'MP15'}, self.MUC['mp'])  # giữ cột khác
        self.assertNotIn('MP15', self.MUC['mp'])  # không sửa mục gốc
        self.assertEqual(m['ghi_chu'], 'Chỉ đọc được từ tên. · màu nhận từ ảnh: NÂU')
        self.assertEqual(m['nguon'], ['AI (không tra web)', 'AI nhìn ảnh'])
        self.assertEqual(m['do_tin_cay'], 'thấp')  # độ tin cậy dòng giữ như cũ
        self.assertTrue(m['mau_anh']['ghi_mp15'])
        # chạy lại (--tra-lai): ghi chú / nguồn không lặp, MP15 do ảnh ghi được thay
        m2 = T.ap_mau(m, {'nhom': 'XÁM', 'mo_ta': 'GHI ĐẬM', 'do_tin_cay': 'thấp'}, 'mdl', 1)
        self.assertEqual(m2['mp']['MP15'], 'GHI ĐẬM')
        self.assertEqual(m2['ghi_chu'], 'Chỉ đọc được từ tên. · màu nhận từ ảnh: XÁM')
        self.assertEqual(m2['nguon'].count('AI nhìn ảnh'), 1)
        # lần sau không thấy rõ => bỏ màu cũ do ảnh ghi
        m3 = T.ap_mau(m2, {'nhom': '', 'mo_ta': '', 'do_tin_cay': 'thấp'}, 'mdl', 1)
        self.assertNotIn('MP15', m3['mp'])
        self.assertTrue(m3['ghi_chu'].endswith('màu nhận từ ảnh: không thấy rõ mẫu vật liệu'))

    def test_ap_mau_ghi_chu_mo_ta_khac_nhom(self):
        m = T.ap_mau(self.MUC, {'nhom': 'NÂU', 'mo_ta': 'VÀNG NÂU', 'do_tin_cay': 'vừa'}, 'mdl', 1)
        self.assertEqual(m['mp']['MP15'], 'NÂU')
        self.assertTrue(m['ghi_chu'].endswith('màu nhận từ ảnh: NÂU (VÀNG NÂU)'))

    def test_ap_mau_giu_mau_tu_ten(self):
        muc = dict(self.MUC, mp=dict(self.MUC['mp'], MP15='MUSCHIO'))
        m = T.ap_mau(muc, {'nhom': 'NÂU', 'mo_ta': 'NÂU', 'do_tin_cay': 'vừa'}, 'mdl', 1)
        self.assertEqual(m['mp']['MP15'], 'MUSCHIO')
        self.assertFalse(m['mau_anh']['ghi_mp15'])
        self.assertIn('giữ MP15 "MUSCHIO"', m['ghi_chu'])

    def test_ap_mau_ghi_chu_dai_khong_mat_ghi_chu_anh(self):
        m = T.ap_mau(dict(self.MUC, ghi_chu='x' * 400), {'nhom': 'ĐEN', 'mo_ta': 'ĐEN', 'do_tin_cay': 'vừa'}, 'm', 1)
        self.assertLessEqual(len(m['ghi_chu']), T.GHI_CHU_TOI_DA)
        self.assertTrue(m['ghi_chu'].endswith('màu nhận từ ảnh: ĐEN'))

    def test_can_nhin_anh(self):
        self.assertEqual(T.can_nhin_anh(self.MUC, False), (True, ''))
        self.assertEqual(T.can_nhin_anh(None, False), (True, ''))
        self.assertEqual(T.can_nhin_anh(self.MUC, True)[0], False)  # dòng DUYỆT = X
        self.assertEqual(T.can_nhin_anh(dict(self.MUC, mp={'MP15': 'NERO'}), False), (False, 'đã có màu từ tên'))
        da = T.ap_mau(self.MUC, {'nhom': 'ĐEN', 'mo_ta': '', 'do_tin_cay': 'vừa'}, 'm', 1)
        self.assertEqual(T.can_nhin_anh(da, False), (False, 'đã nhìn ảnh'))
        self.assertEqual(T.can_nhin_anh(da, False, tra_lai=True), (True, ''))
        self.assertEqual(T.can_nhin_anh(da, True, tra_lai=True)[0], False)

    def test_chay_khong_de_dong_duyet(self):
        """Chạy cả chế độ với DB / API giả: mã đã DUYỆT = X không gọi API, dòng duyệt giữ nguyên trong file;
        mã còn trống MP15 được điền; mã có màu từ tên không gọi."""
        import argparse
        import json
        import openpyxl
        from unittest import mock
        cmp_ = T.cot_mp(self.HDR15)
        ra = os.path.join(self.tmp.name, 'thu.xlsx')
        p_cache = ra[:-5] + '.jsonl'
        cache = {
            '1': dict(self.MUC, ma='1'),
            '2': dict(self.MUC, ma='2', ten='DA DUYỆT'),
            '3': dict(self.MUC, ma='3', mp=dict(self.MUC['mp'], MP15='NERO')),
        }
        T.ghi_excel(ra, cache, self.HDR15, cmp_)
        wb = openpyxl.load_workbook(ra)
        ws = wb[T.SHEET_KQ]
        j15 = self.HDR15.index('MÀU SẮC-MP15') + 1
        for r in range(2, ws.max_row + 1):
            if str(ws.cell(r, 2).value) == '2':
                ws.cell(r, len(self.HDR15) + 5).value = 'X'
                ws.cell(r, j15).value = 'TAY GHI'
        wb.save(ra)
        wb.close()
        vt = {m: dict(ma=m, ten=cache[m]['ten'], dvt='M', kho='K', gia_tri=1, nhom_sap='106', ten_nhom_sap='Vải',
                      loai_vat_tu='') for m in cache}
        goi = []

        def goi_gia(self_api, prompt, tra_google=True, than=None):
            goi.append(than)
            return {'candidates': [{'content': {'parts': [{'text': json.dumps(
                {'nhom': 'NÂU', 'mo_ta': 'NÂU ĐẤT', 'do_tin_cay': 'vừa'})}]}}]}

        a = argparse.Namespace(ma='1,2,3', tu_file=None, toi_da=10, tra_lai=False, model='m', rpm=6000, dot=20)
        with mock.patch.object(T, 'doc_db', lambda ds: [vt[m] for m in ds if m in vt]), \
                mock.patch.object(T, 'doc_anh_db', lambda ds: {m: [('image/jpeg', b'abc')] for m in ds}), \
                mock.patch.object(T.Gemini, 'goi', goi_gia), \
                mock.patch.object(T, 'FILE_KQ', os.path.join(self.tmp.name, 'khong_co.xlsx')):
            T.chay_mau_tu_anh(a, 'khoa-gia', ra, p_cache, dict(cache), self.HDR15, cmp_, 0)
        self.assertEqual(len(goi), 1)  # chỉ mã 1
        self.assertEqual(goi[0]['contents'][0]['parts'][1]['inline_data']['mime_type'], 'image/jpeg')
        self.assertIn('DA 217-PEATMOOS', goi[0]['contents'][0]['parts'][0]['text'])
        wb = openpyxl.load_workbook(ra)
        rows = {str(r[1]): r for r in wb[T.SHEET_KQ].iter_rows(min_row=2, values_only=True)}
        wb.close()
        self.assertEqual(rows['1'][j15 - 1], 'NÂU ĐẤT')
        self.assertIn('AI nhìn ảnh', rows['1'][len(self.HDR15)])
        self.assertEqual(rows['2'][j15 - 1], 'TAY GHI')  # dòng duyệt giữ nguyên
        self.assertEqual(rows['2'][len(self.HDR15) + 4], 'X')
        self.assertEqual(rows['3'][j15 - 1], 'NERO')
        c2 = T.doc_cache(p_cache)
        self.assertEqual(set(c2), {'1'})
        self.assertEqual(c2['1']['mp']['MP15'], 'NÂU ĐẤT')


class DocPhieuAnh(unittest.TestCase):
    """--doc-phieu-anh: thân có ảnh, parse, ánh xạ cột, lọc an toàn, không ghi cột cấm, loader đọc 2 file."""
    HDRP = ['A', 'Material', 'Material Description', 'NHÓM VẬT TƯ-MP00', 'CHỦNG LOẠI-MP01', 'THƯƠNG HIỆU-MP12',
            'BỘ SƯU TẬP-MP13', 'MÀU SẮC-MP15', 'MÃ MÀU-MP16', 'MÃ HỌA TIẾT-MP17', 'MÃ SẢN PHẨM NCC-MP18',
            'TIÊU CHUẨN CHẤT LƯỢNG-MP19', 'QUY CÁCH RỘNG-MP22', 'HÌNH DẠNG-MP27', 'ĐẶC TÍNH ĐẶC THÙ-MP31',
            'PHƯƠNG PHÁP GIA CÔNG-MP34', 'CHẤT LIỆU-MP35', 'ĐƠN VỊ TÍNH-MP36', 'NHÀ CUNG CẤP-MP37',
            'LEADTIME SẢN XUẤT-MP38', 'CHÚ THÍCH THÊM-MP99']
    NCC = T.bo_ncc(['10009999 - CÔNG TY TNHH LEPLUS', '20000376 - NICOLAI DIAMANT SRL', '10000495 - AN HƯNG'])
    RAW = {
        'phieu': {'kho_rong': '142 CM', 'thanh_phan': '100% polyester', 'mai_mon': 'Martindale 50.000',
                  'ma_mau': 'MG01', 'bo_suu_tap': 'CT26-041 CUZ', 'ma_mau_nsx': '0909 123 456',
                  'thuong_hieu': 'Leplus', 'project': 'APEC S3', 'leadtime': '40-50 NGÀY'},
        'anh': {'hoa_van': 'trơn', 'be_mat': 'dệt thô', 'kieu_chat_lieu': 'vải'},
        'MP18': 'X1', 'MP37': 'LEPLUS', 'MP38': '6 TUẦN', 'MP99': 'ghi chú', 'do_tin_cay': 'cao'}

    def setUp(self):
        import contextlib
        import io
        import tempfile
        import nap_ban_vat_tu  # noqa: F401 — import trước khi chuyển stdout (module gọi stdout.reconfigure)
        self.tmp = tempfile.TemporaryDirectory()
        self.im = contextlib.redirect_stdout(io.StringIO())
        self.im.__enter__()

    def tearDown(self):
        self.im.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_than_co_anh_va_prompt(self):
        da_co = {'MP01': ('CHỦNG LOẠI', 'VẢI'), 'MP16': ('MÃ MÀU', 'MG01')}
        pr = T.dung_prompt_phieu(dict(ma='9', ten='VẢI_HN-CUZ-MG01', loai_vat_tu='Vật tư'), da_co, 3)
        b = T.than_yeu_cau_anh(pr, [('image/jpeg', b'a'), ('image/jpeg', b'b'), ('image/jpeg', b'c')])
        parts = b['contents'][0]['parts']
        self.assertEqual(len(parts), 4)
        self.assertTrue(all('inline_data' in p for p in parts[1:]))
        for chu in ('VẢI_HN-CUZ-MG01', 'MP16 MÃ MÀU: MG01', 'Chủng loại: VẢI', 'PROJECT', 'LEADTIME', 'kho_rong',
                    'thanh_phan', 'hoa_van', '"thấp|vừa"'):
            self.assertIn(chu, pr)

    def test_parse_va_anh_xa(self):
        raw = T.tach_json('```json\n' + __import__('json').dumps(self.RAW, ensure_ascii=False) + '\n```')
        kq = T.doc_phieu(raw, {'MP01': 'VẢI', 'MP16': 'MG01'}, self.NCC, '100000013325')
        self.assertEqual(kq['mp'], {'MP22': '1420', 'MP35': '100% POLYESTER', 'MP19': 'MARTINDALE 50.000',
                                    'MP27': 'TRƠN', 'MP34': 'DỆT THÔ'})
        self.assertEqual(kq['nguon_cot'], {'MP22': 'phiếu', 'MP35': 'phiếu', 'MP19': 'phiếu', 'MP27': 'ảnh',
                                           'MP34': 'ảnh'})
        bo = dict(kq['bo'])
        self.assertEqual(bo['MP13'], 'mã công trình / đơn')       # CT26-041
        self.assertEqual(bo['MP17'], 'số điện thoại / số dài')     # SĐT
        self.assertIn('NCC', bo['MP12'])      # LEPLUS: NCC (danh sách NCC hay gặp hoặc DB)
        self.assertEqual(bo['MP31'], 'trùng thuộc tính đã có')     # VẢI = chủng loại
        self.assertNotIn('MP16', kq['mp'])                         # đã có => không đọc lại
        self.assertEqual(kq['do_tin_cay'], 'vừa')                  # không bao giờ 'cao'
        gc = T.ghi_chu_phieu(kq)
        self.assertIn('đọc phiếu: MP19, MP22, MP35', gc)
        self.assertIn('nhìn ảnh: MP27, MP34', gc)

    def test_bo_ghep_ten_ma_mau_chu_va_mau_thuan(self):
        # chạy thật 16/11: MP17 'HN - CUZ - MG01' (ghép lại tên), MP16 'MINT GREEN' (tên màu), DA ghi SIMILI
        kq = T.doc_phieu({'phieu': {'ma_mau_nsx': 'HN - CUZ - MG01'}, 'anh': {'kieu_chat_lieu': 'SIMILI / DA PU'}},
                         {'MP01': 'DA', 'MP12': 'HN', 'MP13': 'CUZ', 'MP16': 'MG01'}, set())
        self.assertEqual(kq['mp'], {})
        self.assertEqual(dict(kq['bo']), {'MP17': 'ghép từ thuộc tính đã có', 'MP31': 'mâu thuẫn chủng loại'})
        kq = T.doc_phieu({'phieu': {'ma_mau': 'MINT GREEN'}}, {'MP01': 'ĐÁ'}, set())
        self.assertEqual((kq['mp'], kq['bo']), ({}, [('MP16', 'mã màu không có số')]))
        self.assertEqual(T.doc_phieu({'phieu': {'ma_mau': 'COL 14', 'ma_mau_nsx': 'ST-10'}}, {}, set())['mp'],
                         {'MP16': 'COL 14'})  # 16/11: ST-10 là mã submittal công trình => bỏ

    def test_khong_ghi_cot_cam(self):
        raw = {'phieu': {'thuong_hieu': 'DEDAR'}, 'MP18': 'A', 'MP37': 'B', 'MP38': 'C', 'MP39': 'D', 'MP99': 'E',
               'MP15': 'ĐỎ'}
        kq = T.doc_phieu(raw, {}, set())
        self.assertEqual(kq['mp'], {'MP12': 'DEDAR'})
        for k in ('MP18', 'MP37', 'MP38', 'MP39', 'MP99', 'MP00', 'MP36'):
            self.assertNotIn(k, T.MP_CONG_KHAI)
        self.assertTrue(all(k in T.MP_CONG_KHAI for _, _, k, _ in T.BANG_PHIEU))

    def test_loc_an_toan(self):
        L = T.ly_do_cam
        self.assertIsNotNone(L('CT26-041'))
        self.assertIsNotNone(L('ct 25-075 sofa'))
        self.assertIsNotNone(L('PO26-001'))
        self.assertIsNotNone(L('0909.123.456'))
        self.assertIsNotNone(L('+84 28 3812 3456'))
        self.assertIsNotNone(L('PROJECT APEC'))
        self.assertIsNotNone(L('APPROVED BY CLIENT'))
        self.assertIsNotNone(L('6-8 TUẦN'))
        self.assertIsNotNone(L('13/7/26'))
        self.assertIsNotNone(L('2026-11-16'))
        self.assertIsNotNone(L('XIAMEN JSC GROUP'))
        self.assertIsNotNone(L('Nicolai Diamant', self.NCC))
        self.assertIsNotNone(L('Công ty TNHH Leplus', self.NCC))
        for ok in ('100% POLYESTER', 'MARTINDALE 50.000', '142 CM', 'MG01', 'CUZ', 'DEDAR', 'LINEA 09-11', '22070802',
                   'TRƠN', 'MÀI MỜ (HONED)'):
            self.assertIsNone(L(ok, self.NCC), ok)
        self.assertIsNone(L('AN', self.NCC))  # tên NCC ngắn (<4) không làm hỏng giá trị khác

    def test_thuoc_tinh_da_co(self):
        d = T.thuoc_tinh_da_co({'MP16 MÃ MÀU': '217', 'MP15 MÀU SẮC': '-', 'NGUỒN THUỘC TÍNH': 'AI'},
                               {'MP16': 'KHÁC', 'MP22': '1400'}, None)
        self.assertEqual(d, {'MP16': ('MÃ MÀU', '217'), 'MP22': ('', '1400')})

    def test_chay_ghi_file_rieng(self):
        import argparse
        import json
        import openpyxl
        from unittest import mock
        cmp_ = T.cot_mp(self.HDRP)
        ra = os.path.join(self.tmp.name, T.TEN_FILE_PHIEU)
        vt = {'1': dict(ma='1', ten='VẢI_HN-CUZ-MG01', dvt='M', kho='K', gia_tri=2, nhom_sap='106', ten_nhom_sap='Vải',
                        loai_vat_tu='')}
        goi = []

        def goi_gia(self_api, prompt, tra_google=True, than=None):
            goi.append(than)
            return {'candidates': [{'content': {'parts': [{'text': json.dumps(self.RAW, ensure_ascii=False)}]}}]}

        a = argparse.Namespace(ma='1', tu_file=None, toi_da=10, tra_lai=False, model='m', rpm=6000, dot=20)
        nen = (['1'], {'1': dict(thuoc_tinh={'MP01 CHỦNG LOẠI': 'VẢI', 'MP16 MÃ MÀU': 'MG01'}, loai_vat_tu='')},
               ['10009999 - CÔNG TY TNHH LEPLUS'])
        with mock.patch.object(T, 'doc_db', lambda ds: [vt[m] for m in ds if m in vt]), \
                mock.patch.object(T, 'doc_nen_phieu', lambda ds: nen), \
                mock.patch.object(T, 'doc_anh_db', lambda ds, n=2: {m: [('image/jpeg', b'abc')] * n for m in ds}), \
                mock.patch.object(T.Gemini, 'goi', goi_gia), \
                mock.patch.object(T, 'FILE_KQ', os.path.join(self.tmp.name, 'khong_co.xlsx')):
            T.chay_doc_phieu_anh(a, 'khoa-gia', ra, ra[:-5] + '.jsonl', {}, self.HDRP, cmp_, [], 0)
        self.assertEqual(len(goi), 1)
        self.assertEqual(len(goi[0]['contents'][0]['parts']), 1 + T.ANH_PHIEU_MOI_MA)
        wb = openpyxl.load_workbook(ra)
        ws = wb[T.SHEET_KQ]
        hdr = [c.value for c in ws[1]]
        r = [c.value for c in ws[2]]
        wb.close()
        self.assertEqual(hdr, self.HDRP + T.COT_THEM)
        d = dict(zip(hdr, r))
        self.assertEqual(d['QUY CÁCH RỘNG-MP22'], '1420')
        self.assertEqual(d['CHẤT LIỆU-MP35'], '100% POLYESTER')
        for cam in ('THƯƠNG HIỆU-MP12', 'MÃ SẢN PHẨM NCC-MP18', 'NHÀ CUNG CẤP-MP37', 'LEADTIME SẢN XUẤT-MP38',
                    'CHÚ THÍCH THÊM-MP99', 'MÃ MÀU-MP16', 'BỘ SƯU TẬP-MP13'):
            self.assertIn(d[cam], (None, ''), cam)
        self.assertEqual(d['NGUỒN'], T.NGUON_PHIEU)
        self.assertIn('đọc phiếu', d['GHI CHÚ TRA CỨU'])
        self.assertTrue(str(d['A']).startswith('AI ĐỌC PHIẾU'))
        self.assertFalse(os.path.exists(os.path.join(self.tmp.name, 'khong_co.xlsx')))  # không đụng file thuộc tính

    def test_loader_doc_hai_file(self):
        import openpyxl
        import nap_ban_vat_tu as N
        cmp_ = T.cot_mp(self.HDRP)
        f1, f2 = (os.path.join(self.tmp.name, x) for x in ('tc.xlsx', 'phieu.xlsx'))
        T.ghi_excel(f1, {'1': dict(ma='1', ten='t', mp={'MP15': 'NÂU', 'MP35': 'TỪ FILE 1'})}, self.HDRP, cmp_)
        T.ghi_excel(f2, {'1': dict(ma='1', ten='t', mp={'MP35': 'TỪ FILE 2', 'MP22': '1420'}),
                         '2': dict(ma='2', ten='t2', mp={'MP27': 'SỌC'})}, self.HDRP, cmp_)
        for f in (f1, f2):
            wb = openpyxl.load_workbook(f)
            ws = wb[T.SHEET_KQ]
            for r in range(2, ws.max_row + 1):
                ws.cell(r, len(self.HDRP) + 5).value = 'X'
            wb.save(f)
            wb.close()
        self.assertEqual(N.ds_file_tra_cuu(None, (f1, os.path.join(self.tmp.name, 'khong.xlsx'), f2)), [f1, f2])
        self.assertEqual(N.ds_file_tra_cuu(['']), [])
        self.assertEqual(N.ds_file_tra_cuu([f1, f2, f1]), [f1, f2])
        mp = {'1': {'MP01 CHỦNG LOẠI': 'VẢI'}}
        kq = N.nap_cac_tra_cuu(mp, [f1, f2])
        self.assertEqual([(n, b) for _, n, b in kq], [(2 - 1, 1), (2, 2)])
        self.assertEqual(mp['1']['MP35 CHẤT LIỆU'], 'TỪ FILE 1')  # file trước thắng, file sau không đè
        self.assertEqual(mp['1']['MP22 QUY CÁCH RỘNG'], '1420')    # file sau bù ô trống
        self.assertEqual(mp['1']['MP01 CHỦNG LOẠI'], 'VẢI')
        self.assertEqual(mp['2']['MP27 HÌNH DẠNG'], 'SỌC')


class LuatChan1611(unittest.TestCase):
    def test_ma_noi_bo_va_ncc_hay_gap(self):
        for v in ('ST-103', 'AATN25-044', 'ATC', 'WOODEN WHITE - KNL', 'ARMANI/CASA', 'SHERWIN'):
            self.assertIsNotNone(T.ly_do_cam(v), v)
        for v in ('TANA 101', '100% POLYESTER', 'WARWICK', 'G8041-04', 'RUST 33', 'NCS S 4050-R10B'):
            self.assertIsNone(T.ly_do_cam(v), v)


if __name__ == '__main__':
    unittest.main()
