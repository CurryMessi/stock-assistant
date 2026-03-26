// js/utils.js

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function calculateDailyProfit(stock) {
  if (!stock.shares || !stock.currentPrice || !stock.preClose) return 0;
  return (stock.currentPrice - stock.preClose) * stock.shares;
}

export function calculateDailyProfitRate(stock) {
  if (!stock.preClose || stock.preClose === 0) return 0;
  return ((stock.currentPrice - stock.preClose) / stock.preClose) * 100;
}

export function calculateTotalStockProfit(stock) {
  if (!stock.shares || !stock.costPrice || !stock.currentPrice) return 0;
  return (stock.currentPrice - stock.costPrice) * stock.shares;
}

export function calculateTotalStockProfitRate(stock) {
  if (!stock.costPrice || stock.costPrice === 0) return 0;
  return ((stock.currentPrice - stock.costPrice) / stock.costPrice) * 100;
}

export function getStockProfitDisplay(stock) {
  const hasCost = stock.costPrice && stock.costPrice > 0;

  if (hasCost && stock.shares) {
    const profit = calculateTotalStockProfit(stock);
    const rate = calculateTotalStockProfitRate(stock);
    return { profit, rate, label: '总' };
  } else if (stock.shares) {
    const profit = calculateDailyProfit(stock);
    const rate = stock.changePercent || 0;
    return { profit, rate, label: '今' };
  } else {
    return { profit: 0, rate: stock.changePercent || 0, label: '' };
  }
}
