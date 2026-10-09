import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseQcEntries, summarizeQc } from '../src/server/qc.js';

// Chạy: npm test (node --test qua tsx). Cùng mẫu dữ liệu với frontend/utils/qcParse.test.ts.
const SAMPLE = [
  '11/05/2026:  # QC: NGUYỄN THỊ KIM CHI # Công đoạn: P20 - Lắp ráp hoàn thiện - Fitting # Trạng thái: rejected # SL Kiểm: 1 # SL Đạt: 0 # TL Đạt: 0% # SL Lỗi: 1 # TL Lỗi: 100% # Ghi chú: QĐ-QAQC-015 # Link Ảnh: https://drive.google.com/file/d/AAA/view\nhttps://drive.google.com/file/d/BBB/view',
  '19/04/2026:  # QC: Y LUIS # Công đoạn: P16 - Lắp Ráp Tinh Chỉnh # Trạng thái: APPROVED # SL Kiểm: 2 # SL Đạt: 2 # TL Đạt: 100% # SL Lỗi: 0 # TL Lỗi: 0% # Ghi chú: Tổ a Tú # Link Ảnh: ',
  '19/04/2026:  # QC: Y LUIS # Công đoạn: P16 - Lắp Ráp Tinh Chỉnh # Trạng thái:  # SL Kiểm: 2 # SL Đạt: 2 # TL Đạt: 100% # SL Lỗi: 0 # TL Lỗi: 0% # Ghi chú: Tổ a Tú # Link Ảnh: https://drive.google.com/file/d/CCC/view',
  '03/05/2026:  # QC: LÊ QUANG HUY # Công đoạn: P17 - Làm Nguội # Trạng thái: flagged # SL Kiểm: 1 # SL Đạt: 0 # TL Đạt: 0% # SL Lỗi: 1 # TL Lỗi: 100% # Ghi chú: Nguội P17 # Link Ảnh: ',
].join('\n');

describe('parseQcEntries (backend)', () => {
  it('tách 4 dòng thô thành 4 lần kiểm, đọc số và đếm ảnh', () => {
    const e = parseQcEntries(SAMPLE);
    assert.equal(e.length, 4);
    assert.equal(e[0].status, 'rejected');
    assert.equal(e[0].fail, 1);
    assert.equal(e[0].photos, 2);
    assert.equal(e[1].status, 'approved');
    assert.equal(e[2].status, 'approved'); // trạng thái trống, không lỗi
    assert.equal(e[3].status, 'flagged');
    assert.ok(!/https?:/.test(e[0].note));
  });

  it('rỗng -> []', () => {
    assert.deepEqual(parseQcEntries(''), []);
    assert.deepEqual(parseQcEntries(undefined), []);
  });
});

describe('summarizeQc', () => {
  it('gộp dòng trùng, cộng số lượng, đếm lần có lỗi, lấy lần kiểm gần nhất', () => {
    const s = summarizeQc(parseQcEntries(SAMPLE))!;
    assert.equal(s.n, 3);          // 19/04 trùng gộp còn 1
    assert.equal(s.checked, 4);    // 1 + 2 + 1
    assert.equal(s.pass, 2);
    assert.equal(s.fail, 2);
    assert.equal(s.bad, 2);        // rejected + flagged
    assert.deepEqual(s.last, { date: '11/05/2026', stage: 'P20 - Lắp ráp hoàn thiện - Fitting', status: 'rejected', fail: 1 });
  });

  it('không có lần kiểm -> null', () => {
    assert.equal(summarizeQc([]), null);
  });
});
