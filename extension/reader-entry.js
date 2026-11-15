import {archiveData,readerData} from './export.mjs';
try{
  const uid=new URLSearchParams(location.search).get('uid');
  if(!/^\d+$/.test(uid||''))throw new Error('未选择档案');
  globalThis.ARCHIVE_DATA=readerData(await archiveData(uid));
  await import('./reader-runtime.js');
}catch(e){document.body.replaceChildren(Object.assign(document.createElement('p'),{textContent:'档案打开失败：'+e.message}));}
