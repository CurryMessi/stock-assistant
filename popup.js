/**
 * 自选股票助手 - 主入口 (ES Module)
 */
import { debounce, calculateDailyProfit, getStockProfitDisplay } from './js/utils.js';
import { searchStocks, fetchStockQuote, fetchMarketIndices } from './js/api.js';
import { loadData, saveStocks, saveSettings, saveGroups } from './js/storage.js';
import {
  renderGroupTabs, addGroup, renameGroup, deleteGroup,
  filterStocksByGroup, renderGroupSelector,
} from './js/groups.js';
import {
  toggleActiveSecid, createChart, switchPeriod, destroyChart,
  getActiveSecid, getActivePeriod,
} from './js/chart.js';

// ========== 常量 ==========
const REFRESH_INTERVAL = 10000;

// ========== 状态 ==========
const state = {
  stocks: [],
  groups: [],
  settings: { theme: 'light', refreshInterval: REFRESH_INTERVAL },
  activeGroupId: 'default',
  isEditMode: false,
  refreshTimer: null,
};

// ========== DOM 元素 ==========
const elements = {};

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  initElements();
  await initData();
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
  elements.themeToggle = document.getElementById('themeToggle');
  elements.editBtn = document.getElementById('editBtn');
  elements.refreshBtn = document.getElementById('refreshBtn');
  elements.marketBtn = document.getElementById('marketBtn');
  elements.marketStatus = document.getElementById('marketStatus');
  elements.totalProfit = document.getElementById('totalProfit');
  elements.totalProfitRate = document.getElementById('totalProfitRate');
  elements.groupTabs = document.getElementById('groupTabs');
}

async function initData() {
  const data = await loadData();
  state.stocks = data.stocks;
  state.settings = data.settings;
  state.groups = data.groups;
  applyTheme(state.settings.theme);
  elements.themeToggle.checked = state.settings.theme === 'dark';
  renderGroups();
}

function initEventListeners() {
  elements.searchBtn.addEventListener('click', handleSearch);
  elements.searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  elements.searchInput.addEventListener('input', debounce(handleSearch, 300));

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.add-stock-section')) {
      elements.searchResults.classList.add('hidden');
    }
  });

  elements.themeToggle.addEventListener('change', handleThemeToggle);
  elements.editBtn.addEventListener('click', toggleEditMode);
  elements.refreshBtn.addEventListener('click', refreshAllData);
  elements.marketBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://quote.eastmoney.com/' });
  });
}

// ========== 分组管理 ==========
function renderGroups() {
  renderGroupTabs(elements.groupTabs, state.groups, state.activeGroupId, state.isEditMode, {
    onTabClick: (groupId) => {
      state.activeGroupId = groupId;
      destroyChart();
      renderGroups();
      renderStockList();
      calculateTotalProfit();
    },
    onAddGroup: async (name) => {
      state.groups = addGroup(state.groups, name);
      await saveGroups(state.groups);
      renderGroups();
    },
    onRenameGroup: async (groupId, newName) => {
      state.groups = renameGroup(state.groups, groupId, newName);
      await saveGroups(state.groups);
      renderGroups();
    },
    onDeleteGroup: async (groupId) => {
      const result = deleteGroup(state.groups, state.stocks, groupId);
      state.groups = result.groups;
      state.stocks = result.stocks;
      if (state.activeGroupId === groupId) {
        state.activeGroupId = 'default';
      }
      await saveGroups(state.groups);
      await saveStocks(state.stocks);
      renderGroups();
      renderStockList();
      calculateTotalProfit();
    },
  });
}

// ========== 数据刷新 ==========
async function refreshAllData() {
  elements.refreshBtn.innerHTML = '<span class="loading"></span>';
  try {
    await refreshMarketIndices();
    await refreshStockQuotes();
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
  const quotes = await Promise.all(
    state.stocks.map(stock => fetchStockQuote(stock.secid))
  );
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
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(refreshAllData, REFRESH_INTERVAL);
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
    document.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        const stockData = e.currentTarget.dataset.stock;
        if (stockData) await addStock(JSON.parse(stockData));
      });
    });
  }
  elements.searchResults.classList.remove('hidden');
}

// ========== 股票管理 ==========
async function addStock(stockInfo) {
  if (state.stocks.some(s => s.code === stockInfo.code)) {
    alert('该股票已在自选列表中');
    return;
  }
  const newStock = {
    ...stockInfo,
    shares: 0,
    costPrice: 0,
    groupId: state.activeGroupId === 'default' ? '' : state.activeGroupId,
    addTime: Date.now(),
  };
  state.stocks.push(newStock);
  await saveStocks(state.stocks);
  elements.searchInput.value = '';
  elements.searchResults.classList.add('hidden');
  await refreshStockQuotes();
}

