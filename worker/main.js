import webpush from 'web-push';
import app from './index.js';

const json=(data,status=200,origin='*')=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'content-type,authorization','cache-control':'no-store'}});
const rolesOf=user=>{const raw=Array.isArray(user?.roles)?user.roles:String(user?.role||'user').split(',');const roles=[...new Set(raw.map(role=>String(role).trim().toLowerCase()).filter(Boolean))];return roles.length?roles:['user'];};
const hasRole=(user,role)=>rolesOf(user).includes(role);
const primaryRole=roles=>roles.includes('admin')?'admin':roles[0]||'user';

async function currentUser(request,env){
  const url=new URL(request.url);url.pathname='/auth/me';url.search='';
  const response=await app.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return null;
  const payload=await response.json();return payload.user||null;
}
async function ensurePushSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,endpoint TEXT NOT NULL UNIQUE,subscription TEXT NOT NULL,device TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_log(id TEXT PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  ]);
}
function configurePush(env){
  if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT||'mailto:bednarik@dronetech.cz',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  return true;
}
async function removeSubscription(env,endpoint){await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(endpoint).run();}
async function sendToUser(env,userId,payload){
  if(!configurePush(env))return {sent:0,disabled:true};
  const rows=await env.DB.prepare('SELECT endpoint,subscription FROM push_subscriptions WHERE user_id=?').bind(userId).all();
  let sent=0;
  for(const row of rows.results||[]){
    try{await webpush.sendNotification(JSON.parse(row.subscription),JSON.stringify(payload),{TTL:86400});sent++;}
    catch(error){if([404,410].includes(error.statusCode))await removeSubscription(env,row.endpoint);else console.error('Push error',error);}
  }
  return {sent};
}
const TASK_MARKER='<<<DFM_TASK_TEXT>>>';
const taskTitle=t=>String(t?.title||t?.custom||t?.type||'Nový úkol').split(TASK_MARKER)[0].trim()||'Nový úkol';
const assignedValue=t=>String(t?.assignedUserId||t?.assignedEmail||t?.assignedTo||t?.userId||'').trim().toLowerCase();
async function findAssignedUser(env,task){
  const value=assignedValue(task);if(!value)return null;
  return env.DB.prepare('SELECT id,email,name FROM users WHERE active=1 AND (lower(id)=? OR lower(email)=? OR lower(name)=?)').bind(value,value,value).first();
}
async function notifyTaskChanges(env,previousState,nextState){
  const before=new Map((previousState?.tasks||[]).map(t=>[t.id,t]));
  for(const task of nextState?.tasks||[]){
    if(task.done===true||task.done==='Ano'||!assignedValue(task))continue;
    const old=before.get(task.id);
    const changed=!old||JSON.stringify({a:assignedValue(old),d:old.dueDate,t:taskTitle(old),x:old.text||old.description||''})!==JSON.stringify({a:assignedValue(task),d:task.dueDate,t:taskTitle(task),x:task.text||task.description||''});
    if(!changed)continue;
    const user=await findAssignedUser(env,task);if(!user)continue;
    await sendToUser(env,user.id,{title:old?'Úkol byl upraven':'Máte nový úkol',body:`${taskTitle(task)}${task.dueDate?` · termín ${task.dueDate}`:''}`,tag:`task-${task.id}`,url:'./#tasks'});
  }
}
async function notifyFlightChanges(env,previousState,nextState){
  const before=new Map((previousState?.flights||[]).map(f=>[f.id,f])),pilots=new Map((nextState?.pilots||[]).map(p=>[p.id,p]));
  const adminRows=await env.DB.prepare('SELECT id,role FROM users WHERE active=1').all(),adminIds=(adminRows.results||[]).filter(user=>rolesOf(user).includes('admin')).map(user=>user.id);
  for(const flight of nextState?.flights||[]){
    const old=before.get(flight.id),pilot=pilots.get(flight.pilotId),assignmentChanged=!old||JSON.stringify({p:old.pilotId,d:old.date,l:old.location,r:old.droneId})!==JSON.stringify({p:flight.pilotId,d:flight.date,l:flight.location,r:flight.droneId});
    const drone=(nextState?.drones||[]).find(d=>d.id===flight.droneId),details=[flight.date,flight.location,drone?.name].filter(Boolean).join(' · ');
    if(assignmentChanged&&pilot){const identity=String(pilot.appUserId||pilot.email||pilot.name||'').trim().toLowerCase();if(identity){const user=await env.DB.prepare('SELECT id FROM users WHERE active=1 AND (lower(id)=? OR lower(email)=? OR lower(name)=?)').bind(identity,identity,identity).first();if(user)await sendToUser(env,user.id,{title:old?'Naplánovaný let byl upraven':'Máte naplánovaný nový let',body:details||'Otevřete DFM pro podrobnosti.',tag:`flight-${flight.id}`,url:'./#flights'});}}
    if(flight.acceptedAt&&old?.acceptedAt!==flight.acceptedAt){for(const adminId of adminIds)await sendToUser(env,adminId,{title:`Let přijal ${flight.acceptedByName||pilot?.name||'pilot'}`,body:details||'Pilot potvrdil přijetí letu.',tag:`flight-accepted-${flight.id}`,url:'./#flights'});}
    if(flight.completedAt&&old?.completedAt!==flight.completedAt){for(const adminId of adminIds)await sendToUser(env,adminId,{title:`Let dokončil ${flight.completedByName||flight.acceptedByName||pilot?.name||'pilot'}`,body:details||'Pilot označil let jako hotový.',tag:`flight-completed-${flight.id}`,url:'./#flights'});}
  }
}
async function sendDueReminders(env){
  await ensurePushSchema(env);
  const row=await env.DB.prepare('SELECT data FROM app_state WHERE id=1').first();if(!row)return;
  const state=JSON.parse(row.data||'{}'),tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  for(const task of state.tasks||[]){
    if(task.dueDate!==tomorrow||task.done===true||task.done==='Ano')continue;
    const user=await findAssignedUser(env,task);if(!user)continue;
    const key=`task-reminder:${task.id}:${tomorrow}`;
    try{await env.DB.prepare('INSERT INTO push_log(id,event_key) VALUES(?,?)').bind(crypto.randomUUID(),key).run();}
    catch{continue;}
    await sendToUser(env,user.id,{title:'Úkol je zítra',body:taskTitle(task),tag:`task-reminder-${task.id}`,url:'./#tasks'});
  }
  const today=new Date().toISOString().slice(0,10),adminRows=await env.DB.prepare('SELECT id,role FROM users WHERE active=1').all(),adminIds=(adminRows.results||[]).filter(user=>rolesOf(user).includes('admin')).map(user=>user.id);
  for(const pilot of state.pilots||[]){
    if(!pilot.licenseUntil)continue;
    const days=Math.round((Date.parse(`${pilot.licenseUntil}T00:00:00Z`)-Date.parse(`${today}T00:00:00Z`))/86400000);if(![30,7,1,0].includes(days))continue;
    const identity=String(pilot.appUserId||pilot.email||pilot.name||'').trim().toLowerCase(),linked=identity?await env.DB.prepare('SELECT id FROM users WHERE active=1 AND (lower(id)=? OR lower(email)=? OR lower(name)=?)').bind(identity,identity,identity).first():null,recipients=[...new Set([linked?.id,...adminIds].filter(Boolean))];
    for(const userId of recipients){const key=`license-reminder:${pilot.id}:${pilot.licenseUntil}:${days}:${userId}`;try{await env.DB.prepare('INSERT INTO push_log(id,event_key) VALUES(?,?)').bind(crypto.randomUUID(),key).run();}catch{continue;}const when=days===0?'vyprší dnes':`vyprší za ${days} ${days===1?'den':'dní'}`;await sendToUser(env,userId,{title:'Blíží se konec licence pilota',body:`${pilot.name||'Pilot'} · licence ${when}`,tag:`license-${pilot.id}`,url:'./#pilots'});}
  }
}

