import React from 'react';
export const CheckpointTriangle = (props: any) => {
  const { viewBox } = props;
  const { x, y } = viewBox;
  // Right-pointing triangle: |> (Larger, Moved up 10px)
  // Vertical side on the dashed line (x)
  return (
    <polygon points={`${x},${y - 10} ${x},${y + 6} ${x + 12},${y - 2}`} fill="#ef4444" />
  );
};