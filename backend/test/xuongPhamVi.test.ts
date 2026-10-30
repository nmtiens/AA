import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { phamViTheoQuyen, lienQuanHex, xemHexDuoc } from '../src/server/xuong/phamVi.js';

// Phạm vi xem của mục Xưởng: luật phamViXem + quyền tra cứu chi tiết hạng mục (GET /api/xuong/hex/:hex)

const xuongCd: Record<string, string> = { 'QT1-CAT': 'QT1', 'QT1-SON': 'QT1', 'QT2-LAP': 'QT2' };
const xuongCuaCd = (id: string) => xuongCd[id] ?? null;

describe('phamViTheoQuyen — giữ luật phamViXem', () => {
  it('admin cả xưởng; quản lý xưởng mình; người khác null', () => {
    assert.deepEqual(phamViTheoQuyen(new Set(['*']), [], 'QT1'), { chiTo: null });
    assert.deepEqual(phamViTheoQuyen(new Set(['QT1']), [], 'QT1'), { chiTo: null });
    assert.equal(phamViTheoQuyen(new Set(['QT1']), [], 'QT2'), null);
    assert.equal(phamViTheoQuyen(new Set(), [], 'QT1'), null);
  });
  it('tổ trưởng chỉ tổ mình, kể cả khi có quyền quản lý', () => {
    assert.deepEqual(phamViTheoQuyen(new Set(['QT1', 'QT2']), [{ id: 3, xuong: 'QT1' }], 'QT1'), { chiTo: [3] });
    assert.equal(phamViTheoQuyen(new Set(['QT1', 'QT2']), [{ id: 3, xuong: 'QT1' }], 'QT2'), null);
  });
});

describe('lienQuanHex — xưởng / công đoạn hạng mục dính tới', () => {
  it('gom xưởng chính, trạng thái, sự kiện, xưởng phụ được giao thành phần, tuyến', () => {
    const lq = lienQuanHex({
      xuongChinh: 'qt1',
      trangThai: [{ xuong: 'QT1', cong_doan_id: 'QT1-CAT' }],
      suKien: [{ xuong: 'QT1', cong_doan_id: null, du_lieu: { xuong: 'QT1', thanhPhan: [{ ten: 'A', xuong: 'qt3' }] } }],
      tuyen: ['QT2-LAP'],
      xuongCuaCd,
    });
    assert.deepEqual([...lq.xuong].sort(), ['QT1', 'QT2', 'QT3']);
    assert.deepEqual([...lq.congDoan].sort(), ['QT1-CAT', 'QT2-LAP']);
  });
});

describe('xemHexDuoc — ai xem được chi tiết hạng mục', () => {
  const lq = lienQuanHex({ xuongChinh: 'QT1', trangThai: [], suKien: [], tuyen: ['QT1-CAT', 'QT2-LAP'], xuongCuaCd });
  it('admin mọi hạng mục', () => {
    assert.equal(xemHexDuoc(new Set(['*']), [], new Set(), { xuong: new Set(['QT9']), congDoan: new Set() }), true);
  });
  it('quản lý: hạng mục dính tới xưởng mình (xưởng chính hoặc tuyến qua), không thì không', () => {
    assert.equal(xemHexDuoc(new Set(['QT2']), [], new Set(), lq), true);
    assert.equal(xemHexDuoc(new Set(['QT5']), [], new Set(), lq), false);
  });
  it('tổ trưởng: hạng mục thuộc xưởng của tổ (hàng sắp tới) hoặc qua công đoạn tổ mình', () => {
    // Tổ ở QT1, hạng mục xưởng chính QT1 dù chưa qua công đoạn của tổ
    assert.equal(xemHexDuoc(new Set(), [{ id: 3, xuong: 'QT1' }], new Set(['QT1-SON']), lq), true);
    // Tổ ở QT4 nhưng phụ trách công đoạn QT2-LAP trên tuyến
    assert.equal(xemHexDuoc(new Set(), [{ id: 7, xuong: 'QT4' }], new Set(['QT2-LAP']), lq), true);
    // Tổ ở QT4, không công đoạn nào trên tuyến
    assert.equal(xemHexDuoc(new Set(), [{ id: 7, xuong: 'QT4' }], new Set(['QT4-X']), lq), false);
  });
  it('tổ trưởng có quyền quản lý xưởng khác: giữ luật phamViXem (chỉ xưởng của tổ)', () => {
    const chiQt2 = { xuong: new Set(['QT2']), congDoan: new Set<string>() };
    assert.equal(xemHexDuoc(new Set(['QT2']), [{ id: 3, xuong: 'QT1' }], new Set(), chiQt2), false);
  });
  it('không quyền quản lý, không làm tổ trưởng: không xem được', () => {
    assert.equal(xemHexDuoc(new Set(), [], new Set(), lq), false);
  });
});

describe('lienQuanHex — xưởng chính mã gốc + tên đã gộp', () => {
  it('nhận danh sách xưởng chính (bảng sản xuất ghi mã gốc), bỏ ô trống', () => {
    const lq = lienQuanHex({ xuongChinh: ['x.đb', 'QT1', null], trangThai: [], suKien: [], tuyen: [], xuongCuaCd });
    assert.deepEqual([...lq.xuong].sort(), ['QT1', 'X.ĐB']);
    assert.equal(xemHexDuoc(new Set(), [{ id: 3, xuong: 'QT1' }], new Set(), lq), true);
  });
});
