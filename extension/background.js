import {inspectAccount} from './bridge.js';

chrome.action.onClicked.addListener(async tab => {
  let connection;
  try {
    if (!tab.id || !tab.url?.startsWith('https://weibo.com/')) throw new Error('先打开微博并登录，再在微博页面点击扩展图标。也可以直接导入已有 JSON。');
    const [result] = await chrome.scripting.executeScript({target: {tabId: tab.id}, world: 'MAIN', func: inspectAccount});
    if (!result?.result || result.result.error) throw new Error(result?.result?.error || '无法读取账号，请刷新微博后重试。');
    connection = {tabId: tab.id, profile: result.result.profile, connectedAt: Date.now()};
  } catch (e) { connection = {error: e.message}; }
  await chrome.storage.session.set({connection});
  const {dashboardTabId} = await chrome.storage.session.get('dashboardTabId');
  try {
    if (!dashboardTabId) throw new Error('new');
    const existing = await chrome.tabs.get(dashboardTabId);
    if (existing.url !== chrome.runtime.getURL('index.html')) throw new Error('new');
    await chrome.tabs.update(dashboardTabId, {active: true});
    await chrome.windows.update(existing.windowId, {focused: true});
  } catch {
    const created = await chrome.tabs.create({url: chrome.runtime.getURL('index.html')});
    await chrome.storage.session.set({dashboardTabId: created.id});
  }
});
