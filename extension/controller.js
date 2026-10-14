import {initialConfig,validateConfig,proxyValue,sameProxy} from './core.js';
export function createController(api){
 const get=()=>api.proxy.settings.get({incognito:false});
 async function snapshot(){const data=await api.storage.local.get(['config','applied','proxyError']);return {config:validateConfig(data.config??initialConfig()),applied:data.applied??null,proxyError:data.proxyError??null,effective:await get()}}
 async function control(){const s=await get();if(!['controlled_by_this_extension','controllable_by_this_extension'].includes(s.levelOfControl))throw Error('代理设置被其他扩展或浏览器策略控制');return s}
 async function apply(action){
  const old=await control();
  let value,profile=null;
  if(action==='release'){await api.proxy.settings.clear({scope:'regular'});await api.storage.local.remove(['applied','proxyError']);return snapshot()}
  if(action==='direct'||action==='system')value={mode:action};
  else {const {config}=await snapshot();profile=config.profiles.find(p=>p.id===action);if(!profile)throw Error('情景不存在');value=proxyValue(profile)}
  await api.proxy.settings.set({value,scope:'regular'});
  try{
   const effective=await get();if(effective.levelOfControl!=='controlled_by_this_extension')throw Error('浏览器未授予代理控制权');
   await api.storage.local.set({applied:{action,profile:profile?structuredClone(profile):null,value:effective.value},proxyError:null});
  }catch(error){if(old.levelOfControl==='controlled_by_this_extension')await api.proxy.settings.set({value:old.value,scope:'regular'});else await api.proxy.settings.clear({scope:'regular'});throw error}
  return snapshot();
 }
 async function save(config){config=validateConfig(config);const {profiles,...stored}=config;await api.storage.local.set({config:stored});return snapshot()}
 return {snapshot,apply,save};
}
export function activeLabel(state){
 if(state.effective.levelOfControl!=='controlled_by_this_extension')return '未接管浏览器代理';
 if(!state.applied||!sameProxy(state.applied.value,state.effective.value))return '代理设置已变化，请重新应用';
 const a=state.applied;if(a.action==='direct')return '直连';if(a.action==='system')return '跟随系统';
 const current=state.config.profiles.find(p=>p.id===a.action);
 return (a.profile?.name??a.action)+(JSON.stringify(current)!==JSON.stringify(a.profile)?' · 配置已变更，需重新应用':'');
}
