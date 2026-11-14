import test from 'node:test';
import assert from 'node:assert/strict';
import { taoNhoNgan, taoNhoTheoKhoa } from '../src/server/nhoNgan.js';

test('taoNhoNgan: còn hạn thì không tính lại, hết hạn thì tính lại', async () => {
  let t = 1000, lan = 0;
  const nho = taoNhoNgan<number>(100, 8, () => t);
  const tinh = async () => ++lan;
  assert.equal(await nho.lay('a', tinh), 1);
  t += 99;
  assert.equal(await nho.lay('a', tinh), 1);
  t += 1; // đúng 100ms kể từ lúc bắt đầu tính => hết hạn
  assert.equal(await nho.lay('a', tinh), 2);
  assert.equal(lan, 2);
});

test('taoNhoNgan: khoá khác nhau tính riêng; các lời gọi cùng lúc dùng chung 1 lượt tính', async () => {
  let lan = 0;
  const nho = taoNhoNgan<string>(1000);
  let mo!: (v: string) => void;
  const tinh = () => { lan++; return new Promise<string>(r => { mo = r; }); };
  const p1 = nho.lay('true|2026-08-24', tinh);
  const p2 = nho.lay('true|2026-08-24', tinh);
  await Promise.resolve(); // tinh được gọi ở microtask
  mo('x');
  assert.deepEqual(await Promise.all([p1, p2]), ['x', 'x']);
  assert.equal(lan, 1);
  assert.equal(await nho.lay('false|2026-08-24', async () => 'y'), 'y');
  assert.equal(await nho.lay('true|2026-08-24', async () => 'z'), 'x');
});

test('taoNhoNgan: xoa() giữa lúc đang tính => kết quả cũ không được lưu lại', async () => {
  const nho = taoNhoNgan<string>(1000);
  let mo!: (v: string) => void;
  const cu = nho.lay('k', () => new Promise<string>(r => { mo = r; }));
  await Promise.resolve();
  nho.xoa(); // vừa có thao tác ghi
  const moi = nho.lay('k', async () => 'sau-khi-ghi'); // không bám vào lượt đang tính dở
  mo('truoc-khi-ghi');
  assert.equal(await cu, 'truoc-khi-ghi'); // người gọi cũ vẫn nhận kết quả của mình
  assert.equal(await moi, 'sau-khi-ghi');
  assert.equal(await nho.lay('k', async () => 'khong-goi'), 'sau-khi-ghi');
});

test('taoNhoNgan: lỗi không bị nhớ, lần sau tính lại; vượt số mục thì bỏ mục cũ nhất', async () => {
  const nho = taoNhoNgan<number>(1000, 2);
  await assert.rejects(nho.lay('a', async () => { throw new Error('db'); }));
  assert.equal(await nho.lay('a', async () => 1), 1);
  await nho.lay('b', async () => 2);
  await nho.lay('c', async () => 3); // 'a' bị bỏ
  assert.equal(await nho.lay('a', async () => 9), 9);
  assert.equal(await nho.lay('c', async () => 0), 3);
});

test('taoNhoTheoKhoa: tách khoá có sẵn / còn thiếu, hết hạn theo từng mục, giới hạn số mục', () => {
  let t = 0;
  const nho = taoNhoTheoKhoa<{ tuan: boolean }>(100, 2, () => t);
  assert.deepEqual(nho.tach(['A', 'B']).thieu, ['A', 'B']);
  nho.ghi('A', { tuan: true });
  t = 50;
  nho.ghi('B', { tuan: false });
  let kq = nho.tach(['A', 'B', 'C']);
  assert.deepEqual([...kq.co.entries()], [['A', { tuan: true }], ['B', { tuan: false }]]);
  assert.deepEqual(kq.thieu, ['C']);
  t = 100; // A hết hạn, B còn
  kq = nho.tach(['A', 'B']);
  assert.deepEqual(kq.thieu, ['A']);
  assert.equal(kq.co.get('B')?.tuan, false);
  nho.ghi('C', { tuan: true }); // quá 2 mục => bỏ mục cũ nhất (A)
  nho.ghi('D', { tuan: true }); // bỏ B
  assert.deepEqual(nho.tach(['B', 'C', 'D']).thieu, ['B']);
});