async function deleteStock(index) {
  const filteredStocks = filterStocksByGroup(state.stocks, state.activeGroupId);
  const stockToDelete = filteredStocks[index];
  const realIndex = state.stocks.indexOf(stockToDelete);
  if (realIndex === -1) return;

  if (confirm(`确定删除 ${state.stocks[realIndex].name} 吗？`)) {
    state.stocks.splice(realIndex, 1);
    await saveStocks(state.stocks);
    destroyChart();
    renderStockList();
    calculateTotalProfit();
  }
}

// ========== UI 渲染 ==========
function renderStockList() {
  const filteredStocks = filterStocksByGroup(state.stocks, state.activeGroupId);
  elements.stockCount.textContent = filteredStocks.length;

  if (filteredStocks.length === 0) {
    elements.stockList.innerHTML = `
      <div class="empty-state">
        <div class="icon">📈</div>
        <p>暂无自选股票，请搜索添加</p>
      </div>
    `;
    return;
  }

  const activeSecid = getActiveSecid();

  elements.stockList.innerHTML = filteredStocks.map((stock, index) => {
    const profitInfo = getStockProfitDisplay(stock);
    const priceClass = (stock.changePercent || 0) >= 0 ? 'rise' : 'fall';
    const profitClass = profitInfo.profit >= 0 ? 'rise' : 'fall';
    const isExpanded = stock.secid === activeSecid;
    const hasCost = stock.costPrice && stock.costPrice > 0 && stock.shares;
    const dailyProfit = hasCost ? calculateDailyProfit(stock) : null;

    let chartHtml = '';
    if (isExpanded) {
      const period = getActivePeriod();
      chartHtml = `
        <div class="chart-expand">
          <div class="chart-toolbar">
            <button class="chart-period-btn ${period === 'daily' ? 'active' : ''}" data-period="daily">日K</button>
            <button class="chart-period-btn ${period === 'weekly' ? 'active' : ''}" data-period="weekly">周K</button>
            <button class="chart-period-btn ${period === 'monthly' ? 'active' : ''}" data-period="monthly">月K</button>
          </div>
          <div class="chart-container" id="chart-${stock.secid}"></div>
        </div>
      `;
    }

    return `
      <div class="stock-item ${isExpanded ? 'expanded' : ''}" data-index="${index}" data-secid="${stock.secid}">
        <span class="col-name">${stock.name}</span>
        <span class="col-code">${stock.code}</span>
        <span class="col-group edit-only">
          ${state.isEditMode ? renderGroupSelector(state.groups, stock.groupId, index) : (getGroupName(stock.groupId) || '-')}
        </span>
        <span class="col-shares edit-only">
          ${state.isEditMode
            ? `<div class="shares-control">
                 <button class="shares-btn minus-btn" data-index="${index}">-</button>
                 <input type="text" class="shares-input" value="${stock.shares || 0}" data-index="${index}">
                 <button class="shares-btn plus-btn" data-index="${index}">+</button>
               </div>`
            : (stock.shares || '-')}
        </span>
        <span class="col-cost edit-only">
          ${state.isEditMode
            ? `<input type="number" step="0.01" class="cost-input" value="${stock.costPrice || ''}" placeholder="选填" data-index="${index}">`
            : (stock.costPrice ? stock.costPrice.toFixed(2) : '-')}
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
          <button class="delete-btn" data-index="${index}">删除</button>
        </span>
      </div>
      ${chartHtml}
    `;
  }).join('');

  bindStockListEvents(filteredStocks);

  // 如果有展开的图表，在 DOM 渲染后创建
  if (activeSecid) {
    const chartContainer = document.getElementById(`chart-${activeSecid}`);
    if (chartContainer) {
      createChart(chartContainer, state.settings.theme);
    }
  }
}

function bindStockListEvents(filteredStocks) {
  // 股票行点击 -> 展开/收起K线
  document.querySelectorAll('.stock-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('input, button, select')) return;
      const secid = item.dataset.secid;
      toggleActiveSecid(secid);
      renderStockList();
    });
  });

  // K线周期切换按钮
  document.querySelectorAll('.chart-period-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const period = btn.dataset.period;
      await switchPeriod(period);
      document.querySelectorAll('.chart-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 删除按钮
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteStock(parseInt(e.target.dataset.index));
    });
  });

  if (state.isEditMode) {
    bindEditEvents(filteredStocks);
  }
}

