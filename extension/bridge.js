// These functions are serialized by chrome.scripting; keep them self-contained.
export function inspectAccount() {
  if (location.origin !== 'https://weibo.com') return {error: '请在已登录的 weibo.com 页面点击扩展图标。'};
  const user = window.$CONFIG?.user;
  const uid = String(user?.idstr ?? user?.id ?? '');
  if (!/^\d+$/.test(uid) || !user?.screen_name) return {error: '未识别到登录账号。请登录并打开自己的主页，再点击扩展图标。'};
  return {profile: {uid, name: String(user.screen_name), description: String(user.description || ''),
    location: String(user.location || ''), avatar: String(user.avatar_large || user.profile_image_url || ''),
    cover: String(user.cover_image_phone || ''), followers: user.followers_count ?? null,
    following: user.friends_count ?? null, reportedTotal: user.statuses_count ?? null}};
}

export async function readPage(uid, page, sinceId) {
  try {
    if (location.origin !== 'https://weibo.com') throw new Error('微博页面已离开，请重新连接。');
    const current = String(window.$CONFIG?.user?.idstr ?? window.$CONFIG?.user?.id ?? '');
    if (current !== uid) throw new Error('登录账号已改变或登录失效，请重新连接，避免混入其他账号的数据。');
    if (!/^\d+$/.test(uid) || !Number.isInteger(page) || page < 1 || (sinceId && !/^\d+$/.test(sinceId))) throw new Error('备份参数无效。');
    const url = new URL('/ajax/statuses/mymblog', location.origin);
    url.search = new URLSearchParams({uid, page: String(page), feature: '0', ...(sinceId ? {since_id: sinceId} : {})});
    const response = await fetch(url.href, {credentials: 'same-origin', cache: 'no-store',
      headers: {accept: 'application/json', 'x-requested-with': 'XMLHttpRequest'}, signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`微博返回 HTTP ${response.status}，请求已停止。`);
    const json = await response.json();
    return {json, url: url.href};
  } catch (e) { return {error: String(e.message || e)}; }
}
