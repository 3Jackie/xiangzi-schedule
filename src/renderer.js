const stateView = {
  snapshot: { state: { version: 1, days: {} }, startupError: '', dataPath: '' },
  selectedDate: dateKey(new Date()),
  currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  view: 'month',
  search: '',
  themeFilter: '',
  editing: null,
  toastTimer: null
};

const el = id => document.getElementById(id);
const calendarGrid = el('calendar-grid');
const weekdayRow = el('weekday-row');
const itemDialog = el('item-dialog');
const searchInput = el('search-input');
const themeFilter = el('theme-filter');
const THEME_CLASS = { 教学: 'theme-teaching', 教研: 'theme-research', 休息: 'theme-rest' };
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const locale = () => stateView.snapshot.edition === 'general' ? (currentState().language || 'zh-CN') : 'zh-CN';
const t = (text, values) => window.XiangziI18n.translate(locale(), text, values);
const categoryLabel = name => ['工作', '学习', '生活'].includes(name) ? t(name) : name;
const weekdayLabels = () => locale() === 'en-US' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : WEEKDAYS;
const staticText = [];
const staticAttributes = [];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
  const node = walker.currentNode;
  if (Object.hasOwn(window.XiangziI18n.english, node.textContent.trim())) staticText.push([node, node.textContent]);
}
for (const element of document.querySelectorAll('[aria-label], [placeholder], [title]')) {
  for (const attribute of ['aria-label', 'placeholder', 'title']) {
    const value = element.getAttribute(attribute);
    if (value && Object.hasOwn(window.XiangziI18n.english, value)) staticAttributes.push([element, attribute, value]);
  }
}

function renderLanguage() {
  document.documentElement.lang = locale();
  for (const [node, original] of staticText) {
    if (node.isConnected) node.textContent = original.replace(original.trim(), t(original.trim()));
  }
  for (const [element, attribute, original] of staticAttributes) element.setAttribute(attribute, t(original));
  el('language-button').hidden = stateView.snapshot.edition !== 'general';
  el('language-button').disabled = Boolean(stateView.snapshot.startupError);
  el('language-button').textContent = locale() === 'en-US' ? '中文' : 'English';
  el('language-button').setAttribute('aria-label', t(locale() === 'en-US' ? '切换为中文' : '切换为英文'));
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function shiftDate(date, amount) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
}

function mondayOf(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function currentState() {
  return stateView.snapshot.state;
}

function dayData(date) {
  return currentState().days[date] || { theme: '', items: [] };
}

function themeClassForDay(theme) {
  if (Object.hasOwn(THEME_CLASS, theme)) return THEME_CLASS[theme];
  const choices = stateView.snapshot.themeChoices || [];
  const index = choices.indexOf(theme);
  return index < 0 ? '' : `theme-tone-${index % 5}`;
}

function dayPassesTheme(date) {
  return !stateView.themeFilter || dayData(date).theme === stateView.themeFilter;
}

function itemMatches(item) {
  if (!stateView.search) return true;
  const query = stateView.search.toLocaleLowerCase();
  return `${item.title} ${item.note}`.toLocaleLowerCase().includes(query);
}

function visibleItems(date) {
  if (!dayPassesTheme(date)) return [];
  return [...dayData(date).items]
    .filter(itemMatches)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title, 'zh-CN'));
}

