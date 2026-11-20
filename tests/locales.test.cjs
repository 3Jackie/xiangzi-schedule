const test = require('node:test');
const assert = require('node:assert/strict');
const { translate, errorMessage, english } = require('../src/locales.js');

test('中英文文案保留占位参数，并且不会翻译用户输入', () => {
  assert.equal(translate('en-US', '确定删除“{title}”吗？', { title: '我的安排' }), 'Delete “我的安排”?');
  assert.equal(translate('zh-CN', '当天分类已设为{value}', { value: '工作' }), '当天分类已设为工作');
  assert.equal(translate('en-US', '用户自己写的标题'), '用户自己写的标题');
  assert.equal(translate('en-US', 'constructor'), 'constructor');
});

test('英文错误提示可去除 Electron IPC 前缀，翻译字典没有空值或遗漏参数', () => {
  assert.equal(errorMessage('en-US', "Error invoking remote method 'add-item': Error: 提醒时间无效"), 'Invalid reminder time');
  for (const [source, translated] of Object.entries(english)) {
    assert.ok(translated.trim());
    assert.deepEqual([...source.matchAll(/\{\w+\}/g)].map(match => match[0]).sort(), [...translated.matchAll(/\{\w+\}/g)].map(match => match[0]).sort(), source);
  }
});
