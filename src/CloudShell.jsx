import React, { useEffect, useRef, useState } from 'react';
import AppV2 from './AppV2';
import './cloud-shell.css';

const STORAGE_KEY='dfm_react_pwa_v1', SESSION_KEY='dfm_auth_session';
const API='https://dfm-cloud-api.bednarik.workers.dev';
const EMPTY={drones:[],pilots:[],flights:[],tasks:[]};
const hasRecords=d=>(d?.drones?.length||0)+(d?.pilots?.length||0)+(d?.flights?.length||0)+(d?.tasks?.length||0)>0;
const roleLabel=r=>({admin:'Administrátor',pilot:'Pilot',technician:'Technik',user:'Uživatel'}[r]||'Uživatel');

export default function CloudShell(){
 const [token,setToken]=useState(()=>localStorage.getItem(SESSION_KEY)||'');
 const [auth,setAuth]=useState('checking'),[initialized,setInitialized]=useState(true),[mode,setMode]=useState('login');
 const [user,setUser]=useState(null),[email,setEmail]=useState(''),[name,setName]=useState('');
 const [password,setPassword]=useState(''),[password2,setPassword2]=useState(''),[code,setCode]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [profileOpen,setProfileOpen]=useState(false),[usersOpen,setUsersOpen]=useState(false);
 const [users,setUsers]=useState([]),[invite,setInvite]=useState({email:'',role:'user'}),[createdCode,setCreatedCode]=useState(null);
 const [adminError,setAdminError]=useState(''),[newPassword,setNewPassword]=useState('');
 const [status,setStatus]=useState('Připojuji…'),[chatOpen,setChatOpen]=useState(false),[messages,setMessages]=useState([]),[message,setMessage]=useState('');
 const lastRemote=useRef(''),syncing=useRef(false),saveTimer=useRef(null);

 const request=async(path,options={},authRequired=true)=>{
   const headers={'content-type':'application/json',...(authRequired&&token?{authorization:`Bearer ${token}`}:{})};
   const response=await fetch(`${API}${path}`,{...options,headers:{...headers,...(options.headers||{})}});
   let payload={}; try{payload=await response.json();}catch{}
   if(!response.ok){const e=new Error(payload.error||`Cloud odpověděl ${response.status}`);e.status=response.status;throw e;}
   return payload;
 };
 const applySession=result=>{localStorage.setItem(SESSION_KEY,result.token);setToken(result.token);setUser(result.user);setAuth('ready');setStatus('Online');setTimeout(()=>location.reload(),80);};
 const clearSession=()=>{localStorage.removeItem(SESSION_KEY);setToken('');setUser(null);setAuth('login');setPassword('');setCode('');};

 useEffect(()=>{(async()=>{try{
   const health=await request('/health',{},false);setInitialized(Boolean(health.initialized));setMode(health.initialized?'login':'bootstrap');
   if(!token){setAuth('login');return;}
   const result=await request('/auth/me');setUser(result.user);setAuth('ready');setStatus('Online');
 }catch(e){if(e.status===401)clearSession();else{setAuth('offline');setStatus('Cloud nedostupný');}}})();},[]);

 const submitAuth=async e=>{e.preventDefault();setBusy(true);setError('');
   try{
     if((mode==='register'||mode==='bootstrap'||mode==='reset')&&password!==password2)throw new Error('Hesla se neshodují.');
     let path='/auth/login',body={email,password};
     if(mode==='bootstrap'){path='/auth/bootstrap';body={email,name,code,password};}
     if(mode==='register'){path='/auth/register';body={email,name,code,password};}
     if(mode==='reset'){path='/auth/reset';body={email,code,password};}
     const result=await request(path,{method:'POST',body:JSON.stringify(body)},false);
     if(mode==='reset'){setMode('login');setPassword('');setPassword2('');setCode('');setError('Heslo bylo změněno. Nyní se přihlaste.');}
     else applySession(result);
   }catch(e){setError(e.message);}finally{setBusy(false);}
 };
 const logout=async()=>{try{await request('/auth/logout',{method:'POST'});}catch{}clearSession();};

 const pushState=async data=>{if(!token||syncing.current)return;try{setStatus('Ukládám…');await request('/state',{method:'PUT',body:JSON.stringify({data})});lastRemote.current=JSON.stringify(data||EMPTY);setStatus('Online');}catch(e){if(e.status===401)clearSession();else setStatus('Offline');}};
 useEffect(()=>{if(auth!=='ready'||!token)return;
   (async()=>{try{const r=await request('/state'),remote=r.data||EMPTY,local=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')||EMPTY;
     if(!hasRecords(remote)&&hasRecords(local))await pushState(local);else if(JSON.stringify(remote)!==JSON.stringify(local)){syncing.current=true;localStorage.setItem(STORAGE_KEY,JSON.stringify(remote));syncing.current=false;location.reload();}lastRemote.current=JSON.stringify(remote);setStatus('Online');
   }catch(e){if(e.status===401)clearSession();}})();
   const original=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){original.call(this,k,v);if(this===localStorage&&k===STORAGE_KEY&&!syncing.current){clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>{try{pushState(JSON.parse(v));}catch{}},500);}};
   const poll=setInterval(async()=>{if(document.hidden||syncing.current)return;try{const r=await request('/state'),s=JSON.stringify(r.data||EMPTY),l=localStorage.getItem(STORAGE_KEY)||JSON.stringify(EMPTY);if(lastRemote.current&&s!==lastRemote.current&&s!==l){syncing.current=true;original.call(localStorage,STORAGE_KEY,s);syncing.current=false;location.reload();}lastRemote.current=s;setStatus('Online');}catch(e){if(e.status===401)clearSession();}},8000);
   return()=>{Storage.prototype.setItem=original;clearInterval(poll);clearTimeout(saveTimer.current);};
 },[auth,token]);

 const loadChat=async()=>{try{setMessages((await request('/chat')).messages||[]);}catch(e){if(e.status===401)clearSession();}};
 useEffect(()=>{if(!chatOpen)return;loadChat();const i=setInterval(loadChat,5000);return()=>clearInterval(i);},[chatOpen,token]);
 const sendMessage=async e=>{e.preventDefault();if(!message.trim())return;await request('/chat',{method:'POST',body:JSON.stringify({message:message.trim()})});setMessage('');loadChat();};

 const loadUsers=async()=>{try{setUsers((await request('/admin/users')).users||[]);}catch(e){setAdminError(e.message);}};
 const openUsers=async()=>{setProfileOpen(false);setCreatedCode(null);setUsersOpen(true);await loadUsers();};
 const createInvite=async e=>{e.preventDefault();setAdminError('');try{const r=await request('/admin/invites',{method:'POST',body:JSON.stringify(invite)});setCreatedCode({...r,type:'invite'});setInvite({email:'',role:'user'});}catch(e){setAdminError(e.message);}};
 const updateUser=async item=>{try{await request(`/admin/users/${encodeURIComponent(item.id)}`,{method:'PUT',body:JSON.stringify({name:item.name,role:item.role,active:Boolean(item.active)})});loadUsers();}catch(e){setAdminError(e.message);}};
 const forceLogout=async item=>{if(!confirm(`Odhlásit uživatele ${item.name} ze všech zařízení?`))return;try{await request(`/admin/users/${encodeURIComponent(item.id)}/logout`,{method:'POST'});loadUsers();}catch(e){setAdminError(e.message);}};
 const resetCode=async item=>{try{const r=await request(`/admin/users/${encodeURIComponent(item.id)}/reset-code`,{method:'POST'});setCreatedCode({...r,type:'reset'});}catch(e){setAdminError(e.message);}};
 const setOwnPassword=async e=>{e.preventDefault();setAdminError('');try{await request('/auth/password',{method:'POST',body:JSON.stringify({password:newPassword})});setNewPassword('');setUser({...user,hasPassword:true});}catch(e){setAdminError(e.message);}};

 if(auth==='checking')return <div className="auth-screen"><div className="auth-card auth-loading"><div className="auth-logo">DFM</div><p>Ověřuji přihlášení…</p></div></div>;
 if(auth==='offline')return <div className="auth-screen"><section className="auth-card"><div className="auth-logo">DFM</div><h1>Cloud není dostupný</h1><button onClick={()=>location.reload()}>Zkusit znovu</button></section></div>;
 if(auth==='login')return <div className="auth-screen"><section className="auth-card">
   <div className="auth-logo">DFM</div><p className="auth-kicker">Drone Fleet Manager</p>
   <h1>{mode==='bootstrap'?'První spuštění':mode==='register'?'Vytvoření účtu':mode==='reset'?'Nové heslo':'Přihlášení'}</h1>
   <form onSubmit={submitAuth}>
    {(mode==='bootstrap'||mode==='register')&&<label>Jméno<input value={name} onChange={e=>setName(e.target.value)} required /></label>}
    <label>Firemní e-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jmeno@dronetech.cz" required /></label>
    {(mode==='bootstrap'||mode==='register'||mode==='reset')&&<label>{mode==='reset'?'Resetovací kód':mode==='bootstrap'?'Startovací kód':'Pozvánkový kód'}<input className="pin-input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required /></label>}
    <label>Heslo<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="10" autoComplete={mode==='login'?'current-password':'new-password'} required /></label>
    {(mode==='bootstrap'||mode==='register'||mode==='reset')&&<label>Heslo znovu<input type="password" value={password2} onChange={e=>setPassword2(e.target.value)} minLength="10" required /></label>}
    {error&&<p className={error.startsWith('Heslo bylo')?'auth-help':'auth-error'}>{error}</p>}
    <button disabled={busy}>{busy?'Pracuji…':mode==='login'?'Přihlásit se':mode==='reset'?'Nastavit nové heslo':'Vytvořit účet'}</button>
   </form>
   {initialized&&<div className="auth-links">{mode!=='login'&&<button className="auth-secondary" onClick={()=>{setMode('login');setError('');}}>Zpět na přihlášení</button>}{mode==='login'&&<><button className="auth-secondary" onClick={()=>{setMode('register');setError('');}}>Mám pozvánkový kód</button><button className="auth-secondary" onClick={()=>{setMode('reset');setError('');}}>Zapomenuté heslo</button></>}</div>}
 </section></div>;

 return <>
  <AppV2/>
  <button className="cloud-status">{status}</button>
  <button className="user-chip" onClick={()=>setProfileOpen(v=>!v)}><span>{user?.name?.[0]||'U'}</span><div><strong>{user?.name}</strong><small>{roleLabel(user?.role)}</small></div></button>
  <button className="chat-fab" onClick={()=>setChatOpen(true)}>💬</button>
  {profileOpen&&<aside className="profile-menu"><strong>{user?.name}</strong><span>{user?.email}</span><em>{roleLabel(user?.role)}</em>{!user?.hasPassword&&<form onSubmit={setOwnPassword}><input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength="10" placeholder="Nastavit heslo" required/><button>Nastavit heslo</button></form>}{user?.role==='admin'&&<button onClick={openUsers}>Správa uživatelů</button>}<button onClick={logout}>Odhlásit se</button></aside>}
  {usersOpen&&<div className="chat-overlay"><section className="users-panel"><header><div><small>Administrace</small><h2>Uživatelé</h2></div><button onClick={()=>setUsersOpen(false)}>×</button></header><div className="users-content">
   <form className="invite-form" onSubmit={createInvite}><h3>Nová pozvánka</h3><input type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})} placeholder="jmeno@dronetech.cz" required/><select value={invite.role} onChange={e=>setInvite({...invite,role:e.target.value})}><option value="user">Uživatel</option><option value="pilot">Pilot</option><option value="technician">Technik</option><option value="admin">Administrátor</option></select><button>Vytvořit kód</button></form>
   {createdCode&&<div className="invite-result"><span>{createdCode.type==='reset'?'Reset hesla':'Pozvánka'} pro {createdCode.email}</span><strong>{createdCode.code}</strong><small>{createdCode.type==='reset'?'Platí 24 hodin.':'Platí 7 dní.'}</small></div>}
   {adminError&&<p className="auth-error">{adminError}</p>}
   <div className="users-list">{users.map(item=><article key={item.id}><input value={item.name} onChange={e=>setUsers(xs=>xs.map(x=>x.id===item.id?{...x,name:e.target.value}:x))}/><span>{item.email}</span><small>{Number(item.sessions||0)} zařízení · naposledy {item.last_seen?new Date(item.last_seen+'Z').toLocaleString('cs-CZ'):'nikdy'}</small><select value={item.role} onChange={e=>setUsers(xs=>xs.map(x=>x.id===item.id?{...x,role:e.target.value}:x))}><option value="user">Uživatel</option><option value="pilot">Pilot</option><option value="technician">Technik</option><option value="admin">Administrátor</option></select><label><input type="checkbox" checked={Boolean(item.active)} onChange={e=>setUsers(xs=>xs.map(x=>x.id===item.id?{...x,active:e.target.checked?1:0}:x))}/> Aktivní</label><div className="user-actions"><button onClick={()=>updateUser(item)}>Uložit</button><button onClick={()=>forceLogout(item)}>Odhlásit zařízení</button><button onClick={()=>resetCode(item)}>Reset hesla</button></div></article>)}</div>
  </div></section></div>}
  {chatOpen&&<div className="chat-overlay"><section className="chat-panel"><header><div><small>Společná místnost</small><h2>DFM Chat</h2></div><button onClick={()=>setChatOpen(false)}>×</button></header><div className="chat-messages">{messages.map(x=><article key={x.id}><strong>{x.author}</strong><p>{x.message}</p><time>{new Date(x.created_at+'Z').toLocaleString('cs-CZ')}</time></article>)}</div><form onSubmit={sendMessage}><textarea value={message} onChange={e=>setMessage(e.target.value)} required/><button>Odeslat</button></form></section></div>}
 </>;
}
