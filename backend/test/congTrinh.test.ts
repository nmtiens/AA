import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COT_CT, bieuThucKhac, sqlHangMuc, moDoi, taoNhoCoHan } from '../src/server/congTrinh.js';

// Chạy: npm test. Tổng quan công trình theo file — server/congTrinh.ts (phần thuần của routes/congTrinh.ts)

describe('cong-trinh/hang-muc — biểu thức ô khác', () => {
  it('chặn tên cột lạ (không ghép chuỗi SQL bừa)', () => {
    assert.throws(() => bieuThucKhac("x; DROP TABLE a", 'f'));
  });
  it('mỗi kiểu cột có biểu thức riêng', () => {
    assert.match(bieuThucKhac('bop', 'f'), /IS DISTINCT FROM p\.bop::text/);
    assert.match(bieuThucKhac('ten_pm', 'g'), /NULLIF\(c\.ten_pm, ''\) IS NOT NULL/);
    assert.match(bieuThucKhac('tri_gia_don_hang_tong', 'n'), /abs\(c\.tri_gia_don_hang_tong - /);
    assert.match(bieuThucKhac('ngay_khnk_tuan', 'd'), /left\(p\.ngay_khnk_tuan::text, 10\)/);
  });
  it('cột file không có (ct_thieu) => giữ số app (cột f / n / d); cột g vốn bỏ qua ô trống', () => {
    for (const [k, kieu] of [['bop', 'f'], ['so_luong_nhap_kho_luy_ke', 'n'], ['ngay_khnk_thang', 'd']] as const) {
      assert.ok(bieuThucKhac(k, kieu).startsWith(`CASE WHEN '${k}' = ANY(COALESCE(c.ct_thieu`), k);
    }
    assert.doesNotMatch(bieuThucKhac('ten_pm', 'g'), /ct_thieu/);
  });
  it('SQL: mỗi HEX 1 dòng, ưu tiên dòng không HỦY, đủ mọi cột', () => {
    const s = sqlHangMuc();
    assert.match(s, /DISTINCT ON \(h\.hex\)/);
    assert.match(s, /LEFT JOIN bot_tong_hop_file f USING \(nguon\)/);
    assert.match(s, /LIKE '04%'/);
    for (const c of COT_CT) assert.ok(s.includes(`'${c.k}', `), c.k);
    assert.equal(new Set(COT_CT.map(c => c.k)).size, COT_CT.length);
  });
});

describe('cong-trinh/hang-muc — mở gói ô khác', () => {
  it('[giá trị] => giá trị, [null] => null (file trống khác app)', () => {
    assert.deepEqual(moDoi({ bop: ['P014'], ten_pm: [null], tri_gia_don_hang_tong: [72.85] }), { bop: 'P014', ten_pm: null, tri_gia_don_hang_tong: 72.85 });
  });
  it('không ô nào khác => 0', () => {
    assert.equal(moDoi({}), 0);
    assert.equal(moDoi(null), 0);
  });
});

describe('taoNhoCoHan — nhớ có hạn + gộp lần đọc đồng thời', () => {
  it('còn hạn không đọc lại; hết hạn đọc lại', async () => {
    let gio = 1000, lan = 0;
    const n = taoNhoCoHan(3000, async () => ++lan, () => gio);
    assert.equal(await n.lay(), 1);
    gio += 2999;
    assert.equal(await n.lay(), 1);
    gio += 1;
    assert.equal(await n.lay(), 2);
    assert.equal(lan, 2);
  });
  it('các lần gọi đồng thời chờ chung 1 lượt đọc', async () => {
    let lan = 0;
    const n = taoNhoCoHan(3000, async () => { await new Promise(r => setTimeout(r, 5)); return ++lan; });
    assert.deepEqual(await Promise.all([n.lay(), n.lay(), n.docMoi()]), [1, 1, 1]);
  });
  it('lỗi không được nhớ: lần sau đọc lại', async () => {
    let lan = 0;
    const n = taoNhoCoHan(3000, async () => { if (++lan === 1) throw new Error('db'); return lan; });
    await assert.rejects(n.lay());
    assert.equal(await n.lay(), 2);
  });
  it('docMoi bỏ qua bản nhớ; dat gán ngay và lượt đọc dở (dữ liệu cũ) không đè lại', async () => {
    let tha: (v: string) => void = () => {};
    let lan = 0;
    const n = taoNhoCoHan<string>(60_000, () => (++lan === 1 ? new Promise<string>(r => { tha = r; }) : Promise.resolve(`doc${lan}`)));
    const dangDoc = n.lay();
    n.dat('moi');
    tha('cu');
    assert.equal(await dangDoc, 'cu');      // người gọi trước vẫn nhận bản mình đã hỏi
    assert.equal(await n.lay(), 'moi');     // bản nhớ là bản vừa ghi
    assert.equal(await n.docMoi(), 'doc2');
    assert.equal(await n.lay(), 'doc2');
    n.xoa();
    assert.equal(await n.lay(), 'doc3');
  });
});