function matchingResults() {
  return Object.entries(currentState().days)
    .filter(([date]) => dayPassesTheme(date))
    .flatMap(([date, day]) => day.items.filter(itemMatches).map(item => ({ date, item })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.item.startTime.localeCompare(b.item.startTime));
}

function localToday() {
  return dateKey(new Date());
}

function formatSelectedDate(key) {
  const date = parseDate(key);
  return new Intl.DateTimeFormat(locale(), { month: locale() === 'en-US' ? 'short' : 'long', day: 'numeric', weekday: 'short' }).format(date);
}

function setSnapshot(snapshot) {
  if (!snapshot?.state) return;
  stateView.snapshot = snapshot;
  renderAll();
}

function renderAll() {
  renderLanguage();
  renderThemeChoices();
  renderCalendar();
  renderDayPanel();
  const warning = el('startup-warning');
  warning.hidden = !stateView.snapshot.startupError;
  warning.textContent = stateView.snapshot.startupError
    ? t('本机日程文件无法读取，已保留一份恢复副本。请导入有效备份后再继续修改。{error}', { error: window.XiangziI18n.errorMessage(locale(), stateView.snapshot.startupError) })
    : '';
}

function renderThemeChoices() {
  const choices = stateView.snapshot.themeChoices || ['教学', '教研', '休息'];
  const select = el('theme-select');
  const filter = el('theme-filter');
  const selected = select.value;
  const filterValue = filter.value;
  const label = t(stateView.snapshot.edition === 'general' ? '当天分类' : '当天主题');
  const allLabel = t(stateView.snapshot.edition === 'general' ? '所有分类' : '所有主题');
  el('theme-select').closest('.theme-field').querySelector('label').textContent = label;
  select.innerHTML = `<option value="">${t(stateView.snapshot.edition === 'general' ? '选择一个分类' : '选择一个主题')}</option>`
    + choices.map(choice => `<option value="${escapeHtml(choice)}">${escapeHtml(categoryLabel(choice))}</option>`).join('');
  select.value = selected;
  filter.innerHTML = `<option value="">${allLabel}</option>` + choices.map(choice => `<option value="${escapeHtml(choice)}">${escapeHtml(categoryLabel(choice))}</option>`).join('');
  filter.value = choices.includes(filterValue) ? filterValue : '';
  stateView.themeFilter = filter.value;
  el('theme-filter-label').textContent = t(stateView.snapshot.edition === 'general' ? '按分类筛选' : '按主题筛选');
  filter.setAttribute('aria-label', el('theme-filter-label').textContent);
  el('calendar-legend').innerHTML = choices.map(choice => `<span class="legend-dot ${themeClassForDay(choice)}"></span><span>${escapeHtml(categoryLabel(choice))}</span>`).join('');
  el('manage-categories-button').hidden = stateView.snapshot.edition !== 'general';
  el('manage-categories-button').disabled = Boolean(stateView.snapshot.startupError);
}

function renderCalendar() {
  const today = localToday();
  const selected = stateView.selectedDate;
  const monthTitle = new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'long' });
  const monthButton = el('month-view-button');
  const weekButton = el('week-view-button');
  monthButton.setAttribute('aria-pressed', String(stateView.view === 'month'));
  weekButton.setAttribute('aria-pressed', String(stateView.view === 'week'));
  el('today-label').textContent = t('今天是 {date}', { date: new Intl.DateTimeFormat(locale(), { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()) });
  calendarGrid.classList.toggle('week-grid', stateView.view === 'week');
  weekdayRow.hidden = stateView.view === 'week';

  if (stateView.view === 'month') {
    el('calendar-title').textContent = monthTitle.format(stateView.currentMonth);
    renderMonth(today, selected);
  } else {
    const start = mondayOf(parseDate(selected));
    const end = shiftDate(start, 6);
    el('calendar-title').textContent = `${new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric' }).format(start)} — ${new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric' }).format(end)}`;
    renderWeek(start, today, selected);
  }
}

function renderMonth(today, selected) {
  weekdayRow.innerHTML = weekdayLabels().map(day => `<span>${day}</span>`).join('');
  const first = new Date(stateView.currentMonth.getFullYear(), stateView.currentMonth.getMonth(), 1);
  const start = mondayOf(first);
  const cells = [];
  for (let index = 0; index < 42; index++) {
    const date = shiftDate(start, index);
    const key = dateKey(date);
    const day = dayData(key);
    const isOutside = date.getMonth() !== stateView.currentMonth.getMonth();
    const themeClass = themeClassForDay(day.theme);
    const events = visibleItems(key);
    const itemsHtml = events.slice(0, 3).map(item => `<div class="calendar-item ${themeClass} ${item.done ? 'is-done' : ''}" title="${escapeHtml(`${item.startTime} ${item.title}`)}">${escapeHtml(item.startTime)} ${escapeHtml(item.title)}</div>`).join('');
    const moreCount = events.length - 3;
    const themeHtml = day.theme ? `<span class="day-theme ${themeClass}">${escapeHtml(categoryLabel(day.theme))}</span>` : '';
    const hiddenByFilter = !dayPassesTheme(key) || (Boolean(stateView.search) && events.length === 0);
    cells.push(`<button class="calendar-day ${isOutside ? 'outside-month' : ''} ${key === selected ? 'is-selected' : ''} ${key === today ? 'is-today' : ''}" type="button" data-date="${key}" aria-label="${escapeHtml(t('{date}，{category}，{count} 项安排', { date: key, category: categoryLabel(day.theme) || t('未分类'), count: events.length }))}" ${hiddenByFilter ? 'data-filtered="true"' : ''}>
      <span class="calendar-day-head"><span class="day-number">${date.getDate()}</span>${themeHtml}</span>
      <span class="calendar-items">${itemsHtml}${moreCount > 0 ? `<span class="more-items">${t('另有 {count} 项', { count: moreCount })}</span>` : ''}${events.length ? `<span class="calendar-mobile-count">${t('{count} 项', { count: events.length })}</span>` : ''}</span>
    </button>`);
  }
  calendarGrid.classList.remove('week-grid');
  calendarGrid.innerHTML = cells.join('');
}

