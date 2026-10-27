function hexHead(on){
  const tabs=[['Hạn & công đoạn (BOT · BOP)',''],['Vật tư (BOM)','<span class="badge t-amb" style="font-size:11px">4 còn chờ</span>'],['QC','<span class="badge t-red" style="font-size:11px">2 lỗi</span>'],['Nhập kho','<span class="badge t-sl" style="font-size:11px">2 lần</span>'],['Ghi chú','<span class="badge t-sl" style="font-size:11px">3</span>']];
  document.getElementById('head').innerHTML=`<div class="mh">
    <div class="hd" style="align-items:flex-start">
      <div><div class="eyebrow">PC Nguyễn Thành Thật › TÂY HỒ VIEW-THÁP 4B › Hạng mục</div>
        <div style="font-size:22px;font-weight:700;letter-spacing:-.02em;margin-top:4px">260409705 · Cửa D10 Maxine</div>
        <div class="sub" style="font-size:13px;margin-top:5px">Xưởng 3A · PM Lê Minh Tuấn · PC Nguyễn Thành Thật · BOQ D10 · Nhóm SP: 10. CỬA</div></div>
      <div class="sp"></div><span class="btn">Vật tư theo PR</span><span class="x">✕</span>
    </div>
    <div class="kpis" style="margin-top:16px">
      <div class="kpi" style="padding:12px 14px"><div class="l">Công đoạn (BOP)</div><div class="v"><b style="font-size:22px">05. MỘC</b><span>xưởng 3A</span></div><div class="s c-red">ở công đoạn 5 TUẦN · Mộc 24/40</div></div>
      <div class="kpi" style="padding:12px 14px"><div class="l">Hạn đang dùng (BOT)</div><div class="v"><b class="c-red" style="font-size:22px">03/10</b><span>KH tuần</span></div><div class="s c-red">quá 17 ngày</div></div>
      <div class="kpi" style="padding:12px 14px"><div class="l">Đã nhập kho</div><div class="v"><b class="c-grn" style="font-size:22px">12 / 40</b><span>bộ</span></div><div class="pbar"><i style="width:30%"></i></div><div class="s">30% giá trị · còn 0,42 tỷ</div></div>
      <div class="kpi" style="padding:12px 14px"><div class="l">Đơn hàng</div><div class="v"><b style="font-size:22px">40</b><span>bộ</span></div><div class="s">0,60 tỷ · SL tính phiếu 40</div></div>
    </div>
    <div class="note" style="background:#fdecec;color:#b3141a;margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>Quá hạn 17 ngày — trễ vì:</b><span class="badge t-red" style="background:#fff">Vướng mắc M3 · thiếu ván lạng (4 ngày)</span><span class="badge t-red" style="background:#fff">BOM · Gỗ·Ván trễ 19n, đang cần cho 05. Mộc</span><span style="color:#64748b">· KH nhập kho tháng 31/10 cũng sau ngày cần giao 25/10</span></div>
    <div class="utabs" style="margin-top:12px">${tabs.map(([t,b],i)=>`<span class="${i===on?'on':''}">${t} ${b}</span>`).join('')}</div>
  </div>`;
}
