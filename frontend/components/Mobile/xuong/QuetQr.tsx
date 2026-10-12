import { useEffect, useRef, useState } from 'react';
import { X as XIcon, Keyboard } from 'lucide-react';
import { trichHex } from '../../../services/xuongModel';
import { NUT_PHU } from './xuongUi';

// ============================================================================
// QUÉT QR PHIẾU PTHSP (quyết định R2): BarcodeDetector gốc khi trình duyệt có (Chrome Android);
// không có thì tải lười bản ZXing WASM (gói barcode-detector, MIT) — file .wasm phục vụ từ chính app,
// không gọi CDN. Luôn có lối "Gõ mã".
// ============================================================================

interface Detector { detect(src: CanvasImageSource): Promise<Array<{ rawValue: string }>> }

async function taoDetector(): Promise<Detector> {
  const Goc = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (Goc) {
    try {
      const ds = (await Goc.getSupportedFormats?.()) ?? ['qr_code'];
      if (ds.includes('qr_code')) return new Goc({ formats: ['qr_code'] });
    } catch { /* dùng bản dự phòng */ }
  }
  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm.default : prefix + path) },
  });
  return new BarcodeDetector({ formats: ['qr_code'] }) as unknown as Detector;
}

export default function QuetQr({ onHex, onGoMa, onClose }: {
  onHex: (hex: string) => void;
  onGoMa: () => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [loi, setLoi] = useState('');
  const [sai, setSai] = useState('');
  // Giữ hàm mới nhất trong ref: màn cha vẽ lại (mỗi 20 giây) không được khởi động lại camera
  const onHexRef = useRef(onHex);
  onHexRef.current = onHex;

  useEffect(() => {
    let dung = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (dung) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const det = await taoDetector();
        const quet = async () => {
          if (dung) return;
          try {
            if (v.readyState >= 2) {
              const kq = await det.detect(v);
              for (const k of kq) {
                const hex = trichHex(k.rawValue);
                if (hex) { navigator.vibrate?.(60); onHexRef.current(hex); return; }
                setSai(`Mã quét được không có số hạng mục 9 số: "${k.rawValue.slice(0, 40)}"`);
              }
            }
          } catch { /* khung hình lỗi — quét khung sau */ }
          timer = setTimeout(quet, 200);
        };
        quet();
      } catch (e) {
        const ten = (e as { name?: string })?.name;
        setLoi(ten === 'NotAllowedError'
          ? 'Chưa cho phép dùng camera. Mở cài đặt trình duyệt để cho phép, hoặc gõ mã.'
          : 'Không mở được camera trên máy này. Hãy gõ mã.');
      }
    })();
    return () => {
      dung = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" role="dialog" aria-label="Quét phiếu">
      <div className="flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] text-white">
        <p className="text-lg font-semibold">Quét QR trên phiếu</p>
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
