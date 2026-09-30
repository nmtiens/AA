import { FIVE_M_LABELS, type FiveMCategory } from '../../services/vuongMacService';

// Giá trị lưu DB giữ nguyên (man/machine/material/method), chỉ đổi nhãn hiển thị.
// Measurement (M5) không còn là lựa chọn riêng vì đã gộp vào mỗi nhóm.
export const FORM_CATEGORIES: { value: FiveMCategory; label: string; hint: string }[] = [
  { value: 'man',      label: 'M1+M5', hint: 'Man + Measurement' },
  { value: 'machine',  label: 'M2+M5', hint: 'Machine + Measurement' },
  { value: 'material', label: 'M3+M5', hint: 'Material + Measurement' },
  { value: 'method',   label: 'M4+M5', hint: 'Method + Measurement' },
];

// Khi SỬA bản ghi cũ có category = measurement thì vẫn hiện thêm 1 chip để không mất dữ liệu
export const formCategoriesFor = (current?: FiveMCategory) =>
  current === 'measurement'
    ? [
        ...FORM_CATEGORIES,
        { value: 'measurement' as FiveMCategory, label: FIVE_M_LABELS.measurement.split(' ')[0], hint: '' },
      ]
    : FORM_CATEGORIES;