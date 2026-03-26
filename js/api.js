// js/api.js

const API_CONFIG = {
  SEARCH_API: 'https://searchapi.eastmoney.com/api/suggest/get',
  QUOTE_API: 'https://push2.eastmoney.com/api/qt/stock/get',
  INDEX_API: 'https://push2.eastmoney.com/api/qt/ulist.np/get',
  KLINE_API: 'https://push2his.eastmoney.com/api/qt/stock/kline/get',
};

const KLINE_PERIOD_MAP = {
  daily: 101,
  weekly: 102,
  monthly: 103,
};

export const MARKET_INDICES = [
  { secid: '1.000001', name: '上证指数' },
  { secid: '1.000300', name: '沪深300' },
  { secid: '0.399001', name: '深证成指' },
  { secid: '0.399006', name: '创业板指' },
];

export async function searchStocks(keyword) {
  if (!keyword.trim()) return [];
  try {
    const url = `${API_CONFIG.SEARCH_API}?input=${encodeURIComponent(keyword)}&type=14&count=10`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.QuotationCodeTable && data.QuotationCodeTable.Data) {
      return data.QuotationCodeTable.Data.map(item => ({
        code: item.Code,
        name: item.Name,
        secid: `${item.MktNum}.${item.Code}`,
        market: item.MktNum === '0' ? '深' : '沪',
      }));
    }
    return [];
  } catch (error) {
    console.error('搜索股票失败:', error);
    return [];
  }
}

export async function fetchStockQuote(secid) {
  try {
    const fields = 'f43,f44,f45,f46,f47,f48,f57,f58,f60,f170,f171';
    const url = `${API_CONFIG.QUOTE_API}?secid=${secid}&fields=${fields}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.data) {
      const d = data.data;
      return {
        code: d.f57,
        name: d.f58,
        price: d.f43 / 100,
        open: d.f44 / 100,
        high: d.f45 / 100,
        low: d.f46 / 100,
        volume: d.f47,
        amount: d.f48,
        preClose: d.f60 / 100,
        changePercent: d.f170 / 100,
        change: d.f171 / 100,
      };
    }
    return null;
  } catch (error) {
    console.error('获取股票行情失败:', error);
    return null;
  }
}

export async function fetchMarketIndices() {
  try {
    const secids = MARKET_INDICES.map(i => i.secid).join(',');
    const url = `${API_CONFIG.INDEX_API}?secids=${secids}&fields=f1,f2,f3,f4,f12,f14`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.data && data.data.diff) {
      return data.data.diff.map(item => ({
        code: item.f12,
        name: item.f14,
        value: item.f2 / 100,
        change: item.f4 / 100,
        changePercent: item.f3 / 100,
      }));
    }
    return [];
  } catch (error) {
    console.error('获取指数行情失败:', error);
    return [];
  }
}

/**
 * 获取股票K线数据
 * @param {string} secid - 股票ID, 如 "1.600519"
 * @param {string} period - 周期: "daily" | "weekly" | "monthly"
 * @param {number} limit - 数据条数, 默认60
 */
export async function fetchKlineData(secid, period = 'daily', limit = 60) {
  try {
    const klt = KLINE_PERIOD_MAP[period] || 101;
    // 计算起始日期：日K取1年前，周K取3年前，月K取10年前
    const now = new Date();
    const yearsBack = period === 'monthly' ? 10 : period === 'weekly' ? 3 : 1;
    now.setFullYear(now.getFullYear() - yearsBack);
    const beg = now.toISOString().slice(0, 10).replace(/-/g, '');
    const url = `${API_CONFIG.KLINE_API}?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=1&beg=${beg}&end=20500101&lmt=${limit}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.data && data.data.klines) {
      return data.data.klines.map(line => {
        const parts = line.split(',');
        return {
          time: parts[0],
          open: parseFloat(parts[1]),
          close: parseFloat(parts[2]),
          high: parseFloat(parts[3]),
          low: parseFloat(parts[4]),
          volume: parseInt(parts[5], 10),
        };
      });
    }
    return [];
  } catch (error) {
    console.error('获取K线数据失败:', error);
    return [];
  }
}
