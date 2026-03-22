/**
 * 自选股票助手 - 主脚本
 */

// ========== 配置常量 ==========
const API_CONFIG = {
  // 股票搜索接口
  SEARCH_API: 'https://searchapi.eastmoney.com/api/suggest/get',
  // 股票行情接口
  QUOTE_API: 'https://push2.eastmoney.com/api/qt/stock/get',
  // 大盘指数接口
  INDEX_API: 'https://push2.eastmoney.com/api/qt/ulist.np/get',
  // 刷新间隔(毫秒)
  REFRESH_INTERVAL: 10000
};

// 大盘指数配置
const MARKET_INDICES = [
  { secid: '1.000001', name: '上证指数' },
  { secid: '1.000300', name: '沪深300' },
  { secid: '0.399001', name: '深证成指' },
  { secid: '0.399006', name: '创业板指' }
];

// ========== 状态管理 ==========
let state = {
  stocks: [],
  settings: {
    theme: 'light',
    refreshInterval: 10000,
    sortBy: 'addTime',
    sortOrder: 'desc'
  },
  isEditMode: false,
  refreshTimer: null
};

// ========== DOM 元素 ==========
const elements = {};

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  initElements();
  await loadData();
  initEventListeners();
  await refreshAllData();
  startAutoRefresh();
});

function initElements() {
  elements.searchInput = document.getElementById('searchInput');
  elements.searchBtn = document.getElementById('searchBtn');
  elements.searchResults = document.getElementById('searchResults');
  elements.stockList = document.getElementById('stockList');
  elements.stockCount = document.getElementById('stockCount');
  elements.sortSelect = document.getElementById('sortSelect');
  elements.themeToggle = document.getElementById('themeToggle');
  elements.editBtn = document.getElementById('editBtn');
  elements.refreshBtn = document.getElementById('refreshBtn');
  elements.marketBtn = document.getElementById('marketBtn');
  elements.marketStatus = document.getElementById('marketStatus');
  elements.totalProfit = document.getElementById('totalProfit');
  elements.totalProfitRate = document.getElementById('totalProfitRate');
}

function initEventListeners() {
  // 搜索功能
  elements.searchBtn.addEventListener('click', handleSearch);
  elements.searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  elements.searchInput.addEventListener('input', debounce(handleSearch, 300));

  // 点击其他位置关闭搜索结果
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.add-stock-section')) {
      elements.searchResults.classList.add('hidden');
    }
  });

  // 排序
  elements.sortSelect.addEventListener('change', handleSortChange);

  // 主题切换
  elements.themeToggle.addEventListener('change', handleThemeToggle);

  // 编辑模式
  elements.editBtn.addEventListener('click', toggleEditMode);

  // 刷新按钮
  elements.refreshBtn.addEventListener('click', refreshAllData);

  // 行情中心
  elements.marketBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://quote.eastmoney.com/' });
  });
}

// ========== 数据存储 ==========
async function loadData() {
  try {
    const result = await chrome.storage.local.get(['stocks', 'settings']);
    if (result.stocks) {
      state.stocks = result.stocks;
    }
    if (result.settings) {
      state.settings = { ...state.settings, ...result.settings };
    }
    applyTheme(state.settings.theme);
    elements.themeToggle.checked = state.settings.theme === 'dark';
    elements.sortSelect.value = `${state.settings.sortBy}-${state.settings.sortOrder}`;
  } catch (error) {
    console.error('加载数据失败:', error);
  }
}

async function saveData() {
  try {
    await chrome.storage.local.set({
      stocks: state.stocks,
      settings: state.settings
    });
  } catch (error) {
    console.error('保存数据失败:', error);
  }
}

// ========== API 调用 ==========
async function searchStocks(keyword) {
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
        market: item.MktNum === '0' ? '深' : '沪'
      }));
    }
    return [];
  } catch (error) {
    console.error('搜索股票失败:', error);
    return [];
  }
}

async function fetchStockQuote(secid) {
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
        price: d.f43 / 100,         // 当前价
        open: d.f44 / 100,          // 开盘价
        high: d.f45 / 100,          // 最高价
        low: d.f46 / 100,           // 最低价
        volume: d.f47,              // 成交量
        amount: d.f48,              // 成交额
        preClose: d.f60 / 100,      // 昨收
        changePercent: d.f170 / 100, // 涨跌幅
        change: d.f171 / 100        // 涨跌额
      };
    }
    return null;
  } catch (error) {
    console.error('获取股票行情失败:', error);
    return null;
  }
}

async function fetchMarketIndices() {
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
        changePercent: item.f3 / 100
      }));
    }
    return [];
  } catch (error) {
    console.error('获取指数行情失败:', error);
    return [];
  }
}

