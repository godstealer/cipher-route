import {nativeClient} from './native-client.js';
const native=nativeClient(chrome.runtime);
import {createController} from './controller.js';
const settings={};
for(const method of ['get','set','clear'])settings[method]=details=>new Promise((resolve,reject)=>chrome.proxy.settings[method](details,value=>{const error=chrome.runtime.lastError;if(error)reject(Error(error.message));else resolve(value)}));
const controller=createController({storage:chrome.storage,proxy:{settings},native});
let queue=Promise.resolve();
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.id!==chrome.runtime.id||sender.tab||!sender.url?.startsWith(chrome.runtime.getURL('')))return false;
 const task=async()=>{
  if(message?.type==='snapshot')return controller.snapshot();
  if(message?.type==='apply')return controller.apply(message.action);
  if(message?.type==='save')return controller.save(message.config);
  if(message?.type==='kernel')return native.call('capabilities');
  if(message?.type==='certificate')return native.call('certificate');
  throw Error('未知操作');
 };
 queue=queue.then(task,task).then(value=>reply({ok:true,value}),error=>reply({ok:false,error:String(error.message??error)}));return true;
});
chrome.proxy.onProxyError.addListener(error=>{void chrome.storage.local.set({proxyError:error.error});void chrome.action.setBadgeText({text:'!'});});
chrome.proxy.settings.onChange.addListener(()=>{void chrome.action.setBadgeText({text:''});});
