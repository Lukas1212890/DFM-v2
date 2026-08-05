import React, { useMemo, useState } from 'react';

const STORAGE_KEY = 'dfm_react_pwa_v1';
const VERSION = '1.0 Beta';
const uid = () => crypto.randomUUID();
const SENSORS = ['RGB','Termokamera','Multispektrál','LiDAR','RTK','Noční vidění'];

const emptyData = { drones: [], pilots: [], flights: [], tasks: [] };

function loadData() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return stored || emptyData;
  } catch {
    return emptyData;
  }
}

function AppV2() {
  const [data, setData] = useState(loadData);
  const [view, setView] = useState('dashboard');
  const [selectedDroneId, setSelectedDroneId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sensorFilters, setSensorFilters] = useState([]);

  const save = next => {
    setData(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const selectedDrone = data.drones.find(d => d.id === selectedDroneId) || null;
  const batteryCount = data.drones.reduce((sum, d) => sum + (d.batteries?.length || 0), 0);
  const openTasks = data.tasks.filter(t => !isDone(t)).length;
  const today = new Date().toISOString().slice(0,10);
  const todayFlights = data.flights.filter(f => f.date === today);
  const todayTasks = data.tasks.filter(t => t.dueDate === today && !isDone(t));

  const nav = next => {
    setView(next);
    setSelectedDroneId(null);
    setEditor(null);
  };

  const openCollectionOrSingle = (type, items) => {
    nav(type);
    if (items.length === 1) setTimeout(() => setEditor({ type: singular(type), item: items[0] }), 0);
  };

  const removeItem = editorItem => {
    const { type, item, droneId } = editorItem;
    const labels = { drone:'dron', pilot:'pilota', flight:'let', task:'úkol', battery:'baterii', accessory:'příslušenství', accident:'nehodu', claim:'reklamaci', service:'servisní záznam' };
    if (!window.confirm(`Opravdu smazat ${labels[type] || 'položku'}?`)) return;
    const next = structuredClone(data);
    if (type === 'drone') {
      next.drones = next.drones.filter(x => x.id !== item.id);
      setSelectedDroneId(null);
      setView('drones');
    } else if (['pilot','flight','task'].includes(type)) {
      const key = type === 'pilot' ? 'pilots' : type === 'flight' ? 'flights' : 'tasks';
      next[key] = next[key].filter(x => x.id !== item.id);
      setView(key);
    } else {
      const drone = next.drones.find(x => x.id === droneId);
      const key = nestedKey(type);
      drone[key] = drone[key].filter(x => x.id !== item.id);
      setView('drones');
      setSelectedDroneId(droneId);
    }
    save(next);
    setEditor(null);
  };

  const saveEditor = payload => {
    const next = structuredClone(data);
    const { type, item, droneId } = editor;
    if (type === 'drone') {
      if (item) Object.assign(next.drones.find(x => x.id === item.id), payload);
      else next.drones.push({ id:uid(), ...payload, sensors:payload.sensors || [], batteries:[], accessories:[], accidents:[], claims:[], services:[] });
    } else if (['pilot','flight','task'].includes(type)) {
      const key = type === 'pilot' ? 'pilots' : type === 'flight' ? 'flights' : 'tasks';
      if (item) Object.assign(next[key].find(x => x.id === item.id), payload);
      else next[key].push({ id:uid(), ...payload });
    } else {
      const drone = next.drones.find(x => x.id === droneId);
      const key = nestedKey(type);
      if (item) Object.assign(drone[key].find(x => x.id === item.id), payload);
      else drone[key].push({ id:uid(), ...payload });
    }
    save(next);
    setEditor(null);
  };

  const filteredDrones = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('cs-CZ');
    return data.drones.filter(d => {
      const matchesText = !q || `${d.name} ${d.model}`.toLocaleLowerCase('cs-CZ').includes(q);
      const matchesSensors = sensorFilters.every(s => (d.sensors || []).includes(s));
      return matchesText && matchesSensors;
    });
  }, [data.drones, search, sensorFilters]);

  const renderDashboard = () => (
    <>
      <section className="dashboard-welcome">
        <div><p className="eyebrow">Drone Fleet Manager</p><h2>Dobrý den.</h2><p>Přehled celé flotily na jednom místě.</p></div>
        <span className="dashboard-version">v{VERSION}</span>
      </section>
      <section className="dashboard-stats">
        <DashboardButton icon="✈" label="Drony" value={data.drones.length} onClick={() => nav('drones')} />
        <DashboardButton icon="▣" label="Baterie" value={batteryCount} onClick={() => nav('drones')} />
        <DashboardButton icon="👤" label="Piloti" value={data.pilots.length} onClick={() => nav('pilots')} />
        <DashboardButton icon="✓" label="Otevřené úkoly" value={openTasks} onClick={() => openCollectionOrSingle('tasks', data.tasks.filter(t => !isDone(t)))} />
      </section>
      <Title eyebrow="Stav flotily" title="Vyžaduje pozornost" />
      <section className="dashboard-attention">
        <Attention value={openTasks} text="otevřených úkolů" onClick={() => openCollectionOrSingle('tasks', data.tasks.filter(t => !isDone(t)))} />
        <Attention value={data.drones.reduce((s,d)=>s+(d.claims||[]).filter(c=>c.status!=='Vyřízeno').length,0)} text="aktivních reklamací" onClick={() => nav('drones')} />
        <Attention value={data.drones.reduce((s,d)=>s+(d.accidents||[]).length,0)} text="evidovaných nehod" onClick={() => nav('drones')} />
      </section>
      <Title eyebrow={new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long'}).format(new Date())} title="Dnes" />
      <section className="dashboard-today">
        <DashboardButton icon="🛫" label="Naplánované lety" value={todayFlights.length} onClick={() => openCollectionOrSingle('flights', todayFlights)} />
        <DashboardButton icon="📋" label="Úkoly na dnešek" value={todayTasks.length} onClick={() => openCollectionOrSingle('tasks', todayTasks)} />
      </section>
      <section className="dashboard-placeholder"><div className="dashboard-mark">DFM</div><p className="eyebrow">DFM Dashboard</p><h2>Prostor pro další přehledy</h2><p>Dashboard budeme postupně doplňovat o další provozní widgety.</p></section>
    </>
  );

  const renderDrones = () => selectedDrone ? (
    <DroneDetail drone={selectedDrone} back={() => setSelectedDroneId(null)} edit={() => setEditor({type:'drone',item:selectedDrone,droneId:selectedDrone.id})} remove={() => removeItem({type:'drone',item:selectedDrone})} openNested={(type,item=null)=>setEditor({type,item,droneId:selectedDrone.id})} />
  ) : (
    <>
      <Title eyebrow="Evidence" title="Drony" badge={`${filteredDrones.length} položek`} />
      <section className="filter-panel">
        <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Hledat podle názvu nebo modelu…" />
        <div className="sensor-filter-row">{SENSORS.map(sensor => <button key={sensor} className={sensorFilters.includes(sensor)?'active':''} onClick={()=>setSensorFilters(v=>v.includes(sensor)?v.filter(x=>x!==sensor):[...v,sensor])}>{sensor}</button>)}</div>
      </section>
      <div className="list">{filteredDrones.map(d => <DroneCard key={d.id} drone={d} onClick={()=>setSelectedDroneId(d.id)} />)}{!filteredDrones.length && <Empty text="Žádný dron neodpovídá výběru." />}</div>
    </>
  );

  const renderCollection = type => {
    const config = {
      pilots:['Piloti',data.pilots,'pilot'],
      flights:['Letový deník',data.flights,'flight'],
      tasks:['Úkoly',data.tasks,'task']
    }[type];
    return <><Title eyebrow="Evidence" title={config[0]} badge={config[1].length}/><div className="list">{config[1].map(item => <CollectionCard key={item.id} type={config[2]} item={item} data={data} onClick={()=>setEditor({type:config[2],item})} />)}{!config[1].length && <Empty text="Zatím žádné položky." />}</div></>;
  };

  const content = view === 'dashboard' ? renderDashboard() : view === 'drones' ? renderDrones() : renderCollection(view);
  const createType = view === 'pilots' ? 'pilot' : view === 'flights' ? 'flight' : view === 'tasks' ? 'task' : 'drone';

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-logo">DFM</div><div><h1>Drone Fleet Manager</h1><p>{new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}</p></div></div><button className="icon-button" onClick={()=>setSettingsOpen(true)}>⚙️</button></header>
    <main className="content">{content}</main>
    {!selectedDrone && view !== 'dashboard' && <button className="fab" onClick={()=>setEditor({type:createType,item:null})}>+</button>}
    <nav className="bottom-nav">{[['dashboard','⌂','Přehled'],['drones','✈','Drony'],['pilots','👤','Piloti'],['flights','🛫','Lety'],['tasks','✓','Úkoly']].map(([id,icon,label])=><button key={id} className={view===id?'active':''} onClick={()=>nav(id)}><span>{icon}</span><small>{label}</small></button>)}</nav>
    {editor && <Editor editor={editor} data={data} onClose={()=>setEditor(null)} onSave={saveEditor} onDelete={()=>removeItem(editor)} />}
    {settingsOpen && <Settings data={data} close={()=>setSettingsOpen(false)} />}
  </div>;
}

function DashboardButton({icon,label,value,onClick}) { return <button className="dashboard-button" onClick={onClick}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div><b>›</b></button>; }
function Attention({value,text,onClick}) { return <button className="attention-button" onClick={onClick}><i className={value?'orange':'green'}></i><div><strong>{value}</strong><small>{text}</small></div><b>›</b></button>; }
function Title({eyebrow,title,badge}) { return <div className="section-title"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{badge!==undefined&&<span className="badge">{badge}</span>}</div>; }
function Empty({text}) { return <div className="empty">{text}</div>; }
function SensorBadges({sensors=[]}) { return <div className="sensor-tags">{sensors.map(s=><span key={s} className="sensor-tag">{s}</span>)}</div>; }
function DroneCard({drone,onClick}) { return <article className="list-item" onClick={onClick}><div className="item-icon">✈</div><div className="item-main"><h3>{drone.name}</h3><p>{drone.model} · {(drone.batteries||[]).length} baterií · {(drone.accessories||[]).length} příslušenství</p><SensorBadges sensors={drone.sensors}/></div><span className={`badge ${drone.status==='Aktivní'?'green':''}`}>{drone.status||'Aktivní'}</span></article>; }

function CollectionCard({type,item,data,onClick}) {
  let icon='○',title='',sub='';
  if(type==='pilot'){icon='👤';title=item.name;sub=`${item.license||'Licence neuvedena'} · ${item.phone||'bez telefonu'}`;}
  if(type==='flight'){icon='🛫';title=item.location||'Let';sub=`${item.date||'Bez data'} · ${data.drones.find(d=>d.id===item.droneId)?.name||'Dron'} · ${data.pilots.find(p=>p.id===item.pilotId)?.name||'Pilot'}`;}
  if(type==='task'){icon=isDone(item)?'✓':'○';title=item.type==='Ostatní'?(item.custom||'Ostatní'):item.type;sub=`${item.dueDate||'Bez termínu'}${item.assignedTo?` · ${item.assignedTo}`:''}`;}
  return <article className="list-item" onClick={onClick}><div className="item-icon">{icon}</div><div className="item-main"><h3>{title}</h3><p>{sub}</p></div><span className="mini-button">✎</span></article>;
}

function DroneDetail({drone,back,edit,remove,openNested}) {
  const [tab,setTab]=useState('equipment');
  const tabs=[['equipment','Sestava'],['accidents','Nehody'],['claims','Reklamace'],['services','Servis']];
  return <><button className="secondary-button" onClick={back}>‹ Zpět na drony</button><section className="detail-hero"><div className="detail-row"><div className="detail-icon">✈</div><div><h2>{drone.name}</h2><p>{drone.model}</p></div><span className="badge green">{drone.status}</span></div><SensorBadges sensors={drone.sensors}/><div className="detail-actions"><button className="primary-button" onClick={edit}>Upravit dron</button><button className="danger-button" onClick={remove}>Smazat dron</button></div></section><div className="detail-grid"><Info label="Výrobce" value={drone.manufacturer||'Neuveden'}/><Info label="Výrobní číslo" value={drone.serial||'Neuvedeno'}/><Info label="DJI Care" value={drone.careUntil||'Neuvedeno'}/><Info label="Poznámka" value={drone.notes||'Bez poznámky'}/></div><div className="tabs">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>{tab==='equipment'?<><NestedList title="Baterie" items={drone.batteries||[]} type="battery" add={()=>openNested('battery')} edit={i=>openNested('battery',i)}/><NestedList title="Příslušenství" items={drone.accessories||[]} type="accessory" add={()=>openNested('accessory')} edit={i=>openNested('accessory',i)}/></>:<NestedList title={{accidents:'Nehody',claims:'Reklamace',services:'Servis'}[tab]} items={drone[tab]||[]} type={tab.slice(0,-1)} add={()=>openNested(tab.slice(0,-1))} edit={i=>openNested(tab.slice(0,-1),i)}/>}</>;
}
function Info({label,value}) { return <article className="info-card"><span>{label}</span><strong>{value}</strong></article>; }
function NestedList({title,items,type,add,edit}) { return <><Title eyebrow="Evidence dronu" title={`${title} · ${items.length}`}/><button className="secondary-button full" onClick={add}>+ Přidat</button><div className="list">{items.map(i=><article key={i.id} className="list-item" onClick={()=>edit(i)}><div className="item-icon">{type==='battery'?'▣':type==='accessory'?'🧰':'•'}</div><div className="item-main"><h3>{i.number||i.name||i.title||'Položka'}</h3><p>{i.cycles!==undefined?`${i.cycles||0} cyklů`:i.date||i.category||'Bez detailu'}</p></div><span className="mini-button">✎</span></article>)}{!items.length&&<Empty text="Zatím žádné záznamy."/>}</div></>; }

const schemas={
 drone:[['name','Název','text'],['model','Model','text'],['manufacturer','Výrobce','text'],['serial','Výrobní číslo','text'],['status','Stav','select',['Aktivní','Servis','Vyřazený']],['careUntil','DJI Care do','date'],['notes','Poznámka','textarea']],
 pilot:[['name','Jméno','text'],['phone','Telefon','tel'],['email','E-mail','email'],['license','Licence','text'],['notes','Poznámka','textarea']],
 flight:[['date','Datum','date'],['pilotId','Pilot','pilot'],['droneId','Dron','drone'],['battery','Baterie','text'],['location','Lokalita','text'],['purpose','Účel letu','text'],['notes','Poznámka','textarea']],
 task:[['type','Typ úkolu','select',['Nabít baterie','Aktualizovat firmware','Poslat dron do servisu','Objednat vrtule','Ostatní']],['custom','Vlastní úkol','text'],['dueDate','Termín','date'],['assignedTo','Přiřazeno','text'],['done','Splněno','select',['Ne','Ano']]],
 battery:[['number','Číslo / označení baterie','text'],['serial','Sériové číslo','text'],['cycles','Počet cyklů','number'],['notes','Poznámka','textarea']],
 accessory:[['name','Název','text'],['category','Kategorie','select',['Ovladač','Kufr','Nabíječka','RTK','Kamera','Ostatní']],['serial','Sériové číslo','text'],['notes','Poznámka','textarea']],
 accident:[['date','Datum','date'],['title','Název','text'],['pilot','Pilot','text'],['description','Popis','textarea'],['status','Vyřešeno','select',['Ne','Ano']]],
 claim:[['date','Datum','date'],['title','Předmět reklamace','text'],['description','Popis','textarea'],['status','Stav','select',['Založeno','Probíhá','Vyřízeno']]],
 service:[['date','Datum','date'],['title','Název servisu','text'],['technician','Technik / servis','text'],['price','Cena','number'],['description','Popis','textarea']]
};

function Editor({editor,data,onClose,onSave,onDelete}) {
  const [form,setForm]=useState(editor.item?{...editor.item}:editor.type==='drone'?{status:'Aktivní',sensors:[]}:{});
  const fields=schemas[editor.type]||[];
  const update=(k,v)=>setForm(f=>({...f,[k]:v}));
  const submit=e=>{e.preventDefault();const payload={...form};if(editor.type==='task')payload.done=payload.done===true||payload.done==='Ano';onSave(payload);};
  return <div className="sheet-backdrop"><div className="sheet-panel"><div className="sheet-header"><div><p className="eyebrow">{editor.item?'Úprava položky':'Nová položka'}</p><h2>{editor.type}</h2></div><button className="icon-button" onClick={onClose}>×</button></div><form onSubmit={submit}><div className="form-fields">{fields.map(([name,label,type,options])=><Field key={name} name={name} label={label} type={type} options={options} value={form[name]} update={update} data={data}/>)}{editor.type==='drone'&&<fieldset className="field full sensor-picker"><legend>Senzory a technologie</legend><div className="sensor-picker-grid">{SENSORS.map(s=><label key={s} className={`sensor-choice ${(form.sensors||[]).includes(s)?'selected':''}`}><input type="checkbox" checked={(form.sensors||[]).includes(s)} onChange={()=>update('sensors',(form.sensors||[]).includes(s)?form.sensors.filter(x=>x!==s):[...(form.sensors||[]),s])}/><span>{s}</span></label>)}</div></fieldset>}</div><div className="sheet-actions">{editor.item&&<button type="button" className="danger-button" onClick={onDelete}>Smazat</button>}<button type="button" className="secondary-button" onClick={onClose}>Zrušit</button><button type="submit" className="primary-button">Uložit</button></div></form></div></div>;
}
function Field({name,label,type,options,value,update,data}) {
  if(type==='textarea')return <label className="field full"><span>{label}</span><textarea name={name} value={value||''} onChange={e=>update(name,e.target.value)}/></label>;
  if(type==='select')return <label className="field"><span>{label}</span><select name={name} value={value??options[0]} onChange={e=>update(name,e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select></label>;
  if(type==='pilot')return <label className="field"><span>{label}</span><select name={name} value={value||''} onChange={e=>update(name,e.target.value)}><option value="">Vyber pilota</option>{data.pilots.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
  if(type==='drone')return <label className="field"><span>{label}</span><select name={name} value={value||''} onChange={e=>update(name,e.target.value)}><option value="">Vyber dron</option>{data.drones.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>;
  return <label className="field"><span>{label}</span><input name={name} type={type} value={value||''} onChange={e=>update(name,e.target.value)}/></label>;
}

function Settings({data,close}) {
  const exportData=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='DFM-zaloha.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);};
  return <div className="settings-overlay" onClick={e=>e.target===e.currentTarget&&close()}><section className="settings-panel"><header><h2>Nastavení</h2><button className="settings-close" onClick={close}>×</button></header><button className="settings-option" onClick={exportData}>Exportovat zálohu</button><div className="about-box"><p className="eyebrow">O aplikaci</p><h3>Drone Fleet Manager</h3><p>Verze {VERSION}<br/>React PWA · DroneTech</p></div></section></div>;
}

const nestedKey=type=>type==='battery'?'batteries':type==='accessory'?'accessories':`${type}s`;
const singular=type=>type==='pilots'?'pilot':type==='flights'?'flight':'task';
const isDone=task=>task.done===true||task.done==='Ano';

export default AppV2;