// ========== 刷新数据 ==========
async function refreshAllData() {
  elements.refreshBtn.innerHTML = '<span class="loading"></span>';

  try {
    // 刷新大盘指数
    await refreshMarketIndices();

    // 刷新股票行情
    await refreshStockQuotes();

    // 更新市场状态
    updateMarketStatus();
  } catch (error) {
    console.error('刷新数据失败:', error);
  } finally {
    elements.refreshBtn.innerHTML = '🔄';
  }
}

async function refreshMarketIndices() {
  const indices = await fetchMarketIndices();
  const indexItems = document.querySelectorAll('.index-item');

  indices.forEach((index, i) => {
    if (indexItems[i]) {
      const item = indexItems[i];
      const valueEl = item.querySelector('.index-value');
      const changeEl = item.querySelector('.index-change');

      valueEl.textContent = index.value.toFixed(2);
      changeEl.textContent = `${index.change >= 0 ? '+' : ''}${index.change.toFixed(2)} ${index.changePercent >= 0 ? '+' : ''}${index.changePercent.toFixed(2)}%`;

      // 设置涨跌颜色
      valueEl.className = 'index-value ' + (index.change >= 0 ? 'rise' : 'fall');
      changeEl.className = 'index-change ' + (index.change >= 0 ? 'rise' : 'fall');
    }
  });
}

async function refreshStockQuotes() {
  if (state.stocks.length === 0) {
    renderStockList();
    return;
  }

  // 并行获取所有股票行情
  const quotes = await Promise.all(
    state.stocks.map(stock => fetchStockQuote(stock.secid))
  );

  // 更新股票数据
  quotes.forEach((quote, i) => {
    if (quote && state.stocks[i]) {
      state.stocks[i].currentPrice = quote.price;
      state.stocks[i].changePercent = quote.changePercent;
      state.stocks[i].preClose = quote.preClose;
    }
  });

  renderStockList();
  calculateTotalProfit();
}

function startAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }
  state.refreshTimer = setInterval(refreshAllData, API_CONFIG.REFRESH_INTERVAL);
}

// ========== UI 渲染 ==========
function renderStockList() {
  elements.stockCount.textContent = state.stocks.length;

  if (state.stocks.length === 0) {
    elements.stockList.innerHTML = `
      <div class="empty-state">
        <div class="icon">📈</div>
        <p>暂无自选股票，请搜索添加</p>
      </div>
    `;
    return;
  }

  const sortedStocks = getSortedStocks();

  elements.stockList.innerHTML = sortedStocks.map(({ stock, originalIndex }) => {
    const profitInfo = getStockProfitDisplay(stock);
    const priceClass = (stock.changePercent || 0) >= 0 ? 'rise' : 'fall';
    const profitClass = profitInfo.profit >= 0 ? 'rise' : 'fall';

    const hasCost = stock.costPrice && stock.costPrice > 0 && stock.shares;
    const dailyProfit = hasCost ? calculateDailyProfit(stock) : null;

    return `
      <div class="stock-item" data-index="${originalIndex}">
        <span class="col-name">${stock.name}</span>
        <span class="col-code">${stock.code}</span>
        <span class="col-shares edit-only">
          ${state.isEditMode
        ? `<div class="shares-control">
             <button class="shares-btn minus-btn" data-index="${originalIndex}">-</button>
             <input type="text" class="shares-input" value="${stock.shares || 0}" data-index="${originalIndex}">
             <button class="shares-btn plus-btn" data-index="${originalIndex}">+</button>
           </div>`
        : (stock.shares || '-')
      }
        </span>
        <span class="col-cost edit-only">
          ${state.isEditMode
        ? `<input type="number" step="0.01" class="cost-input" value="${stock.costPrice || ''}" placeholder="选填" data-index="${originalIndex}">`
        : (stock.costPrice ? stock.costPrice.toFixed(2) : '-')
      }
        </span>
        <span class="col-price ${priceClass}">${(stock.currentPrice || 0).toFixed(2)}</span>
        <span class="col-change ${priceClass}">${(stock.changePercent || 0) >= 0 ? '+' : ''}${(stock.changePercent || 0).toFixed(2)}%</span>
        <span class="col-profit ${profitClass}">
          ${stock.shares ? `
            ${profitInfo.label ? `<small class="profit-label">${profitInfo.label}</small>` : ''}
            ${profitInfo.profit >= 0 ? '+' : ''}${profitInfo.profit.toFixed(2)}
            <br>
            <small>(${profitInfo.rate >= 0 ? '+' : ''}${profitInfo.rate.toFixed(2)}%)</small>
            ${hasCost && dailyProfit !== null ? `<br><small class="daily-hint">今${dailyProfit >= 0 ? '+' : ''}${dailyProfit.toFixed(2)}</small>` : ''}
          ` : '-'}
        </span>
        <span class="col-action edit-only">
          <button class="delete-btn" data-index="${originalIndex}">删除</button>
        </span>
      </div>
    `;
  }).join('');

  // 绑定编辑事件
  if (state.isEditMode) {
    bindEditEvents();
  }

  // 绑定删除事件
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      deleteStock(index);
    });
  });
}