function renderWeek(start, today, selected) {
  const days = [];
  for (let index = 0; index < 7; index++) {
    const date = shiftDate(start, index);
    const key = dateKey(date);
    const day = dayData(key);
    const themeClass = themeClassForDay(day.theme);
    const items = visibleItems(key);
    const events = items.length
      ? items.map(item => `<div class="week-event ${themeClass} ${item.done ? 'is-done' : ''}"><div class="week-event-time">${escapeHtml(item.startTime)}–${escapeHtml(item.endTime)}</div><div class="week-event-title">${escapeHtml(item.title)}</div></div>`).join('')
      : `<div class="no-matches">${t(stateView.search || stateView.themeFilter ? '没有匹配安排' : '暂无安排')}</div>`;
    const theme = day.theme ? `<span class="day-theme ${themeClass}">${escapeHtml(categoryLabel(day.theme))}</span>` : '';
    days.push(`<div class="week-day ${key === selected ? 'is-selected' : ''} ${key === today ? 'is-today' : ''}" data-date="${key}" role="button" tabindex="0" aria-label="${escapeHtml(t('{date}，{category}，{count} 项安排', { date: key, category: categoryLabel(day.theme) || t('未分类'), count: items.length }))}">
      <div class="week-day-head"><span class="week-day-name">${weekdayLabels()[index]}</span><span class="week-day-number">${date.getDate()}</span></div>
      <div class="week-theme">${theme}</div>${events}
    </div>`);
  }
  calendarGrid.innerHTML = days.join('');
}

function renderDayPanel() {
  const selected = stateView.selectedDate;
  const day = dayData(selected);
  const globalResults = Boolean(stateView.search || stateView.themeFilter);
  const results = globalResults ? matchingResults() : null;
  const items = results || visibleItems(selected).map(item => ({ date: selected, item }));
  el('selected-date-label').textContent = t(selected === localToday() ? '今天' : '所选日期');
  el('selected-date-title').textContent = formatSelectedDate(selected);
  el('theme-select').value = day.theme || '';
  el('theme-select').disabled = Boolean(stateView.snapshot.startupError);
  el('add-item-button').disabled = Boolean(stateView.snapshot.startupError);
  el('empty-add-button').disabled = Boolean(stateView.snapshot.startupError);
  el('agenda-heading').querySelector('h3').textContent = t(stateView.search ? '搜索结果' : stateView.themeFilter ? '筛选结果' : '当天安排');
  el('item-count').textContent = t('{count} 项', { count: items.length });
  const list = el('item-list');
  list.innerHTML = items.map(({ date, item }) => `<article class="agenda-item ${item.done ? 'is-done' : ''}" data-id="${escapeHtml(item.id)}" data-date="${date}">
      <input class="done-toggle" type="checkbox" ${item.done ? 'checked' : ''} aria-label="${t(item.done ? '取消完成' : '标记完成')}: ${escapeHtml(item.title)}">
      <div class="agenda-time">${escapeHtml(item.startTime)}<br>— ${escapeHtml(item.endTime)}</div>
      <div class="agenda-content">
        ${globalResults ? `<div class="result-date">${escapeHtml(date)} · ${escapeHtml(categoryLabel(dayData(date).theme) || t(stateView.snapshot.edition === 'general' ? '未分类' : '未选主题'))}</div>` : ''}
        <p class="agenda-title">${escapeHtml(item.title)}</p>
        ${item.note ? `<p class="agenda-note">${escapeHtml(item.note)}</p>` : ''}
        <div class="item-actions"><button type="button" data-action="edit">${t('编辑')}</button><button type="button" data-action="delete">${t('删除')}</button></div>
      </div>
    </article>`).join('');
  const empty = el('empty-state');
  empty.hidden = items.length > 0;
  if (!items.length) {
    const isFiltered = globalResults;
    el('empty-title').textContent = t(isFiltered ? '没有找到匹配的安排' : '这一天还没有安排');
    const general = stateView.snapshot.edition === 'general';
    el('empty-detail').textContent = t(isFiltered ? (general ? '试试换个关键词或分类。' : '试试换个关键词或主题。') : (general ? '选好分类，再把要做的事放进日历。' : '选好主题，再把要做的事放进日历。'));
    el('empty-add-button').hidden = isFiltered;
  }
}

