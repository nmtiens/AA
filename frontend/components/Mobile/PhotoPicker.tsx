import { useEffect, useRef, useState } from 'react';

export type PhotoItem = { id: string; blob: Blob; url: string };

const MAX_SIDE = 1280;   // cạnh dài tối đa (px)
const QUALITY = 0.72;    // chất lượng JPEG

// Nén ảnh ngay trên điện thoại: ảnh chụp 4-8 MB -> khoảng 150-350 KB
export async function compressImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Không xử lý được ảnh'))), 'image/jpeg', QUALITY)
  );
}

type Props = {
  value: PhotoItem[];
  onChange: (next: PhotoItem[]) => void;
  max?: number;
};

export default function PhotoPicker({ value, onChange, max = 5 }: Props) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const latest = useRef(value);
  latest.current = value;

  // Giải phóng bộ nhớ khi đóng form
  useEffect(() => () => latest.current.forEach(p => URL.revokeObjectURL(p.url)), []);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(''); setBusy(true);
    try {
      const room = max - value.length;
      const picked = Array.from(files).slice(0, Math.max(room, 0));
      const added: PhotoItem[] = [];
      for (const f of picked) {
        const blob = await compressImage(f);
        added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, blob, url: URL.createObjectURL(blob) });
      }
      onChange([...value, ...added]);
      if (files.length > room) setErr(`Tối đa ${max} ảnh`);
    } catch (e: any) {
      setErr(e.message || 'Không thêm được ảnh');
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = '';
      if (galRef.current) galRef.current.value = '';
    }
  };

  const remove = (id: string) => {
    const gone = value.find(p => p.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    onChange(value.filter(p => p.id !== id));
  };

  const full = value.length >= max;
  const btn =
    'flex-1 rounded-2xl border border-slate-300 bg-white py-3.5 text-base font-medium text-slate-800 active:bg-slate-100 disabled:opacity-40';

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <button type="button" disabled={busy || full} onClick={() => camRef.current?.click()} className={btn}>
          📷 Chụp ảnh
        </button>
        <button type="button" disabled={busy || full} onClick={() => galRef.current?.click()} className={btn}>
          🖼️ Chọn ảnh
        </button>
      </div>

      {/* capture="environment": mở thẳng camera sau */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={e => add(e.target.files)} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={e => add(e.target.files)} />

      {busy && <p className="text-sm text-slate-500">Đang xử lý ảnh...</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {value.map(p => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label="Xóa ảnh"
                className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400">{value.length}/{max} ảnh</p>
    </div>
  );
}