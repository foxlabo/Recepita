'use client';
import React from 'react';

type Props = {
  months: string[];
  a: number[];
  b: number[];
  height?: number;
};

export default function LineChart({ months, a, b, height = 200 }: Props) {
  const n = Math.max(0, Math.min(months.length, a.length, b.length));
  const m = months.slice(0, n);
  const A = a.slice(0, n).map((v) => Number(v ?? 0));
  const B = b.slice(0, n).map((v) => Number(v ?? 0));

  // y軸の最大値（1/2/5 * 10^k で丸め）
  const rawMax = Math.max(1, ...A, ...B);
  const pow10 = Math.pow(10, Math.max(0, Math.floor(Math.log10(rawMax))));
  const mant = rawMax / pow10;
  const niceMant = mant <= 1 ? 1 : mant <= 2 ? 2 : mant <= 5 ? 5 : 10;
  const maxY = niceMant * pow10;

  const padding = { top: 10, right: 12, bottom: 22, left: 28 };
  const width = 720;
  const heightPx = height;
  const innerW = width - padding.left - padding.right;
  const innerH = heightPx - padding.top - padding.bottom;

  const x = (i: number) => (n <= 1 ? 0 : (innerW * i) / (n - 1));
  const y = (v: number) => innerH - (innerH * v) / maxY;

  const toPoints = (arr: number[]) =>
    arr.map((v, i) => `${padding.left + x(i)},${padding.top + y(v)}`).join(' ');

  const gridYCount = 4;
  const gridYs = Array.from({ length: gridYCount + 1 }, (_, i) => (innerH * i) / gridYCount);

  const nothing = !n || (A.every((v) => v === 0) && B.every((v) => v === 0));

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${heightPx}`} className="w-full h-auto">
        <rect x={0} y={0} width={width} height={heightPx} fill="transparent" />
        {gridYs.map((gy, i) => (
          <line
            key={`gy-${i}`}
            x1={padding.left}
            y1={padding.top + gy}
            x2={padding.left + innerW}
            y2={padding.top + gy}
            stroke="currentColor"
            opacity="0.12"
            strokeWidth={1}
          />
        ))}

        {/* x軸（下端） */}
        <line
          x1={padding.left}
          y1={padding.top + innerH}
          x2={padding.left + innerW}
          y2={padding.top + innerH}
          stroke="currentColor"
          opacity="0.3"
          strokeWidth={1}
        />

        {!nothing && (
          <>
            <polyline points={toPoints(A)} fill="none" stroke="currentColor" strokeWidth={2} />
            <polyline points={toPoints(B)} fill="none" stroke="#ef4444" strokeWidth={2} />
          </>
        )}

        {m.map((mm, i) => (
          <text
            key={`xl-${i}`}
            x={padding.left + x(i)}
            y={padding.top + innerH + 14}
            fontSize={10}
            fill="currentColor"
            opacity="0.7"
            textAnchor="middle"
          >
            {mm}
          </text>
        ))}

        <text x={4} y={padding.top + 8} fontSize={10} fill="currentColor" opacity="0.7">
          {maxY.toLocaleString()}
        </text>

        {nothing && (
          <text
            x={width / 2}
            y={heightPx / 2}
            fontSize={12}
            fill="currentColor"
            opacity="0.5"
            textAnchor="middle"
          >
            データがありません
          </text>
        )}
      </svg>
    </div>
  );
}
