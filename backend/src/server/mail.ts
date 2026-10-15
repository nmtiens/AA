import nodemailer, { type Transporter } from 'nodemailer';

// ============================================================================
// GỬI EMAIL qua SMTP email công ty (Google Workspace / Microsoft 365 …) — dùng cho mã OTP quên mật khẩu.
// Cấu hình (Vercel → Environment Variables, KHÔNG ghi vào mã nguồn):
//   SMTP_HOST   vd smtp.gmail.com (Google Workspace) / smtp.office365.com (Microsoft 365)
//   SMTP_PORT   587 (STARTTLS, mặc định) hoặc 465 (SSL)
//   SMTP_USER   hộp thư gửi, vd no-reply@aacorporation.com
//   SMTP_PASS   mật khẩu ứng dụng (App Password) của hộp thư đó
//   SMTP_FROM   tên hiển thị người gửi (không bắt buộc), vd "Operations Hub <no-reply@aacorporation.com>"
// Thiếu SMTP_HOST / SMTP_USER / SMTP_PASS => coi như chưa bật gửi mail.
// ============================================================================

let tp: Transporter | null = null;

export const coGuiMail = (): boolean => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function transporter(): Transporter {
  if (tp) return tp;
  const port = Number(process.env.SMTP_PORT) || 587;
  tp = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL ngay từ đầu; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  return tp;
}

export async function guiMail(m: { to: string; subject: string; text: string; html: string }): Promise<void> {
  await transporter().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, ...m });
}

const thoat = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Nội dung email mã OTP quên mật khẩu (tiếng Việt, có bản chữ thường cho hộp thư không đọc HTML) */
export function noiDungOtp(otp: string, phutHetHan: number, ten?: string | null) {
  const chao = ten ? `Chào ${ten},` : 'Chào bạn,';
  const text = [
    chao, '',
    `Mã OTP đặt lại mật khẩu Operations Hub của bạn là: ${otp}`,
    `Mã có hiệu lực trong ${phutHetHan} phút. Không chia sẻ mã này với ai.`, '',
    'Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a;line-height:1.5">
  <p>${thoat(chao)}</p>
  <p>Mã OTP đặt lại mật khẩu <b>Operations Hub</b> của bạn là:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${thoat(otp)}</p>
  <p>Mã có hiệu lực trong <b>${phutHetHan} phút</b>. Không chia sẻ mã này với ai.</p>
  <p style="color:#475569;font-size:13px">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.</p>
</div>`;
  return { subject: `Mã OTP đặt lại mật khẩu: ${otp}`, text, html };
}
