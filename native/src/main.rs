mod install;
use anyhow::{ensure,Context,Result};
use capture_core::{Engine,proxy::{self,ProxyHandle}};
use serde_json::{json,Value};
use std::{path::PathBuf,io::{Read,Write},collections::HashMap,sync::Arc};
struct Session {proxy:ProxyHandle,engine:Arc<Engine>,directory:PathBuf}
impl Session {async fn stop(self){self.proxy.stop().await;drop(self.engine);let _=std::fs::remove_dir_all(self.directory);}}
struct Host {root:PathBuf,ca:PathBuf,cap:Value,sessions:HashMap<String,Session>,active:Option<String>}
impl Host {
 async fn call(&mut self,m:Value)->Result<Value>{
 ensure!(m["version"]==1,"Unsupported protocol");
 match m["type"].as_str().unwrap_or("") {
 "capabilities"=>Ok(json!({"version":1,"available":true,"engine":"httpcloak","browserVersions":self.cap["browserVersions"],"customClientHello":false,"protocols":["auto"],"tlsVersions":["auto"],"caPath":self.ca,"active":self.active})),
 "certificate"=>Ok(json!({"path":self.ca,"pem":std::fs::read_to_string(&self.ca)?,"trust":capture_core::ca_management::status(&self.ca)?})),
 "prepare"=>{
 ensure!(self.sessions.len()<2,"Commit or abort the pending mode first");
 let p=&m["profile"];let tls=&p["tls"];
 let family=tls["preset"].as_str().context("Missing TLS family")?;
 ensure!(["chrome","firefox"].contains(&family),"Only Chrome and Firefox presets are supported by this host");
 ensure!(tls["protocol"].as_str().unwrap_or("auto")=="auto"&&tls["tlsVersion"].as_str().unwrap_or("auto")=="auto","httpcloak requires HTTP and TLS protocol Auto; overrides are not silently ignored");
 ensure!(tls["helloHex"].as_str().unwrap_or("").is_empty(),"ClientHello Hex is not supported by this host yet");
 let versions=self.cap["browserVersions"][family].as_array().context("Unsupported browser family")?;
 let version=tls["version"].as_str().unwrap_or("auto");
 ensure!(["auto","latest"].contains(&version)||version.parse::<u64>().ok().is_some_and(|v|versions.contains(&json!(v))),"Requested browser version is unavailable");
 let scheme=p["scheme"].as_str().context("Proxy scheme missing")?;ensure!(["http","https","socks5"].contains(&scheme),"Invalid proxy scheme");
 let host=p["host"].as_str().context("Proxy host missing")?;ensure!(!host.is_empty()&&host.chars().all(|c|c.is_ascii_alphanumeric()||".-:[]".contains(c)),"Invalid proxy host");
 let port=p["port"].as_u64().context("Proxy port missing")?;ensure!((1..=65535).contains(&port),"Invalid proxy port");
 let id=uuid::Uuid::new_v4().to_string();let dir=self.root.join("sessions").join(&id);
 std::fs::create_dir_all(dir.join("certificates"))?;
 for name in ["capture-ca.pem","capture-ca.key"]{std::fs::copy(self.root.join("certificates").join(name),dir.join("certificates").join(name))?;}
 let result=async {
 let engine=Engine::open(&dir)?;
 ensure!(engine.send_engines.list().iter().any(|e|e.id=="httpcloak"&&e.available),"httpcloak unavailable");
 engine.upstream.update(serde_json::from_value(json!({"enabled":true,"url":format!("{scheme}://{host}:{port}"),"username":"","authEnabled":false,"password":null}))?)?;
 // Immutable generated policy: no user-supplied script is executed.
 let spec=json!({"preset":family,"browserVersion":version});
 engine.scripts.configure(serde_json::from_value(json!({"enabled":true,"before":format!("request.engine='httpcloak';request.tls={spec};request.pseudoHeaders=[];"),"after":"","variables":{}}))?)?;
 engine.intercept.configure(serde_json::from_value(json!({"request":false,"response":false,"scope":"all","rules":[{"urlContains":"http"}]}))?)?;
 let proxy=proxy::start(engine.clone(),0).await?;let address=proxy.address;
 self.sessions.insert(id.clone(),Session{proxy,engine,directory:dir.clone()});
 Ok::<_,anyhow::Error>(json!({"sessionId":id,"host":"127.0.0.1","port":address.port(),"caPath":self.ca}))
 }.await;
 if result.is_err(){let _=std::fs::remove_dir_all(&dir);}result
 },
 "commit"=>{let id=m["sessionId"].as_str().context("Missing session")?.to_string();ensure!(self.sessions.contains_key(&id),"Unknown session");self.active=Some(id.clone());let old:Vec<_>=self.sessions.keys().filter(|k|**k!=id).cloned().collect();for k in old{if let Some(s)=self.sessions.remove(&k){s.stop().await}}Ok(json!({"active":id}))},
 "abort"=>{let id=m["sessionId"].as_str().context("Missing session")?;ensure!(self.active.as_deref()!=Some(id),"Cannot abort active session");if let Some(s)=self.sessions.remove(id){s.stop().await}Ok(json!({}))},
 "deactivate"=>{for (_,s)in self.sessions.drain(){s.stop().await}self.active=None;Ok(json!({}))},
 _=>anyhow::bail!("Unknown command")
 }
 }
}
fn read_message(reader:&mut impl Read)->Result<Option<Value>>{let mut size=[0;4];match reader.read_exact(&mut size){Err(e)if e.kind()==std::io::ErrorKind::UnexpectedEof=>return Ok(None),r=>r?};let n=u32::from_le_bytes(size)as usize;ensure!(n>0&&n<=256*1024,"Invalid message size");let mut bytes=vec![0;n];reader.read_exact(&mut bytes)?;Ok(Some(serde_json::from_slice(&bytes)?))}
#[tokio::main]
async fn main()->Result<()>{
 if std::env::args().nth(1).as_deref()==Some("--install"){return install::run(&std::env::args().nth(2).unwrap_or_else(||"both".into()));}
 let exe=std::env::current_exe()?;let config:Value=serde_json::from_slice(&std::fs::read(exe.with_extension("config.json"))?)?;
 let origin=std::env::args().nth(1).context("Browser origin required")?;
 ensure!(config["allowedOrigins"].as_array().is_some_and(|a|a.iter().any(|v|v.as_str()==Some(&origin))),"Extension origin not authorized");
 let root=PathBuf::from(config["dataDir"].as_str().context("dataDir missing")?);std::fs::create_dir_all(&root)?;
 #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;std::fs::set_permissions(&root,std::fs::Permissions::from_mode(0o700))?;}
 let ca=capture_core::ca::CertificateAuthority::load_or_create(&root.join("certificates"))?.cert_path;
 let helper=exe.parent().unwrap().join(if cfg!(windows){"http-capture-httpcloak.exe"}else{"http-capture-httpcloak"});
 ensure!(helper.is_file(),"Install the httpcloak helper alongside this host");std::env::set_var("HTTP_CAPTURE_HTTPCLOAK",&helper);
 let cap:Value=serde_json::from_slice(&std::fs::read(helper.with_extension("json"))?)?;ensure!(cap["protocolVersion"]==1,"Unsupported helper protocol");
 let mut host=Host{root,ca,cap,sessions:HashMap::new(),active:None};
 let (tx,mut rx)=tokio::sync::mpsc::channel(4);
 std::thread::spawn(move||{let mut stdin=std::io::stdin().lock();loop{match read_message(&mut stdin){Ok(Some(m))=>if tx.blocking_send(m).is_err(){break},_=>break}}});
 while let Some(m)=rx.recv().await{let id=m["id"].clone();let reply=match host.call(m).await{Ok(value)=>json!({"id":id,"ok":true,"value":value}),Err(e)=>json!({"id":id,"ok":false,"error":format!("{e:#}")})};let bytes=serde_json::to_vec(&reply)?;let mut stdout=std::io::stdout().lock();if stdout.write_all(&(bytes.len()as u32).to_le_bytes()).and_then(|_|stdout.write_all(&bytes)).and_then(|_|stdout.flush()).is_err(){break}}
 for (_,s)in host.sessions.drain(){s.stop().await}Ok(())
}
#[cfg(test)]mod tests{use super::*;#[test]fn framing(){let bytes=serde_json::to_vec(&json!({"version":1})).unwrap();let mut input=(bytes.len()as u32).to_le_bytes().to_vec();input.extend(bytes);assert_eq!(read_message(&mut &input[..]).unwrap().unwrap()["version"],1);assert!(read_message(&mut &u32::MAX.to_le_bytes()[..]).is_err());}}
