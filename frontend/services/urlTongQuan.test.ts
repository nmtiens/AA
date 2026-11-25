import { describe, expect, it } from 'vitest';
import {
  urlOverviewSummary, urlNkNgay, urlPlanActual, urlKhNgay, urlStockDates, urlRevenue, urlManDau, urlTuyChonThoiGian,
  urlVuongMacTheoCongTrinh, urlGuiTruoc, urlGuiTruocTrang, type LocTongQuan,
} from './urlTongQuan';
import { expandProjectNames } from '../utils/productionMetrics';
import { toISODateLocal } from '../components/Dashboard/utils/dateHelpers';

// ---- Bản chép NGUYÊN VĂN cách các nơi gọi dựng URL trước khi có urlTongQuan.ts (để chứng minh chuỗi trùng khít) ----
const cuAppend = (params: URLSearchParams, opts?: LocTongQuan) => {
  if (opts?.congTrinh?.length) params.set('congTrinh', expandProjectNames(opts.congTrinh).join('|') + '|');
  if (opts?.xuong?.length) params.set('xuong', opts.xuong.join(','));
  if (opts?.tinhTrang?.length) params.set('tinhTrang', opts.tinhTrang.join(','));
  if (opts?.tinhTrangIpo?.length) params.set('tinhTrangIpo', opts.tinhTrangIpo.join(','));
};
// dataService.fetchOverviewSummary
const cuSummary = (dateFromISO?: string, dateToISO?: string, datesISO?: string[], opts?: LocTongQuan) => {
  const params = new URLSearchParams();
  if (dateFromISO) params.set('dateFrom', dateFromISO);
  if (dateToISO) params.set('dateTo', dateToISO);
  if (datesISO?.length) params.set('dates', datesISO.join(','));
  cuAppend(params, opts);
  const qs = params.toString();
  return qs ? `/api/overview/summary?${qs}` : `/api/overview/summary`;
};
// dataService.fetchStockDates
const cuStockDates = (opts?: LocTongQuan) => {
  const params = new URLSearchParams();
  cuAppend(params, opts);
  const qs = params.toString();
  return qs ? `/api/stock/dates?${qs}` : `/api/stock/dates`;
};
const thamSoCt = (ct: string[]) => `${ct.join('|')}|`;
// TongQuanDauTrang.layNkNgay
const cuNkNgay = (tu: Date, den: Date, xuong: string[], ct: string[]) => {
  const q = new URLSearchParams({ source: 'inventory', granularity: 'day', dateFrom: toISODateLocal(tu), dateTo: toISODateLocal(den) });
  if (ct.length) q.set('ctWhitelist', thamSoCt(ct));
  if (xuong.length) q.set('xuong', xuong.join(','));
  return `/api/trend?${q.toString()}`;
};
// TongQuanDauTrang: khsx-nam/plan-actual
const cuPlanActual = (namLabel: string, congTrinh: string[]) => {
  const q = new URLSearchParams({ year: namLabel });
  if (congTrinh.length) q.set('congTrinh', thamSoCt(congTrinh));
  return `/api/khsx-nam/plan-actual?${q.toString()}`;
};
// TongQuanDauTrang: khsx/ke-hoach-ngay
const cuKhNgay = (khTu: string, khDen: string, xs: string[], ct: string[]) => {
  const q = new URLSearchParams({ tu: khTu, den: khDen });
  if (xs.length) q.set('xuong', xs.join(','));
  if (ct.length) q.set('congTrinh', thamSoCt(ct));
  return `/api/khsx/ke-hoach-ngay?${q.toString()}`;
};

const LOC: Array<LocTongQuan | undefined> = [
  undefined,
  {},
  { congTrinh: [], xuong: [] },
  { xuong: ['X1', 'X2'] },
  { congTrinh: ['VILLA A, B', 'KHÁCH SẠN C&D'] },
  { congTrinh: ['CT 1'], xuong: ['XƯỞNG MỘC'], tinhTrang: ['Đang SX', 'Tạm ngưng'], tinhTrangIpo: ['01'] },
];

