// Đầu cửa sổ công trình dùng chung cho 4 tab: thanh tab = 4 ô trạng thái
function ctHead(on){
  const tabs=[['Tổng quan','#0f172a','<b>25%</b> nhập kho · ước xong <b class="c-red">08/2027</b>'],
    ['BOT · Thời hạn','#e31e24','<b class="c-red">187</b> quá hạn · 248 đến hạn ≤ 14 ngày'],
    ['BOP · Công đoạn','#f59e0b','<b class="c-amb">74</b> nghẽn ≥ 4 tuần · QC lỗi 6'],
    ['BOM · Vật tư','#e31e24','<b class="c-red">23</b> HM đứng chờ vật tư · 219 còn thiếu']];
  document.getElementById('head').innerHTML=`<div class="mh">
    <div class="hd" style="align-items:flex-start">
      <div><div class="eyebrow">PC Nguyễn Thành Thật › Công trình</div>
        <div style="font-size:22px;font-weight:700;letter-spacing:-.02em;margin-top:4px">TÂY HỒ VIEW-THÁP 4B-BAN CÔNG_CT24-067</div>
        <div class="hd" style="gap:8px;margin-top:6px;flex-wrap:wrap"><span class="sub" style="font-size:13px">PM Lê Minh Tuấn · PC Nguyễn Thành Thật · 1.757 hạng mục · 125,02 tỷ · Nhóm: <b style="color:#b3141a">Luồng đỏ</b></span>
        <span class="badge dot t-red">BOT dự án 30/10/2026 · còn 10 ngày, còn 1.420 mục</span></div></div>
      <div class="sp"></div><span class="btn">Xuất Excel</span><span class="btn dark">Danh sách HEX →</span><span class="x">✕</span>
    </div>
    <div class="stabs">${tabs.map(([k,c,m],i)=>`<div class="stab${i===on?' on':''}" style="--hc:${c}"><div class="k" style="${i===on?'color:#0f172a':''}">${k}</div><div class="m">${m}</div></div>`).join('')}</div>
  </div>`;
}
const H={r:'#e31e24',a:'#f59e0b',g:'#22c55e',n:'#cbd5e1'};
const mini=p=>`<span class="mini"><i><b style="width:${p}%"></b></i><span class="c-sub">${p}%</span></span>`;
