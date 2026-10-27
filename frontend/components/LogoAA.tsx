// ============================================================================
// LOGO AA CORPORATION — dùng chung cho mọi app (Operations Hub, Vướng mắc, MRA, trạm quét) và trang đăng nhập.
//   LogoAA: biểu tượng chữ A                                          → public/logo-aa-mark.png
//   LogoAANgang: logo ngang ghép từ ảnh gốc (thanh trên cùng, cột menu)          → public/logo-aa-ngang.png
//   LogoAADayDu: nguyên ảnh logo dọc (trang đăng nhập, màn đăng ký trạm) → public/logo-aa.png
// ============================================================================

export function LogoAA({ className = 'h-8 w-8' }: { className?: string }) {
  return <img src="/logo-aa-mark.png" alt="AA Corporation" className={`${className} shrink-0 object-contain`} draggable={false} />;
}

/**
 * Logo dàn ngang cho chỗ thấp (thanh trên cùng, cột menu): ghép từ chính ảnh logo gốc — biểu tượng bên trái, khối chữ
 * "AA Corporation / Interior Solutions / Since 1989" bên phải, giữ nguyên phông và màu (public/logo-aa-ngang.png).
 */
export function LogoAANgang({ co = 'vua', className = '' }: { co?: 'nho' | 'vua' | 'lon'; className?: string }) {
  const cao = { nho: 'h-10', vua: 'h-12', lon: 'h-14' }[co];
  return (
    <img src="/logo-aa-ngang.png" alt="AA Corporation — Interior Solutions Since 1989"
      className={`${cao} w-auto max-w-full shrink-0 object-contain object-left ${className}`} draggable={false} />
  );
}

export function LogoAADayDu({ className = 'h-28 w-auto' }: { className?: string }) {
  return (
    <img src="/logo-aa.png" alt="AA Corporation — Interior Solutions Since 1989"
      className={`${className} shrink-0 object-contain`} draggable={false} />
  );
}
