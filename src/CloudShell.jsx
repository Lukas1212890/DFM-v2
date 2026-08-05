import React,{useEffect,useMemo,useRef,useState}from'react';
import{BrowserQRCodeReader}from'@zxing/browser';
import{BarcodeFormat,EncodeHintType,QRCodeWriter}from'@zxing/library';
import AppV2 from'./AppV2';
import'./cloud-shell.css';

const STORAGE_KEY='dfm_react_pwa_v1',SESSION_KEY='dfm_auth_session',PENDING_KEY='dfm_pending_sync';
const API='https://dfm-cloud-api.bednarik.workers.dev';
const EMPTY={drones:[],pilots:[],flights:[],tasks:[]};
const roleLabel=r=>({admin:'Administrátor',pilot:'Pilot',technician:'Technik',user:'Uživatel'}[r]||'Uživatel');
const qrPayload=(email,code)=>JSON.stringify({type:'dfm-login',server:API,email,code});
function qrSvg(text,size=240){
 try{
  const hints=new Map();hints.set(EncodeHintType.MARGIN,1);
  const matrix=new QRCodeWriter().encode(text,BarcodeFormat.QR_CODE,size,size,hints);
  let path='';for(let y=0;y<matrix.getHeight();y++)for(let x=0;x<matrix.getWidth();x++)if(matrix.get(x,y))path+=`M${x} ${y}h1v1h-1z`;
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${matrix.getWidth()} ${matrix.getHeight()}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
 }catch{return'';}
}

