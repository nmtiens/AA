import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chonViDu, docKetQuaAI, taoLoiDan } from '../src/server/hoiDapAi.js';
import { DANH_MUC } from '../src/server/hoiDapDanhMuc.js';

// Chạy: npm test. Tầng AI của Hỏi số liệu — server/hoiDapAi.ts

describe('hỏi số liệu — AI', () => {
  it('đọc JSON AI trả, kể cả bọc ```json; sai dạng => null', () => {
    assert.deepEqual(docKetQuaAI('```json\n{"loai":"tim_kiem"}\n```'), { loai: 'tim_kiem' });
    assert.equal(docKetQuaAI('Tôi nghĩ là {"loai":"truy_van","tv":{"bang":"nhap_kho"}} nhé')?.loai, 'truy_van');
    assert.equal(docKetQuaAI('{"loai":"xoa_bang"}'), null);
    assert.equal(docKetQuaAI('không phải JSON'), null);
  });

  it('lời dặn có danh mục + giá trị tình trạng, KHÔNG có tên khách hàng / người / công trình', () => {
    const bangs = DANH_MUC.map(b => ({ b, cot: b.cot }));
    const sx = DANH_MUC.find(b => b.id === 'production_status_app')!.cot.filter(c => c.kieu === 'chu');
    const gt = {
      production_status_app: { tinh_trang: ['15. CHƯA TRIỂN KHAI', '05. MỘC'], khach_hang: ['SUN GROUP'], ten_pm: ['saudn'] },
      vat_tu: { trang_thai: ['1.CHƯA MUA'] },
    };
    const s = taoLoiDan(bangs, sx, gt, new Date(2026, 9, 19));
    assert.match(s, /Hôm nay: 2026-10-19 \(Thứ hai\)/);
    assert.match(s, /## nhap_kho — Nhập kho/);
    assert.match(s, /tinh_trang: Công đoạn hiện tại .*giá trị: 15\. CHƯA TRIỂN KHAI \| 05\. MỘC/);
    assert.match(s, /1\.CHƯA MUA/);
    assert.doesNotMatch(s, /SUN GROUP/);
    assert.doesNotMatch(s, /saudn/);
  });

  it('ví dụ gần câu hỏi: chọn theo chữ chung, chỉ bảng / cột được xem', () => {
    const bangs = DANH_MUC.map(b => ({ b, cot: b.cot }));
    const vd = chonViDu('nhập kho quý 3 theo xưởng', bangs, []);
    assert.ok(vd.length > 0 && vd.length <= 8);
    assert.equal(vd[0].tv.bang, 'nhap_kho');
    // Không được xem bảng nhập kho => không có ví dụ nhập kho
    const khongNk = chonViDu('nhập kho quý 3 theo xưởng', bangs.filter(x => x.b.id !== 'nhap_kho'), []);
    assert.ok(khongNk.every(v => v.tv.bang !== 'nhap_kho'));
    assert.match(taoLoiDan(bangs, [], {}, new Date(2026, 9, 19), 'nhập kho quý 3 theo xưởng'), /Ví dụ gần câu hỏi/);
  });
});
