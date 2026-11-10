import React from 'react';
import { X } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { fmtInt } from '../../utils/format';
import * as bang from '../shared/bangBaoCao';
import { tenFile, type FileLoiBot } from './core/baoCaoBot';

// File công trình lỗi (BÁO CÁO BOT): dùng ở BÁO CÁO BOT và thanh cảnh báo admin ở mọi trang (CanhBaoFileLoi).

export const fmtLuc = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

/** 1 dòng mô tả file lỗi (tooltip): tên file · lỗi · số đang hiện của bản nào */
export const moTaLoi = (f: FileLoiBot) => `${tenFile(f.nguon)}: ${f.loi}${f.kieu === 'cot' ? '' : f.dungSoCua ? ` · đang dùng số file ${tenFile(f.dungSoCua)}` : f.luuTot ? ` · số đang hiện: bản lưu ${fmtLuc(f.luuTot)}` : f.kieu ? ' · chưa có số' : ''}`;

/** Danh sách file công trình lỗi: tên file, công trình, lỗi gì, lúc nào, số đang hiện là của bản lưu nào */
export const DanhSachLoi = ({ ds, onClose }: { ds: FileLoiBot[]; onClose: () => void }) => (
  <ModalShell open onClose={onClose} labelledBy="bcbot-loi" closeOnEsc closeOnBackdrop
    overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/40 p-4"
    panelClassName="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl">
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
      <div>
        <h3 id="bcbot-loi" className="text-base font-bold text-slate-900">{fmtInt(ds.length)} file công trình lỗi</h3>
        <p className="text-xs text-slate-500">Số trên bảng của các file này là của lần đọc tốt gần nhất. Sửa file rồi lưu lại, tool tự đọc lại.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
    </div>
    <div className="flex min-h-0 flex-col px-5 py-3">
      <div className={`${bang.khung} min-h-0`}>
        <table className={bang.table}>
          <thead className={bang.thead}>
            <tr>
              <th className={bang.thC}>FILE</th><th className={bang.thC}>CÔNG TRÌNH</th><th className={bang.thC}>LỖI</th>
              <th className={bang.thC}>LỖI LÚC</th><th className={bang.thC}>SỐ ĐANG HIỆN</th>
            </tr>
          </thead>
          <tbody>
            {ds.map(f => (
              <tr key={f.nguon} className="hover:bg-slate-50">
                <td className={`${bang.tdB} break-all`} title={f.nguon}>{tenFile(f.nguon)}</td>
                <td className={bang.tdB}>{f.ten?.length ? f.ten.join(', ') : '—'}</td>
                <td className={`${bang.tdB} text-red-700`}>{f.loi}</td>
                <td className={bang.tdSo}>{fmtLuc(f.luc)}</td>
                <td className={bang.tdSo}>
                  {f.kieu === 'cot' ? `lần đọc ${fmtLuc(f.luc)}`
                    : f.dungSoCua ? <>dùng số file {tenFile(f.dungSoCua)}{f.luuTot ? ` · bản lưu ${fmtLuc(f.luuTot)}` : ''}</>
                    : f.luuTot ? <>bản lưu {fmtLuc(f.luuTot)}{f.soDong ? ` · ${fmtInt(f.soDong)} dòng` : ''}</>
                      : f.kieu ? <span className="font-semibold text-red-700">chưa có số</span> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </ModalShell>
);
