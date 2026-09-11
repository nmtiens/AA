import React from 'react';

interface CheckpointTriangleProps {
  viewBox?: { x: number; y: number };
  fill?: string;
}

export const CheckpointTriangle = (props: any) => {
  const { viewBox, fill = '#ef4444' } = props;
  const { x, y } = viewBox;
  // Right-pointing triangle: |> (Larger, Moved up 10px)
  return (
    <polygon points={`${x},${y - 10} ${x},${y + 6} ${x + 12},${y - 2}`} fill={fill} />
  );
};