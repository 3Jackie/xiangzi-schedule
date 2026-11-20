const test = require('node:test');
const assert = require('node:assert/strict');
const { THEMES, DEFAULT_CATEGORIES, cleanCategories, isDateKey, createOccurrenceDates, dueReminders, cleanItem, validateState } = require('../src/core.cjs');

test('主题清单固定为教学、教研、休息', () => {
  assert.deepEqual(THEMES, ['教学', '教研', '休息']);
});

test('日期校验拒绝不存在的日期', () => {
  assert.equal(isDateKey('2026-02-28'), true);
  assert.equal(isDateKey('2026-02-30'), false);
  assert.equal(isDateKey('not-a-date'), false);
});

test('重复日期支持每日、工作日和每周', () => {
  assert.deepEqual(createOccurrenceDates('2026-11-02', 'daily', '2026-11-04'), [
    '2026-11-02', '2026-11-03', '2026-11-04'
  ]);
  assert.deepEqual(createOccurrenceDates('2026-11-06', 'weekdays', '2026-11-10'), [
    '2026-11-06', '2026-11-09', '2026-11-10'
  ]);
  assert.deepEqual(createOccurrenceDates('2026-11-02', 'weekly', '2026-11-16'), [
    '2026-11-02', '2026-11-09', '2026-11-16'
  ]);
});

test('结束时间必须晚于开始时间，提醒值必须有效', () => {
  assert.throws(() => cleanItem({ title: '备课', startTime: '10:00', endTime: '09:00' }));
  assert.throws(() => cleanItem({ title: '备课', startTime: '09:00', endTime: '10:00', reminderMinutes: 7 }));
  assert.equal(cleanItem({ title: '备课', startTime: '09:00', endTime: '10:00' }).title, '备课');
});

test('备份校验会保留主题和日程，并拒绝错误主题', () => {
  const state = validateState({ version: 1, days: { '2026-11-02': { theme: '教学', items: [
    { id: 'lesson-1', title: '备课', startTime: '09:00', endTime: '10:00' }
  ] } } });
  assert.equal(state.days['2026-11-02'].theme, '教学');
  assert.equal(state.days['2026-11-02'].items[0].title, '备课');
  assert.throws(() => validateState({ version: 1, days: { '2026-11-02': { theme: '旅行', items: [] } } }));
});

test('通用版提供默认分类，并支持自定义分类和主题', () => {
  assert.deepEqual(DEFAULT_CATEGORIES, ['工作', '学习', '生活']);
  const state = validateState({ version: 1, days: { '2026-11-02': { theme: '志愿服务', items: [] } } }, { edition: 'general' });
  assert.deepEqual(state.categories, ['工作', '学习', '生活', '志愿服务']);
  assert.equal(state.days['2026-11-02'].theme, '志愿服务');
  assert.equal(state.language, 'zh-CN');
});

test('通用版保存中英文设置，旧备份默认中文且拒绝无效语言', () => {
  const backup = { version: 1, categories: ['工作', '学习', '生活'], days: {}, language: 'en-US' };
  assert.equal(validateState(backup, { edition: 'general' }).language, 'en-US');
  assert.throws(() => validateState({ ...backup, language: 'fr' }, { edition: 'general' }), /语言/);
  assert.equal(Object.hasOwn(validateState({ version: 1, days: {} }), 'language'), false);
});

test('通用版分类名称必须非空且不可重复', () => {
  assert.throws(() => validateState({ version: 1, categories: ['工作', '工作'], days: {} }, { edition: 'general' }));
  assert.throws(() => validateState({ version: 1, categories: [''], days: {} }, { edition: 'general' }));
});

test('分类数量和名称长度有上限，名称会去除首尾空格', () => {
  assert.deepEqual(cleanCategories([' 工作 ', '学习']), ['工作', '学习']);
  assert.throws(() => cleanCategories([]));
  assert.throws(() => cleanCategories(Array.from({ length: 21 }, (_, index) => `分类${index}`)));
  assert.throws(() => cleanCategories(['长'.repeat(21)]));
  assert.throws(() => cleanCategories(['工作', ' 工作 ']));
});

test('重复安排覆盖闰日、跨年，并拒绝空工作日范围和超量安排', () => {
  assert.deepEqual(createOccurrenceDates('2028-02-28', 'daily', '2028-03-01'), ['2028-02-28', '2028-02-29', '2028-03-01']);
  assert.deepEqual(createOccurrenceDates('2026-12-28', 'weekly', '2027-01-11'), ['2026-12-28', '2027-01-04', '2027-01-11']);
  assert.throws(() => createOccurrenceDates('2026-11-21', 'weekdays', '2026-11-22'), /没有工作日/);
  assert.throws(() => createOccurrenceDates('2027-01-01', 'daily', '2028-01-02'), /366/);
  assert.throws(() => createOccurrenceDates('2026-11-22', 'daily', '2026-11-21'));
});

test('次日零点后的安排可在前一天触发提前提醒', () => {
  const item = cleanItem({ title: '跨日提醒', startTime: '00:15', endTime: '00:45', reminderMinutes: 30 });
  const state = { days: { '2030-02-02': { items: [item] } } };
  assert.equal(dueReminders(state, new Date('2030-02-01T23:44:59').getTime()).length, 0);
  assert.equal(dueReminders(state, new Date('2030-02-01T23:45:00').getTime()).length, 1);
  assert.equal(dueReminders(state, new Date('2030-02-02T00:30:00').getTime()).length, 1);
  assert.equal(dueReminders(state, new Date('2030-02-02T00:30:01').getTime()).length, 0);
});

test('跨午夜仍会补发短时错过的提醒，完成和已提醒的安排不会重发', () => {
  const makeItem = changes => cleanItem({ title: '晚间安排', startTime: '23:55', endTime: '23:59', reminderMinutes: 0, ...changes });
  const state = { days: { '2030-02-01': { items: [makeItem({}), makeItem({ done: true }), makeItem({ notifiedAt: 1 }), makeItem({ reminderMinutes: null })] } } };
  const due = dueReminders(state, new Date('2030-02-02T00:05:00').getTime());
  assert.equal(due.length, 1);
  assert.equal(due[0].date, '2030-02-01');
  assert.equal(state.days['2030-02-01'].items[0].notifiedAt, null);
});

test('备份拒绝丢失、无效或同日重复的日程编号', () => {
  const valid = cleanItem({ id: 'valid-id', title: '安排', startTime: '09:00', endTime: '10:00' });
  const backup = items => ({ version: 1, days: { '2030-02-01': { theme: '', items } } });
  assert.throws(() => validateState(backup([{ ...valid, id: undefined }])), /编号/);
  assert.throws(() => validateState(backup([{ ...valid, id: '<script>' }])), /编号/);
  assert.throws(() => validateState(backup([valid, valid])), /重复/);
});
