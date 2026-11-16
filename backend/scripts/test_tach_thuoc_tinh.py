"""Test quy tắc tách thuộc tính từ tên (tên thật trong file tồn 14/11/2026, gồm các ca sai đã biết).

Chạy (từ thư mục backend):  python -B -m unittest scripts/test_tach_thuoc_tinh.py
                        hoặc python -B scripts/test_tach_thuoc_tinh.py
"""
import os
import sys
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tach_thuoc_tinh as T  # noqa: E402


class ChungLoai(unittest.TestCase):
    def test_tu_khoa_dau_ten(self):
        self.assertEqual(T.tach('CHẶN CỬA TƯỜNG INOX 78MM 937.12.100')['chung_loai'], 'CHẶN CỬA')
        self.assertEqual(T.tach('VẢI NILE 905_SYMPHONY-KHỔ 1.4M')['chung_loai'], 'VẢI')
        self.assertEqual(T.tach('KEO_PUR JOWATHERM REAKTANT_609.29', 'Keo')['chung_loai'], 'KEO')

    def test_da_thuoc_khong_thanh_da_stone(self):  # ca sai đã biết: "DA" ra "ĐÁ" vì so khớp bỏ dấu
        self.assertEqual(T.tach('DA 217-PEATMOOS', 'Da')['chung_loai'], 'DA')
        self.assertEqual(T.tach('DA 622 NERO')['chung_loai'], 'DA')
        self.assertEqual(T.tach('DA_VIANDU LINEA 666V', 'Da')['chung_loai'], 'DA')

    def test_da_stone_co_dau(self):
        self.assertEqual(T.tach('ĐÁ MINT GREEN', 'Đá')['chung_loai'], 'ĐÁ')
        self.assertEqual(T.tach('ĐÁ-GALAXY_GREY MARBLE')['chung_loai'], 'ĐÁ')

    def test_da_khong_dau_nhom_da_stone(self):  # "DA" thiếu dấu nhưng nhóm SAP là Đá
        self.assertEqual(T.tach('DA CALACATTA GOLD', 'Đá')['chung_loai'], 'ĐÁ')

    def test_ten_khong_dau(self):
        self.assertEqual(T.tach('LONG DEN_7MAU_D8X20X2')['chung_loai'], 'LONG ĐỀN')
        self.assertEqual(T.tach('VAI LINEN 1.4M')['chung_loai'], 'VẢI')

    def test_viet_tat(self):
        self.assertEqual(T.tach('P.GIA CHỐNG LẮNG 5KG')['chung_loai'], 'PHỤ GIA')
        self.assertEqual(T.tach('G.DÁN TƯỜNG_W4834-D319CY')['chung_loai'], 'GIẤY DÁN TƯỜNG')
        self.assertEqual(T.tach('SIMILY RF 06403')['chung_loai'], 'SIMILI')

    def test_nhom_sap_khi_khong_co_tu_khoa(self):
        r = T.tach('CALACATTA VIOLA 20MM', 'Đá')
        self.assertEqual((r['chung_loai'], r['nguon_cl']), ('ĐÁ', 'nhom'))

    def test_ten_rong(self):
        self.assertEqual(T.tach(''), dict({k: None for k in T.KHOA}, nguon_cl=None, nguon_th=None))


