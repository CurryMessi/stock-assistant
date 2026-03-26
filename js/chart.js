// js/chart.js

import { fetchKlineData } from './api.js';

const klineCache = new Map();

let activeChart = null;
let activeSecid = null;
let activePeriod = 'daily';

function getChartColors(theme) {
  if (theme === 'dark') {
    return {
      background: '#1a1a2e',
      textColor: '#b0b0b0',
      gridColor: '#2a2a4a',
      borderColor: '#2a2a4a',
      upColor: '#e74c3c',
      downColor: '#27ae60',
    };
  }
  return {
    background: '#ffffff',
    textColor: '#666666',
    gridColor: '#e0e0e0',
    borderColor: '#e0e0e0',
    upColor: '#e74c3c',
    downColor: '#27ae60',
  };
}

/**
 * 切换展开状态（不创建图表，仅切换 activeSecid）
 * @returns {'expand'|'collapse'} 操作结果
 */
export function toggleActiveSecid(secid) {
  if (activeSecid === secid) {
    destroyChart();
    return 'collapse';
  }
  if (activeChart) {
    destroyChart();
  }
  activeSecid = secid;
  activePeriod = 'daily';
  return 'expand';
}

/**
 * 在指定容器中创建 K 线图表（需在 DOM 渲染后调用）
 */
export async function createChart(container, theme) {
  if (!activeSecid || !container) return;

  const colors = getChartColors(theme);

  const LightweightCharts = await import('../libs/lightweight-charts.standalone.production.mjs');

  activeChart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: 200,
    layout: {
      background: { color: colors.background },
      textColor: colors.textColor,
    },
    grid: {
      vertLines: { color: colors.gridColor },
      horzLines: { color: colors.gridColor },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
    timeScale: {
      borderColor: colors.borderColor,
      timeVisible: false,
    },
    rightPriceScale: {
      borderColor: colors.borderColor,
    },
  });

  const series = activeChart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: colors.upColor,
    downColor: colors.downColor,
    wickUpColor: colors.upColor,
    wickDownColor: colors.downColor,
    borderVisible: false,
  });

  activeChart._candleSeries = series;

  await loadKlineData(series);
}

async function loadKlineData(series) {
  const cacheKey = `${activeSecid}_${activePeriod}`;
  let data = klineCache.get(cacheKey);

  if (!data) {
    data = await fetchKlineData(activeSecid, activePeriod, 120);
    if (data.length > 0) {
      klineCache.set(cacheKey, data);
    }
  }

  if (data.length > 0) {
    series.setData(data);
    activeChart.timeScale().fitContent();
  }
}

export async function switchPeriod(period) {
  if (!activeChart || period === activePeriod) return;
  activePeriod = period;
  await loadKlineData(activeChart._candleSeries);
}

export function destroyChart() {
  if (activeChart) {
    activeChart.remove();
    activeChart = null;
  }
  activeSecid = null;
}

export function getActiveSecid() {
  return activeSecid;
}

export function getActivePeriod() {
  return activePeriod;
}
