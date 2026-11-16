import { useEffect, useMemo, useState } from 'react';
import { linkSources } from '../shared/LinkLightbox';
import { urlAnhKhach, type HangKhach } from '../../services/cuaHangApi';
import { tenHienThiKhach, xepAnhHopLe } from './xuLyCuaHang';

// ============================================================================
// Hàm dùng chung (không phải component) của trang khách: nguồn ảnh, tên, dòng mô tả ngắn, vị trí cắt ảnh thẻ.
// Tách khỏi TheHang.tsx để file component chỉ export component (Fast Refresh không phải nạp lại cả module).
// ============================================================================

/** Mọi ảnh xem được của 1 mã: ảnh nội bộ đã bật công khai trước, rồi link ảnh ngoài có ảnh trực tiếp */
export const dsAnhKhach = (h: Pick<HangKhach, 'anh' | 'anhNgoai'>): string[] => [
  ...h.anh.map(urlAnhKhach),
  ...h.anhNgoai.map(u => linkSources(u).img).filter((u): u is string => !!u),
];

/**
 * Ảnh mẫu trên thẻ: phiếu nhãn viết tay thường chiếm nửa trên ảnh => neo đáy + phóng nhẹ để mặt vật liệu chiếm khung.
 * Chỉ áp khi ảnh đủ lớn / không quá dẹt (AnhKhach fit="tu_dong" tự chuyển sang hiện trọn ảnh khi ảnh quá nhỏ).
 */
export const VI_TRI_CAT = '50% 100%';

/** Tên khách thấy ở mọi nơi (thẻ, chi tiết, giỏ, thông báo): giữ đủ nghĩa ("Đá nung kết…"), bỏ đuôi đơn vị SAP "(M2)" */
export const tenKhach = (h: Pick<HangKhach, 'ten'>): string => tenHienThiKhach(h.ten);

/** Chữ khi chưa có giá bán: cửa sổ chi tiết ghi đủ, thẻ / ô nhỏ ghi gọn */
export const CHU_LIEN_HE = 'Liên hệ báo giá';
export const CHU_LIEN_HE_GON = 'Liên hệ';

/**
 * Ảnh của cửa sổ chi tiết, ảnh dẹt / quá nhỏ (443×46 — ảnh chụp dải nhãn) đẩy xuống cuối: đo kích thước từng ảnh lúc
 * tải (API không trả kích thước). Chưa đo xong => giữ thứ tự gốc.
 */
export const useAnhXepHopLe = (ds: string[]): string[] => {
  const khoa = JSON.stringify(ds);
  const [kt, setKt] = useState<ReadonlyMap<string, { w: number; h: number }>>(() => new Map());
  useEffect(() => {
    let huy = false;
    const imgs = (JSON.parse(khoa) as string[]).map(u => {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = () => { if (!huy) setKt(m => new Map(m).set(u, { w: img.naturalWidth, h: img.naturalHeight })); };
      img.src = u;
      return img;
    });
    return () => { huy = true; imgs.forEach(i => { i.onload = null; }); };
  }, [khoa]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- khoa đại diện cho ds
  return useMemo(() => xepAnhHopLe(ds, kt), [khoa, kt]);
};
