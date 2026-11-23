// Hàng đợi suất gọi API có mức ưu tiên — hàm thuần (không đụng window / fetch) để test được.
// Trần suất giữ nguyên như cũ; chỉ đổi THỨ TỰ phát suất trống: mức 0 trước, rồi 1, 2, 3; cùng mức thì ai xin trước
// được trước.

export type MucUuTien = 0 | 1 | 2 | 3;

export interface HangDoi {
  /** Xin 1 suất; promise xong khi được phát. Còn suất và không ai mức cao hơn đang chờ thì được ngay. */
  xin(muc: MucUuTien): Promise<void>;
  /** Trả suất sau khi request xong (kể cả lỗi) */
  tra(): void;
  /** Bật: mức 1-3 chỉ được dùng (tổng − 1) suất, suất cuối để dành cho mức 0. Tắt: phát ngay cho người đang chờ. */
  giuSuat(bat: boolean): void;
}

export function taoHangDoi(tong = 4): HangDoi {
  let dangChay = 0;
  let giu = false;
  const cho: Array<Array<() => void>> = [[], [], [], []];

  const conSuat = (muc: number) => dangChay < (giu && muc > 0 ? tong - 1 : tong);

  const phat = () => {
    for (;;) {
      let daPhat = false;
      for (let muc = 0; muc < cho.length; muc++) {
        if (cho[muc].length === 0) continue;
        // Mức này không còn suất (đang giữ suất cho mức 0) thì các mức thấp hơn cũng không: dừng lượt
        if (!conSuat(muc)) break;
        dangChay++;
        cho[muc].shift()!();
        daPhat = true;
        break;
      }
      if (!daPhat) return;
    }
  };

  return {
    xin: muc => new Promise<void>(resolve => { cho[muc].push(resolve); phat(); }),
    tra: () => { if (dangChay > 0) dangChay--; phat(); },
    giuSuat: bat => { giu = bat; if (!bat) phat(); },
  };
}
