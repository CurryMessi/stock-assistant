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
