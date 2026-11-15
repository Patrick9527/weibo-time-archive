import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseBackup,validatePage,summarize,normalize,safeURL,scriptJSON} from '../extension/core.mjs';
import {runBackup} from '../extension/engine.mjs';
import {inspectAccount,readPage} from '../extension/bridge.js';
const uid='12345678';
const post=(id,author=uid)=>({idstr:String(id),created_at:'Tue Mar 16 18:23:18 +0800 2021',user:{idstr:author,screen_name:author===uid?'测试用户':'其他作者'},text_raw:'测试正文 '+id});
const response=(list,next,total=4)=>({ok:1,data:{list,since_id:next,total}});
function memoryDB(){
  let meta={uid,page:1,sinceId:'',endCandidate:false},posts=new Map(),pages=[];
  return {readArchive:async()=>structuredClone({meta,posts:[...posts.values()],pages}),
    saveStatus:async(_,changes)=>{meta={...meta,...changes}},
    savePage:async(_,page,state)=>{pages.push(structuredClone(page));page.response.data.list.forEach(p=>posts.set(p.idstr,p));meta=structuredClone(state);}};
}
test('use response cursor across three pages; archive foreign authors without failing',async()=>{
  const db=memoryDB(),requests=[];const responses=[response([post(10),post(9)],'8'),response([post(8),post(7,'999')],'6'),response([],'6')];
  const out=await runBackup({uid,profile:{uid},...db,interval:0,requestPage:async(page,cursor)=>{requests.push([page,cursor]);return {json:responses.shift(),url:'https://weibo.com/ajax/statuses/mymblog'}}});
  assert.deepEqual(requests,[[1,''],[2,'8'],[3,'6']]);assert.equal(out.ended,true);
  const saved=await db.readArchive();assert.equal(saved.posts.length,4);assert.equal(saved.meta.endCandidate,true);
  assert.equal(summarize(saved.posts,uid).ownPosts,3);
});
test('network failure retains last committed cursor and resume retries same page',async()=>{
  const db=memoryDB();let requests=0;
  await assert.rejects(runBackup({uid,profile:{uid},...db,interval:0,requestPage:async()=>{if(requests++)throw new Error('网络断开');return {json:response([post(10)],'9')};}}),/网络断开/);
  const saved=await db.readArchive();assert.equal(saved.meta.page,2);assert.equal(saved.meta.sinceId,'9');assert.equal(saved.posts.length,1);
  let retried;await runBackup({uid,profile:{uid},...db,interval:0,requestPage:async(p,c)=>{retried=[p,c];return {json:response([],'0')};}});
  assert.deepEqual(retried,[2,'9']);
});
test('duplicate page stops without advancing checkpoint or declaring completion',async()=>{
  const db=memoryDB();await assert.rejects(runBackup({uid,profile:{uid},...db,interval:0,requestPage:async p=>({json:response([post(10)],p===1?'9':'8')})}),/整页重复/);
  const a=await db.readArchive();assert.equal(a.meta.page,2);assert.equal(a.meta.endCandidate,false);assert.equal(a.pages.length,1);
});
test('failed local save never triggers another request or advances durable checkpoint',async()=>{
  const db=memoryDB();let requests=0;
  await assert.rejects(runBackup({uid,profile:{uid},...db,savePage:async()=>{throw new Error('磁盘空间不足')},interval:0,requestPage:async()=>{requests++;return {json:response([post(1)],'2')};}}),/磁盘空间不足/);
  assert.equal(requests,1);assert.equal((await db.readArchive()).meta.page,1);
});
test('pause finishes saving in-flight page; next run resumes rather than restarting',async()=>{
  const db=memoryDB();let paused=false;
  const result=await runBackup({uid,profile:{uid},...db,interval:0,shouldStop:()=>paused,onProgress:()=>{paused=true},requestPage:async()=>({json:response([post(2)],'1')})});
  assert.equal(result.paused,true);assert.equal((await db.readArchive()).meta.page,2);
});
test('reject rate limit responses, malformed IDs, cursor cycles; empty last page remains a candidate',()=>{
  assert.throws(()=>validatePage({ok:0}, {sinceId:''},new Set(),new Set()),/接口返回异常/);
  assert.throws(()=>validatePage(response([{}],'1'),{},new Set(),new Set()),/无效博文/);
  assert.throws(()=>validatePage(response([post(2)],'1'),{sinceId:'1'},new Set(),new Set()),/重复游标/);
  assert.equal(validatePage(response([],'1'),{sinceId:'1'},new Set(),new Set()).endCandidate,true);
});
test('import and deduplicate original and merged backup formats, enforce account UID',()=>{
  const input={uid,pages:[{response:response([post(1),post(1)],'0')}]};assert.equal(parseBackup(input).posts.length,1);
  assert.equal(parseBackup({report:{uid},posts:[post(2)]}).profile.name,'测试用户');
  assert.throws(()=>parseBackup({uid:'123',posts:[post(2)]}),/对应账号/);
  assert.throws(()=>parseBackup({uid,posts:[{id:'1',date:'2021',text:'normalized'}]}),/原始博文/);
});
test('normalize arbitrary user with private content, inaccessible reposts and online media',()=>{
  const p={...post(1),visible:{type:1},isLongText:true,retweeted_status:{...post(2,'999'),user:null,text_raw:'原微博不可见'},
    pic_ids:['p'],pic_infos:{p:{original:{url:'http://wx1.sinaimg.cn/large/p.jpg'}}}};
  const normalized=normalize(p,x=>x);assert.equal(normalized.uid,uid);assert.equal(normalized.private,true);assert.equal(normalized.long,true);
  assert.equal(normalized.date,'2021-03-16T18:23:18+08:00');assert.equal(normalized.repost.text,'原微博不可见');
  assert.equal(normalized.photos[0].full,'https://wx1.sinaimg.cn/large/p.jpg');
});
test('safe URLs and embedded JSON prevent executable archive data',()=>{
  assert.equal(safeURL('javascript:alert(1)'),'');assert.equal(safeURL('data:text/html,<script>'), '');
  const value={name:'</script><script>alert(1)</script>',line:'\u2028'};const serialized=scriptJSON(value);
  assert.equal(serialized.includes('</script>'),false);assert.deepEqual(JSON.parse(serialized),value);
});
test('bridge reads only current account profile; account changes stop before fetch',async()=>{
  const context={location:{origin:'https://weibo.com'},window:{$CONFIG:{user:{idstr:uid,screen_name:'测试',cookie:'secret'}}}};
  vm.createContext(context);const profile=vm.runInContext(`(${inspectAccount.toString()})()`,context);
  assert.equal(profile.profile.uid,uid);assert.equal('cookie' in profile.profile,false);
  const result=await vm.runInContext(`(${readPage.toString()})('999',1,'')`,context);
  assert.match(result.error,/账号已改变/);
});
test('merge overlapping backups without needing any personal fixtures',()=>{
  const first=parseBackup({uid,pages:[{response:response([post(3),post(2)],'1')}]});
  const second=parseBackup({uid,pages:[{response:response([post(3),post(2),post(1),post(4,'999')],'0')}]});
  const records=new Map([...first.posts,...second.posts].map(p=>[p.idstr,p]));
  const report=summarize([...records.values()],uid);
  assert.equal(report.uniqueRecords,4);assert.equal(report.ownPosts,3);assert.equal(report.otherOrUnknownAuthors,1);
});
test('package has no private snapshots or embedded executable scripts in extension pages',()=>{
  const base=new URL('../extension/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',base)));
  assert.equal(manifest.manifest_version,3);assert.equal(manifest.permissions.includes('cookies'),false);assert.equal(manifest.host_permissions,undefined);
  for(const file of ['index.html','preview.html','privacy.html']){
    const html=fs.readFileSync(new URL(file,base),'utf8');assert.equal(/<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html),false,file);
    assert.equal(/on(?:click|error|load)\s*=/i.test(html),false,file);
  }
  const runtime=fs.readFileSync(new URL('reader-runtime.js',base),'utf8');new vm.Script(runtime);
  for(const file of ['reader-template.html','reader-runtime.js','preview.html'])assert.equal(fs.readFileSync(new URL(file,base),'utf8').includes('WBPSESS='),false);
});
test('generic reader boots for a different UID and renders correct account counts and escaped content',()=>{
  const posts=[normalize({...post(1),text_raw:'<img src=x onerror=alert(1)>'},x=>x),normalize(post(2,'999'),x=>x)];
  const data={posts,profile:{uid,name:'另一个账号',description:'测试简介',following:12,followers:3},report:summarize([post(1),post(2,'999')],uid)};
  const elements=new Map(),lists=new Map();
  const node=()=>({style:{},classList:{toggle(){}},addEventListener(){},setAttribute(){},scrollIntoView(){}});
  const element=s=>{if(!elements.has(s))elements.set(s,node());return elements.get(s)};
  const context={ARCHIVE_DATA:data,console,localStorage:{getItem:()=>null,setItem(){}},
    document:{querySelector:element,querySelectorAll:s=>{
      if(['.profile-meta span','.profile-stats strong','.stat-line b','#archive-details li'].includes(s)){
        if(!lists.has(s))lists.set(s,Array.from({length:s==='#archive-details li'?5:3},node));return lists.get(s);
      }return [];
    },addEventListener(){}},IntersectionObserver:class{observe(){}disconnect(){}},setTimeout,clearTimeout};
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../extension/reader-runtime.js',import.meta.url),'utf8'),context);
  assert.equal(context.document.title,'另一个账号 的微博个人档案');
  assert.equal(element('.profile h1').textContent,'另一个账号');assert.equal(element('#result-count').textContent,'共 1 条');
  assert.equal(element('#feed').innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'),true);
  assert.equal(element('#feed').innerHTML.includes('其他作者'),false);
  assert.equal(lists.get('.profile-stats strong')[2].textContent,'1');
});
