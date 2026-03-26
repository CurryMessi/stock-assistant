# Stock Assistant Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add group management (Tab-based filtering) and K-line chart (inline expand with lightweight-charts) to the stock-assistant Chrome extension, while refactoring the codebase into ES Modules.

**Architecture:** Split the monolithic `popup.js` into focused ES Modules (`js/api.js`, `js/storage.js`, `js/groups.js`, `js/chart.js`, `js/utils.js`) with `popup.js` as the entry coordinator. Groups stored in Chrome Storage alongside stocks. K-line data fetched on-demand from Eastmoney history API and rendered with TradingView's lightweight-charts.

**Tech Stack:** Vanilla JS (ES Modules), Chrome Extension Manifest V3, lightweight-charts v4, Eastmoney public APIs

**Design Spec:** `docs/superpowers/specs/2026-03-26-stock-assistant-enhancement-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `js/utils.js` | Create | debounce, profit calculation functions |
| `js/api.js` | Create | All Eastmoney API calls (search, quote, indices, kline) |
| `js/storage.js` | Create | Chrome Storage read/write (stocks, groups, settings) |
| `js/groups.js` | Create | Group CRUD, Tab rendering, stock filtering |
| `js/chart.js` | Create | K-line chart lifecycle (create, update, destroy) |
| `libs/lightweight-charts.standalone.production.mjs` | Create | Downloaded library file |
| `popup.js` | Rewrite | Entry point: state, init, event wiring, render coordination |
| `popup.html` | Modify | Add group tabs, chart expand containers, script type=module |
| `popup.css` | Modify | Add group tab styles, chart area styles |
| `manifest.json` | Modify | No changes needed (ES Modules work in popup with type=module) |

---

## Task 1: Create `js/utils.js` — Extract Utility Functions

**Files:**
- Create: `js/utils.js`

- [ ] **Step 1: Create `js/utils.js` with extracted utility and profit functions**

```js
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
```

- [ ] **Step 2: Verify file is valid ES Module syntax**

Run: `node --check js/utils.js`
Expected: No output (no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add js/utils.js
git commit -m "refactor: extract utility functions to js/utils.js"
```

---

## Task 2: Create `js/api.js` — Extract API Layer

**Files:**
- Create: `js/api.js`

- [ ] **Step 1: Create `js/api.js` with all Eastmoney API functions including new K-line API**

