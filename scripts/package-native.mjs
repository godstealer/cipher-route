import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync,chmodSync,cpSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),core=path.resolve(root,'../http-capture');
const source=JSON.parse(readFileSync('scripts/core-source.json','utf8'));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:core,encoding:'utf8'}).trim();
if(revision!==source.revision)throw Error('HTTP Capture checkout must match pinned revision');
const platform=process.platform==='win32'?'windows':process.platform==='darwin'?'macos':'linux';
if(!['x64','arm64'].includes(process.arch))throw Error('Unsupported architecture');
const label=`${platform}-${process.arch}`,suffix=platform==='windows'?'.exe':'';
const staging=path.join(root,'dist',`cipher-route-${label}`);mkdirSync(staging,{recursive:true});
execFileSync('cargo',['build','--release','--locked','--manifest-path','native/Cargo.toml'],{stdio:'inherit'});
copyFileSync(path.join(root,'native/target/release',`cipher-route-host${suffix}`),path.join(staging,`cipher-route-host${suffix}`));
const helperDir=path.join(core,'helpers/httpcloak'),helper=path.join(staging,`http-capture-httpcloak${suffix}`);
execFileSync('go',['build','-mod=readonly','-trimpath','-o',helper,'.'],{cwd:helperDir,stdio:'inherit'});
const capabilities=execFileSync(helper,['--capabilities'],{encoding:'utf8'});
if(JSON.parse(capabilities).protocolVersion!==1)throw Error('Invalid helper capabilities');
writeFileSync(path.join(staging,'http-capture-httpcloak.json'),capabilities);
copyFileSync('native/'+(platform==='windows'?'install-windows.ps1':'install.sh'),path.join(staging,platform==='windows'?'install-windows.ps1':'install.sh'));
copyFileSync('docs/install.md',path.join(staging,'INSTALL.md'));
cpSync('dist/extension',path.join(staging,'extension'),{recursive:true});
const launcher=platform==='windows'?'Install.cmd':platform==='macos'?'Install.command':null;
if(launcher){copyFileSync('native/'+launcher,path.join(staging,launcher));if(platform==='macos')chmodSync(path.join(staging,launcher),0o755);}
writeFileSync(path.join(staging,'BUILD.json'),JSON.stringify({platform,arch:process.arch,coreRevision:revision,extensionId:JSON.parse(readFileSync('native/extension-identity.json')).id},null,2));
const notices=[];
const modules=execFileSync('go',['list','-m','-mod=readonly','-f','{{.Path}}|{{.Dir}}','all'],{cwd:helperDir,encoding:'utf8'});
for(const line of modules.trim().split(/\r?\n/)){const [name,dir]=line.split('|');if(!dir)continue;const license=['LICENSE','LICENSE.txt','LICENSE.md','COPYING'].map(n=>path.join(dir,n)).find(existsSync);if(license)notices.push(`\n===== ${name} =====\n${readFileSync(license,'utf8')}`)}
const metadata=JSON.parse(execFileSync('cargo',['metadata','--locked','--format-version','1','--manifest-path','native/Cargo.toml'],{encoding:'utf8',maxBuffer:20*1024*1024}));
for(const p of metadata.packages){const dir=path.dirname(p.manifest_path);for(const name of [p.license_file,'LICENSE','LICENSE-MIT','LICENSE-APACHE','LICENSE.txt','LICENSE.md','COPYING'].filter(Boolean)){const f=path.resolve(dir,name);if(existsSync(f))notices.push(`\n===== ${p.name} ${p.version} (${p.license??'see text'}) =====\n${readFileSync(f,'utf8')}`)}}
if(!notices.length)throw Error('Dependency licenses missing');writeFileSync(path.join(staging,'THIRD-PARTY-LICENSES.txt'),notices.join('\n'));
if(platform!=='windows'){chmodSync(path.join(staging,'cipher-route-host'),0o755);chmodSync(helper,0o755);chmodSync(path.join(staging,'install.sh'),0o755)}
execFileSync(process.platform==='win32'?'python':'python3',['scripts/archive-package.py',staging],{stdio:'inherit'});
