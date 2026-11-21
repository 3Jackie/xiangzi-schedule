(() => {
  const byId = id => document.getElementById(id);
  let busy = false;
  function render(status = {}) {
    if (stateView.snapshot.edition === 'general') { byId('sync-button').hidden = true; return; }
    byId('sync-button').hidden = false;
    byId('sync-button').textContent = status.running ? '同步中…' : status.error ? '同步待重试' : status.conflicts?.length ? '同步需核对' : status.connected ? '已连接云同步' : '云同步';
    byId('sync-unpaired').hidden = !!status.connected;
    byId('sync-paired').hidden = !status.connected;
    byId('sync-status').textContent = status.running ? '正在合并两端日程…' : status.connected
      ? `已连接 ${status.endpoint}。${status.lastSync ? '上次成功：' + new Date(status.lastSync).toLocaleString('zh-CN') : '等待首次同步'}`
      : '尚未连接日程库，本机可正常离线使用。';
    const error = byId('sync-error');
    error.hidden = !status.error; error.textContent = status.error || '';
    byId('sync-conflicts').hidden = !status.conflicts?.length;
    const list = byId('sync-conflict-list'); list.replaceChildren();
    for (const conflict of status.conflicts || []) { const li = document.createElement('li'); li.textContent = conflict.message; list.append(li); }
    for (const button of byId('sync-dialog').querySelectorAll('button:not(#sync-close):not(#sync-copy)')) button.disabled = busy || status.running;
  }
  async function action(work) {
    if (busy) return;
    busy = true;
    try { await work(); }
    catch (error) { byId('sync-error').textContent = error.message; byId('sync-error').hidden = false; }
    finally { busy = false; for (const button of byId('sync-dialog').querySelectorAll('button')) button.disabled = false; }
  }
  function hideCode() { byId('sync-pairing-code').value = ''; byId('sync-code-field').hidden = true; }
  byId('sync-button').addEventListener('click', () => action(async () => {
    render(await window.xiangzi.syncStatus());
    byId('sync-dialog').showModal();
    if (window.xiangzi.reminderStatus) {
      const status = await window.xiangzi.reminderStatus();
      byId('mobile-reminder-status').hidden = false;
      byId('mobile-reminder-status').textContent = status.notifications ? (status.exact ? '手机通知与准时提醒已开启。' : '手机通知已开启；系统未允许准时提醒，可能有延迟。') : '手机通知尚未允许，提醒暂时不会显示。';
      byId('mobile-reminder-permission').hidden = status.notifications && status.exact;
    }
  }));
  byId('sync-close').addEventListener('click', () => byId('sync-dialog').close());
  byId('sync-dialog').addEventListener('close', () => { hideCode(); byId('sync-join-code').value = ''; byId('sync-setup').value = ''; });
  byId('sync-join-form').addEventListener('submit', event => { event.preventDefault(); action(async () => { render(await window.xiangzi.syncJoin(byId('sync-join-code').value)); byId('sync-join-code').value = ''; showToast('配对成功，两端日程已合并'); }); });
  byId('sync-create-form').addEventListener('submit', event => { event.preventDefault(); action(async () => { render(await window.xiangzi.syncCreate(byId('sync-url').value, byId('sync-setup').value)); byId('sync-setup').value = ''; showToast('私人日程库已创建'); }); });
  byId('sync-now').addEventListener('click', () => action(async () => { render(await window.xiangzi.syncNow()); showToast('同步完成'); }));
  byId('sync-reveal').addEventListener('click', () => action(async () => { byId('sync-pairing-code').value = await window.xiangzi.syncPairing(); byId('sync-code-field').hidden = false; }));
  byId('sync-copy').addEventListener('click', () => action(async () => {
    const text = byId('sync-pairing-code').value;
    if (window.xiangzi.copyText) await window.xiangzi.copyText(text); else await navigator.clipboard.writeText(text);
    showToast('配对码已复制，请只发给自己的设备');
  }));
  byId('sync-disconnect').addEventListener('click', () => action(async () => {
    if (!confirm('断开本机配对？本机日程与云端数据均保留。')) return;
    render(await window.xiangzi.syncDisconnect()); hideCode();
  }));
  byId('sync-clear-conflicts').addEventListener('click', () => action(async () => { await window.xiangzi.syncClearConflicts(); render(await window.xiangzi.syncStatus()); }));
  byId('mobile-reminder-permission').addEventListener('click', () => action(async () => { await window.xiangzi.requestReminders?.(); showToast('请在系统设置中允许通知与提醒，然后返回'); }));
  window.xiangzi.onStateChanged(snapshot => render(snapshot.sync));
  window.xiangzi.getState().then(snapshot => render(snapshot.sync)).catch(() => {});
})();
