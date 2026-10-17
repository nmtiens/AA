// ============================================================================
// LOGO AA CORPORATION — dùng chung cho mọi app (Operations Hub, Vướng mắc, MRA, trạm quét) và trang đăng nhập.
//   LogoAA: biểu tượng chữ A                                          → public/logo-aa-mark.png
//   LogoAANgang: biểu tượng + "AA Corporation" + "Interior Solutions · Since 1989" (thanh trên cùng, cột menu)
//   LogoAADayDu: nguyên ảnh logo dọc (trang đăng nhập, màn đăng ký trạm) → public/logo-aa.png
// ============================================================================

export function LogoAA({ className = 'h-8 w-8' }: { className?: string }) {
  return <img src="/logo-aa-mark.png" alt="AA Corporation" className={`${className} shrink-0 object-contain`} draggable={false} />;
}

/** Logo dàn ngang cho chỗ thấp: đủ thông tin như logo gốc (tên công ty + khẩu hiệu) */
export function LogoAANgang({ co = 'vua', className = '' }: { co?: 'nho' | 'vua' | 'lon'; className?: string }) {
  const s = {
    nho: { icon: 'h-8 w-8', ten: 'text-[0.9375rem]', phu: 'text-[0.625rem]' },
    vua: { icon: 'h-10 w-10', ten: 'text-base', phu: 'text-[0.6875rem]' },
    lon: { icon: 'h-12 w-12', ten: 'text-xl', phu: 'text-sm' },
  }[co];
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`} aria-label="AA Corporation — Interior Solutions Since 1989">
      <LogoAA className={s.icon} />
      <div className="min-w-0 leading-tight">
        <p className={`truncate font-bold tracking-tight text-slate-900 ${s.ten}`}>AA Corporation</p>
        <p className={`truncate border-t border-[#f7941d] pt-0.5 font-serif text-slate-700 ${s.phu}`}>Interior Solutions · Since 1989</p>
      </div>
    </div>
  );
}

export function LogoAADayDu({ className = 'h-28 w-auto' }: { className?: string }) {
  return (
    <img src="/logo-aa.png" alt="AA Corporation — Interior Solutions Since 1989"
      className={`${className} shrink-0 object-contain`} draggable={false} />
  );
}
