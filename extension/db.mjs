import {idOf, bestPost} from './core.mjs';
const req = r => new Promise((resolve,reject) => {r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const done = tx => new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('本地数据库保存失败'));tx.onerror=()=>{};});
let opening;
function open() {
  return opening ||= new Promise((resolve,reject)=>{
    const r=indexedDB.open('weibo-time-archive',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('accounts',{keyPath:'uid'});r.result.createObjectStore('posts',{keyPath:['uid','id']});r.result.createObjectStore('pages',{keyPath:['uid','page']});};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    r.onblocked=()=>reject(new Error('数据库被旧页面阻塞，请关闭其他档案工具标签页。'));
  });
}
const range=uid=>IDBKeyRange.bound([uid,''],[uid,'\uffff']);
export async function listAccounts(){const db=await open();return req(db.transaction('accounts').objectStore('accounts').getAll());}
export async function readArchive(uid){
  const db=await open(),tx=db.transaction(['accounts','posts','pages']);
  const [meta,records,pages]=await Promise.all([req(tx.objectStore('accounts').get(uid)),req(tx.objectStore('posts').getAll(range(uid))),req(tx.objectStore('pages').getAll(IDBKeyRange.bound([uid,0],[uid,Number.MAX_SAFE_INTEGER])))]);
  return {meta:meta||{uid,page:1,sinceId:'',endCandidate:false},posts:records.map(r=>r.raw),pages:pages.sort((a,b)=>a.page-b.page)};
}
function putPosts(tx,uid,posts){
  const store=tx.objectStore('posts');
  for(const raw of posts){const id=idOf(raw),r=store.get([uid,id]);r.onsuccess=()=>store.put({uid,id,raw:bestPost(r.result?.raw,raw)});}
}
export async function savePage(uid,record,meta){
  const db=await open(),tx=db.transaction(['accounts','posts','pages'],'readwrite'),complete=done(tx);
  putPosts(tx,uid,record.response.data.list);
  tx.objectStore('pages').put({...record,uid});tx.objectStore('accounts').put({...meta,uid});await complete;
}
export async function saveStatus(uid,changes){
  const db=await open(),tx=db.transaction('accounts','readwrite'),complete=done(tx),store=tx.objectStore('accounts');
  const r=store.get(uid);r.onsuccess=()=>store.put({page:1,sinceId:'',endCandidate:false,...r.result,...changes,uid,updatedAt:new Date().toISOString()});await complete;
}
export async function importArchive(parsed,filename){
  const db=await open(),tx=db.transaction(['accounts','posts'],'readwrite'),complete=done(tx),accounts=tx.objectStore('accounts');
  putPosts(tx,parsed.uid,parsed.posts);
  const r=accounts.get(parsed.uid);r.onsuccess=()=>{
    const existing=r.result;const imports=[...new Set([...(existing?.imports||[]),filename])];
    accounts.put({uid:parsed.uid,page:1,sinceId:'',endCandidate:false,...existing,
      profile:{...parsed.profile,...existing?.profile},imports,updatedAt:new Date().toISOString()});
  };await complete;
}
