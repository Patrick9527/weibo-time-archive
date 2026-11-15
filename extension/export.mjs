import {normalize,summarize,scriptJSON} from './core.mjs';
import {readArchive} from './db.mjs';
export function plainHTML(html){
  const doc=new DOMParser().parseFromString(String(html),'text/html');
  doc.querySelectorAll('script,style,iframe,object').forEach(n=>n.remove());
  doc.querySelectorAll('img').forEach(n=>n.replaceWith(doc.createTextNode(n.getAttribute('alt')||'')));
  doc.querySelectorAll('br').forEach(n=>n.replaceWith(doc.createTextNode('\n')));
  return doc.body.textContent||'';
}
export async function archiveData(uid){
  const archive=await readArchive(uid),profile=archive.meta.profile||{uid,name:uid};
  const report=summarize(archive.posts,uid,archive.meta.reportedTotal??profile.reportedTotal);
  return {...archive,profile,report};
}
export function readerData(archive){return {profile:archive.profile,report:archive.report,
  posts:archive.posts.map(p=>normalize(p,plainHTML)).sort((a,b)=>b.date.localeCompare(a.date))};}
export async function saveFile(name,content,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  try{return await chrome.downloads.download({url,filename:name,saveAs:false,conflictAction:'uniquify'});}
  finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}
}
export async function downloadJSON(uid){
  const a=await archiveData(uid);
  const output={schema:2,uid,profile:a.profile,exportedAt:new Date().toISOString(),report:a.report,state:a.meta,posts:a.posts,pages:a.pages};
  return saveFile(`微博时光档案/${uid}/weibo-${uid}-${a.report.uniqueRecords}.json`,JSON.stringify(output,null,2),'application/json');
}
export async function makeHTML(uid){
  const a=await archiveData(uid);
  const [template,runtime]=await Promise.all(['reader-template.html','reader-runtime.js'].map(async path=>{
    const r=await fetch(chrome.runtime.getURL(path));if(!r.ok)throw new Error('阅读器模板缺失');return r.text();
  }));
  return template.replace('__ARCHIVE_DATA__',()=>scriptJSON(readerData(a)))
    .replace('__ARCHIVE_RUNTIME__',()=>runtime.replace(/<\/script/gi,'<\\/script'));
}
export async function downloadHTML(uid){return saveFile(`微博时光档案/${uid}/微博个人档案-${uid}.html`,await makeHTML(uid),'text/html;charset=utf-8');}
