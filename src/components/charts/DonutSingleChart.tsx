import React from "react";

interface DonutSingleChartProps {
  value: number;
  label: string;
  color: string;
  maxValue?: number;
  valueFormatter?: (v: number) => string;
}

export default function DonutSingleChart({ value, label, color, maxValue, valueFormatter }: DonutSingleChartProps) {
  const max = maxValue || Math.max(value * 1.5, 1);
  const ratio = Math.min(value / max, 1);

  const cx = 130;
  const cy = 130;
  const r = 80;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * r;
  const filled = circumference * ratio;

  const displayValue = valueFormatter ? valueFormatter(value) : value.toLocaleString("pt-BR");

  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <svg width="260" height="260" viewBox="0 0 260 260">
        {/* Background circle */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Filled circle */}
        {ratio > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeDashoffset={circumference * 0.25}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 0.8s ease-out" }}
          />
        )}
        {/* Value text */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="central"
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
          y={cy + 20}
          textAnchor="middle"
          dominantBaseline="central"
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