class QuyCach(unittest.TestCase):
    def test_vit_dk_x_dai(self):  # "5X25MM" = ĐK 5 × Dài 25
        self.assertEqual(T.tach('VÍT INOX 5X25MM')['quy_cach'], 'ĐK 5 × Dài 25')
        self.assertEqual(T.tach('BÙLON LGC ĐẦU BẰNG 6X90')['quy_cach'], 'ĐK 6 × Dài 90')

    def test_tam_3_chieu(self):
        self.assertEqual(T.tach('MDF MEL 1M E2 CA_402TA_6X1220X2440')['quy_cach'], 'Dày 6 × Rộng 1220 × Dài 2440')

    def test_long_den_d_dinh_so(self):  # ca sai đã biết: "D8X12X2" trước đây ra ĐK 8 × Dài 12
        self.assertEqual(T.tach('LONG ĐỀN_7MÀU_D8X12X2')['quy_cach'], 'ĐK 8 × ĐK ngoài 12 × Dày 2')

    def test_thanh_nhom_co_dai(self):  # ca sai đã biết: trước đây ra Rộng 10 × Dài 10
        self.assertEqual(T.tach('THANH NHÔM ASV-TN1010U 10X10MM DÀI 3M')['quy_cach'], 'Dày 10 × Rộng 10 × Dài 3000')

    def test_kho_vai(self):
        self.assertEqual(T.tach('VẢI NILE 905_SYMPHONY-KHỔ 1.4M')['quy_cach'], 'Khổ 1400')
        # ca sai thấy khi chạy khô: "KHỔ 900MM" ra Khổ 900000 (đơn vị M khớp trước MM)
        self.assertEqual(T.tach('MÂY NHỰA MẮT CÁO NK02-03 KEM KHỔ 900MM')['quy_cach'], 'Khổ 900')

    def test_dinh_luong_khong_phai_kich_thuoc(self):  # "60x250G/M2" trước đây ra Rộng 60 × Dài 250
        self.assertEqual(T.tach('GÒN PE 60x250G/M2 ( khổ 1.5m)')['quy_cach'], 'Khổ 1500')

    def test_bon_so_khong_doan(self):  # "40X40X1.2X2500MM" trước đây ra Dày 40 × Rộng 40 × Dài 1.2
        self.assertIsNone(T.tach('THÉP TẤM ZAM V 40X40X1.2X2500MM')['quy_cach'])

    def test_don_vi_va_ty_trong(self):
        self.assertEqual(T.tach('CHẶN CỬA TƯỜNG INOX 78MM 937.12.100')['quy_cach'], '78 mm')
        self.assertEqual(T.tach('KEO HẠT JOWATHERM TRẮNG-288.60-25 KG')['quy_cach'], '25 kg')
        self.assertEqual(T.tach('BÔNG KHOÁNG_ROCKWOOL_60KG/M3')['quy_cach'], 'Tỷ trọng 60 kg/m3')

    def test_sua_quy_cach_vit_dao(self):
        self.assertEqual(T.sua_quy_cach_ren('Dài 5 × ĐK 25', 'VÍT ĐẦU BẰNG INOX 5X25MM', 'VÍT', '5', '25'), 'ĐK 5 × Dài 25')
        self.assertEqual(T.sua_quy_cach_ren('Dài 3.5 × ĐK 12', 'VÍT_ĐẦU BẰNG R.THƯA_ĐEN_3.5X12', 'VÍT', '3.5', '12'),
                         'ĐK 3.5 × Dài 12')

    def test_khong_sua_khi_khong_chac(self):
        # đã đúng (Dài 80 > ĐK 12)
        self.assertIsNone(T.sua_quy_cach_ren('Dài 80 × ĐK 12', 'BULONG INOX 12X80MM', 'BU LONG', '80', '12'))
        # số trong tên khác số master
        self.assertIsNone(T.sua_quy_cach_ren('Dài 7 × ĐK 98', 'VÍT_TẮC KÊ_10X100MM', 'VÍT', '7', '98'))
        # "6F" = 6 phân, không chắc đơn vị
        self.assertIsNone(T.sua_quy_cach_ren('Dài 4 × ĐK 6', 'VÍT RĂNG THƯA VÀNG_4X6F', 'VÍT', '4', '6'))
        # không phải nhóm ren
        self.assertIsNone(T.sua_quy_cach_ren('Dài 5 × ĐK 25', 'THANH 5X25MM', 'THANH', '5', '25'))


class Mau(unittest.TestCase):
    def test_mau_tieng_viet_va_anh(self):
        self.assertEqual(T.tach('KEO HẠT JOWATHERM TRẮNG-288.60-25 KG')['mau'], 'TRẮNG')
        self.assertEqual(T.tach('ĐÁ MINT GREEN')['mau'], 'MINT')

    def test_long_den_khong_ra_mau_den(self):  # ca sai đã biết: "LONG ĐEN_TRẮNG" ra màu ĐEN
        self.assertEqual(T.tach('LONG ĐEN_TRẮNG_D6X18X2')['mau'], 'TRẮNG')

    def test_go_khong_co_mau(self):  # tên gỗ là loài gỗ
        self.assertIsNone(T.tach('GỖ WHITE ASH 25MM')['mau'])

    def test_ma_mau(self):
        self.assertEqual(T.tach('VẢI NILE 905_SYMPHONY-KHỔ 1.4M')['ma_mau'], '905')
        self.assertEqual(T.tach('SIMILI S2666-KHỔ 1.4M')['ma_mau'], 'S2666')

    def test_ma_mau_khong_lay_kho_va_kich_thuoc(self):
        self.assertIsNone(T.tach('VẢI_WARRIOR_26 BEETTE_142CM')['ma_mau'])
        self.assertNotEqual(T.tach('LAMINATE_LED 5551G_1220X3050')['ma_mau'], '1220X3050')