export default{
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('origin')||'*';
    if(request.method==='OPTIONS')return app.fetch(request,env);
    try{
      if(url.pathname==='/users/directory'&&request.method==='GET'){
        const user=await currentUser(request,env);if(!user)return json({error:'Přihlášení je vyžadováno.'},401,origin);
        const rows=await env.DB.prepare('SELECT id,email,name,role,active,phone,position FROM users WHERE active=1 ORDER BY name,email').all();
        return json({users:(rows.results||[]).map(item=>{const roles=rolesOf(item);return{...item,role:primaryRole(roles),roles};})},200,origin);
      }
      if(url.pathname.startsWith('/push/')){
        await ensurePushSchema(env);
        const user=await currentUser(request,env);if(!user)return json({error:'Přihlášení je vyžadováno.'},401,origin);
        if(url.pathname==='/push/subscribe'&&request.method==='POST'){
          const body=await request.json(),subscription=body?.subscription,endpoint=subscription?.endpoint;
          if(!endpoint||!subscription?.keys)return json({error:'Neplatná registrace zařízení.'},400,origin);
          await env.DB.prepare(`INSERT INTO push_subscriptions(id,user_id,endpoint,subscription,device) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription,device=excluded.device,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(),user.id,endpoint,JSON.stringify(subscription),String(body?.device||'').slice(0,240)).run();
          return json({ok:true},201,origin);
        }
        if(url.pathname==='/push/unsubscribe'&&request.method==='POST'){
          const body=await request.json();if(body?.endpoint)await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').bind(body.endpoint,user.id).run();
          return json({ok:true},200,origin);
        }
        if(url.pathname==='/push/test'&&request.method==='POST'){
          return json({ok:true,...await sendToUser(env,user.id,{title:'DFM upozornění fungují',body:'Tento telefon je připraven přijímat notifikace.',tag:'dfm-test',url:'./'})},200,origin);
        }
      }
      if(request.method==='DELETE'&&(url.pathname==='/chat'||url.pathname.startsWith('/chat/'))){
        const user=await currentUser(request,env);if(!user)return json({error:'Přihlášení je vyžadováno.'},401,origin);if(!hasRole(user,'admin'))return json({error:'Mazat zprávy může pouze administrátor.'},403,origin);
        if(url.pathname==='/chat'){await env.DB.prepare('DELETE FROM chat_messages').run();return json({ok:true},200,origin);}
        const id=decodeURIComponent(url.pathname.slice('/chat/'.length));if(!id)return json({error:'Chybí ID zprávy.'},400,origin);
        const result=await env.DB.prepare('DELETE FROM chat_messages WHERE id=?').bind(id).run();if(!result.meta?.changes)return json({error:'Zpráva nebyla nalezena.'},404,origin);return json({ok:true},200,origin);
      }
      if(url.pathname==='/state'&&request.method==='PUT'){
        const beforeRow=await env.DB.prepare('SELECT data FROM app_state WHERE id=1').first();
        const before=beforeRow?JSON.parse(beforeRow.data):{tasks:[]};
        const copy=request.clone(),response=await app.fetch(request,env);
        if(response.ok){const body=await copy.json().catch(()=>null);if(body?.data)await Promise.all([notifyTaskChanges(env,before,body.data),notifyFlightChanges(env,before,body.data)]);}
        return response;
      }
      return app.fetch(request,env);
    }catch(error){console.error(error);return json({error:'Cloud API error'},500,origin);}
  },
  async scheduled(_controller,env,_ctx){await sendDueReminders(env);}
};
