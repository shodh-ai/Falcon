'use client';

import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

const DARK_THEME = {
  backgroundColor: 'transparent',
  textStyle: { color: '#94a3b8', fontSize: 10 },
};

type Props = {
  option: EChartsOption;
  height?: number | string;
  className?: string;
};

export function QuadrantChart({ option, height = 220, className }: Props) {
  return (
    <ReactECharts
      className={className}
      option={{ ...DARK_THEME, ...option }}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
      lazyUpdate
    />
  );
}

export function buildLedgerChart(data: Array<{ period: string; revenue: number; expenses: number }>): EChartsOption {
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['Revenue', 'Expenses'], textStyle: { color: '#94a3b8' } },
    grid: { left: 48, right: 16, top: 32, bottom: 24 },
    xAxis: {
      type: 'category',
      data: data.map((d) => new Date(d.period).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })),
      axisLabel: { color: '#64748b', fontSize: 9 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 9, formatter: (v: number) => `${(v / 100000).toFixed(0)}L` },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      { name: 'Revenue', type: 'bar', data: data.map((d) => d.revenue), itemStyle: { color: '#22c55e' } },
      { name: 'Expenses', type: 'bar', data: data.map((d) => d.expenses), itemStyle: { color: '#ef4444' } },
    ],
  };
}

export function buildRevenuePieChart(data: Array<{ source: string; amount: number }>): EChartsOption {
  return {
    tooltip: { trigger: 'item', formatter: '{b}: ₹{c}' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: data.map((d) => ({ name: d.source, value: d.amount })),
        label: { color: '#94a3b8', fontSize: 10 },
        itemStyle: {
          borderRadius: 4,
          borderColor: '#08234a',
          borderWidth: 2,
        },
        color: ['#22c55e', '#d6b65d', '#3b82f6', '#94a3b8'],
      },
    ],
  };
}

export function buildDefaulterGauge(collected: number, due: number): EChartsOption {
  const rate = collected + due > 0 ? Math.round((collected / (collected + due)) * 100) : 0;
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        progress: { show: true, width: 12, itemStyle: { color: rate >= 75 ? '#22c55e' : '#ef4444' } },
        axisLine: { lineStyle: { width: 12, color: [[1, '#1e293b']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        detail: {
          valueAnimation: true,
          formatter: `{value}%`,
          color: '#fff',
          fontSize: 18,
          offsetCenter: [0, '10%'],
        },
        data: [{ value: rate }],
      },
    ],
  };
}

export function buildDeptRiskChart(data: Array<{ department_name: string; total_score: number }>): EChartsOption {
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 80, right: 16, top: 8, bottom: 24 },
    xAxis: { type: 'value', max: 100, axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.department_name).slice(0, 8),
      axisLabel: { color: '#94a3b8', fontSize: 9 },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d) => ({
          value: d.total_score,
          itemStyle: { color: d.total_score >= 70 ? '#22c55e' : d.total_score >= 50 ? '#d6b65d' : '#ef4444' },
        })),
      },
    ],
  };
}
