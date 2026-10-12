import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { authenticateJWT, signAuthToken } from '../src/server/auth.js';
import { globalLimiter } from '../src/server/app.js';
import { JWT_SECRET_SAFE } from '../src/server/config.js';
import {
  signDeviceToken, verifyDeviceToken, newDeviceId, signXuongToken, xuongScopeError, xuongTokenVersionOk,
  isXuongPath, xuongLimiter, XUONG_RATE_PER_MIN,
} from '../src/server/xuong/auth.js';

// Hợp đồng chống hồi quy R12 (1)(2) + token / thiết bị mục Xưởng (R1, R4, R5)

const chay = (mw: express.RequestHandler, path: string, token: string) => {
  let status = 200;
  let goiNext = false;
  const req = { headers: { authorization: `Bearer ${token}` }, path } as unknown as express.Request;
  const res = {
    status(c: number) { status = c; return this; },
    json() { return this; },
  } as unknown as express.Response;
  mw(req, res, () => { goiNext = true; });
  return { status, goiNext, user: (req as { user?: unknown }).user };
};

describe('mã thiết bị ký HMAC (R4)', () => {
  it('ký rồi xác minh được; sửa chữ ký hoặc tự đặt mã thì bị từ chối', () => {
    const id = newDeviceId();
    const tok = signDeviceToken(id);
    assert.equal(verifyDeviceToken(tok), id);
    assert.equal(verifyDeviceToken(`${id}.giamao`), null);
    assert.equal(verifyDeviceToken(`${newDeviceId()}.${tok.split('.')[1]}`), null);
    assert.equal(verifyDeviceToken('khong-phai-uuid.abc'), null);
    assert.equal(verifyDeviceToken(undefined), null);
  });
});

describe('phạm vi token (R5) — regression R12 (2)', () => {
  const u = { id: 7, username: 'tt3a', role: 'USER' };
  it('JWT 8 giờ thường vẫn dùng được mọi API, kể cả /api/xuong', () => {
    const tok = signAuthToken(u);
    const claims = jwt.verify(tok, JWT_SECRET_SAFE) as jwt.JwtPayload;
    assert.equal((claims.exp! - claims.iat!) / 3600, 8);
    assert.ok(chay(authenticateJWT, '/api/overview/summary', tok).goiNext);
    assert.ok(chay(authenticateJWT, '/api/xuong/cong-viec', tok).goiNext);
  });
  it('token Xưởng 30 ngày chỉ mở /api/xuong/*, bị từ chối ở API khác', () => {
    const tok = signXuongToken(u, newDeviceId(), 3);
    const claims = jwt.verify(tok, JWT_SECRET_SAFE) as jwt.JwtPayload;
    assert.equal((claims.exp! - claims.iat!) / 86400, 30);
    assert.equal(claims.scope, 'xuong');
    assert.ok(chay(authenticateJWT, '/api/xuong/events', tok).goiNext);
    const ngoai = chay(authenticateJWT, '/api/all-data', tok);
    assert.equal(ngoai.goiNext, false);
    assert.equal(ngoai.status, 401);
    assert.equal(chay(authenticateJWT, '/API/ALL-DATA', tok).status, 401);
  });
  it('scope lạ bị từ chối; thu hồi theo token_version', () => {
    assert.equal(xuongScopeError({ scope: 'admin' }, '/api/xuong/x'), 'Token không hợp lệ');
    assert.equal(xuongScopeError(undefined, '/api/all-data'), null);
    assert.equal(xuongTokenVersionOk({ scope: 'xuong', tv: 3 }, 3), true);
    assert.equal(xuongTokenVersionOk({ scope: 'xuong', tv: 3 }, 4), false);
    assert.equal(xuongTokenVersionOk({ scope: 'xuong', tv: 3 }, null), true); // DB chưa chạy SQL
    assert.equal(xuongTokenVersionOk({}, 9), true); // token thường không bị ảnh hưởng
  });
  it('isXuongPath không phân biệt hoa thường', () => {
    assert.ok(isXuongPath('/api/xuong/events'));
    assert.ok(isXuongPath('/API/Xuong/time'));
    assert.ok(!isXuongPath('/api/xuongx'));
    assert.ok(!isXuongPath('/api/overview'));
  });
});

describe('giới hạn request (R1) — regression R12 (1)', () => {
  it('Xưởng 120/phút theo người, không ăn vào 300/phút/IP của API khác', async () => {
    const a = express();
    a.use(globalLimiter);
    a.use((req, _res, next) => { (req as { user?: unknown }).user = { id: req.headers['x-u'] }; next(); });
    a.use('/api/xuong', xuongLimiter);
    a.get('/api/xuong/ping', (_req, res) => { res.json({ ok: true }); });
    a.get('/api/khac', (_req, res) => { res.json({ ok: true }); });
    const server = a.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const goi = (p: string, u: string) => fetch(`${base}${p}`, { headers: { 'x-u': u } }).then(r => r.status);
      const user1: number[] = [];
      for (let i = 0; i < XUONG_RATE_PER_MIN + 1; i++) user1.push(await goi('/api/xuong/ping', '1'));
      assert.equal(user1.filter(s => s === 200).length, XUONG_RATE_PER_MIN);
      assert.equal(user1[XUONG_RATE_PER_MIN], 429);
      // Người khác cùng IP vẫn gửi được
      assert.equal(await goi('/api/xuong/ping', '2'), 200);
      // API khác vẫn còn nguyên 300/phút/IP (121 request Xưởng không bị tính)
      const khac: number[] = [];
      for (let i = 0; i < 301; i++) khac.push(await goi('/api/khac', '1'));
      assert.equal(khac.filter(s => s === 200).length, 300);
      assert.equal(khac[300], 429);
    } finally {
      server.close();
    }
  });
});
