import type { FiveMCategory } from '../../services/vuongMacService';

// 5M: mỗi loại 1 mã riêng M1..M5 (giá trị lưu DB giữ nguyên: man/machine/material/method/measurement).
export const FORM_CATEGORIES: { value: FiveMCategory; label: string; hint: string }[] = [
  { value: 'man',         label: 'M1', hint: 'Con người' },
  { value: 'machine',     label: 'M2', hint: 'Máy móc' },
  { value: 'material',    label: 'M3', hint: 'Vật tư' },
  { value: 'method',      label: 'M4', hint: 'Phương pháp' },
  { value: 'measurement', label: 'M5', hint: 'Đo lường' },
];

// Giữ tên hàm cũ cho các nơi đang gọi
export const formCategoriesFor = (_current?: FiveMCategory) => FORM_CATEGORIES;
