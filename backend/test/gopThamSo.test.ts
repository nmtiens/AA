import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { gopThamSo, GOP_TOI_DA_BYTE } from '../src/server/gopThamSo.js';
import { chayCoGioiHan, lenhMoGiaoDich } from '../src/db.js';

// Chạy: npm test. Không kết nối DB.
const g = gopThamSo;
const prepareValue = (pg as unknown as { utils: { prepareValue: (v: unknown) => string } }).utils.prepareValue;

describe('gopThamSo — giá trị', () => {
  it('chữ, số, đúng/sai, null: hằng trong nháy có ngoặc', () => {
    assert.equal(g('SELECT $1', ['a']), "SELECT ('a')");
    assert.equal(g('SELECT 5-$1', [-3]), "SELECT 5-('-3')");
    assert.equal(g('SELECT $1, $2', [1.5, 1e21]), "SELECT ('1.5'), ('1e+21')");
    assert.equal(g('SELECT $1, $2', [true, false]), "SELECT ('true'), ('false')");
    assert.equal(g('SELECT 1 WHERE a IS NOT DISTINCT FROM $1::text', [null]), 'SELECT 1 WHERE a IS NOT DISTINCT FROM (NULL)::text');
    assert.equal(g('SELECT $1', ['']), "SELECT ('')");
  });
  it('ngày, LIMIT / OFFSET, ANY', () => {
    assert.equal(g('SELECT 1 WHERE d < $1::date - 14 LIMIT $2 OFFSET $3', ['2026-11-24', 200, 0]),
      "SELECT 1 WHERE d < ('2026-11-24')::date - 14 LIMIT ('200') OFFSET ('0')");
    const d = new Date(Date.UTC(2026, 10, 24, 1, 2, 3, 4));
    assert.equal(g('SELECT $1', [d]), `SELECT ('${prepareValue(d)}')`);
    assert.equal(g('SELECT 1 WHERE a = ANY($1::text[])', [['x', 'y']]), `SELECT 1 WHERE a = ANY(('{"x","y"}')::text[])`);
    assert.equal(g('SELECT $1::text[]', [[]]), "SELECT ('{}')::text[]");
  });
  it('mảng có nháy, phẩy, ngoặc nhọn, gạch chéo, NULL, số', () => {
    const v = ["a'b", 'c,d', '{e}', 'f\\g', 'h"i', null, 5, 'NULL', ''];
    assert.equal(g('SELECT $1::text[]', [v]),
      String.raw`SELECT (E'{"a''b","c,d","{e}","f\\\\g","h\\"i",NULL,"5","NULL",""}')::text[]`);
  });
  it('kiểu lạ => null', () => {
    for (const v of [undefined, NaN, Infinity, -Infinity, 1n, {}, { toPostgres: () => "x'" }, Symbol('a'), () => 1, Buffer.from('a'),
      new Date(NaN), [undefined], [true], [['a']], [{}], [NaN], [new Date(0)], new Array(2), Object('a')]) {
      assert.equal(g('SELECT $1', [v]), null);
    }
  });
  it('byte NUL (chữ, mảng, câu) => null', () => {
    assert.equal(g('SELECT $1', ['a\0b']), null);
    assert.equal(g('SELECT $1::text[]', [['a\0']]), null);
    assert.equal(g('SELECT $1 \0', ['a']), null);
  });
});