class ThuongHieu(unittest.TestCase):
    def test_tu_dien(self):
        self.assertEqual(T.tach('KEO_PUR JOWATHERM REAKTANT_609.29')['thuong_hieu'], 'JOWATHERM')
        self.assertEqual(T.tach('ĐẾ BẢN LỀ HETTICH 9071575')['thuong_hieu'], 'HETTICH')

    def test_ma_hafele(self):
        r = T.tach('CHẶN CỬA TƯỜNG INOX 78MM 937.12.100')
        self.assertEqual((r['thuong_hieu'], r['nguon_th']), ('HAFELE', 'ma_hafele'))

    def test_hafele_ban_blum_khong_suy(self):  # mã Häfele dải Blum chỉ cho biết NCC
        self.assertIsNone(T.tach('BẢN LỀ BẬT TRÙM_342.52.607_18')['thuong_hieu'])
        self.assertIsNone(T.tach('RAY_GIẢM.CHẤN_423.53.740')['thuong_hieu'])

    def test_blum(self):
        self.assertEqual(T.tach('ĐẾ BẢN LỀ_BLUM_342.41.510')['thuong_hieu'], 'BLUM')
        self.assertEqual(T.tach('NÊM_NHẤN MỞ CỬA LỚN TIPON_356.04.580')['thuong_hieu'], 'BLUM')

    def test_khong_lay_bo_suu_tap(self):  # CANVAS / FLAX là tên màu / bộ sưu tập
        self.assertIsNone(T.tach('VẢI_HANAM_5492-0000-CANVAS FLAX')['thuong_hieu'])

    def test_thuong_hieu_nghi(self):
        self.assertTrue(T.thuong_hieu_nghi('CHAMPAGNE'))
        self.assertTrue(T.thuong_hieu_nghi('FLAX'))
        self.assertTrue(T.thuong_hieu_nghi('ASP214'))
        self.assertTrue(T.thuong_hieu_nghi('MIDNIGHT', 'MIDNIGHT'))
        self.assertFalse(T.thuong_hieu_nghi('HAFELE'))
        self.assertFalse(T.thuong_hieu_nghi('KVADRAT'))
        self.assertFalse(T.thuong_hieu_nghi(None))


class ChatLieu(unittest.TestCase):
    def test_inox(self):
        self.assertEqual(T.tach('CHẶN CỬA TƯỜNG INOX 78MM 937.12.100')['chat_lieu'], 'INOX')

    def test_go_cao_su_la_loai_go(self):  # ca sai đã biết
        self.assertIsNone(T.tach('GỖ CAO SU XẺ SẤY F33', 'Gỗ')['chat_lieu'])
        self.assertIsNone(T.tach('GỖ CAO SU GHÉP BC 12*1220*2440MM')['chat_lieu'])

    def test_cao_su_that(self):
        self.assertEqual(T.tach('MIẾNG ĐỆM CAO SU EPDM CHỮ U_14X30X25')['chat_lieu'], 'CAO SU')

    def test_pvc_truoc_nhua(self):
        self.assertEqual(T.tach('CHỈ_NẸP CẠNH NHỰA_PVC_4528_45MM')['chat_lieu'], 'PVC')

    def test_cua_kinh_khong_phai_chat_lieu(self):
        self.assertIsNone(T.tach('TAY NẮM CỬA KÍNH 903.04.151')['chat_lieu'])

    def test_he_son(self):
        self.assertEqual(T.tach('SƠN LÓT PU 2K TRẮNG')['chat_lieu'], 'HỆ PU')


