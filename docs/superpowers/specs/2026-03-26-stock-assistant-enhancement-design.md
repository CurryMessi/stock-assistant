# 自选股票助手 - 功能增强设计

## 概述

为 stock-assistant Chrome 扩展新增两项功能：**分组管理** 和 **K线图表**，同时将代码拆分为模块化结构以支撑功能扩展。

## 功能一：分组管理

### 数据结构

Chrome Storage 中新增 `groups` 字段：

```js
groups: [
  { id: 'default', name: '全部', editable: false },
  { id: 'g1', name: '重仓', editable: true },
  { id: 'g2', name: '科技', editable: true }
]
```

每只股票新增 `groupId` 字段：

```js
stock: { code: '600519', name: '贵州茅台', groupId: 'g1', ... }
```

### UI 交互

- 股票列表上方新增 Tab 标签栏，始终显示「全部」+ 自定义分组
- Tab 末尾有 `[+]` 按钮用于新建分组
- 编辑模式下：Tab 右键/长按可重命名或删除分组，每只股票行显示分组下拉选择器
- 切换 Tab 时筛选显示对应分组的股票，「全部」显示所有
- 日收益汇总跟随当前选中分组计算

### 约束

- 未分组的股票默认属于「全部」（groupId 为空或 'default'）
- 删除分组时，其中的股票变为未分组（仍在「全部」中显示）

## 功能二：K线图表

### 数据源

- 使用东方财富历史 K 线 API（`push2his.eastmoney.com/api/qt/stock/kline/get`）
- 获取日 K 线数据，默认加载近 60 个交易日

### 图表库

- 使用 TradingView 的 lightweight-charts（~45KB）
- 以本地文件方式引入（`libs/lightweight-charts.standalone.production.mjs`），符合 Manifest V3 CSP 要求

### 交互方式

- 点击股票行展开/收起 K 线图区域（手风琴模式，同时只展开一只）
- 展开区域高度约 200px，宽度撑满列表
- 图表上方显示周期切换按钮：`[日K] [周K] [月K]`，默认日 K
- 图表支持左右拖拽浏览、鼠标悬停显示十字光标和 OHLC 数据
- K 线颜色跟随主题：涨红跌绿（浅色主题），暗色主题下调整为适配的配色

### 性能考虑

- K 线数据按需加载，只在展开时请求
- 切换周期时缓存已加载的数据，避免重复请求
- 收起时销毁图表实例释放内存

## 架构：文件结构与模块化

### 新文件结构

```
stock-assistant/
├── manifest.json          # 更新 CSP 配置
├── popup.html             # 新增 Tab 栏、K线展开区域
├── popup.css              # 新增分组 Tab 样式、K线区域样式
├── popup.js               # 入口：初始化、事件绑定、UI 协调
├── js/
│   ├── api.js             # API 调用层（搜索、行情、K线数据）
│   ├── storage.js         # Chrome Storage 读写（股票、分组、设置）
│   ├── groups.js          # 分组管理逻辑（CRUD、Tab 渲染、筛选）
│   ├── chart.js           # K线图表逻辑（创建、销毁、周期切换）
│   └── utils.js           # 工具函数（debounce、收益计算等）
├── libs/
│   └── lightweight-charts.standalone.production.mjs
├── icons/
└── screenshots/
```

### 模块通信

- 各模块通过 ES Module（`import/export`）组织，`popup.js` 作为入口统一协调
- `manifest.json` 中 popup.html 的 script 标签改为 `type="module"`
- 状态（state）仍集中管理在 `popup.js`，各模块通过函数参数接收和返回数据

### 不做的事

- 不引入构建工具（webpack/vite），保持开发者可以直接加载源码调试
- 不引入前端框架（React/Vue），保持原生 JS 风格
- 不重构现有的主题切换、编辑模式等已稳定的功能

## 技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| K线图表库 | lightweight-charts | 体积小（~45KB）、TradingView 出品、专为金融图表设计 |
| 分组展示 | Tab 标签切换 | 直观、不占纵向空间、符合 Chrome 扩展 popup 场景 |
| K线展示 | 内嵌手风琴展开 | 无需额外弹窗/标签页、体验流畅 |
| 代码组织 | ES Module 拆分 | 保持零构建工具、浏览器原生支持 |
