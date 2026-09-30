import { getToken } from '../../services/userService';
import { UNAUTHORIZED } from '../../services/vuongMacService';
import type { HexHit } from '../../services/vuongMacMobileApi';

// Tìm nhiều mã (hex 9 số hoặc mã nhà máy 12 số) trong 1 lần gọi. Tối đa 200 mã.
export async function searchHexBulk(
  codes: string[],
  xuongs: string[],
): Promise<{ hits: HexHit[]; missing: string[] }> {
  const res = await fetch('/api/vuong-mac/hex-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ codes, xuongs }),
  });
  if (res.status === 401) throw new Error(UNAUTHORIZED);
  if (!res.ok) throw new Error('Không tìm được');
  return res.json();
}