```js
// js/api.js

const API_CONFIG = {
  SEARCH_API: 'https://searchapi.eastmoney.com/api/suggest/get',
  QUOTE_API: 'https://push2.eastmoney.com/api/qt/stock/get',
  INDEX_API: 'https://push2.eastmoney.com/api/qt/ulist.np/get',
  KLINE_API: 'https://push2his.eastmoney.com/api/qt/stock/kline/get',
};

// klt: 101=日K, 102=周K, 103=月K
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
 * @returns {Promise<Array<{time: string, open: number, high: number, low: number, close: number, volume: number}>>}
 */
export async function fetchKlineData(secid, period = 'daily', limit = 60) {
  try {
    const klt = KLINE_PERIOD_MAP[period] || 101;
    const url = `${API_CONFIG.KLINE_API}?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=1&beg=0&end=20500101&lmt=${limit}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.data && data.data.klines) {
      return data.data.klines.map(line => {
        const parts = line.split(',');
        return {
          time: parts[0],       // 日期 "2026-03-25"
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
```

- [ ] **Step 2: Verify file syntax**

Run: `node --check js/api.js`
Expected: No output (no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add js/api.js
git commit -m "refactor: extract API layer to js/api.js with kline support"
```

---

## Task 3: Create `js/storage.js` — Extract Storage Layer

**Files:**
- Create: `js/storage.js`

- [ ] **Step 1: Create `js/storage.js` with groups support**

```js
// js/storage.js

const DEFAULT_GROUPS = [
  { id: 'default', name: '全部', editable: false },
];

export async function loadData() {
  try {
    const result = await chrome.storage.local.get(['stocks', 'settings', 'groups']);
    return {
      stocks: result.stocks || [],
      settings: { theme: 'light', refreshInterval: 10000, ...result.settings },
      groups: result.groups || [...DEFAULT_GROUPS],
    };
  } catch (error) {
    console.error('加载数据失败:', error);
    return {
      stocks: [],
      settings: { theme: 'light', refreshInterval: 10000 },
      groups: [...DEFAULT_GROUPS],
    };
  }
}

export async function saveStocks(stocks) {
  try {
    await chrome.storage.local.set({ stocks });
  } catch (error) {
    console.error('保存股票数据失败:', error);
  }
}

export async function saveSettings(settings) {
  try {
    await chrome.storage.local.set({ settings });
  } catch (error) {
    console.error('保存设置失败:', error);
  }
}

export async function saveGroups(groups) {
  try {
    await chrome.storage.local.set({ groups });
  } catch (error) {
    console.error('保存分组数据失败:', error);
  }
}
```

- [ ] **Step 2: Verify file syntax**

Run: `node --check js/storage.js`
Expected: No output (no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add js/storage.js
git commit -m "refactor: extract storage layer to js/storage.js with groups support"
```

---

## Task 4: Create `js/groups.js` — Group Management Module

**Files:**
- Create: `js/groups.js`

- [ ] **Step 1: Create `js/groups.js` with CRUD, Tab rendering, and filtering logic**

```js
// js/groups.js

/**
 * 生成唯一分组ID
 */
function generateGroupId() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * 渲染分组 Tab 标签栏
 * @param {HTMLElement} container - Tab 容器元素
 * @param {Array} groups - 分组数组
 * @param {string} activeGroupId - 当前选中的分组ID
 * @param {boolean} isEditMode - 是否编辑模式
 * @param {object} callbacks - { onTabClick, onAddGroup, onRenameGroup, onDeleteGroup }
 */
export function renderGroupTabs(container, groups, activeGroupId, isEditMode, callbacks) {
  container.innerHTML = '';

  groups.forEach(group => {
    const tab = document.createElement('div');
    tab.className = 'group-tab' + (group.id === activeGroupId ? ' active' : '');
    tab.dataset.groupId = group.id;
    tab.textContent = group.name;

    tab.addEventListener('click', () => {
      callbacks.onTabClick(group.id);
    });

    // 编辑模式下，可编辑的分组支持右键菜单
    if (isEditMode && group.editable) {
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showGroupContextMenu(e, group, callbacks);
      });
    }

    container.appendChild(tab);
  });

  // 编辑模式下显示添加按钮
  if (isEditMode) {
    const addBtn = document.createElement('div');
    addBtn.className = 'group-tab group-tab-add';
    addBtn.textContent = '+';
    addBtn.title = '新建分组';
    addBtn.addEventListener('click', () => {
      const name = prompt('请输入分组名称：');
      if (name && name.trim()) {
        callbacks.onAddGroup(name.trim());
      }
    });
    container.appendChild(addBtn);
  }
}

/**
 * 显示分组右键菜单
 */
function showGroupContextMenu(event, group, callbacks) {
  // 移除已有的菜单
  const existing = document.querySelector('.group-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'group-context-menu';
  menu.innerHTML = `
    <div class="context-menu-item" data-action="rename">重命名</div>
    <div class="context-menu-item context-menu-danger" data-action="delete">删除</div>
  `;

  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';

  menu.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (action === 'rename') {
      const newName = prompt('请输入新名称：', group.name);
      if (newName && newName.trim()) {
        callbacks.onRenameGroup(group.id, newName.trim());
      }
    } else if (action === 'delete') {
      if (confirm(`确定删除分组「${group.name}」吗？其中的股票将变为未分组。`)) {
        callbacks.onDeleteGroup(group.id);
      }
    }
    menu.remove();
  });

  document.body.appendChild(menu);

  // 点击其他地方关闭菜单
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

/**
 * 添加新分组
 * @param {Array} groups - 当前分组数组
 * @param {string} name - 新分组名称
 * @returns {Array} 更新后的分组数组
 */
export function addGroup(groups, name) {
  return [...groups, { id: generateGroupId(), name, editable: true }];
}

/**
 * 重命名分组
 * @param {Array} groups - 当前分组数组
 * @param {string} groupId - 分组ID
 * @param {string} newName - 新名称
 * @returns {Array} 更新后的分组数组
 */
export function renameGroup(groups, groupId, newName) {
  return groups.map(g => g.id === groupId ? { ...g, name: newName } : g);
}

/**
 * 删除分组，返回更新后的 groups 和 stocks
 * @param {Array} groups - 当前分组数组
 * @param {Array} stocks - 当前股票数组
 * @param {string} groupId - 要删除的分组ID
 * @returns {{ groups: Array, stocks: Array }}
 */
export function deleteGroup(groups, stocks, groupId) {
  const newGroups = groups.filter(g => g.id !== groupId);
  const newStocks = stocks.map(s => s.groupId === groupId ? { ...s, groupId: '' } : s);
  return { groups: newGroups, stocks: newStocks };
}

/**
 * 按分组筛选股票
 * @param {Array} stocks - 全部股票
 * @param {string} groupId - 分组ID, "default" 表示全部
 * @returns {Array} 筛选后的股票
 */
export function filterStocksByGroup(stocks, groupId) {
  if (groupId === 'default') return stocks;
  return stocks.filter(s => s.groupId === groupId);
}

/**
 * 渲染股票行内的分组选择器（编辑模式）
 * @param {Array} groups - 分组数组（不含"全部"）
 * @param {string} currentGroupId - 当前所属分组ID
 * @param {number} stockIndex - 股票索引
 * @returns {string} select HTML
 */
export function renderGroupSelector(groups, currentGroupId, stockIndex) {
  const editableGroups = groups.filter(g => g.editable);
  const options = editableGroups.map(g =>
    `<option value="${g.id}" ${g.id === currentGroupId ? 'selected' : ''}>${g.name}</option>`
  ).join('');
  return `<select class="group-select" data-index="${stockIndex}">
    <option value="" ${!currentGroupId ? 'selected' : ''}>未分组</option>
    ${options}
  </select>`;
}
```

- [ ] **Step 2: Verify file syntax**

Run: `node --check js/groups.js`
Expected: No output (no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add js/groups.js
git commit -m "feat: add group management module js/groups.js"
```

---

## Task 5: Download lightweight-charts Library

**Files:**
- Create: `libs/lightweight-charts.standalone.production.mjs`

- [ ] **Step 1: Create libs directory and download lightweight-charts v4 standalone bundle**

```bash
mkdir -p libs
curl -L -o libs/lightweight-charts.standalone.production.mjs \
  "https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.mjs"
```

- [ ] **Step 2: Verify file was downloaded and has content**

```bash
ls -lh libs/lightweight-charts.standalone.production.mjs
head -c 200 libs/lightweight-charts.standalone.production.mjs
```

Expected: File size ~45-50KB, starts with valid JavaScript.

- [ ] **Step 3: Commit**

```bash
git add libs/
git commit -m "vendor: add lightweight-charts v4.2.2 standalone bundle"
```

---

## Task 6: Create `js/chart.js` — K-Line Chart Module

**Files:**
- Create: `js/chart.js`

- [ ] **Step 1: Create `js/chart.js` with chart lifecycle management**

```js
// js/chart.js

import { fetchKlineData } from './api.js';

// K线数据缓存: key = `${secid}_${period}`, value = kline data array
const klineCache = new Map();

// 当前活跃的图表实例
let activeChart = null;
let activeSecid = null;
let activePeriod = 'daily';

/**
 * 获取当前主题对应的图表配色
 * @param {string} theme - "light" | "dark"
 */
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
 * 展开或收起股票的K线图
 * @param {string} secid - 股票ID
 * @param {HTMLElement} chartContainer - 图表容器元素
 * @param {string} theme - 当前主题
 * @returns {boolean} true=展开, false=收起
 */
export async function toggleChart(secid, chartContainer, theme) {
  // 如果点击的是已展开的同一只股票，收起
  if (activeSecid === secid && activeChart) {
    destroyChart();
    return false;
  }

  // 如果有其他已展开的图表，先销毁
  if (activeChart) {
    destroyChart();
  }

  // 创建新图表
  activeSecid = secid;
  activePeriod = 'daily';
  await createChart(chartContainer, theme);
  return true;
}

/**
 * 创建图表实例并加载数据
 */
async function createChart(container, theme) {
  const colors = getChartColors(theme);

  // 动态导入 lightweight-charts
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

  // 保存 series 引用以便切换周期时更新数据
  activeChart._candleSeries = series;

  await loadKlineData(series);
}

/**
 * 加载K线数据到图表
 */
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

/**
 * 切换K线周期
 * @param {string} period - "daily" | "weekly" | "monthly"
 */
export async function switchPeriod(period) {
  if (!activeChart || period === activePeriod) return;
  activePeriod = period;
  await loadKlineData(activeChart._candleSeries);
}

/**
 * 销毁当前图表实例
 */
export function destroyChart() {
  if (activeChart) {
    activeChart.remove();
    activeChart = null;
    activeSecid = null;
  }
}

/**
 * 获取当前展开的股票 secid
 */
export function getActiveSecid() {
  return activeSecid;
}

/**
 * 获取当前选中的周期
 */
export function getActivePeriod() {
  return activePeriod;
}

/**
 * 清除K线缓存
 */
export function clearKlineCache() {
  klineCache.clear();
}
```

- [ ] **Step 2: Verify file syntax**

Run: `node --check js/chart.js`
Expected: No output (no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add js/chart.js
git commit -m "feat: add K-line chart module js/chart.js"
```

---

## Task 7: Update `popup.html` — Add Group Tabs and Chart Containers

**Files:**
- Modify: `popup.html`

- [ ] **Step 1: Replace the entire `popup.html` with updated structure**

The key changes:
1. Script tag changed to `type="module"`
2. New group tabs section added between add-stock and stock-list
3. Stock header gets a new "分组" column for edit mode
4. Chart expand area rendered dynamically in JS

Replace `popup.html` with:

```html
<!DOCTYPE html>
<html lang="zh-CN">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>自选股票助手</title>
  <link rel="stylesheet" href="popup.css">
</head>

<body>
  <div class="container">
    <!-- 大盘指数区域 -->
    <div class="market-indices">
      <div class="index-item" data-secid="1.000001">
        <div class="index-name">上证指数</div>
        <div class="index-value">--</div>
        <div class="index-change">-- --</div>
      </div>
      <div class="index-item" data-secid="1.000300">
        <div class="index-name">沪深300</div>
        <div class="index-value">--</div>
        <div class="index-change">-- --</div>
      </div>
      <div class="index-item" data-secid="0.399001">
        <div class="index-name">深证成指</div>
        <div class="index-value">--</div>
        <div class="index-change">-- --</div>
      </div>
      <div class="index-item" data-secid="0.399006">
        <div class="index-name">创业板指</div>
        <div class="index-value">--</div>
        <div class="index-change">-- --</div>
      </div>
    </div>

    <!-- 添加股票区域 -->
    <div class="add-stock-section edit-only">
      <label>添加股票：</label>
      <input type="text" id="searchInput" placeholder="请输入股票代码或名称">
      <button id="searchBtn">确定</button>
      <div id="searchResults" class="search-results hidden"></div>
    </div>

    <!-- 分组标签栏 -->
    <div id="groupTabs" class="group-tabs"></div>

    <!-- 股票列表区域 -->
    <div class="stock-list-section">
      <div class="stock-header">
        <span class="col-name">股票名称 (<span id="stockCount">0</span>)</span>
        <span class="col-code">股票代码</span>
        <span class="col-group edit-only">分组</span>
        <span class="col-shares edit-only">持有股数</span>
        <span class="col-cost edit-only">成本价</span>
        <span class="col-price">现价</span>
        <span class="col-change">涨跌幅</span>
        <span class="col-profit">收益</span>
        <span class="col-action edit-only">操作</span>
      </div>
      <div id="stockList" class="stock-list"></div>
    </div>

    <!-- 底部工具栏 -->
    <div class="footer">
      <div class="theme-toggle">
        <span>标准模式</span>
        <label class="switch">
          <input type="checkbox" id="themeToggle">
          <span class="slider"></span>
        </label>
        <span>暗色模式</span>
      </div>
      <div class="actions">
        <button id="marketBtn">行情中心</button>
        <span id="marketStatus" class="market-status">休市中</span>
        <button id="editBtn">编辑</button>
        <button id="refreshBtn" class="refresh-btn">🔄</button>
      </div>
    </div>

    <!-- 日收益汇总 -->
    <div class="daily-profit">
      日收益：<span id="totalProfit">0.00</span> <span id="totalProfitRate">(0.00%)</span>
    </div>
  </div>

  <script type="module" src="popup.js"></script>
</body>

</html>
```

Note: Removed the "设置" button from footer (no settings panel exists). Added `col-group` column. Added `#groupTabs` container.

- [ ] **Step 2: Commit**

```bash
git add popup.html
git commit -m "feat: update popup.html with group tabs and module script"
```

---

## Task 8: Update `popup.css` — Add Group Tab and Chart Styles

**Files:**
- Modify: `popup.css`

- [ ] **Step 1: Append group tab styles, chart area styles, and context menu styles to the end of `popup.css`**

Add the following at the end of `popup.css`:

```css
/* ========== 分组标签栏 ========== */
.group-tabs {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
  margin-bottom: 10px;
  overflow-x: auto;
  scrollbar-width: none;
}

.group-tabs::-webkit-scrollbar {
  display: none;
}

.group-tab {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--text-secondary);
  background: transparent;
  transition: all 0.2s;
  user-select: none;
}

.group-tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.group-tab.active {
  background: var(--accent-color);
  color: white;
}

.group-tab-add {
  color: var(--accent-color);
  font-weight: 600;
  font-size: 14px;
  padding: 4px 10px;
}

.group-tab-add:hover {
  background: var(--bg-hover);
}

/* 分组右键菜单 */
.group-context-menu {
  position: fixed;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: var(--shadow);
  z-index: 200;
  min-width: 100px;
  overflow: hidden;
}

.context-menu-item {
  padding: 8px 14px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.context-menu-item:hover {
  background: var(--bg-hover);
}

.context-menu-danger {
  color: var(--rise-color);
}

/* 分组选择器 */
.group-select {
  padding: 2px 4px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 11px;
  background: var(--bg-primary);
  color: var(--text-primary);
  max-width: 70px;
}

/* 分组列宽 */
.col-group {
  flex: 1;
  text-align: center;
}

/* ========== K线图表区域 ========== */
.chart-expand {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 260px;
  }
}

.chart-toolbar {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.chart-period-btn {
  padding: 2px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.chart-period-btn:hover {
  border-color: var(--accent-color);
  color: var(--text-primary);
}

.chart-period-btn.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.chart-container {
  width: 100%;
  height: 200px;
}

/* 股票行可点击提示 */
.stock-item {
  cursor: pointer;
}

.stock-item.expanded {
  background: var(--bg-hover);
}
```

- [ ] **Step 2: Commit**

```bash
git add popup.css
git commit -m "feat: add group tabs, chart area, and context menu styles"
```

---

## Task 9: Rewrite `popup.js` — ES Module Entry Point

**Files:**
- Rewrite: `popup.js`

This is the largest task. The new `popup.js` imports all modules and coordinates state, UI rendering, and event handling.

- [ ] **Step 1: Replace `popup.js` with the new ES Module entry point**

```js
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
import { toggleChart, switchPeriod, destroyChart, getActiveSecid, getActivePeriod } from './js/chart.js';

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
  // index 是在 filteredStocks 中的位置，需要找到在 state.stocks 中的真实位置
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
      const activePeriod = getActivePeriod();
      chartHtml = `
        <div class="chart-expand">
          <div class="chart-toolbar">
            <button class="chart-period-btn ${activePeriod === 'daily' ? 'active' : ''}" data-period="daily">日K</button>
            <button class="chart-period-btn ${activePeriod === 'weekly' ? 'active' : ''}" data-period="weekly">周K</button>
            <button class="chart-period-btn ${activePeriod === 'monthly' ? 'active' : ''}" data-period="monthly">月K</button>
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

  // 绑定事件
  bindStockListEvents(filteredStocks);
}

function bindStockListEvents(filteredStocks) {
  // 股票行点击 -> 展开/收起K线
  document.querySelectorAll('.stock-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      // 不在编辑模式的输入元素上触发
      if (e.target.closest('input, button, select')) return;

      const secid = item.dataset.secid;
      const expanded = await toggleChart(secid, null, state.settings.theme);
      // 重新渲染以显示/隐藏图表区域
      renderStockList();

      // 如果展开了，需要在 DOM 更新后创建图表
      if (expanded) {
        const chartContainer = document.getElementById(`chart-${secid}`);
        if (chartContainer) {
          // 需要重新调用 toggleChart，因为 renderStockList 重建了 DOM
          // 先销毁再重建
          destroyChart();
          await toggleChart(secid, chartContainer, state.settings.theme);
        }
      }
    });
  });

  // K线周期切换按钮
  document.querySelectorAll('.chart-period-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const period = btn.dataset.period;
      await switchPeriod(period);
      // 更新按钮样式
      document.querySelectorAll('.chart-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 删除按钮
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.dataset.index);
      deleteStock(index);
    });
  });

  // 编辑模式事件
  if (state.isEditMode) {
    bindEditEvents(filteredStocks);
  }
}