describe('gopThamSo — chèn mã', () => {
  // Bộ đọc độc lập 1 hằng ('…') / (E'…'): phải hết đúng ở cuối và giải ra lại đúng giá trị
  const giai = (s: string): string => {
    const m = /^SELECT \((E?)'([\s\S]*)'\) AS a$/.exec(s);
    assert.ok(m, s);
    let ra = '';
    for (let i = 0; i < m[2].length; i++) {
      const c = m[2][i];
      if (c === "'") { assert.equal(m[2][++i], "'", 'nháy lẻ trong hằng'); ra += "'"; }
      else if (c === '\\') { assert.equal(m[1], 'E'); assert.equal(m[2][++i], '\\', 'gạch chéo lẻ trong hằng'); ra += '\\'; }
      else ra += c;
    }
    return ra;
  };
  const AC = [
    "'", "''", "'''", '\\', "\\'", "\\\\'", "'; DROP TABLE users; --", "\\'; DROP TABLE users; --", "') OR 1=1 --", "' OR ''='",
    '$1', '$2', '$$', '$a$x$a$', '/*', '*/', '--', '-- \n', '\n; COMMIT; DELETE FROM users', '"', "E'", "U&'\\0027'", '’', '＇',
    'ʼ', "😀'", "\ud800'", "Đặng'", '%\\_\\%', 'x\r\ny', '', '\\u0027', '\\x27', '\\047', '$&', "$'", '$`',
  ];
  it('mọi mẫu tấn công chỉ là dữ liệu', () => {
    for (const a of AC) assert.equal(giai(g('SELECT $1 AS a', [a])!), a);
  });
  it('mẫu tấn công ngẫu nhiên 5.000 lượt (ghép các mẩu)', () => {
    let s = 7;
    const r = (k: number) => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return (s >>> 8) % k; };
    for (let i = 0; i < 5000; i++) {
      let a = '';
      for (let j = r(6); j >= 0; j--) a += AC[r(AC.length)];
      assert.equal(giai(g('SELECT $1 AS a', [a])!), a);
    }
  });
  it('giá trị chứa $n không bị thay tiếp', () => {
    assert.equal(g('SELECT $1, $2', ['$2', "'$1'"]), "SELECT ('$2'), ('''$1''')");
  });
  it('mảng: hằng giải ra đúng chữ pg gửi', () => {
    for (const a of AC) assert.equal(giai(g('SELECT $1 AS a', [[a, 'x']])!), prepareValue([a, 'x']));
  });
});

