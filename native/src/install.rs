use anyhow::{ensure,Context,Result};
use serde_json::{json,Value};
use std::path::{Path,PathBuf};
pub const EXTENSION_ID:&str="kejpkbdliekmgpagfceglikahmchoabg";
fn locations(os:&str,home:&Path,xdg:Option<&Path>,browser:&str)->Result<(PathBuf,PathBuf)>{
 ensure!(["chrome","edge","chromium"].contains(&browser),"Choose chrome, edge or chromium");
 let (base,manifest)=match os {
 "macos"=>{let base=home.join("Library/Application Support");let browser=match browser{"chrome"=>"Google/Chrome","edge"=>"Microsoft Edge",_=>"Chromium"};(base.join("CipherRoute"),base.join(browser))},
 "linux"=>{let config=xdg.filter(|p|p.is_absolute()).map(Path::to_path_buf).unwrap_or_else(||home.join(".config"));let browser=match browser{"chrome"=>"google-chrome","edge"=>"microsoft-edge",_=>"chromium"};(home.join(".local/share/cipher-route"),config.join(browser))},
 _=>anyhow::bail!("Use install-windows.ps1 on Windows"),
 };
 Ok((base,manifest.join("NativeMessagingHosts/io.cipherroute.host.json")))
}
fn write_json(path:&Path,value:&Value)->Result<()>{
 std::fs::create_dir_all(path.parent().context("Missing parent")?)?;
 let tmp=path.with_extension("json.new");std::fs::write(&tmp,serde_json::to_vec_pretty(value)?)?;std::fs::rename(tmp,path)?;Ok(())
}
pub fn run(browser:&str)->Result<()>{
 if browser=="both"{run("chrome")?;return run("edge");}
 let home=PathBuf::from(std::env::var_os("HOME").context("HOME is missing")?);ensure!(home.is_absolute(),"HOME must be absolute");
 let xdg=std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from);
 let (base,manifest_path)=locations(std::env::consts::OS,&home,xdg.as_deref(),browser)?;
 let source=std::env::current_exe()?.parent().context("Missing binary directory")?.to_path_buf();
 for name in ["cipher-route-host","http-capture-httpcloak","http-capture-httpcloak.json"]{ensure!(source.join(name).is_file(),"Incomplete package: {name}");}
 let cap:Value=serde_json::from_slice(&std::fs::read(source.join("http-capture-httpcloak.json"))?)?;ensure!(cap["protocolVersion"]==1,"Unsupported helper");
 // A fresh version directory permits upgrading a running host without replacing its executable.
 let dest=base.join("native").join(uuid::Uuid::new_v4().to_string());std::fs::create_dir_all(&dest)?;
 #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;std::fs::set_permissions(&base,std::fs::Permissions::from_mode(0o700))?;std::fs::set_permissions(&dest,std::fs::Permissions::from_mode(0o700))?;}
 for name in ["cipher-route-host","http-capture-httpcloak","http-capture-httpcloak.json"]{
  std::fs::copy(source.join(name),dest.join(name))?;
  #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;std::fs::set_permissions(dest.join(name),std::fs::Permissions::from_mode(if name.ends_with(".json"){0o600}else{0o700}))?;}
 }
 let origin=format!("chrome-extension://{EXTENSION_ID}/");
 write_json(&dest.join("cipher-route-host.config.json"),&json!({"allowedOrigins":[origin],"dataDir":base.join("data")}))?;
 write_json(&manifest_path,&json!({"name":"io.cipherroute.host","description":"CipherRoute TLS forwarding host","path":dest.join("cipher-route-host"),"type":"stdio","allowed_origins":[origin]}))?;
 println!("Installed for {browser}: {}\nNo CA installed. Reload the extension, then detect the local kernel.",manifest_path.display());Ok(())
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn platform_paths(){let h=Path::new("/Users/test space");let (_,p)=locations("macos",h,None,"edge").unwrap();assert_eq!(p,h.join("Library/Application Support/Microsoft Edge/NativeMessagingHosts/io.cipherroute.host.json"));let (_,p)=locations("linux",h,None,"chrome").unwrap();assert_eq!(p,h.join(".config/google-chrome/NativeMessagingHosts/io.cipherroute.host.json"));assert!(locations("linux",h,None,"firefox").is_err());}
 #[test]fn fixed_key(){let m:Value=serde_json::from_str(include_str!("../extension-identity.json")).unwrap();assert_eq!(m["id"],EXTENSION_ID);}
}