function bindEditEvents(filteredStocks) {
  document.querySelectorAll('.shares-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const stock = filteredStocks[parseInt(e.target.dataset.index)];
      const realIndex = state.stocks.indexOf(stock);
      if (realIndex !== -1) {
        state.stocks[realIndex].shares = parseInt(e.target.value) || 0;
        await saveStocks(state.stocks);
        calculateTotalProfit();
      }
    });
  });

  document.querySelectorAll('.plus-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const stock = filteredStocks[parseInt(e.target.dataset.index)];
      const realIndex = state.stocks.indexOf(stock);
      if (realIndex !== -1) {
        state.stocks[realIndex].shares = (state.stocks[realIndex].shares || 0) + 100;
        await saveStocks(state.stocks);
        renderStockList();
        calculateTotalProfit();
      }
    });
  });

  document.querySelectorAll('.minus-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const stock = filteredStocks[parseInt(e.target.dataset.index)];
      const realIndex = state.stocks.indexOf(stock);
      if (realIndex !== -1) {
        state.stocks[realIndex].shares = Math.max(0, (state.stocks[realIndex].shares || 0) - 100);
        await saveStocks(state.stocks);
        renderStockList();
        calculateTotalProfit();
      }
    });
  });

  document.querySelectorAll('.cost-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      e.stopPropagation();
      const stock = filteredStocks[parseInt(e.target.dataset.index)];
      const realIndex = state.stocks.indexOf(stock);
      if (realIndex !== -1) {
        state.stocks[realIndex].costPrice = parseFloat(e.target.value) || 0;
        await saveStocks(state.stocks);
        calculateTotalProfit();
      }
    });
  });

  document.querySelectorAll('.group-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      e.stopPropagation();
      const stock = filteredStocks[parseInt(e.target.dataset.index)];
      const realIndex = state.stocks.indexOf(stock);
      if (realIndex !== -1) {
        state.stocks[realIndex].groupId = e.target.value;
        await saveStocks(state.stocks);
        if (state.activeGroupId !== 'default') {
          renderStockList();
          calculateTotalProfit();
        }
      }
    });
  });
}

function getGroupName(groupId) {
  if (!groupId) return '';
  const group = state.groups.find(g => g.id === groupId);
  return group ? group.name : '';
}

// ========== 收益计算 ==========
function calculateTotalProfit() {
  const filteredStocks = filterStocksByGroup(state.stocks, state.activeGroupId);
  let totalDailyProfit = 0;
  let totalMarketValue = 0;

  filteredStocks.forEach(stock => {
    if (stock.shares) {
      totalDailyProfit += calculateDailyProfit(stock);
      totalMarketValue += (stock.currentPrice || 0) * stock.shares;
    }
  });

  const dailyRate = totalMarketValue > 0
    ? (totalDailyProfit / (totalMarketValue - totalDailyProfit)) * 100
    : 0;

  elements.totalProfit.textContent = `${totalDailyProfit >= 0 ? '+' : ''}${totalDailyProfit.toFixed(2)}`;
  elements.totalProfitRate.textContent = `(${dailyRate >= 0 ? '+' : ''}${dailyRate.toFixed(2)}%)`;

  const profitEl = document.querySelector('.daily-profit');
  if (totalDailyProfit >= 0) {
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
  saveSettings(state.settings);
  destroyChart();
  renderStockList();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// ========== 编辑模式 ==========
function toggleEditMode() {
  state.isEditMode = !state.isEditMode;
  document.body.classList.toggle('edit-mode', state.isEditMode);
  elements.editBtn.textContent = state.isEditMode ? '完成编辑' : '编辑';
  destroyChart();
  renderGroups();
  renderStockList();
}

// ========== 市场状态 ==========
function updateMarketStatus() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const day = now.getDay();

  if (day === 0 || day === 6) {
    elements.marketStatus.textContent = '休市中';
    elements.marketStatus.classList.remove('trading');
    return;
  }

  const time = hours * 60 + minutes;
  if ((time >= 570 && time <= 690) || (time >= 780 && time <= 900)) {
    elements.marketStatus.textContent = '交易中';
    elements.marketStatus.classList.add('trading');
  } else {
    elements.marketStatus.textContent = '休市中';
    elements.marketStatus.classList.remove('trading');
  }
}
