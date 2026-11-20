(function (root) {
  const english = {
    '巷子日程首页': 'Xiangzi Schedule home', '搜索日程': 'Search schedules', '找一条日程': 'Search schedules',
    '清空搜索': 'Clear search', '导出备份': 'Export', '导入备份': 'Import', '打开数据文件夹': 'Open data folder',
    '日历': 'Calendar', '今天': 'Today', '日历视图': 'Calendar view', '月': 'Month', '周': 'Week',
    '上一个月或上一周': 'Previous month or week', '下一个月或下一周': 'Next month or week',
    '当天安排': 'Daily schedule', '新建安排': 'New event', '添加第一条安排': 'Add your first event',
    '安排一段时间': 'Make time for what matters', '编辑安排': 'Edit event', '保存修改': 'Save changes', '保存安排': 'Save event',
    '关闭': 'Close', '项目名称': 'Event name', '日期': 'Date', '提醒': 'Reminder', '不提醒': 'No reminder',
    '开始时': 'At start time', '提前 5 分钟': '5 minutes before', '提前 10 分钟': '10 minutes before',
    '提前 15 分钟': '15 minutes before', '提前 30 分钟': '30 minutes before', '提前 1 小时': '1 hour before',
    '开始时间': 'Start time', '结束时间': 'End time', '重复安排': 'Repeat', '不重复': 'Never', '每天': 'Daily',
    '每个工作日': 'Every weekday', '每周': 'Weekly', '重复到（含当天）': 'Repeat through', '备注': 'Notes',
    '可不填': 'Optional', '补充一些需要记住的内容': 'Anything else to remember', '取消': 'Cancel',
    '管理分类': 'Categories', '＋ 添加分类': '+ Add category', '保存分类': 'Save categories', '移除': 'Remove',
    '当天分类': 'Day category', '当天主题': 'Day theme', '所有分类': 'All categories', '所有主题': 'All themes',
    '按分类筛选': 'Filter by category', '按主题筛选': 'Filter by theme', '选择一个分类': 'Choose a category',
    '选择一个主题': 'Choose a theme', '今天是 {date}': 'Today is {date}', '所选日期': 'Selected date',
    '另有 {count} 项': '+{count} more', '{count} 项': '{count} events', '{date}，{category}，{count} 项安排': '{date}, {category}, {count} events',
    '未分类': 'Uncategorized', '未选主题': 'No theme', '没有匹配安排': 'No matching events', '暂无安排': 'No events',
    '搜索结果': 'Search results', '筛选结果': 'Filtered events', '取消完成': 'Mark incomplete', '标记完成': 'Mark complete',
    '编辑': 'Edit', '删除': 'Delete', '没有找到匹配的安排': 'No matching events', '这一天还没有安排': 'Nothing planned yet',
    '试试换个关键词或分类。': 'Try a different keyword or category.', '试试换个关键词或主题。': 'Try a different keyword or theme.',
    '选好分类，再把要做的事放进日历。': 'Choose a category and add your plans.', '选好主题，再把要做的事放进日历。': 'Choose a theme and add your plans.',
    '操作没有完成，请再试一次。': 'The action could not be completed. Please try again.',
    '例如：项目会议、读书、锻炼': 'For example: team meeting, reading, exercise', '例如：备课、听课、整理资料': 'For example: lesson planning, class observation',
    '分类名称': 'Category name', '新分类名称': 'New category name', '输入分类名称': 'Enter a category name',
    '请至少保留一个分类，并填写完整名称。': 'Keep at least one category and enter a name for each.',
    '最多可以设置 20 个分类。': 'You can have up to 20 categories.', '分类名称不能超过 20 个字。': 'Category names can contain up to 20 characters.',
    '分类名称不能重复。': 'Category names must be unique.', '分类已保存': 'Categories saved',
    '分类没有保存，请再试一次。': 'Categories could not be saved. Please try again.', '请选择日期': 'Choose a date',
    '请选择重复结束日期': 'Choose a repeat end date', '重复结束日期不能早于开始日期': 'The repeat end date cannot be before the start date',
    '安排已更新': 'Event updated', '安排已添加': 'Event added', '重复安排已添加': 'Recurring events added',
    '保存失败，请检查填写内容。': 'Could not save. Check the event details.', '安排已删除': 'Event deleted',
    '已标记完成': 'Marked complete', '已恢复为待办': 'Marked incomplete', '当天分类已设为{value}': 'Day category set to {value}',
    '当天分类已清除': 'Day category cleared', '当天主题已设为{value}': 'Day theme set to {value}', '当天主题已清除': 'Day theme cleared',
    '备份已导出': 'Backup exported', '备份已恢复': 'Backup restored', '切换为英文': 'Switch to English', '切换为中文': 'Switch to Chinese',
    '工作': 'Work', '学习': 'Study', '生活': 'Life', '语言设置无效': 'Invalid language setting',
    '此版本不支持更改语言': 'This edition does not support changing the language',
    '巷子日程 · 日程提醒': 'Xiangzi Schedule · Reminders', '打开巷子日程': 'Open Xiangzi Schedule', '退出巷子日程': 'Quit Xiangzi Schedule',
    '移除“{name}”？': 'Remove “{name}”?', '移除分类': 'Remove category',
    '保存分类后，使用该分类的日期会变为未分类，其中的日程会保留。': 'When you save, dates using this category will become uncategorized. Their events will be kept.',
    '确定删除“{title}”吗？': 'Delete “{title}”?', '删除安排': 'Delete event',
    '导出巷子日程备份': 'Export Xiangzi Schedule backup', '导入巷子日程备份': 'Import Xiangzi Schedule backup',
    'JSON 备份': 'JSON backup', '恢复备份并替换当前日程': 'Restore and replace events', '备份中有 {count} 条日程。': 'This backup contains {count} events.',
    '恢复前会保留当前数据副本。恢复将替换本机现有日程。': 'Your current data will be copied before restoring. Restoring replaces existing events on this device.',
    '请先导入有效备份，再继续修改日程。': 'Import a valid backup before making changes.',
    '本机日程文件无法读取，已保留一份恢复副本。请导入有效备份后再继续修改。{error}': 'The local schedule file could not be read. A recovery copy was retained. Import a valid backup before editing. {error}',
    '分类数量需要在 1–20 个之间': 'Use between 1 and 20 categories', '分类名称请控制在 1–20 个字': 'Category names must contain 1–20 characters',
    '分类名称不能重复': 'Category names must be unique', '请选择有效的重复日期范围': 'Choose a valid repeat date range',
    '重复方式无效': 'Invalid repeat frequency', '单次最多创建 366 个重复日程': 'You can create up to 366 recurring events at a time',
    '所选范围内没有工作日，请调整日期': 'There are no weekdays in this range. Choose different dates',
    '日程内容无效': 'Invalid event details', '日程名称请控制在 1–120 个字': 'Event names must contain 1–120 characters',
    '请填写有效时间，并确保结束时间晚于开始时间': 'Enter valid times. The end time must be after the start time', '提醒时间无效': 'Invalid reminder time',
    '备份文件格式不正确': 'Invalid backup format', '备份中包含无效日期': 'The backup contains an invalid date',
    '备份中包含无效主题': 'The backup contains an invalid category', '备份中包含无效日程编号': 'The backup contains an invalid event ID',
    '同一天中存在重复日程编号': 'The backup contains duplicate event IDs for the same date', '日程总数不能超过 20000 项': 'You can store up to 20,000 events',
    '计划文件无法读取。请先导入有效备份，再继续修改日程。': 'The schedule file could not be read. Import a valid backup before editing.',
    '请选择有效日期': 'Choose a valid date', '请求来源无效': 'Invalid request source', '请选择有效主题': 'Choose a valid category',
    '此版本不支持自定义分类': 'This edition does not support custom categories', '分类改名格式无效': 'Invalid category rename data',
    '分类不存在': 'This category no longer exists', '这条日程已不存在': 'This event no longer exists',
    '当前数据无法读取，请先打开数据文件夹保留恢复副本。': 'Current data could not be read. Open the data folder and keep a recovery copy first.',
    '备份文件不能超过 20 MB': 'Backup files cannot exceed 20 MB'
  };
  function translate(language, text, values = {}) {
    const template = language === 'en-US' && Object.hasOwn(english, text) ? english[text] : text;
    return template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  }
  function errorMessage(language, message) {
    const text = String(message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
    return translate(language, text);
  }
  const api = { translate, errorMessage, english };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XiangziI18n = api;
})(typeof window === 'undefined' ? globalThis : window);
