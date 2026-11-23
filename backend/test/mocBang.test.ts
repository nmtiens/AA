import test from 'node:test';
import assert from 'node:assert/strict';
import { gopMoc } from '../src/server/mocBang.js';

test('gopMoc: gộp theo nhóm, bảng chưa tạo bỏ qua, nhóm trống không có khoá', () => {
  const k = gopMoc([{ t: 'bot_tong_hop', n: '10' }, { t: 'cong_trinh_hang_muc', n: 3 }, { t: 'khnk_sheet', n: '5' }, { t: 'bang_la', n: '9' }]);
  assert.deepEqual(k, { bot: '10.3', khnk: '5' });
});
test('gopMoc: ghi thêm vào bất kỳ bảng nào của nhóm thì mốc đổi', () => {
  const a = gopMoc([{ t: 'bot_tong_hop', n: '10' }, { t: 'cong_trinh_hang_muc', n: '3' }]);
  const b = gopMoc([{ t: 'bot_tong_hop', n: '10' }, { t: 'cong_trinh_hang_muc', n: '4' }]);
  assert.notEqual(a.bot, b.bot);
});