function showToast(message) {
  const toast = el('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(stateView.toastTimer);
  stateView.toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function reportError(error) {
  showToast(window.XiangziI18n.errorMessage(locale(), error?.message || '操作没有完成，请再试一次。'));
}

async function selectDate(key) {
  stateView.selectedDate = key;
  const date = parseDate(key);
  stateView.currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  renderAll();
}

function openDialog(item = null, itemDate = stateView.selectedDate) {
  if (stateView.snapshot.startupError) {
    showToast(t('请先导入有效备份，再继续修改日程。'));
    return;
  }
  stateView.editing = item ? { ...item, originalDate: itemDate } : null;
  el('dialog-title').textContent = t(item ? '编辑安排' : '新建安排');
  el('item-title').placeholder = t(stateView.snapshot.edition === 'general' ? '例如：项目会议、读书、锻炼' : '例如：备课、听课、整理资料');
  el('save-item-button').textContent = t(item ? '保存修改' : '保存安排');
  el('item-title').value = item?.title || '';
  el('item-date').value = itemDate;
  el('item-reminder').value = item?.reminderMinutes == null ? '' : String(item.reminderMinutes);
  el('item-start').value = item?.startTime || '09:00';
  el('item-end').value = item?.endTime || '10:00';
  el('item-note').value = item?.note || '';
  el('item-repeat').value = 'none';
  el('item-repeat').disabled = Boolean(item);
  el('repeat-until-field').hidden = true;
  el('item-repeat-until').required = false;
  el('item-repeat-until').value = '';
  el('repeat-fields').hidden = Boolean(item);
  el('form-error').hidden = true;
  el('form-error').textContent = '';
  itemDialog.showModal();
  el('item-title').focus();
}

function renderCategoryRows(categories) {
  el('category-list').innerHTML = categories.map(category => `<div class="category-row" data-original="${escapeHtml(category)}">
      <input type="text" maxlength="20" value="${escapeHtml(categoryLabel(category))}" aria-label="${escapeHtml(categoryLabel(category))} ${t('分类名称')}" required>
      <button class="remove-category-button" type="button">${t('移除')}</button>
    </div>`).join('');
}

function openCategoryDialog() {
  const categories = currentState().categories || ['工作', '学习', '生活'];
  renderCategoryRows(categories);
  el('category-error').hidden = true;
  el('category-error').textContent = '';
  el('category-dialog').showModal();
  el('category-list').querySelector('input')?.focus();
}

async function saveCategories(event) {
  event.preventDefault();
  const rows = [...el('category-list').querySelectorAll('.category-row')];
  const categories = rows.map(row => {
    const value = row.querySelector('input').value.trim();
    return row.dataset.original && value === categoryLabel(row.dataset.original) ? row.dataset.original : value;
  });
  const error = el('category-error');
  error.hidden = true;
  if (!categories.length || categories.some(category => !category)) {
    error.textContent = t('请至少保留一个分类，并填写完整名称。');
    error.hidden = false;
    return;
  }
  if (categories.length > 20) {
    error.textContent = t('最多可以设置 20 个分类。');
    error.hidden = false;
    return;
  }
  if (categories.some(category => category.length > 20)) {
    error.textContent = t('分类名称不能超过 20 个字。');
    error.hidden = false;
    return;
  }
  if (new Set(categories).size !== categories.length) {
    error.textContent = t('分类名称不能重复。');
    error.hidden = false;
    return;
  }
  const renames = Object.create(null);
  rows.forEach((row, index) => {
    const oldName = row.dataset.original;
    if (oldName && oldName !== categories[index]) renames[oldName] = categories[index];
  });
  try {
    const snapshot = await window.xiangzi.setCategories(categories, renames);
    setSnapshot(snapshot);
    el('category-dialog').close();
    showToast(t('分类已保存'));
  } catch (failure) {
    error.textContent = window.XiangziI18n.errorMessage(locale(), failure.message || '分类没有保存，请再试一次。');
    error.hidden = false;
  }
}

async function handleSave(event) {
  event.preventDefault();
  const errorBox = el('form-error');
  errorBox.hidden = true;
  const input = {
    ...(stateView.editing ? { id: stateView.editing.id, done: stateView.editing.done } : {}),
    title: el('item-title').value,
    startTime: el('item-start').value,
    endTime: el('item-end').value,
    reminderMinutes: el('item-reminder').value === '' ? null : Number(el('item-reminder').value),
    note: el('item-note').value
  };
  const newDate = el('item-date').value;
  try {
    if (!newDate) throw new Error(t('请选择日期'));
    if (stateView.editing) {
      const snapshot = await window.xiangzi.updateItem(stateView.editing.originalDate, newDate, input);
      stateView.snapshot = snapshot;
      stateView.selectedDate = newDate;
      stateView.currentMonth = new Date(parseDate(newDate).getFullYear(), parseDate(newDate).getMonth(), 1);
      showToast(t('安排已更新'));
    } else {
      const frequency = el('item-repeat').value;
      let repeat = null;
      if (frequency !== 'none') {
        const until = el('item-repeat-until').value;
        if (!until) throw new Error(t('请选择重复结束日期'));
        if (until < newDate) throw new Error(t('重复结束日期不能早于开始日期'));
        repeat = { frequency, until };
      }
      const snapshot = await window.xiangzi.addItem(newDate, input, repeat);
      stateView.snapshot = snapshot;
      stateView.selectedDate = newDate;
      stateView.currentMonth = new Date(parseDate(newDate).getFullYear(), parseDate(newDate).getMonth(), 1);
      showToast(t(frequency === 'none' ? '安排已添加' : '重复安排已添加'));
    }
    itemDialog.close();
    renderAll();
  } catch (error) {
    errorBox.textContent = window.XiangziI18n.errorMessage(locale(), error.message || '保存失败，请检查填写内容。');
    errorBox.hidden = false;
  }
}

async function handleDelete(date, id) {
  const day = dayData(date);
  const item = day.items.find(candidate => candidate.id === id);
  if (!item) return;
  try {
    const snapshot = await window.xiangzi.deleteItem(date, id);
    if (!snapshot) return;
    setSnapshot(snapshot);
    showToast(t('安排已删除'));
  } catch (error) {
    reportError(error);
  }
}

function movePeriod(direction) {
  if (stateView.view === 'month') {
    const nextMonth = new Date(stateView.currentMonth.getFullYear(), stateView.currentMonth.getMonth() + direction, 1);
    stateView.currentMonth = nextMonth;
    const requestedDay = parseDate(stateView.selectedDate).getDate();
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    stateView.selectedDate = dateKey(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(requestedDay, lastDay)));
  } else {
    stateView.selectedDate = dateKey(shiftDate(parseDate(stateView.selectedDate), 7 * direction));
    const selected = parseDate(stateView.selectedDate);
    stateView.currentMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  }
  renderAll();
}

calendarGrid.addEventListener('click', async event => {
  const dayElement = event.target.closest('[data-date]');
  if (dayElement) {
    await selectDate(dayElement.dataset.date);
    if (matchMedia('(max-width: 900px)').matches) document.querySelector('.day-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

calendarGrid.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.week-day')) {
    event.preventDefault();
    selectDate(event.target.dataset.date);
  }
});

el('item-list').addEventListener('change', async event => {
  if (!event.target.matches('.done-toggle')) return;
  const item = event.target.closest('.agenda-item');
  try {
    setSnapshot(await window.xiangzi.toggleItem(item.dataset.date, item.dataset.id));
    showToast(t(event.target.checked ? '已标记完成' : '已恢复为待办'));
  } catch (error) {
    reportError(error);
  }
});

el('item-list').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const itemElement = button.closest('.agenda-item');
  const itemDate = itemElement.dataset.date;
  const item = dayData(itemDate).items.find(candidate => candidate.id === itemElement.dataset.id);
  if (button.dataset.action === 'edit' && item) openDialog(item, itemDate);
  if (button.dataset.action === 'delete') handleDelete(itemDate, itemElement.dataset.id);
});

