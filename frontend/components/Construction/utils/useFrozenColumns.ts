import React, { useMemo } from 'react';
import { getFrozenColumns } from './tableColumnConfig';

export interface FrozenInfo { left: number; isLast: boolean }

const EDGE = 'shadow-[2px_0_3px_-1px_rgba(0,0,0,0.18)]';

/** Trả về Map<key, {left, isLast}> cho MỌI cột đang được ghim, gồm cả 2 cột cố định
 *  đầu (fixed) và các cột phụ. Luôn chừa ít nhất 1 cột cuộn được; dừng trước cột `unfreezable`. */
export function useFrozenColumns<K extends string>(
  modalId: string,
  fixed: { key: string; width: number }[],   // vd [{key:'stt',width:50},{key:'hex',width:150}]
  orderedCols: K[],
  widths: Record<K, number>,
  cfgVersion: number,
  unfreezable: K[] = []
): Map<string, FrozenInfo> {
  return useMemo(() => {
    const all = [
      ...fixed,
      ...orderedCols.map((k) => ({ key: k as string, width: widths[k] })),
    ];
    let count = Math.min(getFrozenColumns(modalId), Math.max(all.length - 1, 0));
    const blocked = all.findIndex((c) => (unfreezable as string[]).includes(c.key));
    if (blocked !== -1) count = Math.min(count, blocked);

    const map = new Map<string, FrozenInfo>();
    let left = 0;
    for (let i = 0; i < count; i++) {
      map.set(all[i].key, { left, isLast: i === count - 1 });
      left += all[i].width;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalId, orderedCols, cfgVersion]);
}

/** Class + style cho 2 cột cố định (STT / Hex): chỉ sticky khi đang được ghim. */
export const fzClass = (info?: FrozenInfo) =>
  info ? `sticky z-10 ${info.isLast ? EDGE : ''}` : '';
export const fzStyle = (info?: FrozenInfo): React.CSSProperties | undefined =>
  info ? { left: info.left } : undefined;

/** Gắn sticky vào 1 <th>/<td>/component nhận className + style (cột phụ). */
export function applyFrozen(node: React.ReactNode, info?: FrozenInfo, bg = '!bg-white'): React.ReactNode {
  if (!info || !React.isValidElement(node)) return node;
  const p = node.props as { className?: string; style?: React.CSSProperties };
  return React.cloneElement(node as React.ReactElement<any>, {
    style: { ...p.style, left: info.left },
    className: `${p.className ?? ''} sticky z-10 ${bg} ${info.isLast ? EDGE : ''}`,
  });
}