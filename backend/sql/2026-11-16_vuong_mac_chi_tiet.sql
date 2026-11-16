-- Chi tiết riêng của vướng mắc M6 Tiền (đã chạy trên DB thật 16/11/2026):
-- { loai: 'nhieu_gia' | 'gia_thap_gcvt' | 'vat_tu_vuot_gia', hexTrung?: string[], chiPhiGcvt?: number, giaiTrinh?: string, ghiChu?: string }
ALTER TABLE vuong_mac ADD COLUMN IF NOT EXISTS chi_tiet jsonb;