el('theme-select').addEventListener('change', async event => {
  const value = event.target.value;
  const general = stateView.snapshot.edition === 'general';
  try {
    setSnapshot(await window.xiangzi.setTheme(stateView.selectedDate, value));
    showToast(t(value ? (general ? '当天分类已设为{value}' : '当天主题已设为{value}') : (general ? '当天分类已清除' : '当天主题已清除'), { value: categoryLabel(value) }));
  } catch (error) {
    renderDayPanel();
    reportError(error);
  }
});
el('manage-categories-button').addEventListener('click', openCategoryDialog);
el('language-button').addEventListener('click', async () => {
  try {
    setSnapshot(await window.xiangzi.setLanguage(locale() === 'en-US' ? 'zh-CN' : 'en-US'));
    el('toast').hidden = true;
  } catch (error) { reportError(error); }
});
el('category-form').addEventListener('submit', saveCategories);
el('close-category-dialog').addEventListener('click', () => el('category-dialog').close());
el('cancel-category-button').addEventListener('click', () => el('category-dialog').close());
el('add-category-button').addEventListener('click', () => {
  const list = el('category-list');
  if (list.children.length >= 20) {
    el('category-error').textContent = t('最多可以设置 20 个分类。');
    el('category-error').hidden = false;
    return;
  }
  const row = document.createElement('div');
  row.className = 'category-row';
  row.dataset.original = '';
  row.innerHTML = `<input type="text" maxlength="20" aria-label="${t('新分类名称')}" placeholder="${t('输入分类名称')}" required><button class="remove-category-button" type="button">${t('移除')}</button>`;
  list.append(row);
  row.querySelector('input').focus();
});
el('category-list').addEventListener('click', async event => {
  const button = event.target.closest('.remove-category-button');
  if (!button) return;
  const row = button.closest('.category-row');
  try {
    if (row.dataset.original && !await window.xiangzi.confirmCategoryRemoval(row.dataset.original)) return;
    row.remove();
  } catch (error) { reportError(error); }
});

