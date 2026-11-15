export const idOf = p => String(p?.idstr ?? p?.id ?? '');
export const authorOf = p => String(p?.user?.idstr ?? p?.user?.id ?? '');
export function safeURL(value) {
  let s = String(value || '');
  if (s.startsWith('//')) s = 'https:' + s;
  if (s.startsWith('http://')) s = 'https://' + s.slice(7);
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
export function bestPost(a, b) {
  if (!a) return b;
  const score = p => (p.longTextContent?.length || 0) * 10 + (p.text_raw?.length || 0) * 4 + JSON.stringify(p).length;
  return score(b) >= score(a) ? b : a;
}
export function validatePage(json, state, seen, cursors) {
  if (Number(json?.ok) !== 1 || !Array.isArray(json?.data?.list)) throw new Error('接口返回异常。请在微博检查登录、验证码或访问限制后重新连接。');
  const list = json.data.list;
  if (list.some(p => !p || typeof p !== 'object' || !/^\d+$/.test(idOf(p)))) throw new Error('响应中存在无效博文 ID，已停止并保留断点。');
  const next = String(json.data.since_id ?? '');
  if (next && !/^\d+$/.test(next)) throw new Error('分页游标格式异常，已停止。');
  const fresh = list.filter(p => !seen.has(idOf(p))).length;
  if (list.length && !fresh) throw new Error('接口返回整页重复内容，已停止；这不代表备份完成。');
  if (list.length && next && next !== '0' && (next === state.sinceId || cursors.has(next))) throw new Error('接口返回重复游标，已停止；这不代表备份完成。');
  return {list, next, fresh, endCandidate: !list.length || !next || next === '0'};
}
export function parseBackup(input) {
  const uid = String(input?.uid ?? input?.report?.uid ?? '');
  if (!/^\d+$/.test(uid)) throw new Error('JSON 中缺少有效账号 UID。请导入原始备份 JSON。');
  let rows = [];
  if (Array.isArray(input.posts)) rows.push(...input.posts);
  if (Array.isArray(input.pages)) for (const page of input.pages) {
    if (!Array.isArray(page?.response?.data?.list)) throw new Error('JSON 分页结构无效。');
    rows.push(...page.response.data.list);
  }
  if (!rows.length) throw new Error('没有找到博文记录。');
  const posts = new Map();
  for (const post of rows) {
    if (!post || !/^\d+$/.test(idOf(post)) || !('created_at' in post)) throw new Error('此文件不是原始博文备份。请使用含 created_at 的接口 JSON，阅读器筛选导出暂不支持。');
    posts.set(idOf(post), bestPost(posts.get(idOf(post)), post));
  }
  const own = [...posts.values()].find(p => authorOf(p) === uid);
  if (!own) throw new Error('备份中没有找到对应账号的博文，请检查 UID。');
  const user = own.user || {};
  const profile = {uid, name: user.screen_name || uid, avatar: user.avatar_large || user.profile_image_url || '',
    description: user.description || '', location: user.location || '', cover: user.cover_image_phone || '',
    followers: user.followers_count ?? null, following: user.friends_count ?? null,
    reportedTotal: input.report?.reportedTotal ?? input.state?.reportedTotal ?? null, ...input.profile, uid};
  return {uid, posts: [...posts.values()], profile};
}
export function isoDate(raw) {
  const ms = Date.parse(raw || '');
  return Number.isFinite(ms) ? new Date(ms + 8 * 3600000).toISOString().slice(0, 19) + '+08:00' : '';
}
export function normalize(post, plain, nested = false) {
  const user = post.user || {}, page = post.page_info || {}, media = page.media_info || {};
  const photos = (post.pic_ids || []).flatMap(pid => {
    const info = post.pic_infos?.[pid] || {};
    const full = ['largest','original','large'].map(k => safeURL(info[k]?.url)).find(Boolean);
    return full ? [{src: safeURL(info.bmiddle?.url) || full, full}] : [];
  });
  const video = (media.playback_list || []).filter(p => p.play_info?.mime === 'video/mp4').map(p => safeURL(p.play_info.url)).find(Boolean)
    || safeURL(media.mp4_hd_url || media.stream_url_hd || media.stream_url);
  const result = {id: idOf(post), bid: post.mblogid || '', uid: authorOf(post), name: user.screen_name || '原微博不可见',
    avatar: safeURL(user.avatar_large || user.profile_image_url), date: isoDate(post.created_at),
    text: typeof post.text_raw === 'string' ? post.text_raw : plain(post.text || ''), source: plain(post.source || ''),
    private: post.title?.text === '仅自己可见' || post.visible?.type === 1, long: Boolean(post.isLongText), photos, video,
    cover: safeURL(page.page_pic), cardTitle: page.page_title || '', cardUrl: safeURL(media.h5_url || page.page_url),
    videoCard: page.object_type === 'video', counts: [post.reposts_count || 0, post.comments_count || 0, post.attitudes_count || 0],
    links: (post.url_struct || []).map(l => ({short: l.short_url || '', title: l.url_title || '', url: safeURL(l.long_url || l.ori_url)}))};
  if (!nested && post.retweeted_status) result.repost = normalize(post.retweeted_status, plain, true);
  return result;
}
export function summarize(raw, uid, reportedTotal = null) {
  const own = raw.filter(p => authorOf(p) === uid), dates = own.map(p => isoDate(p.created_at)).filter(Boolean).sort();
  return {uid, uniqueRecords: raw.length, ownPosts: own.length, otherOrUnknownAuthors: raw.length-own.length,
    reportedTotal, earliest: dates[0] || '', latest: dates.at(-1) || '', longTextRecords: raw.filter(p => p.isLongText).length};
}
export const scriptJSON = data => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
