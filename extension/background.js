import {createController} from './controller.js';
const settings={};
for(const method of ['get','set','clear'])settings[method]=details=>new Promise((resolve,reject)=>chrome.proxy.settings[method](details,value=>{const error=chrome.runtime.lastError;if(error)reject(Error(error.message));else resolve(value)}));
const controller=createController({storage:chrome.storage,proxy:{settings}});
let queue=Promise.resolve();
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.id!==chrome.runtime.id||sender.tab||!sender.url?.startsWith(chrome.runtime.getURL('')))return false;
 const task=async()=>{
  if(message?.type==='snapshot')return controller.snapshot();
  if(message?.type==='apply')return controller.apply(message.action);
  if(message?.type==='save')return controller.save(message.config);
  if(message?.type==='kernel')return kernelStatus();
  throw Error('未知操作');
 };
 queue=queue.then(task,task).then(value=>reply({ok:true,value}),error=>reply({ok:false,error:String(error.message??error)}));return true;
});
chrome.proxy.onProxyError.addListener(error=>{void chrome.storage.local.set({proxyError:error.error});void chrome.action.setBadgeText({text:'!'});});
chrome.proxy.settings.onChange.addListener(()=>{void chrome.action.setBadgeText({text:''});});
async function kernelStatus(){
 let timer;try{return await Promise.race([new Promise((resolve,reject)=>chrome.runtime.sendNativeMessage('io.cipherroute.host',{version:1,type:'capabilities'},response=>{if(chrome.runtime.lastError)reject(Error(chrome.runtime.lastError.message));else if(response?.version!==1)reject(Error('本地内核协议版本不兼容'));else resolve(response)})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('本地内核响应超时')),5000)})])}finally{clearTimeout(timer)}
}
