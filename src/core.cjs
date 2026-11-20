const crypto = require('node:crypto');

const THEMES = ['教学', '教研', '休息'];
const DEFAULT_CATEGORIES = ['工作', '学习', '生活'];
const REMINDERS = [null, 0, 5, 10, 15, 30, 60];

function cleanCategories(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new Error('分类数量需要在 1–20 个之间');
  const categories = value.map(category => String(category || '').trim());
  if (categories.some(category => !category || category.length > 20)) throw new Error('分类名称请控制在 1–20 个字');
  if (new Set(categories).size !== categories.length) throw new Error('分类名称不能重复');
  return categories;
}

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftDate(key, amount) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function createOccurrenceDates(start, frequency, until) {
  if (!isDateKey(start) || !isDateKey(until) || until < start) throw new Error('请选择有效的重复日期范围');
  if (!['daily', 'weekdays', 'weekly'].includes(frequency)) throw new Error('重复方式无效');
  const result = [];
  const startDay = Date.UTC(...start.split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0)));
  const endDay = Date.UTC(...until.split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0)));
  const step = frequency === 'weekly' ? 7 : 1;
  for (let current = startDay; current <= endDay; current += step * 86400000) {
    const date = new Date(current);
    const key = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    if (frequency === 'weekdays' && (weekday === 0 || weekday === 6)) continue;
    result.push(key);
    if (result.length > 366) throw new Error('单次最多创建 366 个重复日程');
  }
  if (!result.length) throw new Error('所选范围内没有工作日，请调整日期');
  return result;
}

function dueReminders(state, now = Date.now()) {
  const due = [];
  for (const [date, day] of Object.entries(state.days)) {
    for (const item of day.items) {
      if (item.done || item.notifiedAt || item.reminderMinutes == null) continue;
      const startsAt = new Date(`${date}T${item.startTime}:00`).getTime();
      const scheduled = startsAt - item.reminderMinutes * 60000;
      if (scheduled <= now && now <= startsAt + 15 * 60000) due.push({ date, item });
    }
  }
  return due;
}

function cleanItem(input) {
  if (!input || typeof input !== 'object') throw new Error('日程内容无效');
  const id = typeof input.id === 'string' && /^[\w-]{1,80}$/.test(input.id) ? input.id : crypto.randomUUID();
  const title = String(input.title || '').trim();
  const startTime = String(input.startTime || '');
  const endTime = String(input.endTime || '');
  if (!title || title.length > 120) throw new Error('日程名称请控制在 1–120 个字');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime) {
    throw new Error('请填写有效时间，并确保结束时间晚于开始时间');
  }
  const reminderMinutes = input.reminderMinutes == null ? null : Number(input.reminderMinutes);
  if (!REMINDERS.includes(reminderMinutes)) throw new Error('提醒时间无效');
  return {
    id,
    title,
    startTime,
    endTime,
    note: String(input.note || '').slice(0, 3000),
    done: Boolean(input.done),
    reminderMinutes,
    notifiedAt: Number.isFinite(input.notifiedAt) && input.notifiedAt > 0 ? input.notifiedAt : null,
    ...(typeof input.seriesId === 'string' ? { seriesId: input.seriesId } : {})
  };
}

function validateState(input, { edition = 'special' } = {}) {
  if (!input || input.version !== 1 || !input.days || typeof input.days !== 'object' || Array.isArray(input.days)) {
    throw new Error('备份文件格式不正确');
  }
  let categories;
  if (edition === 'general') {
    const saved = Array.isArray(input.categories) ? input.categories : [...DEFAULT_CATEGORIES];
    const inherited = Object.values(input.days)
      .map(day => day?.theme)
      .filter(theme => typeof theme === 'string' && theme.trim() && theme.length <= 20 && !saved.includes(theme));
    categories = cleanCategories([...saved, ...new Set(inherited)]);
  }
  const allowedThemes = edition === 'general' ? categories : THEMES;
  const days = {};
  let total = 0;
  for (const [key, value] of Object.entries(input.days)) {
    if (!isDateKey(key) || !value || typeof value !== 'object' || !Array.isArray(value.items)) throw new Error('备份中包含无效日期');
    if (value.theme && !allowedThemes.includes(value.theme)) throw new Error('备份中包含无效主题');
    const seen = new Set();
    const items = value.items.map(item => {
      if (!item || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id)) throw new Error('备份中包含无效日程编号');
      return cleanItem(item);
    });
    for (const item of items) {
      if (seen.has(item.id)) throw new Error('同一天中存在重复日程编号');
      seen.add(item.id);
    }
    total += items.length;
    if (total > 20000) throw new Error('日程总数不能超过 20000 项');
    days[key] = { theme: allowedThemes.includes(value.theme) ? value.theme : '', items };
  }
  const language = input.language ?? 'zh-CN';
  if (edition === 'general' && !['zh-CN', 'en-US'].includes(language)) throw new Error('语言设置无效');
  return { version: 1, days, ...(edition === 'general' ? { categories, language } : {}) };
}

module.exports = { THEMES, DEFAULT_CATEGORIES, cleanCategories, REMINDERS, isDateKey, dateKey, shiftDate, createOccurrenceDates, dueReminders, cleanItem, validateState };
