import app from './index.js';

const json=(data,status=200,origin='*')=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'content-type,authorization','cache-control':'no-store'}});

async function currentUser(request,env){
  const url=new URL(request.url);
  url.pathname='/auth/me';
  url.search='';
  const response=await app.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return null;
  const payload=await response.json();
  return payload.user||null;
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    const origin=request.headers.get('origin')||'*';
    if(request.method==='DELETE'&&(url.pathname==='/chat'||url.pathname.startsWith('/chat/'))){
      try{
        const user=await currentUser(request,env);
        if(!user)return json({error:'Přihlášení je vyžadováno.'},401,origin);
        if(user.role!=='admin')return json({error:'Mazat zprávy může pouze administrátor.'},403,origin);
        if(url.pathname==='/chat'){
          await env.DB.prepare('DELETE FROM chat_messages').run();
          return json({ok:true},200,origin);
        }
        const id=decodeURIComponent(url.pathname.slice('/chat/'.length));
        if(!id)return json({error:'Chybí ID zprávy.'},400,origin);
        const result=await env.DB.prepare('DELETE FROM chat_messages WHERE id=?').bind(id).run();
        if(!result.meta?.changes)return json({error:'Zpráva nebyla nalezena.'},404,origin);
        return json({ok:true},200,origin);
      }catch(error){
        console.error(error);
        return json({error:'Cloud API error'},500,origin);
      }
    }
    return app.fetch(request,env);
  }
};