function getSortedStocks() {
  const { sortBy, sortOrder } = state.settings;
  const direction = sortOrder === 'asc' ? 1 : -1;

  return state.stocks
    .map((stock, originalIndex) => ({ stock, originalIndex }))
    .sort((left, right) => {
      const leftValue = getSortValue(left.stock, sortBy);
      const rightValue = getSortValue(right.stock, sortBy);

      if (sortBy === 'name') {
        return direction * String(leftValue).localeCompare(String(rightValue), 'zh-CN');
      }

      if (leftValue === rightValue) {
        return right.stock.addTime - left.stock.addTime;
      }

      return direction * (leftValue - rightValue);
    });
}

function getSortValue(stock, sortBy) {
  switch (sortBy) {
    case 'changePercent':
      return stock.changePercent || 0;
    case 'currentPrice':
      return stock.currentPrice || 0;
    case 'profit':
      return getStockProfitDisplay(stock).profit || 0;
    case 'name':
      return stock.name || '';
    case 'addTime':
    default:
      return stock.addTime || 0;
  }
}

function handleSortChange() {
  const [sortBy, sortOrder] = elements.sortSelect.value.split('-');
  state.settings.sortBy = sortBy;
  state.settings.sortOrder = sortOrder;
  saveData();
  renderStockList();
}

function bindEditEvents() {
  // 股数输入框
  document.querySelectorAll('.shares-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const index = parseInt(e.target.dataset.index);
      state.stocks[index].shares = parseInt(e.target.value) || 0;
      await saveData();
      calculateTotalProfit();
    });
  });

  // 股数加按钮 (+100)
  document.querySelectorAll('.plus-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      state.stocks[index].shares = (state.stocks[index].shares || 0) + 100;
      await saveData();
      renderStockList();
      calculateTotalProfit();
    });
  });

  // 股数减按钮 (-100)
  document.querySelectorAll('.minus-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      const newShares = (state.stocks[index].shares || 0) - 100;
      state.stocks[index].shares = Math.max(0, newShares);
      await saveData();
      renderStockList();
      calculateTotalProfit();
    });
  });

  // 成本价输入框
  document.querySelectorAll('.cost-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const index = parseInt(e.target.dataset.index);
      state.stocks[index].costPrice = parseFloat(e.target.value) || 0;
      await saveData();
      calculateTotalProfit();
    });
  });
}

// ========== 搜索功能 ==========
async function handleSearch() {
  const keyword = elements.searchInput.value.trim();
  if (!keyword) {
    elements.searchResults.classList.add('hidden');
    return;
  }

  const results = await searchStocks(keyword);

  if (results.length === 0) {
    elements.searchResults.innerHTML = '<div class="search-result-item">未找到相关股票</div>';
  } else {
    elements.searchResults.innerHTML = results.map(stock => `
      <div class="search-result-item" data-stock='${JSON.stringify(stock)}'>
        <span class="stock-name">${stock.market} ${stock.name}</span>
        <span class="stock-code">${stock.code}</span>
      </div>
    `).join('');

    // 绑定点击事件
    document.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        const stockData = e.currentTarget.dataset.stock;
        if (stockData) {
          await addStock(JSON.parse(stockData));
        }
      });
    });
  }

  elements.searchResults.classList.remove('hidden');
}

// ========== 股票管理 ==========
async function addStock(stockInfo) {
  // 检查是否已存在
  if (state.stocks.some(s => s.code === stockInfo.code)) {
    alert('该股票已在自选列表中');
    return;
  }

  const newStock = {
    ...stockInfo,
    shares: 0,
    costPrice: 0,
    addTime: Date.now()
  };

  state.stocks.push(newStock);
  await saveData();

  // 清空搜索
  elements.searchInput.value = '';
  elements.searchResults.classList.add('hidden');

  // 刷新显示
  await refreshStockQuotes();
}

async function deleteStock(index) {
  if (confirm(`确定删除 ${state.stocks[index].name} 吗？`)) {
    state.stocks.splice(index, 1);
    await saveData();
    renderStockList();
    calculateTotalProfit();
  }
}

