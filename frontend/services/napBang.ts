// Xin App tải thêm bảng lúc cần (App giữ dữ liệu bảng, hook trang gọi ở đây). true = đã có đủ bảng.
type NapBang = (bang: string[]) => Promise<boolean>;

let nap: NapBang | null = null;

export const dangKyNapBang = (f: NapBang | null) => { nap = f; };

export const napBang = async (bang: string[]): Promise<boolean> => (nap ? nap(bang) : false);