function bindEditEvents(filteredStocks) {
  // 股数输入框
  document.querySelectorAll('.shares-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const index = parseInt(e.target.dataset.index);
      const stock = filteredStocks[index];
      const realIndex = state.stocks.indexOf(stock);
      if (realIndex !== -1) {
        state.stocks[realIndex].shares = parseInt(e.target.value) || 0;
        await saveStocks(state.stocks);
        calculateTotalProfit();
      }
    });
  });

  // 加减按钮
  document.querySelectorAll('.plus-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.dataset.index);
      const stock = filteredStocks[index];
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
      const index = parseInt(e.target.dataset.index);
      const stock = filteredStocks[index];
      const realIndex = state.stocks.indexOf(stock);
      if (realIndex !== -1) {
        const newShares = (state.stocks[realIndex].shares || 0) - 100;
        state.stocks[realIndex].shares = Math.max(0, newShares);
        await saveStocks(state.stocks);
        renderStockList();
        calculateTotalProfit();
      }
    });
  });

  // 成本价输入框
  document.querySelectorAll('.cost-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.dataset.index);
      const stock = filteredStocks[index];
      const realIndex = state.stocks.indexOf(stock);
      if (realIndex !== -1) {
        state.stocks[realIndex].costPrice = parseFloat(e.target.value) || 0;
        await saveStocks(state.stocks);
        calculateTotalProfit();
      }
    });
  });

  // 分组选择器
  document.querySelectorAll('.group-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.dataset.index);
      const stock = filteredStocks[index];
      const realIndex = state.stocks.indexOf(stock);
      if (realIndex !== -1) {
        state.stocks[realIndex].groupId = e.target.value;
        await saveStocks(state.stocks);
        // 如果当前不在"全部"Tab，切换分组后股票可能不再属于当前Tab
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
  // 如果有展开的图表，需要销毁重建以适配新主题
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
```

- [ ] **Step 2: Verify file syntax**

Run: `node --check popup.js`
Expected: No output (no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add popup.js
git commit -m "refactor: rewrite popup.js as ES Module entry point with group and chart integration"
```

---

## Task 10: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Verify all JS files have valid syntax**

```bash
for f in js/utils.js js/api.js js/storage.js js/groups.js js/chart.js popup.js; do
  echo "Checking $f..."
  node --check "$f" && echo "  OK" || echo "  FAIL"
done
```

Expected: All files print "OK"

- [ ] **Step 2: Verify file structure is complete**

```bash
ls -la js/ libs/ popup.js popup.html popup.css manifest.json
```

Expected: All files exist:
- `js/utils.js`, `js/api.js`, `js/storage.js`, `js/groups.js`, `js/chart.js`
- `libs/lightweight-charts.standalone.production.mjs`
- `popup.js`, `popup.html`, `popup.css`, `manifest.json`

- [ ] **Step 3: Load extension in Chrome and verify**

Manual steps:
1. Open `chrome://extensions/`
2. Click "Load unpacked" and select the project folder (or reload if already loaded)
3. Click the extension icon — popup should open without console errors
4. Verify: Market indices load, group tabs show "全部", stock list renders

- [ ] **Step 4: Test group management**

1. Click "编辑" to enter edit mode
2. Click the `[+]` tab to add a new group (e.g., "重仓")
3. Add a stock, use the group dropdown to assign it to "重仓"
4. Click the "重仓" tab — only that stock shows
5. Click "全部" tab — all stocks show
6. Right-click "重仓" tab → rename → verify name changes
7. Right-click "重仓" tab → delete → verify stock becomes ungrouped

- [ ] **Step 5: Test K-line chart**

1. Exit edit mode (click "完成编辑")
2. Click on a stock row — K-line chart should expand below it
3. Verify: Daily K-line data loads, candles render red/green
4. Click "周K" / "月K" buttons — chart data should switch
5. Click the same stock again — chart should collapse
6. Click a different stock — previous chart closes, new one opens
7. Toggle dark mode — chart colors should adapt

- [ ] **Step 6: Final commit with all remaining changes**

```bash
git add -A
git status
git commit -m "feat: complete stock assistant enhancement with groups and K-line chart"
```

---

## Summary

| Task | Description | Est. Time |
|------|------------|-----------|
| 1 | Create `js/utils.js` | 2 min |
| 2 | Create `js/api.js` with K-line API | 3 min |
| 3 | Create `js/storage.js` with groups | 2 min |
| 4 | Create `js/groups.js` module | 4 min |
| 5 | Download lightweight-charts library | 2 min |
| 6 | Create `js/chart.js` module | 4 min |
| 7 | Update `popup.html` | 3 min |
| 8 | Update `popup.css` | 3 min |
| 9 | Rewrite `popup.js` entry point | 5 min |
| 10 | Integration verification | 5 min |
