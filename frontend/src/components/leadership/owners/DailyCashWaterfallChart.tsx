'use client';

import ReactECharts from 'echarts-for-react';
import type { DailyCashWaterfall } from '@/lib/api/api.leadership';

function toCr(amount: number) {
  return amount / 10000000;
}

export function DailyCashWaterfallChart({ data }: { data: DailyCashWaterfall }) {
  const categories = ['Opening', ...data.steps.map((s) => s.label), 'Closing'];
  const values = [data.starting_balance, ...data.steps.map((s) => s.value), data.ending_balance];

  const option = {
    backgroundColor: 'transparent',
    grid: { left: 24, right: 24, top: 24, bottom: 36 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (params: Array<{ axisValue: string; data: number }>) => {
        const p = params?.[0];
        if (!p) return '';
        return `${p.axisValue}<br/>₹${Number(p.data ?? 0).toLocaleString('en-IN')}`;
      },
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: '#94a3b8', fontSize: 10, interval: 0, rotate: 25 },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#94a3b8', formatter: (v: number) => `${toCr(v).toFixed(2)} Cr` },
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
    },
    series: [
      {
        type: 'bar',
        data: values,
        barWidth: 22,
        itemStyle: {
          borderRadius: [8, 8, 8, 8],
          color: (p: { dataIndex: number }) => {
            const i = p.dataIndex;
            if (i === 0 || i === values.length - 1) return '#d6b65d';
            const delta = data.steps[i - 1]?.value ?? 0;
            return delta >= 0 ? '#22c55e' : '#ef4444';
          },
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 360, width: '100%' }} opts={{ renderer: 'canvas' }} />;
}