describe('gopThamSo — tách câu', () => {
  it("$n trong chuỗi, E'', định danh, chú thích giữ nguyên", () => {
    assert.equal(g(`SELECT '$1 it''s $2', "c$1""x", $1 -- $9 '\n /* $8 /* ' */ $7 */ , E'\\'$3' || $2`, ['a', 'b']),
      `SELECT '$1 it''s $2', "c$1""x", ('a') -- $9 '\n /* $8 /* ' */ $7 */ , E'\\'$3' || ('b')`);
    assert.equal(g(`SELECT e'a\\\\', $1`, ['a']), `SELECT e'a\\\\', ('a')`);
    assert.equal(g(`SELECT e1, 'b\\d+', $1`, ['a']), `SELECT e1, 'b\\d+', ('a')`);
    // '--' ngay sau toán tử vẫn là chú thích; xuống dòng \r cũng kết thúc chú thích
    assert.equal(g('SELECT 1 +-- $1\n $1', ['a']), "SELECT 1 +-- $1\n ('a')");
    assert.equal(g('SELECT $1\r\n-- x $2\r+ 1', ['a']), "SELECT ('a')\r\n-- x $2\r+ 1");
  });
  it('nhiều lần, $10 khác $1', () => {
    assert.equal(g('SELECT $1,$10,$2,$3,$4,$5,$6,$7,$8,$9,$1', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']),
      "SELECT ('a'),('j'),('b'),('c'),('d'),('e'),('f'),('g'),('h'),('i'),('a')");
  });
  it('không chắc => null', () => {
    const k = (t: string, p: unknown[] = ['a']) => assert.equal(g(t, p), null, t);
    for (const t of ['INSERT INTO a VALUES ($1)', 'UPDATE a SET b=$1', 'EXPLAIN SELECT $1', 'SELECTX $1', 'SELECTĐ $1', '-- x\nSELECT $1', '(SELECT $1)', 'VALUES ($1)',
      'WITH x AS (DELETE FROM a WHERE b = $1 RETURNING 1) SELECT 1', 'WITH x AS (INSERT INTO a VALUES ($1)) SELECT 1', 'SELECT $1 INTO t', 'SELECT $1 FOR UPDATE']) k(t);
    for (const t of ['SELECT $1; SELECT 2', 'SELECT $1;']) k(t);
    for (const t of ['SELECT $$x$$, $1', 'SELECT $a$ $1 $a$', 'SELECT $, $1', 'SELECT $0, $1', 'SELECT $01', 'SELECT a$1, $1', 'SELECT 1$1', 'SELECT $1a', 'SELECT $1$', 'SELECT $1đ']) k(t);
    for (const t of ["SELECT $1, 'abc", 'SELECT $1, "abc', 'SELECT $1 /* x', 'SELECT $1 /* /* */', "SELECT $1, E'abc\\'", "SELECT $1, 'a\\'", "SELECT 'a\\'' || $1",
      "SELECT E'a'\n'b\\'' , $1", "SELECT E'a' -- c\n'b', $1", 'SELECT ($1', 'SELECT $1)']) k(t);
    k('SELECT 1'); k('SELECT $1', []); k('SELECT $2', ['a', 'b']); k('SELECT $1', ['a', 'b']); k('SELECT $1 -- $2', ['a', 'b']);
    k('SELECT $99999999999999999999');
  });
  it('ORDER BY / GROUP BY / PARTITION BY / DISTINCT ON có tham số => null; LIMIT / HAVING / UNION sau đó vẫn ghép', () => {
    for (const t of ['SELECT a FROM t ORDER BY $1', 'SELECT a FROM t GROUP BY a, $1', 'SELECT a FROM t ORDER BY (CASE WHEN a=$1 THEN 1 END)', 'SELECT row_number() OVER (PARTITION BY $1) FROM t',
      'SELECT DISTINCT ON ($1) a FROM t', 'SELECT DISTINCT /* x */ ON ($1) a FROM t', 'SELECT a FROM t ORDER /* x */ BY\n$1']) assert.equal(g(t, [1]), null, t);
    for (const t of ['SELECT a FROM t GROUP BY 1 ORDER BY 1 LIMIT $1', 'SELECT a FROM t GROUP BY a HAVING a > $1', 'SELECT a FROM t GROUP BY 1 UNION ALL SELECT $1',
      'SELECT array_agg(a ORDER BY a), $1 FROM t', 'WITH x AS (SELECT 1 GROUP BY 1) SELECT $1', 'SELECT DISTINCT a FROM t JOIN u ON a = $1']) assert.ok(g(t, [1]), t);
  });
  it('IS [NOT] DISTINCT FROM trong ORDER BY không kết thúc danh sách', () => {
    for (const t of ['SELECT a FROM t ORDER BY a IS DISTINCT FROM 2, $1', 'SELECT a FROM t ORDER BY a IS NOT DISTINCT /* x */ FROM 2, $1',
      'SELECT a FROM t GROUP BY a IS DISTINCT FROM 2, $1']) assert.equal(g(t, [1]), null, t);
    for (const t of ['SELECT a FROM t WHERE a IS DISTINCT FROM $1', 'SELECT a FROM t ORDER BY a IS DISTINCT FROM 2 LIMIT $1']) assert.ok(g(t, [1]), t);
  });
  it('cùng tham số, ép kiểu khác nhau => null', () => {
    for (const t of ['SELECT $1::date, $1::text', 'SELECT a = $1, $1::text', 'SELECT $1::text, a = $1', 'SELECT $1::text, $1::text[]', 'SELECT $1::varchar(2), $1::varchar(3)',
      'SELECT $1::timestamp, $1::timestamp with time zone', 'SELECT $1::character, $1::character varying', 'SELECT $1 :: date, $1::text']) assert.equal(g(t, ['1']), null, t);
    for (const t of ['SELECT $1::date, $1 :: DATE - 1', 'SELECT $1::double precision, $1::DOUBLE  PRECISION AS x', 'SELECT a = $1 OR b = $1', 'SELECT $1::date::text, $1::date',
      'SELECT a = ANY($1::text[]), b = ANY($1::text[])']) assert.ok(g(t, ['1']), t);
  });
  it('quá cỡ => null (đếm byte UTF-8, tính cả tham số lặp)', () => {
    assert.ok(g('SELECT $1', ['a'.repeat(GOP_TOI_DA_BYTE - 100)]));
    assert.equal(g('SELECT $1', ['a'.repeat(GOP_TOI_DA_BYTE)]), null);
    assert.equal(g('SELECT $1', ['ệ'.repeat(GOP_TOI_DA_BYTE / 2)]), null);
    assert.equal(g('SELECT $1,$1,$1,$1', ['a'.repeat(GOP_TOI_DA_BYTE / 3)]), null);
  });
});

describe('gopThamSo — chayCoGioiHan', () => {
  const clientGia = (loiO?: string) => {
    const lenh: string[] = [];
    const ts: unknown[] = [];
    return {
      lenh, ts,
      query: async (text: string, params?: unknown) => {
        lenh.push(text); ts.push(params);
        if (loiO && text.includes(loiO)) throw Object.assign(new Error('thiếu bảng'), { code: '42P01' });
        const cac = text.includes('; COMMIT') ? text.split(/;\s+/) : [text];
        return cac.length > 1 ? cac.map(x => ({ rows: [{ text: x.trim() }] })) : { rows: [{ text }] };
      },
    };
  };
  it('bật: 1 lượt, giữ timeout / work_mem, trả kết quả của câu', async () => {
    const c = clientGia(), gh = { timeoutMs: 15000, workMemMb: 32, gopThamSo: true };
    const r = await chayCoGioiHan(c, 'SELECT $1::date LIMIT $2', ['2026-11-24', 5], gh);
    assert.deepEqual(c.lenh, [`${lenhMoGiaoDich(gh)};\nSELECT ('2026-11-24')::date LIMIT ('5')\n; COMMIT`]);
    assert.deepEqual(c.ts, [undefined]);
    assert.equal(r.rows[0].text, "SELECT ('2026-11-24')::date LIMIT ('5')");
    assert.match(c.lenh[0], /statement_timeout = 15000;.*work_mem = '32MB'/);
  });
  it('không bật: 3 lượt như cũ', async () => {
    const c = clientGia();
    await chayCoGioiHan(c, 'SELECT $1', ['a'], { timeoutMs: 1 });
    assert.equal(c.lenh.length, 3);
    assert.deepEqual(c.ts[1], ['a']);
  });
  it('DB_GOP_LENH=0: 3 lượt dù có bật', () => {
    const ma = `const { chayCoGioiHan } = await import('./src/db.ts'); const l = [];
      await chayCoGioiHan({ query: async (t, p) => { l.push([t, p]); return { rows: [] }; } }, 'SELECT $1', ['a'], { gopThamSo: true });
      console.log('KQ' + JSON.stringify(l.map(x => x[0]).slice(1)) + JSON.stringify(l[1][1])); process.exit(0);`;
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', ma], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, DB_GOP_LENH: '0' } });
    assert.match(r.stdout, /KQ\["SELECT \$1","COMMIT"\]\["a"\]/, r.stderr);
  });
  it('bật nhưng không ghép được: 3 lượt, tham số nguyên vẹn', async () => {
    const c = clientGia(), p = [{ a: 1 }];
    await chayCoGioiHan(c, 'SELECT $1::jsonb', p, { gopThamSo: true });
    assert.deepEqual(c.lenh, [lenhMoGiaoDich(), 'SELECT $1::jsonb', 'COMMIT']);
    assert.equal(c.ts[1], p);
  });
  it('lỗi 42P01: ROLLBACK rồi ném lại đúng lỗi', async () => {
    const c = clientGia('FROM khong_co');
    await assert.rejects(chayCoGioiHan(c, 'SELECT 1 FROM khong_co WHERE a = $1', ['x'], { gopThamSo: true }), (e: { code?: string }) => e.code === '42P01');
    assert.equal(c.lenh.length, 2);
    assert.equal(c.lenh[1], 'ROLLBACK');
  });
});

describe('gopThamSo chế độ chặt (ghép tự động)', () => {
  it('tham số trần dùng 2 chỗ => không ghép; 1 chỗ hoặc cùng ép kiểu => ghép', () => {
    assert.equal(gopThamSo('SELECT 1 FROM t WHERE a >= $1 AND b <= $1', ['2026-11-01'], true), null);
    assert.ok(gopThamSo('SELECT 1 FROM t WHERE a >= $1 AND b <= $1', ['2026-11-01']));
    assert.ok(gopThamSo('SELECT 1 FROM t WHERE a = $1 AND b = $2', ["o'n", 2], true));
    assert.ok(gopThamSo('SELECT 1 FROM t WHERE a >= $1::date AND b <= $1::date', ['2026-11-01'], true));
  });
});
