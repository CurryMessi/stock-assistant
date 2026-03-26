// js/groups.js

function generateGroupId() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * 渲染分组 Tab 标签栏
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

    if (isEditMode && group.editable) {
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showGroupContextMenu(e, group, callbacks);
      });
    }

    container.appendChild(tab);
  });

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

function showGroupContextMenu(event, group, callbacks) {
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

  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

export function addGroup(groups, name) {
  return [...groups, { id: generateGroupId(), name, editable: true }];
}

export function renameGroup(groups, groupId, newName) {
  return groups.map(g => g.id === groupId ? { ...g, name: newName } : g);
}

export function deleteGroup(groups, stocks, groupId) {
  const newGroups = groups.filter(g => g.id !== groupId);
  const newStocks = stocks.map(s => s.groupId === groupId ? { ...s, groupId: '' } : s);
  return { groups: newGroups, stocks: newStocks };
}

export function filterStocksByGroup(stocks, groupId) {
  if (groupId === 'default') return stocks;
  return stocks.filter(s => s.groupId === groupId);
}

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