export default function CloudShell(){
 const[token,setToken]=useState(()=>localStorage.getItem(SESSION_KEY)||'');
 const[auth,setAuth]=useState('checking'),[initialized,setInitialized]=useState(true),[user,setUser]=useState(null);
 const[email,setEmail]=useState(''),[name,setName]=useState(''),[code,setCode]=useState('');
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('Připojuji…');
 const[profileOpen,setProfileOpen]=useState(false),[usersOpen,setUsersOpen]=useState(false),[scannerOpen,setScannerOpen]=useState(false);
 const[users,setUsers]=useState([]),[newUser,setNewUser]=useState({name:'',email:'',role:'user'}),[inviteCard,setInviteCard]=useState(null),[adminError,setAdminError]=useState('');
 const[chatOpen,setChatOpen]=useState(false),[messages,setMessages]=useState([]),[message,setMessage]=useState('');
 const lastRemote=useRef(''),syncing=useRef(false),saveTimer=useRef(null),videoRef=useRef(null),scannerRef=useRef(null);
 const inviteQr=useMemo(()=>inviteCard?qrSvg(qrPayload(inviteCard.user.email,inviteCard.accessCode)): '',[inviteCard]);

 const request=async(path,options={},needsAuth=true)=>{
  const headers={'content-type':'application/json',...(needsAuth&&token?{authorization:`Bearer ${token}`}:{})};
  const response=await fetch(`${API}${path}`,{...options,headers:{...headers,...(options.headers||{})}});
  let payload={};try{payload=await response.json();}catch{}
  if(!response.ok){const e=new Error(payload.error||`Cloud odpověděl ${response.status}`);e.status=response.status;throw e;}return payload;
 };
 const applySession=r=>{localStorage.setItem(SESSION_KEY,r.token);setToken(r.token);setUser(r.user);setAuth('ready');setStatus('Online');setTimeout(()=>location.reload(),80);};
 const clearSession=()=>{localStorage.removeItem(SESSION_KEY);setToken('');setUser(null);setAuth('login');setCode('');};

 useEffect(()=>{(async()=>{try{
  const h=await request('/health',{},false);setInitialized(Boolean(h.initialized));
  if(!token){setAuth('login');return;}
  try{const r=await request('/auth/me');setUser(r.user);setAuth('ready');setStatus(navigator.onLine?'Online':'Offline');}
  catch(e){if(!navigator.onLine){setAuth('ready');setStatus('Offline');}else throw e;}
 }catch(e){if(e.status===401)clearSession();else if(token){setAuth('ready');setStatus('Offline');}else setAuth('offline');}})();},[]);

 const login=async e=>{e.preventDefault();setBusy(true);setError('');try{
  const path=initialized?'/auth/code-login':'/auth/bootstrap';
  const body=initialized?{email,code}:{email,name,code};
  const r=await request(path,{method:'POST',body:JSON.stringify(body)},false);applySession(r);
 }catch(e){setError(e.message);}finally{setBusy(false);}};
 const logout=async()=>{try{await request('/auth/logout',{method:'POST'});}catch{}clearSession();};

 const pushState=async data=>{if(!token||syncing.current)return;try{
  setStatus('Synchronizuji…');await request('/state',{method:'PUT',body:JSON.stringify({data})});
  lastRemote.current=JSON.stringify(data||EMPTY);localStorage.removeItem(PENDING_KEY);setStatus('Online');
 }catch(e){if(e.status===401&&navigator.onLine)clearSession();else{localStorage.setItem(PENDING_KEY,'1');setStatus('Offline · čeká na synchronizaci');}}};
 const syncNow=async()=>{if(!navigator.onLine||!token)return;const local=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')||EMPTY;await pushState(local);};
 useEffect(()=>{if(auth!=='ready'||!token)return;
  const original=Storage.prototype.setItem;
  const initial=async()=>{if(!navigator.onLine){setStatus(localStorage.getItem(PENDING_KEY)?'Offline · čeká na synchronizaci':'Offline');return;}try{
   if(localStorage.getItem(PENDING_KEY)){await syncNow();return;}
   const r=await request('/state'),remote=r.data||EMPTY,local=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')||EMPTY;
   if(JSON.stringify(remote)!==JSON.stringify(local)){syncing.current=true;original.call(localStorage,STORAGE_KEY,JSON.stringify(remote));syncing.current=false;location.reload();}
   lastRemote.current=JSON.stringify(remote);setStatus('Online');
  }catch{setStatus('Offline');}};initial();
  Storage.prototype.setItem=function(k,v){original.call(this,k,v);if(this===localStorage&&k===STORAGE_KEY&&!syncing.current){localStorage.setItem(PENDING_KEY,'1');setStatus(navigator.onLine?'Čeká na synchronizaci':'Offline · čeká na synchronizaci');clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>{try{pushState(JSON.parse(v));}catch{}},500);}};
  const online=()=>syncNow(),offline=()=>setStatus(localStorage.getItem(PENDING_KEY)?'Offline · čeká na synchronizaci':'Offline');
  addEventListener('online',online);addEventListener('offline',offline);
  return()=>{Storage.prototype.setItem=original;removeEventListener('online',online);removeEventListener('offline',offline);clearTimeout(saveTimer.current);};
 },[auth,token]);

 const openScanner=()=>setScannerOpen(true);
 useEffect(()=>{if(!scannerOpen||!videoRef.current)return;const reader=new BrowserQRCodeReader();scannerRef.current=reader;
  reader.decodeFromVideoDevice(undefined,videoRef.current,(result)=>{if(!result)return;try{const data=JSON.parse(result.getText());if(data.type==='dfm-login'&&data.email&&data.code){setEmail(data.email);setCode(data.code);setScannerOpen(false);reader.reset();}}catch{}}).catch(()=>setError('Kameru se nepodařilo spustit.'));
  return()=>reader.reset();},[scannerOpen]);

 const loadUsers=async()=>{try{setUsers((await request('/admin/users')).users||[]);}catch(e){setAdminError(e.message);}};
 const openUsers=async()=>{setProfileOpen(false);setInviteCard(null);setUsersOpen(true);await loadUsers();};
 const createUser=async e=>{e.preventDefault();setAdminError('');try{const r=await request('/admin/users',{method:'POST',body:JSON.stringify(newUser)});setInviteCard(r);setNewUser({name:'',email:'',role:'user'});loadUsers();}catch(e){setAdminError(e.message);}};
 const regenerate=async item=>{if(!confirm(`Vytvořit nový kód pro ${item.name}? Starý kód přestane fungovat.`))return;try{setInviteCard(await request(`/admin/users/${encodeURIComponent(item.id)}/regenerate-code`,{method:'POST'}));}catch(e){setAdminError(e.message);}};
 const updateUser=async item=>{try{await request(`/admin/users/${encodeURIComponent(item.id)}`,{method:'PUT',body:JSON.stringify({name:item.name,role:item.role,active:Boolean(item.active)})});loadUsers();}catch(e){setAdminError(e.message);}};
 const forceLogout=async item=>{if(!confirm(`Odhlásit ${item.name} ze všech zařízení?`))return;try{await request(`/admin/users/${encodeURIComponent(item.id)}/logout`,{method:'POST'});loadUsers();}catch(e){setAdminError(e.message);}};
 const shareInvite=async()=>{if(!inviteCard)return;const text=`DFM – přístup pro ${inviteCard.user.name}\nE-mail: ${inviteCard.user.email}\nKód: ${inviteCard.accessCode}\nOtevřít: https://lukas1212890.github.io/DFM-v2/`;if(navigator.share)await navigator.share({title:'Pozvánka do DFM',text});else{await navigator.clipboard.writeText(text);alert('Pozvánka byla zkopírována.');}};

 const loadChat=async()=>{if(!navigator.onLine)return;try{setMessages((await request('/chat')).messages||[]);}catch{}};
 useEffect(()=>{if(!chatOpen)return;loadChat();const i=setInterval(loadChat,5000);return()=>clearInterval(i);},[chatOpen,token]);
 const sendMessage=async e=>{e.preventDefault();if(!navigator.onLine){alert('Chat vyžaduje internet.');return;}await request('/chat',{method:'POST',body:JSON.stringify({message:message.trim()})});setMessage('');loadChat();};

 if(auth==='checking')return <div className="auth-screen"><div className="auth-card auth-loading"><div className="auth-logo">DFM</div><p>Ověřuji přihlášení…</p></div></div>;
 if(auth==='offline')return <div className="auth-screen"><section className="auth-card"><div className="auth-logo">DFM</div><h1>První přihlášení vyžaduje internet</h1><button onClick={()=>location.reload()}>Zkusit znovu</button></section></div>;
 if(auth==='login')return <div className="auth-screen"><section className="auth-card"><div className="auth-logo">DFM</div><p className="auth-kicker">Drone Fleet Manager</p><h1>{initialized?'Přihlášení':'První spuštění'}</h1><form onSubmit={login}>
  {!initialized&&<label>Jméno<input value={name} onChange={e=>setName(e.target.value)} required/></label>}
  <label>Firemní e-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jmeno@dronetech.cz" required/></label>
  <label>{initialized?'Přístupový kód':'Startovací kód'}<input className="pin-input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" required/></label>
  {error&&<p className="auth-error">{error}</p>}<button disabled={busy}>{busy?'Přihlašuji…':initialized?'Přihlásit se':'Vytvořit administrátora'}</button>
 </form>{initialized&&<button className="scan-login" onClick={openScanner}>📷 Naskenovat QR kód</button>}</section>
 {scannerOpen&&<div className="chat-overlay"><section className="scanner-panel"><header><h2>Naskenuj pozvánku</h2><button onClick={()=>setScannerOpen(false)}>×</button></header><video ref={videoRef} muted playsInline/><p>Namiř kameru na QR kód vytvořený administrátorem.</p></section></div>}</div>;

 return <><AppV2/><button className="cloud-status" onClick={syncNow}>{status}</button><button className="user-chip" onClick={()=>setProfileOpen(v=>!v)}><span>{user?.name?.[0]||'U'}</span><div><strong>{user?.name}</strong><small>{roleLabel(user?.role)}</small></div></button><button className="chat-fab" onClick={()=>setChatOpen(true)}>💬</button>
 {profileOpen&&<aside className="profile-menu"><strong>{user?.name}</strong><span>{user?.email}</span><em>{roleLabel(user?.role)}</em>{user?.role==='admin'&&<button onClick={openUsers}>Správa uživatelů</button>}<button onClick={logout}>Odhlásit se</button></aside>}
 {usersOpen&&<div className="chat-overlay"><section className="users-panel"><header><div><small>Administrace</small><h2>Uživatelé</h2></div><button onClick={()=>setUsersOpen(false)}>×</button></header><div className="users-content">
  <form className="invite-form" onSubmit={createUser}><h3>Přidat uživatele</h3><input value={newUser.name} onChange={e=>setNewUser({...newUser,name:e.target.value})} placeholder="Jméno" required/><input type="email" value={newUser.email} onChange={e=>setNewUser({...newUser,email:e.target.value})} placeholder="jmeno@dronetech.cz" required/><select value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})}><option value="user">Uživatel</option><option value="pilot">Pilot</option><option value="technician">Technik</option><option value="admin">Administrátor</option></select><button>Vytvořit přístup</button></form>
  {inviteCard&&<div className="qr-invite"><h3>{inviteCard.user.name}</h3><span>{inviteCard.user.email}</span><div className="qr-image" dangerouslySetInnerHTML={{__html:inviteQr}}/><strong>{inviteCard.accessCode}</strong><div><button onClick={()=>navigator.clipboard.writeText(inviteCard.accessCode)}>Kopírovat kód</button><button onClick={shareInvite}>Sdílet pozvánku</button></div></div>}
  {adminError&&<p className="auth-error">{adminError}</p>}
  <div className="users-list">{users.map(item=><article key={item.id}><input value={item.name} onChange={e=>setUsers(xs=>xs.map(x=>x.id===item.id?{...x,name:e.target.value}:x))}/><span>{item.email}</span><small>{Number(item.sessions||0)} zařízení · {item.last_seen?new Date(item.last_seen+'Z').toLocaleString('cs-CZ'):'dosud nepřihlášen'}</small><select value={item.role} onChange={e=>setUsers(xs=>xs.map(x=>x.id===item.id?{...x,role:e.target.value}:x))}><option value="user">Uživatel</option><option value="pilot">Pilot</option><option value="technician">Technik</option><option value="admin">Administrátor</option></select><label><input type="checkbox" checked={Boolean(item.active)} onChange={e=>setUsers(xs=>xs.map(x=>x.id===item.id?{...x,active:e.target.checked?1:0}:x))}/> Aktivní</label><div className="user-actions"><button onClick={()=>updateUser(item)}>Uložit</button><button onClick={()=>regenerate(item)}>Nový kód + QR</button><button onClick={()=>forceLogout(item)}>Odhlásit zařízení</button></div></article>)}</div>
 </div></section></div>}
 {chatOpen&&<div className="chat-overlay"><section className="chat-panel"><header><div><small>Společná místnost</small><h2>DFM Chat</h2></div><button onClick={()=>setChatOpen(false)}>×</button></header><div className="chat-messages">{messages.map(x=><article key={x.id}><strong>{x.author}</strong><p>{x.message}</p><time>{new Date(x.created_at+'Z').toLocaleString('cs-CZ')}</time></article>)}</div><form onSubmit={sendMessage}><textarea value={message} onChange={e=>setMessage(e.target.value)} required/><button>Odeslat</button></form></section></div>}</>;
}
