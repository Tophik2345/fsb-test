import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.join(root,'public');
const dataFile=process.env.DATA_FILE||path.join(root,'data','templates.json');
const origin=process.env.PUBLIC_ORIGIN;
const hashes={user:process.env.USER_PASSWORD_HASH,admin:process.env.ADMIN_PASSWORD_HASH};
const key=process.env.SESSION_SECRET?Buffer.from(process.env.SESSION_SECRET,'base64'):null;
const insecureLocal=process.env.ALLOW_INSECURE_LOCAL==='1'&&origin?.startsWith('http://localhost:');
if(!origin||!key||key.length<32||!hashes.user||!hashes.admin||(!origin.startsWith('https://')&&!insecureLocal)){
 console.error('Set PUBLIC_ORIGIN, SESSION_SECRET, USER_PASSWORD_HASH and ADMIN_PASSWORD_HASH. HTTPS is required.');process.exit(1);
}
const rate=new Map();
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const mac=x=>crypto.createHmac('sha256',key).update(x).digest('base64url');
function issue(role){const body=b64({role,exp:Date.now()+8*60*60*1000,id:crypto.randomBytes(16).toString('hex')});return body+'.'+mac(body)}
function session(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='));if(!cookie)return null;
 const value=cookie.slice(8),dot=value.lastIndexOf('.');if(dot<0)return null;const body=value.slice(0,dot),sig=value.slice(dot+1),expected=mac(body);
 if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
 try{const payload=JSON.parse(Buffer.from(body,'base64url'));return payload.exp>Date.now()&&['user','admin'].includes(payload.role)?payload:null}catch{return null}
}
function cookie(value,maxAge){return `session=${value}; HttpOnly; ${insecureLocal?'':'Secure; '}SameSite=Strict; Path=/; Max-Age=${maxAge}`}
function headers(extra={}){return {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",...extra}}
function reply(res,status,data,extra={}){const body=JSON.stringify(data);res.writeHead(status,headers({'Content-Type':'application/json; charset=utf-8',...extra}));res.end(body)}
function sameOrigin(req){return req.headers.origin===origin}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>65536)throw new Error('too_large')}return JSON.parse(text)}
function checkPassword(password,stored){const [salt,hex]=stored.split(':');if(!/^[0-9a-f]{32}$/.test(salt)||!/^[0-9a-f]{128}$/.test(hex))throw new Error('Invalid password hash');const actual=crypto.scryptSync(password,salt,64);return crypto.timingSafeEqual(actual,Buffer.from(hex,'hex'))}
async function templates(){try{return JSON.parse(await fs.readFile(dataFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;return JSON.parse(await fs.readFile(path.join(root,'seed-templates.json'),'utf8'))}}
async function save(list){await fs.mkdir(path.dirname(dataFile),{recursive:true,mode:0o700});const temp=dataFile+'.'+crypto.randomBytes(8).toString('hex');await fs.writeFile(temp,JSON.stringify(list,null,2),{mode:0o600});await fs.rename(temp,dataFile)}
function clean(input){const limits={name:120,title:300,code:80,date:10,author:120,position:200,signature:120,intro:12000,decision:12000};const doc={};for(const [field,max] of Object.entries(limits)){if(typeof input[field]!=='string'||input[field].length>max)throw new Error('invalid_template');doc[field]=input[field].trim()}if(!doc.name)throw new Error('invalid_template');return doc}
const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/login':'login.html','/login.js':'login.js','/login.css':'login.css'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin),route=url.pathname,auth=session(req);
 if(route==='/api/login'&&req.method==='POST'){
  if(!sameOrigin(req))return reply(res,403,{error:'Доступ запрещён'});
  const ip=req.socket.remoteAddress||'unknown',now=Date.now();let bucket=rate.get(ip)||{count:0,until:now+15*60*1000};if(now>bucket.until)bucket={count:0,until:now+15*60*1000};
  if(bucket.count>=6)return reply(res,429,{error:'Слишком много попыток. Подождите 15 минут.'});
  const input=await body(req),password=input.password;if(typeof password!=='string'||password.length>256)return reply(res,400,{error:'Неверный пароль'});
  const isUser=checkPassword(password,hashes.user),isAdmin=checkPassword(password,hashes.admin);
  if(!isUser&&!isAdmin){bucket.count++;rate.set(ip,bucket);return reply(res,401,{error:'Неверный пароль'})}
  rate.delete(ip);const role=isAdmin?'admin':'user';return reply(res,200,{role},{'Set-Cookie':cookie(issue(role),28800)});
 }
 if(route==='/api/session'&&req.method==='GET')return auth?reply(res,200,{role:auth.role}):reply(res,401,{error:'Требуется вход'});
 if(route==='/api/logout'&&req.method==='POST'){if(!sameOrigin(req))return reply(res,403,{error:'Доступ запрещён'});return reply(res,200,{ok:true},{'Set-Cookie':cookie('',0)})}
 if(route.startsWith('/api/')){
  if(!auth)return reply(res,401,{error:'Требуется вход'});
  if(route==='/api/templates'&&req.method==='GET')return reply(res,200,await templates());
  if(auth.role!=='admin')return reply(res,403,{error:'Только для администратора'});
  if(!sameOrigin(req))return reply(res,403,{error:'Доступ запрещён'});
  if(route==='/api/templates'&&req.method==='POST'){
   const doc=clean(await body(req)),list=await templates();if(list.some(t=>t.name===doc.name))return reply(res,409,{error:'Шаблон с таким названием уже есть'});
   if(list.length>=100)return reply(res,400,{error:'Достигнут лимит шаблонов'});list.push(doc);await save(list);return reply(res,201,{ok:true});
  }
  if(route.startsWith('/api/templates/')&&req.method==='DELETE'){
   const name=decodeURIComponent(route.slice('/api/templates/'.length)),list=await templates(),filtered=list.filter(t=>t.name!==name);
   if(filtered.length===list.length)return reply(res,404,{error:'Шаблон не найден'});await save(filtered);return reply(res,200,{ok:true});
  }
  return reply(res,404,{error:'Не найдено'});
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return reply(res,405,{error:'Метод не разрешён'});
 const file=files[route];if(!file)return reply(res,404,{error:'Не найдено'});
 if(!['login.html','login.js','login.css'].includes(file)&&!auth){res.writeHead(302,headers({Location:'/login'}));return res.end()}
 if(file==='login.html'&&auth){res.writeHead(302,headers({Location:'/'}));return res.end()}
 const data=await fs.readFile(path.join(publicDir,file));res.writeHead(200,headers({'Content-Type':types[path.extname(file)]}));return req.method==='HEAD'?res.end():res.end(data);
 }catch(error){console.error(error);reply(res,error.message==='too_large'?413:400,{error:'Некорректный запрос'})}});
server.listen(Number(process.env.PORT)||3000,()=>console.log('Listening on port '+(process.env.PORT||3000)));
