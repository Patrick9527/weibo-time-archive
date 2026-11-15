import {idOf,validatePage} from './core.mjs';
export async function runBackup({uid,profile,readArchive,savePage,saveStatus,requestPage,onProgress=()=>{},shouldStop=()=>false,wait=ms=>new Promise(r=>setTimeout(r,ms)),interval=4000,maxPages=500}){
  const saved=await readArchive(uid);
  let state={...saved.meta,profile:{...saved.meta.profile,...profile}};
  if(state.endCandidate)return {ended:true,alreadyEnded:true};
  const seen=new Set(saved.pages.flatMap(p=>p.response.data.list.map(idOf)));
  const cursors=new Set(saved.pages.map(p=>p.requestSinceId).filter(Boolean));
  let count=0;
  try{
    await saveStatus(uid,{profile:state.profile,status:'running',reason:''});
    while(count<maxPages&&!shouldStop()){
      const response=await requestPage(state.page,state.sinceId);
      const parsed=validatePage(response.json,state,seen,cursors);
      const record={page:state.page,requestSinceId:state.sinceId,url:response.url,
        fetchedAt:new Date().toISOString(),response:response.json};
      const nextState={...state,page:state.page+1,sinceId:parsed.next,endCandidate:parsed.endCandidate,
        reportedTotal:response.json.data.total??state.reportedTotal??profile.reportedTotal,
        status:parsed.endCandidate?'ended':'running',reason:parsed.endCandidate?'接口无后续内容，仍需核对完整性':'',updatedAt:new Date().toISOString()};
      await savePage(uid,record,nextState);
      if(state.sinceId)cursors.add(state.sinceId);
      parsed.list.forEach(p=>seen.add(idOf(p)));state=nextState;count++;
      await onProgress({page:record.page,count:parsed.list.length,fresh:parsed.fresh,state});
      if(parsed.endCandidate)return {ended:true};
      // Short slices make pause responsive even while waiting for the next request.
      for(let elapsed=0;elapsed<interval&&!shouldStop();elapsed+=250)await wait(Math.min(250,interval-elapsed));
    }
    await saveStatus(uid,{status:'paused',reason:count>=maxPages?'已达到单轮页数上限，可继续备份':'已暂停，断点已保存'});
    return {ended:false,paused:true};
  }catch(e){
    await saveStatus(uid,{status:'error',reason:String(e.message||e)});
    throw e;
  }
}