describe('url* trùng khít chuỗi các nơi gọi cũ', () => {
  it('urlOverviewSummary: có / không dates, có / không lọc', () => {
    const ngay: Array<[string?, string?, string[]?]> = [
      [undefined, undefined, undefined],
      ['2026-11-13', '2026-11-13', undefined],
      ['2026-11-13', '2026-11-13', []],
      ['2026-11-13', '2026-11-13', ['2026-11-13']],
      ['2026-11-01', '2026-11-13', ['2026-11-01', '2026-11-07', '2026-11-13']],
      [undefined, '2026-11-13', undefined],
    ];
    for (const [f, t, d] of ngay) for (const loc of LOC) {
      expect(urlOverviewSummary(f, t, d, loc)).toBe(cuSummary(f, t, d, loc));
    }
    expect(urlOverviewSummary()).toBe('/api/overview/summary');
    expect(urlOverviewSummary('2026-11-13', '2026-11-13', ['2026-11-13'], { xuong: ['X1'] }))
      .toBe('/api/overview/summary?dateFrom=2026-11-13&dateTo=2026-11-13&dates=2026-11-13&xuong=X1');
  });

  it('urlStockDates', () => {
    for (const loc of LOC) expect(urlStockDates(loc)).toBe(cuStockDates(loc));
    expect(urlStockDates()).toBe('/api/stock/dates');
  });

  it('urlNkNgay: nhận Date hoặc chuỗi ngày, ctWhitelist trước xuong', () => {
    const tu = new Date(2026, 10, 7), den = new Date(2026, 10, 13);
    for (const [xs, ct] of [[[], []], [['X1', 'X2'], []], [[], ['CT A, B']], [['X1'], ['CT A', 'CT B']]] as Array<[string[], string[]]>) {
      expect(urlNkNgay(tu, den, xs, ct)).toBe(cuNkNgay(tu, den, xs, ct));
      expect(urlNkNgay('2026-11-07', '2026-11-13', xs, ct)).toBe(cuNkNgay(tu, den, xs, ct));
    }
    expect(urlNkNgay(tu, den, [], [])).toBe('/api/trend?source=inventory&granularity=day&dateFrom=2026-11-07&dateTo=2026-11-13');
  });

  it('urlPlanActual', () => {
    for (const ct of [[], ['CT A, B'], ['CT A', 'CT B']]) {
      expect(urlPlanActual(2026, ct)).toBe(cuPlanActual('2026', ct));
      expect(urlPlanActual('2026', ct)).toBe(cuPlanActual('2026', ct));
    }
    expect(urlPlanActual(2026, [])).toBe('/api/khsx-nam/plan-actual?year=2026');
  });

  it('urlKhNgay: xuong trước congTrinh', () => {
    for (const [xs, ct] of [[[], []], [['X1', 'X2'], []], [[], ['CT A, B']], [['X1'], ['CT A', 'CT B']]] as Array<[string[], string[]]>) {
      expect(urlKhNgay('2026-11-07', '2026-11-13', xs, ct)).toBe(cuKhNgay('2026-11-07', '2026-11-13', xs, ct));
      expect(urlKhNgay(new Date(2026, 10, 7), new Date(2026, 10, 13), xs, ct)).toBe(cuKhNgay('2026-11-07', '2026-11-13', xs, ct));
    }
  });

  it('urlRevenue: có năm / không năm như fetchRevenue2026', () => {
    expect(urlRevenue(2026)).toBe('/api/revenue/2026');
    expect(urlRevenue('2025')).toBe('/api/revenue/2025');
    expect(urlRevenue()).toBe('/api/revenue');
    expect(urlRevenue('')).toBe('/api/revenue');
  });

  it('URL không tham số', () => {
    expect(urlTuyChonThoiGian()).toBe('/api/overview/tuy-chon-thoi-gian');
    expect(urlVuongMacTheoCongTrinh()).toBe('/api/vuong-mac/by-project');
  });
});

describe('urlManDau', () => {
  it('ngày thường: đúng 7 URL theo thứ tự, trùng chuỗi các hàm url* với bộ lọc rỗng', () => {
    const ds = urlManDau(new Date(2026, 10, 14, 9, 30)); // 14/11/2026 => hôm qua 13/11
    expect(ds).toEqual([
      '/api/overview/summary?dateFrom=2026-11-13&dateTo=2026-11-13',
      '/api/trend?source=inventory&granularity=day&dateFrom=2026-11-07&dateTo=2026-11-13',
      '/api/khsx-nam/plan-actual?year=2026',
      '/api/overview/tuy-chon-thoi-gian',
      '/api/overview/summary?dateFrom=2026-11-12&dateTo=2026-11-12',
      '/api/khsx/ke-hoach-ngay?tu=2026-11-07&den=2026-11-13',
      '/api/overview/summary?dateFrom=2026-11-13&dateTo=2026-11-13&dates=2026-11-13',
    ]);
    // Trùng với chuỗi nơi gọi dựng khi bộ lọc mặc định (mảng rỗng)
    const loc = { congTrinh: [], xuong: [] };
    expect(ds[0]).toBe(cuSummary('2026-11-13', '2026-11-13', undefined, loc));
    expect(ds[1]).toBe(cuNkNgay(new Date(2026, 10, 7), new Date(2026, 10, 13), [], []));
    expect(ds[2]).toBe(cuPlanActual('2026', []));
    expect(ds[4]).toBe(cuSummary('2026-11-12', '2026-11-12', undefined, loc));
    expect(ds[5]).toBe(cuKhNgay('2026-11-07', '2026-11-13', [], []));
    expect(ds[6]).toBe(cuSummary('2026-11-13', '2026-11-13', ['2026-11-13'], loc));
    expect(new Set(ds).size).toBe(7);
  });

  it('ngày 1/1: hôm qua thuộc năm trước => năm của plan-actual là năm trước', () => {
    const ds = urlManDau(new Date(2027, 0, 1, 0, 5));
    expect(ds[0]).toBe('/api/overview/summary?dateFrom=2026-12-31&dateTo=2026-12-31');
    expect(ds[1]).toBe('/api/trend?source=inventory&granularity=day&dateFrom=2026-12-25&dateTo=2026-12-31');
    expect(ds[2]).toBe('/api/khsx-nam/plan-actual?year=2026');
    expect(ds[4]).toBe('/api/overview/summary?dateFrom=2026-12-30&dateTo=2026-12-30');
  });

  it('ngày 1 đầu tháng và ngày 2: lùi qua tháng trước đúng', () => {
    const d1 = urlManDau(new Date(2026, 2, 1, 8)); // 1/3/2026 => hôm qua 28/2
    expect(d1[0]).toBe('/api/overview/summary?dateFrom=2026-02-28&dateTo=2026-02-28');
    expect(d1[4]).toBe('/api/overview/summary?dateFrom=2026-02-27&dateTo=2026-02-27');
    expect(d1[5]).toBe('/api/khsx/ke-hoach-ngay?tu=2026-02-22&den=2026-02-28');
    const d2 = urlManDau(new Date(2026, 2, 2, 8)); // 2/3 => hôm qua 1/3, hôm kia 28/2
    expect(d2[0]).toBe('/api/overview/summary?dateFrom=2026-03-01&dateTo=2026-03-01');
    expect(d2[4]).toBe('/api/overview/summary?dateFrom=2026-02-28&dateTo=2026-02-28');
    expect(d2[6]).toBe('/api/overview/summary?dateFrom=2026-03-01&dateTo=2026-03-01&dates=2026-03-01');
  });
});

