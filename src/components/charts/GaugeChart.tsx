import React from "react";

interface GaugeChartProps {
  value: number;
  label: string;
  color: string;
  maxValue?: number;
  valueFormatter?: (v: number) => string;
}

export default function GaugeChart({ value, label, color, maxValue, valueFormatter }: GaugeChartProps) {
  const max = maxValue || Math.max(value * 1.5, 1);
  const ratio = Math.min(value / max, 1);

  const cx = 130;
  const cy = 130;
  const r = 90;
  const strokeWidth = 16;

  // Arc from 180° (left) to 0° (right) — semicircle
  const startAngle = Math.PI;
  const endAngle = 0;
  const sweepAngle = startAngle - endAngle;

  const bgX1 = cx + r * Math.cos(startAngle);
  const bgY1 = cy - r * Math.sin(startAngle);
  const bgX2 = cx + r * Math.cos(endAngle);
  const bgY2 = cy - r * Math.sin(endAngle);

  const filledAngle = startAngle - sweepAngle * ratio;
  const fX = cx + r * Math.cos(filledAngle);
  const fY = cy - r * Math.sin(filledAngle);
  const largeArc = ratio > 0.5 ? 1 : 0;

  const bgPath = `M ${bgX1} ${bgY1} A ${r} ${r} 0 1 1 ${bgX2} ${bgY2}`;
  const fillPath = `M ${bgX1} ${bgY1} A ${r} ${r} 0 ${largeArc} 1 ${fX} ${fY}`;

  const displayValue = valueFormatter ? valueFormatter(value) : value.toLocaleString("pt-BR");

  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <svg width="260" height="160" viewBox="0 0 260 160">
        {/* Background arc */}
        <path
          d={bgPath}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {ratio > 0 && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${color}40)`,
              transition: "all 0.8s ease-out",
            }}
          />
        )}
        {/* Value text */}
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          fill="hsl(var(--foreground))"
          fontSize="22"
          fontWeight="700"
          fontFamily="Arial, sans-serif"
        >
          {displayValue}
        </text>
        {/* Label */}
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          fontSize="11"
          fontWeight="500"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}