// ========== 收益计算 ==========
// 计算今日收益（基于昨收价）
function calculateDailyProfit(stock) {
  if (!stock.shares || !stock.currentPrice || !stock.preClose) return 0;
  return (stock.currentPrice - stock.preClose) * stock.shares;
}

// 计算今日收益率（基于昨收价）
function calculateDailyProfitRate(stock) {
  if (!stock.preClose || stock.preClose === 0) return 0;
  return ((stock.currentPrice - stock.preClose) / stock.preClose) * 100;
}

// 计算总收益（基于成本价）
function calculateTotalStockProfit(stock) {
  if (!stock.shares || !stock.costPrice || !stock.currentPrice) return 0;
  return (stock.currentPrice - stock.costPrice) * stock.shares;
}

// 计算总收益率（基于成本价）
function calculateTotalStockProfitRate(stock) {
  if (!stock.costPrice || stock.costPrice === 0) return 0;
  return ((stock.currentPrice - stock.costPrice) / stock.costPrice) * 100;
}

// 获取股票显示的收益信息
function getStockProfitDisplay(stock) {
  const hasCost = stock.costPrice && stock.costPrice > 0;

  if (hasCost && stock.shares) {
    // 有成本价：显示总收益
    const profit = calculateTotalStockProfit(stock);
    const rate = calculateTotalStockProfitRate(stock);
    return { profit, rate, label: '总' };
  } else if (stock.shares) {
    // 无成本价但有股数：显示今日收益
    const profit = calculateDailyProfit(stock);
    const rate = stock.changePercent || 0;
    return { profit, rate, label: '今' };
  } else {
    // 无股数：只显示涨跌
    return { profit: 0, rate: stock.changePercent || 0, label: '' };
  }
}

function calculateTotalProfit() {
  let totalDailyProfit = 0;  // 今日总收益
  let totalProfit = 0;       // 总收益（有成本价的）
  let totalCost = 0;         // 总成本
  let totalMarketValue = 0;  // 总市值

  state.stocks.forEach(stock => {
    if (stock.shares) {
      // 计算今日收益
      totalDailyProfit += calculateDailyProfit(stock);
      totalMarketValue += (stock.currentPrice || 0) * stock.shares;

      // 如果有成本价，计算总收益
      if (stock.costPrice && stock.costPrice > 0) {
        totalProfit += calculateTotalStockProfit(stock);
        totalCost += stock.costPrice * stock.shares;
      }
    }
  });

  // 计算收益率
  const dailyRate = totalMarketValue > 0 ? (totalDailyProfit / (totalMarketValue - totalDailyProfit)) * 100 : 0;
  const totalRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  // 显示：优先显示今日收益
  const displayProfit = totalDailyProfit;
  const displayRate = dailyRate;

  elements.totalProfit.textContent = `${displayProfit >= 0 ? '+' : ''}${displayProfit.toFixed(2)}`;
  elements.totalProfitRate.textContent = `(${displayRate >= 0 ? '+' : ''}${displayRate.toFixed(2)}%)`;

  // 设置颜色
  const profitEl = document.querySelector('.daily-profit');
  if (displayProfit >= 0) {
    profitEl.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
  } else {
    profitEl.style.background = 'linear-gradient(135deg, #27ae60, #229954)';
  }
}

// ========== 主题切换 ==========
function handleThemeToggle() {
  const theme = elements.themeToggle.checked ? 'dark' : 'light';
  state.settings.theme = theme;
  applyTheme(theme);
  saveData();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// ========== 编辑模式 ==========
function toggleEditMode() {
  state.isEditMode = !state.isEditMode;
  document.body.classList.toggle('edit-mode', state.isEditMode);
  elements.editBtn.textContent = state.isEditMode ? '完成编辑' : '编辑';
  renderStockList();
}

// ========== 市场状态 ==========
function updateMarketStatus() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const day = now.getDay();

  // 周末休市
  if (day === 0 || day === 6) {
    elements.marketStatus.textContent = '休市中';
    elements.marketStatus.classList.remove('trading');
    return;
  }

  // 工作日交易时间
  const time = hours * 60 + minutes;
  const morningOpen = 9 * 60 + 30;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const afternoonClose = 15 * 60;

  if ((time >= morningOpen && time <= morningClose) ||
    (time >= afternoonOpen && time <= afternoonClose)) {
    elements.marketStatus.textContent = '交易中';
    elements.marketStatus.classList.add('trading');
  } else {
    elements.marketStatus.textContent = '休市中';
    elements.marketStatus.classList.remove('trading');
  }
}

// ========== 工具函数 ==========
function debounce(func, wait) {
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