describe('urlGuiTruoc', () => {
  const now = new Date(2026, 10, 14, 9);
  const admin = { role: 'ADMIN', permissions: [] };
  const coTq = { role: 'USER', permissions: ['dashboard'] };
  const coCt = { role: 'USER', permissions: ['construction_overview'] };

  it('trang Tổng quan, có quyền: đúng 7 URL màn đầu', () => {
    expect(urlGuiTruoc('/', '', admin, now)).toEqual(urlManDau(now));
    expect(urlGuiTruoc('/', '#/', coTq, now)).toEqual(urlManDau(now));
  });

  it('trang Tổng quan công trình, có quyền: chỉ vướng mắc theo công trình', () => {
    expect(urlGuiTruoc('/', '#/cong-trinh/tong-quan', coCt, now)).toEqual([urlVuongMacTheoCongTrinh()]);
  });

  it('không có quyền xem trang / không đọc được tài khoản: không gửi gì', () => {
    expect(urlGuiTruoc('/', '#/', coCt, now)).toEqual([]);
    expect(urlGuiTruoc('/', '#/cong-trinh/tong-quan', coTq, now)).toEqual([]);
    expect(urlGuiTruoc('/', '', null, now)).toEqual([]);
    expect(urlGuiTruoc('/', '', { role: 'USER', permissions: 'dashboard' }, now)).toEqual([]);
  });

  it('app điện thoại / trạm quét (hash rỗng nhưng không phải trang Tổng quan): không gửi gì', () => {
    for (const p of ['/m', '/m/', '/m/xuong', '/xuong', '/xuong/tram']) expect(urlGuiTruoc(p, '', admin, now)).toEqual([]);
  });

  it('trang khác (đăng nhập, người dùng…): không gửi gì', () => {
    expect(urlGuiTruoc('/', '#/login', admin, now)).toEqual([]);
    expect(urlGuiTruoc('/', '#/users', admin, now)).toEqual([]);
  });
});

describe('urlGuiTruocTrang', () => {
  const coCt = { role: 'USER', permissions: ['construction_overview'] };
  it('Tổng quan công trình: đăng nhập, phiên bản, bản ghi gọn + hạng mục theo file', () => {
    expect(urlGuiTruocTrang('/', '#/cong-trinh/tong-quan', coCt)).toEqual(
      ['/api/auth/me', '/api/check-versions', '/api/cong-trinh/hang-muc', '/api/tong-quan/cong-trinh']);
    expect(urlGuiTruocTrang('/', '#/cong-trinh/tong-quan', coCt, true)).toEqual( // máy đã lưu bảng: khỏi tải bản dựng sẵn
      ['/api/auth/me', '/api/check-versions', '/api/cong-trinh/hang-muc']);
  });
  it('không có quyền trang đó: chỉ đăng nhập + phiên bản; app điện thoại / đăng nhập: không gửi', () => {
    expect(urlGuiTruocTrang('/', '#/users', coCt)).toEqual(['/api/auth/me', '/api/check-versions']);
    expect(urlGuiTruocTrang('/m/', '', coCt)).toEqual([]);
    expect(urlGuiTruocTrang('/', '#/login', coCt)).toEqual([]);
  });
});