class RaSoat15_11(unittest.TestCase):  # ca sai rà soát 15/11/2026 tìm trên dữ liệu thật
    def test_nhiet_do_mau_khong_phai_kg(self):
        self.assertIsNone(T.tach('LED DÁN COB DC 12V 3000K')['quy_cach'])
        self.assertIsNone(T.tach('ĐÈN LED DÂY 3074 3000K 833.76.636')['quy_cach'])

    def test_ma_son_gach_k_khong_phai_kg(self):
        d = T.tach('SƠN LÓT NƯỚC W-0070K', 'Sơn')
        self.assertIsNone(d['quy_cach'])
        self.assertEqual(d['ma_mau'], 'W-0070K')

    def test_k_la_kg_voi_son(self):
        self.assertEqual(T.tach('TINH MÀU_ĐỎ_238:001:20002 SHW_7.00K', 'Sơn')['quy_cach'], '7 kg')
        self.assertIsNone(T.tach('SƠN LÓT PU 2K TRẮNG')['quy_cach'])  # 2K = sơn 2 thành phần

    def test_bong_led_la_bong_den(self):
        d = T.tach('BÓNG LED TRÒN E27,9W,3000K', 'Phụ kiện')
        self.assertEqual(d['chung_loai'], 'BÓNG ĐÈN')
        self.assertIsNone(d['quy_cach'])
        self.assertIsNone(d['ma_mau'])

    def test_so_ton_khong_phai_ma_mau(self):
        self.assertIsNone(T.tach('VẢI TỒN SỐ 433', 'Vải')['ma_mau'])

    def test_ma_hai_cham_khong_phai_ma_mau(self):
        self.assertIsNone(T.tach('TINH MÀU_ĐỎ_238:001:20002 SHW_7.00K', 'Sơn')['ma_mau'])
        self.assertIsNone(T.tach('LÓT MÀU_GLAZE_TRANG_288:018:10000_25.00K', 'Sơn')['ma_mau'])

    def test_ma_mau_tron(self):
        self.assertEqual(T.tach('VẢI YL-L14029', 'Vải')['ma_mau'], 'YL-L14029')
        self.assertEqual(T.tach('VẢI 42105-0002-1.4M', 'Vải')['ma_mau'], '42105-0002')

    def test_kho_vai_cuoi_ten(self):
        self.assertEqual(T.tach('VẢI 42105-0002-1.4M', 'Vải')['quy_cach'], 'Khổ 1400')


class SuyTuTen(unittest.TestCase):
    def test_chi_dien_o_trong(self):
        ten = 'CHẶN CỬA TƯỜNG INOX 78MM 937.12.100'
        d = T.suy_tu_ten(ten, 'Phụ kiện', {'chung_loai': 'CHẶN CỬA', 'thuong_hieu': 'HAFELE'})
        self.assertEqual(d, {'quy_cach': '78 mm', 'chat_lieu': 'INOX'})

    def test_khong_de_master(self):
        d = T.suy_tu_ten('KEO HẠT JOWATHERM TRẮNG-288.60-25 KG', 'Keo', {'mau': 'TRẮNG NGÀ'})
        self.assertNotIn('mau', d)
        self.assertEqual(d['thuong_hieu'], 'JOWATHERM')

    def test_gach_ngang_la_trong(self):
        d = T.suy_tu_ten('SIMILI S2666-KHỔ 1.4M', None, {'chung_loai': 'SIMILI', 'ma_mau': '-'})
        self.assertEqual(d.get('ma_mau'), 'S2666')

    def test_dung_chung_loai_master(self):  # master ghi VÍT => quy cách theo kiểu ren
        d = T.suy_tu_ten('PK LIÊN KẾT 5X25MM', None, {'chung_loai': 'VÍT'})
        self.assertEqual(d.get('quy_cach'), 'ĐK 5 × Dài 25')

    def test_chi_khoa_hop_le(self):
        d = T.suy_tu_ten('VẢI NILE 905_SYMPHONY-KHỔ 1.4M')
        self.assertTrue(set(d) <= set(T.KHOA))
        self.assertTrue(all(isinstance(v, str) and v for v in d.values()))


if __name__ == '__main__':
    unittest.main()