el('add-item-button').addEventListener('click', () => openDialog());
el('empty-add-button').addEventListener('click', () => openDialog());
el('item-form').addEventListener('submit', handleSave);
el('close-dialog-button').addEventListener('click', () => itemDialog.close());
el('cancel-dialog-button').addEventListener('click', () => itemDialog.close());
el('item-dialog').addEventListener('close', () => { stateView.editing = null; });
el('item-repeat').addEventListener('change', event => {
  const enabled = event.target.value !== 'none';
  el('repeat-until-field').hidden = !enabled;
  el('item-repeat-until').required = enabled;
  el('item-repeat-until').min = el('item-date').value;
});
el('item-date').addEventListener('change', () => {
  el('item-repeat-until').min = el('item-date').value;
});
el('month-view-button').addEventListener('click', () => { stateView.view = 'month'; renderAll(); });
el('week-view-button').addEventListener('click', () => { stateView.view = 'week'; renderAll(); });
el('previous-button').addEventListener('click', () => movePeriod(-1));
el('next-button').addEventListener('click', () => movePeriod(1));
el('today-button').addEventListener('click', () => {
  stateView.selectedDate = localToday();
  const today = new Date();
  stateView.currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  renderAll();
});

searchInput.addEventListener('input', () => {
  stateView.search = searchInput.value.trim();
  el('clear-search').hidden = !searchInput.value;
  renderCalendar();
  renderDayPanel();
});
el('clear-search').addEventListener('click', () => {
  searchInput.value = '';
  stateView.search = '';
  el('clear-search').hidden = true;
  searchInput.focus();
  renderCalendar();
  renderDayPanel();
});
themeFilter.addEventListener('change', () => {
  stateView.themeFilter = themeFilter.value;
  renderCalendar();
  renderDayPanel();
});

el('export-button').addEventListener('click', async () => {
  try {
    const file = await window.xiangzi.exportBackup();
    if (file) showToast(t('备份已导出'));
  } catch (error) { reportError(error); }
});
el('import-button').addEventListener('click', async () => {
  try {
    const snapshot = await window.xiangzi.importBackup();
    if (snapshot) {
      setSnapshot(snapshot);
      showToast(t('备份已恢复'));
    }
  } catch (error) { reportError(error); }
});
el('data-folder-button').addEventListener('click', async () => {
  try { await window.xiangzi.openDataFolder(); } catch (error) { reportError(error); }
});

window.xiangzi.onStateChanged(setSnapshot);
window.xiangzi.getState().then(setSnapshot).catch(reportError);
