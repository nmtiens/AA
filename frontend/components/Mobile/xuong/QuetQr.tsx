import { useEffect, useRef, useState } from 'react';
import { X as XIcon, Keyboard } from 'lucide-react';
import { taoLocMaLap, trichHex } from '../../../services/xuongModel';
import { NUT_PHU } from './xuongUi';

// ============================================================================
// QUÉT QR PHIẾU PTHSP (quyết định R2): BarcodeDetector gốc khi trình duyệt có (Chrome Android);
// không có thì tải lười bản ZXing WASM (gói barcode-detector, MIT) — file .wasm phục vụ từ chính app,
// không gọi CDN. Luôn có lối "Gõ mã".
// ============================================================================

interface Detector { detect(src: CanvasImageSource): Promise<Array<{ rawValue: string }>> }

/** Trạm quét: thẻ NV có thể là mã vạch 1D (chưa chốt mẫu thẻ — T6) */
const DANG_THE = ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix'];

async function taoDetector(caMaVach = false): Promise<Detector> {
  const Goc = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (Goc) {
    try {
      const ds = (await Goc.getSupportedFormats?.()) ?? ['qr_code'];
      if (caMaVach) { const co = DANG_THE.filter(f => ds.includes(f)); if (co.length) return new Goc({ formats: co }); }
      else if (ds.includes('qr_code')) return new Goc({ formats: ['qr_code'] });
    } catch { /* dùng bản dự phòng */ }
  }
  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm.default : prefix + path) },
  });
  return new BarcodeDetector({ formats: caMaVach ? DANG_THE as never : ['qr_code'] }) as unknown as Detector;
}

const moCamera = () => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
const loiCamera = (e: unknown) => ((e as { name?: string })?.name === 'NotAllowedError'
  ? 'Chưa cho phép dùng camera. Mở cài đặt trình duyệt để cho phép, hoặc gõ mã.'
  : 'Không mở được camera trên máy này. Hãy gõ mã.');

/**
 * Camera nhúng trong màn trạm: tự mở khi vào màn, chạy liên tục, không che màn hình. Một lượt đọc một lần (taoLocMaLap);
 * quét phiếu rồi quét thẻ liền nhau không phải bấm gì. Máy không có camera: báo ngay trong khung, máy quét USB / Gõ mã vẫn dùng được.
 */
export function KhungCamera({ onRaw, className = '' }: { onRaw: (raw: string) => void; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [loi, setLoi] = useState('');
  const [san, setSan] = useState(false);
  const onRawRef = useRef(onRaw);
  onRawRef.current = onRaw;

  useEffect(() => {
    let dung = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const moi = taoLocMaLap();
    (async () => {
      try {
        stream = await moCamera();
        if (dung) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setSan(true);
        const det = await taoDetector(true);
        const quet = async () => {
          if (dung) return;
          try {
            if (v.readyState >= 2 && !document.hidden) {
              const ma = (await det.detect(v))[0]?.rawValue;
              if (ma && moi(ma, Date.now())) { navigator.vibrate?.(60); onRawRef.current(ma); }
            }
          } catch { /* khung hình lỗi — quét khung sau */ }
          timer = setTimeout(quet, 200);
        };
        quet();
      } catch (e) { if (!dung) setLoi(loiCamera(e)); }
    })();
    return () => {
      dung = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-[1.75rem] border-4 border-dashed border-aa-600 bg-white/5 ${className}`}>
      <video ref={video} playsInline muted aria-label="Camera quét mã" className={`h-full w-full object-cover ${san ? '' : 'invisible'}`} />
      {!san && (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-lg font-semibold text-white" role={loi ? 'alert' : undefined}>
          {loi || 'Đang mở camera…'}
        </p>
      )}
    </div>
  );
}

export default function QuetQr({ onHex, onGoMa, onClose, onRaw, tieuDe = 'Quét QR trên phiếu' }: {
  onHex: (hex: string) => void;
  onGoMa: () => void;
  onClose: () => void;
  /** Trạm quét: nhận nguyên nội dung mọi mã (thẻ NV hoặc phiếu), không lọc mã hạng mục */
  onRaw?: (raw: string) => void;
  tieuDe?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [loi, setLoi] = useState('');
  const [sai, setSai] = useState('');
  // Giữ hàm mới nhất trong ref: màn cha vẽ lại (mỗi 20 giây) không được khởi động lại camera
  const onHexRef = useRef(onHex);
  onHexRef.current = onHex;
  const onRawRef = useRef(onRaw);
  onRawRef.current = onRaw;
  const caMaVach = !!onRaw;

  useEffect(() => {
    let dung = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        stream = await moCamera();
        if (dung) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const det = await taoDetector(caMaVach);
        const quet = async () => {
          if (dung) return;
          try {
            if (v.readyState >= 2) {
              const kq = await det.detect(v);
              for (const k of kq) {
                if (onRawRef.current) { navigator.vibrate?.(60); onRawRef.current(k.rawValue); return; }
                const hex = trichHex(k.rawValue);
                if (hex) { navigator.vibrate?.(60); onHexRef.current(hex); return; }
                setSai(`Mã quét được không có số hạng mục 9 số: "${k.rawValue.slice(0, 40)}"`);
              }
            }
          } catch { /* khung hình lỗi — quét khung sau */ }
          timer = setTimeout(quet, 200);
        };
        quet();
      } catch (e) { setLoi(loiCamera(e)); }
    })();
    return () => {
      dung = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [caMaVach]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" role="dialog" aria-label="Quét phiếu">
      <div className="flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] text-white">
        <p className="text-lg font-semibold">{tieuDe}</p>
        <button onClick={onClose} aria-label="Đóng" className="flex h-14 w-14 items-center justify-center rounded-full active:bg-white/10">
          <XIcon size="1.5em" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {!loi && <div className="pointer-events-none absolute inset-x-[15%] top-1/2 aspect-square -translate-y-1/2 rounded-3xl border-4 border-white/80" />}
        {loi && <p className="absolute inset-x-4 top-1/3 rounded-2xl bg-white p-4 text-base text-slate-800" role="alert">{loi}</p>}
        {sai && !loi && <p className="absolute inset-x-4 bottom-4 rounded-2xl bg-white/95 p-3 text-base text-slate-800" aria-live="polite">{sai}</p>}
      </div>
      <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
        <button onClick={onGoMa} className={`${NUT_PHU} w-full`}><Keyboard size="1.25em" /> Gõ mã</button>
      </div>
    </div>
  );
}
