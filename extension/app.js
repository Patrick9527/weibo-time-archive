import * as db from './db.mjs';
import {parseBackup,summarize} from './core.mjs';
import {readPage,inspectAccount} from './bridge.js';
import {runBackup} from './engine.mjs';
import {downloadJSON,downloadHTML} from './export.mjs';
const $=id=>document.getElementById(id);
let connection=null,selected='',running=false,paused=false,busy=false,accounts=[];
const format=n=>n==null?'—':Number(n).toLocaleString();
function log(text){const li=document.createElement('li');li.textContent=new Date().toLocaleTimeString('zh-CN')+' · '+text;$('logs').prepend(li);while($('logs').children.length>100)$('logs').lastElementChild.remove();}
function error(text){$('error').hidden=!text;$('error').textContent=text||'';}
function toast(text){$('toast').textContent=text;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',4000);}
function controls(hasData=false,endCandidate=false){
  const connected=connection?.profile?.uid===selected&&!connection.error;
  $('start').disabled=running||busy||!connected||endCandidate;
  $('pause').disabled=!running||paused;
  for(const id of ['json','html','preview'])$(id).disabled=busy||!hasData;
  $('accounts').disabled=running||busy;$('import').disabled=running||busy;
}
async function refresh(){
  accounts=await db.listAccounts();
  const options=new Map(accounts.map(a=>[a.uid,a.profile?.name||a.uid]));
  if(connection?.profile)options.set(connection.profile.uid,connection.profile.name);
  if(!selected||!options.has(selected))selected=connection?.profile?.uid||options.keys().next().value||'';
  $('accounts').replaceChildren();
  for(const [uid,name]of options){const option=document.createElement('option');option.value=uid;option.textContent=`${name} · ${uid}`;$('accounts').append(option);}
  if(!options.size){const o=document.createElement('option');o.textContent='暂无档案';o.value='';$('accounts').append(o);}
  $('accounts').value=selected;
  const profile=connection?.profile?.uid===selected?connection.profile:accounts.find(a=>a.uid===selected)?.profile;
  $('account-summary').hidden=!profile;
  if(profile){$('account-name').textContent=profile.name;$('account-uid').textContent='UID '+profile.uid;$('account-avatar').textContent=profile.name.slice(0,1);}
  $('connection').classList.toggle('connected',Boolean(connection?.profile));
  $('connection').textContent=connection?.profile?`已连接微博账号 ${connection.profile.name}。可备份当前登录账号；其他档案可离线查看。`:(connection?.error||'请在已登录的微博页面点击工具栏的“微博时光档案”图标。');
  if(!selected){controls(false);return;}
  const a=await db.readArchive(selected),report=summarize(a.posts,selected,a.meta.reportedTotal??profile?.reportedTotal);
  $('count').textContent=format(report.ownPosts);$('page-count').textContent=format(a.pages.length);$('total').textContent=format(report.reportedTotal);
  const pct=report.reportedTotal>0?Math.min(100,report.ownPosts/report.reportedTotal*100):0;
  $('progress').style.width=pct+'%';
  const statuses={running:running?'备份中':'可续传',paused:'已暂停',error:'已停止',ended:'读取结束，待核对'};
  $('account-status').textContent=statuses[a.meta.status]||(a.posts.length?'已导入':'待开始');
  $('range').textContent=report.earliest?`${report.earliest.slice(0,10)} — ${report.latest.slice(0,10)}`:'尚无内容';
  $('progress-label').textContent=a.meta.endCandidate?`已遇到接口结束信号。本人 ${report.ownPosts} 条，其他作者/未知 ${report.otherOrUnknownAuthors} 条；请核对完整性。`:
    a.pages.length?`已保存 ${a.pages.length} 页，下一页 ${a.meta.page}。${a.meta.reason||'进度会逐页保存在本地。'}`:
    a.posts.length?`已导入 ${report.uniqueRecords} 条唯一记录，可以直接下载或预览档案。`:'准备就绪。每页间隔约 4 秒，异常会自动停止。';
  $('start').textContent=a.pages.length?'继续备份':'开始备份';controls(a.posts.length>0,a.meta.endCandidate);
}
async function updateConnection(){
  const result=await chrome.storage.session.get('connection');connection=result.connection||null;
  if(connection?.profile&&!running)selected=connection.profile.uid;
  await refresh();
}
async function withLock(callback){
  return navigator.locks.request('weibo-time-archive-job',{ifAvailable:true},async lock=>{
    if(!lock)throw new Error('另一个档案工作台正在处理数据，请先暂停该任务。');
    return callback();
  });
}
async function exportFiles(kind,uid=selected){
  if(!uid)return;
  busy=true;error('');await refresh();
  try{
    if(kind==='json'||kind==='both')await downloadJSON(uid);
    if(kind==='html'||kind==='both')await downloadHTML(uid);
    log('已提交文件下载，请在 Chrome 下载记录中确认保存成功。');toast('已提交下载，请检查下载记录。');
  }catch(e){error('导出失败：'+e.message);log('导出失败：'+e.message);}
  finally{busy=false;await refresh();}
}
$('start').onclick=async()=>{
  if(running||busy||!connection?.profile||connection.profile.uid!==selected)return;
  const source={...connection},uid=source.profile.uid;
  paused=false;error('');running=true;controls();log('开始备份账号 '+source.profile.name);
  let outcome;
  try{
    outcome=await withLock(async()=>{
      const [checked]=await chrome.scripting.executeScript({target:{tabId:source.tabId},world:'MAIN',func:inspectAccount});
      if(checked?.result?.profile?.uid!==uid)throw new Error('账号连接已失效。请在微博重新点击扩展图标。');
      return runBackup({uid,profile:source.profile,...db,
        shouldStop:()=>paused,
        requestPage:async(page,sinceId)=>{
          let results;
          try{results=await chrome.scripting.executeScript({target:{tabId:source.tabId},world:'MAIN',func:readPage,args:[uid,page,sinceId]});}
          catch{throw new Error('无法访问微博标签页。请保持微博打开，并在该页面重新点击扩展图标连接。');}
          const result=results?.[0]?.result;
          if(!result||result.error)throw new Error(result?.error||'微博未返回有效响应。');
          return result;
        },
        onProgress:async progress=>{log(`第 ${progress.page} 页已保存：${progress.count} 条，本轮新增 ${progress.fresh} 条。`);await refresh();}
      });
    });
    log(outcome.ended?'接口已无后续内容，请核对数量和时间范围。':'任务已暂停，可稍后继续。');
  }catch(e){error(e.message);log('备份停止：'+e.message);}
  finally{running=false;paused=false;await refresh();}
  if(outcome?.ended&&!outcome.alreadyEnded&&$('auto-export').checked)await exportFiles('both',uid);
};
$('pause').onclick=()=>{paused=true;$('pause').disabled=true;log('正在暂停，将先保存当前请求返回的数据。');};
$('accounts').onchange=async e=>{selected=e.target.value;error('');await refresh();};
$('open-weibo').onclick=()=>chrome.tabs.create({url:'https://weibo.com/'});
$('refresh').onclick=()=>refresh().catch(e=>error(e.message));
$('json').onclick=()=>exportFiles('json');$('html').onclick=()=>exportFiles('html');
$('preview').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('preview.html')+'?uid='+encodeURIComponent(selected)});
$('import').onchange=async e=>{
  const files=[...e.target.files];if(!files.length)return;
  busy=true;error('');await refresh();
  try{
    await withLock(async()=>{
      for(const file of files){
        if(file.size>256*1024*1024)throw new Error('单个 JSON 超过 256 MB，请拆分后导入。');
        const parsed=parseBackup(JSON.parse(await file.text()));
        await db.importArchive(parsed,file.name);selected=parsed.uid;log(`已导入 ${file.name}：${parsed.posts.length} 条，重复记录已合并。`);
      }
    });toast('导入完成，可以预览或下载 HTML。');
  }catch(e){error('导入停止：'+e.message+'；此前成功导入的文件已保留。');log('导入停止：'+e.message);}
  finally{busy=false;$('import').value='';await refresh();}
};
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='session'&&changes.connection){
    if(running){paused=true;log('连接发生变化，正在暂停当前任务。');return;}
    updateConnection().catch(e=>error(e.message));
  }
});
window.addEventListener('beforeunload',e=>{if(running||busy){e.preventDefault();e.returnValue='';}});
updateConnection().catch(e=>error('初始化失败：'+e.message));
