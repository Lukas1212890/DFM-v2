import React, { useMemo, useState } from 'react';

const STORAGE_KEY = 'dfm_react_pwa_v1';

const uid = () => crypto.randomUUID();

const SENSOR_OPTIONS = ['RGB','Termokamera','Multispektrál','LiDAR','RTK','Noční vidění'];

const initialData = {
  drones: [
    {
      id: uid(),
      name: 'Matrice 4T',
      model: 'DJI Matrice 4T',
      manufacturer: 'DJI',
      serial: '',
      status: 'Aktivní',
      careUntil: '',
      sensors: ['RGB','Termokamera','RTK'],
      notes: '',
      batteries: [
        { id: uid(), number: 'Baterie 01', serial: '', cycles: 0, notes: '' },
        { id: uid(), number: 'Baterie 02', serial: '', cycles: 0, notes: '' }
      ],
      accessories: [
        { id: uid(), name: 'RC Plus', category: 'Ovladač', serial: '', notes: '' },
        { id: uid(), name: 'Nabíjecí stanice', category: 'Nabíječka', serial: '', notes: '' },
        { id: uid(), name: 'Přepravní kufr', category: 'Kufr', serial: '', notes: '' }
      ],
      accidents: [],
      claims: [],
      services: []
    },
    {
      id: uid(),
      name: 'Mavic 3M',
      model: 'DJI Mavic 3 Multispectral',
      manufacturer: 'DJI',
      serial: '',
      status: 'Aktivní',
      careUntil: '',
      sensors: ['RGB','Multispektrál','RTK'],
      notes: '',
      batteries: [],
      accessories: [],
      accidents: [],
      claims: [],
      services: []
    }
  ],
  pilots: [],
  flights: [],
  tasks: []
};

const loadData = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || initialData;
  } catch {
    return initialData;
  }
};

const schema = {
  drone: [
    ['name','Název','text',true],
    ['model','Model','text',true],
    ['manufacturer','Výrobce','text',false],
    ['serial','Výrobní číslo','text',false],
    ['status','Stav','select',['Aktivní','Servis','Vyřazený']],
    ['careUntil','DJI Care do','date',false],
    ['sensors','Senzory a technologie','multiSelect',SENSOR_OPTIONS],
    ['notes','Poznámka','textarea',false]
  ],
  battery: [
    ['number','Číslo / označení baterie','text',true],
    ['serial','Sériové číslo','text',false],
    ['cycles','Počet cyklů','number',false],
    ['notes','Poznámka','textarea',false]
  ],
  accessory: [
    ['name','Název','text',true],
    ['category','Kategorie','select',['Ovladač','Kufr','Nabíječka','RTK','Kamera','Ostatní']],
    ['serial','Sériové číslo','text',false],
    ['notes','Poznámka','textarea',false]
  ],
  accident: [
    ['date','Datum','date',true],
    ['title','Název / stručný popis','text',true],
    ['pilot','Pilot','text',false],
    ['description','Popis nehody','textarea',false],
    ['status','Vyřešeno','select',['Ne','Ano']]
  ],
  claim: [
    ['date','Datum','date',true],
    ['title','Předmět reklamace','text',true],
    ['description','Popis','textarea',false],
    ['status','Stav','select',['Založeno','Probíhá','Vyřízeno']]
  ],
  service: [
    ['date','Datum','date',true],
    ['title','Název servisu','text',true],
    ['technician','Technik / servis','text',false],
    ['price','Cena','number',false],
    ['description','Popis','textarea',false]
  ],
  pilot: [
    ['name','Jméno','text',true],
    ['phone','Telefon','tel',false],
    ['email','E-mail','email',false],
    ['license','Licence','text',false],
    ['notes','Poznámka','textarea',false]
  ],
  flight: [
    ['date','Datum','date',true],
    ['pilotId','Pilot','pilotSelect',true],
    ['droneId','Dron','droneSelect',true],
    ['battery','Baterie','batterySelect',false],
    ['location','Lokalita','text',true],
    ['purpose','Účel letu','text',false],
    ['notes','Poznámka','textarea',false]
  ],
  task: [
    ['type','Typ úkolu','select',['Nabít baterie','Aktualizovat firmware','Poslat dron do servisu','Objednat vrtule','Ostatní']],
    ['custom','Vlastní úkol','text',false],
    ['dueDate','Termín','date',false],
    ['assignedTo','Přiřazeno','text',false],
    ['done','Splněno','select',['Ne','Ano']]
  ]
};

function App() {
  const [data, setData] = useState(loadData);
  const [view, setView] = useState('dashboard');
  const [selectedDroneId, setSelectedDroneId] = useState(null);
  const [droneTab, setDroneTab] = useState('equipment');
  const [editor, setEditor] = useState(null);

  const save = (next) => {
    setData(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const selectedDrone = useMemo(
    () => data.drones.find(d => d.id === selectedDroneId) || null,
    [data.drones, selectedDroneId]
  );

  const openEditor = (type, item = null, droneId = null) => {
    setEditor({ type, item, droneId });
  };

  const addOrUpdate = (payload) => {
    const next = structuredClone(data);
    const { type, item, droneId } = editor;

    if (type === 'drone') {
      if (item) {
        Object.assign(next.drones.find(x => x.id === item.id), payload);
      } else {
        next.drones.push({
          id: uid(),
          ...payload,
          batteries: [],
          accessories: [],
          accidents: [],
          claims: [],
          services: []
        });
      }
    } else if (['battery','accessory','accident','claim','service'].includes(type)) {
      const drone = next.drones.find(x => x.id === droneId);
      const key = type === 'battery' ? 'batteries' : type === 'accessory' ? 'accessories' : `${type}s`;
      if (item) Object.assign(drone[key].find(x => x.id === item.id), payload);
      else drone[key].push({ id: uid(), ...payload });
    } else {
      const key = type === 'pilot' ? 'pilots' : type === 'flight' ? 'flights' : 'tasks';
      if (item) Object.assign(next[key].find(x => x.id === item.id), payload);
      else next[key].push({ id: uid(), ...payload });
    }

    save(next);
    setEditor(null);
  };

  const nav = (nextView) => {
    setView(nextView);
    setSelectedDroneId(null);
  };

  const batteryCount = data.drones.reduce((sum, d) => sum + d.batteries.length, 0);
  const openTasks = data.tasks.filter(t => !t.done).length;

  const renderDashboard = () => (
    <>
      <section className="hero">
        <p className="eyebrow">DFM React PWA</p>
        <h2>Celá flotila v jednom hangáru</h2>
        <p>Dron je hlavní sestava. Uvnitř má baterie, příslušenství, nehody, reklamace a servisní historii.</p>
      </section>
      <section className="stats-grid">
        <Stat label="Drony" value={data.drones.length} sub="evidovaných" />
        <Stat label="Baterie" value={batteryCount} sub="u dronů" />
        <Stat label="Piloti" value={data.pilots.length} sub="evidovaných" />
        <Stat label="Úkoly" value={openTasks} sub="otevřených" />
      </section>
      <SectionTitle eyebrow="Flotila" title="Drony" badge={data.drones.length} />
      <div className="list">
        {data.drones.map(d => (
          <DroneCard key={d.id} drone={d} onClick={() => { setView('drones'); setSelectedDroneId(d.id); }} />
        ))}
      </div>
      <SectionTitle eyebrow="Co řešit" title="Otevřené úkoly" />
      <div className="list">
        {data.tasks.filter(t => !t.done).slice(0,4).map(t => <TaskCard key={t.id} task={t} />)}
        {!openTasks && <Empty text="Všechno je hotové." />}
      </div>
    </>
  );

  const renderDrones = () => {
    if (selectedDrone) return (
      <DroneDetail
        drone={selectedDrone}
        tab={droneTab}
        setTab={setDroneTab}
        back={() => setSelectedDroneId(null)}
        editDrone={() => openEditor('drone', selectedDrone, selectedDrone.id)}
        addBattery={() => openEditor('battery', null, selectedDrone.id)}
        addAccessory={() => openEditor('accessory', null, selectedDrone.id)}
        addHistory={(type) => openEditor(type, null, selectedDrone.id)}
        editNested={(type, item) => openEditor(type, item, selectedDrone.id)}
      />
    );

    return (
      <>
        <SectionTitle eyebrow="Evidence" title="Drony" badge={`${data.drones.length} položek`} />
        <div className="list">
          {data.drones.map(d => (
            <DroneCard key={d.id} drone={d} onClick={() => setSelectedDroneId(d.id)} />
          ))}
          {!data.drones.length && <Empty text="Přidej první dron." />}
        </div>
      </>
    );
  };

  const renderCollection = (type) => {
    const labels = {
      pilots: ['Piloti', data.pilots],
      flights: ['Letový deník', data.flights],
      tasks: ['Úkoly', data.tasks]
    };
    const [title, items] = labels[type];

    return (
      <>
        <SectionTitle eyebrow="Evidence" title={title} badge={items.length} />
        <div className="list">
          {type === 'pilots' && items.map(p => <PilotCard key={p.id} pilot={p} onEdit={() => openEditor('pilot', p)} />)}
          {type === 'flights' && items.map(f => <FlightCard key={f.id} flight={f} data={data} onEdit={() => openEditor('flight', f)} />)}
          {type === 'tasks' && items.map(t => <TaskCard key={t.id} task={t} onEdit={() => openEditor('task', t)} />)}
          {!items.length && <Empty text="Zatím žádné položky." />}
        </div>
      </>
    );
  };

  const currentContent =
    view === 'dashboard' ? renderDashboard() :
    view === 'drones' ? renderDrones() :
    renderCollection(view);

  const createType = view === 'pilots' ? 'pilot' : view === 'flights' ? 'flight' : view === 'tasks' ? 'task' : 'drone';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">DFM</div>
          <div>
            <h1>Drone Fleet Manager</h1>
            <p>{new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}</p>
          </div>
        </div>
        <button className="icon-button" aria-label="Nastavení">⚙️</button>
      </header>

      <main className="content">{currentContent}</main>

      {!selectedDrone && <button className="fab" onClick={() => openEditor(createType)}>+</button>}

      <nav className="bottom-nav">
        {[
          ['dashboard','⌂','Přehled'],
          ['drones','✈','Drony'],
          ['pilots','👤','Piloti'],
          ['flights','🛫','Lety'],
          ['tasks','✓','Úkoly']
        ].map(([id,icon,label]) => (
          <button key={id} className={view===id?'active':''} onClick={() => nav(id)}>
            <span>{icon}</span><small>{label}</small>
          </button>
        ))}
      </nav>

      {editor && (
        <EditorSheet
          editor={editor}
          data={data}
          onClose={() => setEditor(null)}
          onSave={addOrUpdate}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return <article className="stat-card"><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>;
}

function SectionTitle({ eyebrow, title, badge }) {
  return <div className="section-title"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{badge !== undefined && <span className="badge">{badge}</span>}</div>;
}

function SensorBadges({ sensors = [] }) {
  if (!sensors?.length) return null;
  const classes = {
    RGB: 'sensor-rgb',
    Termokamera: 'sensor-thermal',
    Multispektrál: 'sensor-multi',
    LiDAR: 'sensor-lidar',
    RTK: 'sensor-rtk',
    'Noční vidění': 'sensor-night'
  };
  return (
    <div className="sensor-tags">
      {sensors.map(sensor => (
        <span key={sensor} className={`sensor-tag ${classes[sensor] || ''}`}>{sensor}</span>
      ))}
    </div>
  );
}

function DroneCard({ drone, onClick }) {
  return (
    <article className="list-item" onClick={onClick}>
      <div className="item-icon">✈</div>
      <div className="item-main">
        <h3>{drone.name}</h3>
        <p>{drone.model} · {drone.batteries.length} baterií · {drone.accessories.length} příslušenství</p>
        <SensorBadges sensors={drone.sensors} />
      </div>
      <span className={`badge ${drone.status==='Aktivní'?'green':''}`}>{drone.status}</span>
    </article>
  );
}

function DroneDetail({ drone, tab, setTab, back, editDrone, addBattery, addAccessory, addHistory, editNested }) {
  const tabs = [
    ['equipment','Sestava'],
    ['accidents','Nehody'],
    ['claims','Reklamace'],
    ['services','Servis']
  ];

  return (
    <>
      <button className="secondary-button" onClick={back}>‹ Zpět na drony</button>
      <section className="detail-hero">
        <div className="detail-row">
          <div className="detail-icon">✈</div>
          <div><h2>{drone.name}</h2><p>{drone.model}</p></div>
          <span className="badge green">{drone.status}</span>
        </div>
        <SensorBadges sensors={drone.sensors} />
        <div className="detail-actions">
          <button className="primary-button" onClick={editDrone}>Upravit dron</button>
          <button className="secondary-button" onClick={addAccessory}>Přidat vybavení</button>
        </div>
      </section>

      <div className="detail-grid">
        <Info label="Výrobce" value={drone.manufacturer || 'Neuveden'} />
        <Info label="Výrobní číslo" value={drone.serial || 'Neuvedeno'} />
        <Info label="DJI Care" value={drone.careUntil || 'Neuvedeno'} />
        <Info label="Poznámka" value={drone.notes || 'Bez poznámky'} />
      </div>

      <div className="tabs">
        {tabs.map(([id,label]) => <button key={id} className={tab===id?'active':''} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      {tab === 'equipment' ? (
        <>
          <SectionTitle eyebrow="Baterie" title={`${drone.batteries.length} kusů`} />
          <button className="secondary-button full" onClick={addBattery}>+ Přidat baterii</button>
          <div className="list">
            {drone.batteries.map(b => (
              <article className="list-item" key={b.id}>
                <div className="item-icon">▣</div>
                <div className="item-main"><h3>{b.number}</h3><p>{b.cycles || 0} cyklů{b.serial ? ` · S/N ${b.serial}` : ''}</p></div>
                <button className="mini-button" onClick={() => editNested('battery', b)}>✎</button>
              </article>
            ))}
          </div>

          <SectionTitle eyebrow="Příslušenství" title={`${drone.accessories.length} položek`} />
          <button className="secondary-button full" onClick={addAccessory}>+ Přidat příslušenství</button>
          <div className="list">
            {drone.accessories.map(a => (
              <article className="list-item" key={a.id}>
                <div className="item-icon">🧰</div>
                <div className="item-main"><h3>{a.name}</h3><p>{a.category}{a.serial ? ` · S/N ${a.serial}` : ''}</p></div>
                <button className="mini-button" onClick={() => editNested('accessory', a)}>✎</button>
              </article>
            ))}
          </div>
        </>
      ) : (
        <HistorySection type={tab} items={drone[tab]} onAdd={() => addHistory(tab.slice(0,-1))} onEdit={(item) => editNested(tab.slice(0,-1), item)} />
      )}
    </>
  );
}

function Info({ label, value }) {
  return <article className="info-card"><span>{label}</span><strong>{value}</strong></article>;
}

function HistorySection({ type, items, onAdd, onEdit }) {
  const titles = { accidents:'Nehody', claims:'Reklamace', services:'Servis' };
  return (
    <>
      <SectionTitle eyebrow="Historie dronu" title={titles[type]} />
      <button className="secondary-button full" onClick={onAdd}>+ Přidat</button>
      <div className="list">
        {items.map(item => (
          <article className="list-item" key={item.id}>
            <div className="item-icon">{type==='accidents'?'⚠️':type==='claims'?'↩':'🛠'}</div>
            <div className="item-main"><h3>{item.title}</h3><p>{item.date || 'Bez data'}{item.status ? ` · ${item.status}` : ''}</p></div>
            <button className="mini-button" onClick={() => onEdit(item)}>✎</button>
          </article>
        ))}
        {!items.length && <Empty text="Zatím žádné záznamy." />}
      </div>
    </>
  );
}

function PilotCard({ pilot, onEdit }) {
  return <article className="list-item"><div className="item-icon">👤</div><div className="item-main"><h3>{pilot.name}</h3><p>{pilot.license || 'Licence neuvedena'} · {pilot.phone || 'bez telefonu'}</p></div><button className="mini-button" onClick={onEdit}>✎</button></article>;
}

function FlightCard({ flight, data, onEdit }) {
  const drone = data.drones.find(d => d.id === flight.droneId);
  const pilot = data.pilots.find(p => p.id === flight.pilotId);
  return <article className="list-item"><div className="item-icon">🛫</div><div className="item-main"><h3>{flight.location || 'Let'}</h3><p>{flight.date || 'Bez data'} · {drone?.name || 'Dron'} · {pilot?.name || 'Pilot'}</p></div><button className="mini-button" onClick={onEdit}>✎</button></article>;
}

function TaskCard({ task, onEdit }) {
  return <article className="list-item"><div className="item-icon">{task.done?'✓':'○'}</div><div className="item-main"><h3>{task.type==='Ostatní' ? task.custom || 'Ostatní' : task.type}</h3><p>{task.dueDate || 'Bez termínu'}{task.assignedTo ? ` · ${task.assignedTo}` : ''}</p></div>{onEdit && <button className="mini-button" onClick={onEdit}>✎</button>}</article>;
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

function EditorSheet({ editor, data, onClose, onSave }) {
  const { type, item } = editor;
  const [form, setForm] = useState(item ? { ...item } : {});

  const fields = schema[type];

  const update = (name, value) => setForm(prev => ({ ...prev, [name]: value }));

  const submit = (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (type === 'task') payload.done = payload.done === true || payload.done === 'Ano';
    onSave(payload);
  };

  const batteries = data.drones.find(d => d.id === form.droneId)?.batteries || [];

  return (
    <div className="sheet-backdrop">
      <div className="sheet-panel">
        <div className="sheet-header">
          <div><p className="eyebrow">{item ? 'Úprava položky' : 'Nová položka'}</p><h2>{type}</h2></div>
          <button className="icon-button" type="button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={submit}>
          <div className="form-fields">
            {fields.map(([name,label,fieldType,required]) => {
              const common = { name, required: required === true, value: form[name] ?? '', onChange: e => update(name, e.target.value) };

              if (fieldType === 'textarea') {
                return <label className="field full" key={name}><span>{label}{required===true?' *':''}</span><textarea {...common} /></label>;
              }

              if (fieldType === 'multiSelect') {
                const selected = Array.isArray(form[name]) ? form[name] : [];
                return (
                  <fieldset className="field full sensor-picker" key={name}>
                    <legend>{label}</legend>
                    <div className="sensor-picker-grid">
                      {required.map(option => {
                        const checked = selected.includes(option);
                        return (
                          <label key={option} className={`sensor-choice ${checked ? 'selected' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => update(name, checked ? selected.filter(x => x !== option) : [...selected, option])}
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              }

              if (fieldType === 'select') {
                return <label className="field" key={name}><span>{label}</span><select {...common}>{required.map(opt => <option key={opt}>{opt}</option>)}</select></label>;
              }

              if (fieldType === 'pilotSelect') {
                return <label className="field" key={name}><span>{label} *</span><select {...common}><option value="">Vyber pilota</option>{data.pilots.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
              }

              if (fieldType === 'droneSelect') {
                return <label className="field" key={name}><span>{label} *</span><select {...common}><option value="">Vyber dron</option>{data.drones.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>;
              }

              if (fieldType === 'batterySelect') {
                return <label className="field" key={name}><span>{label}</span><select {...common}><option value="">Bez výběru</option>{batteries.map(b => <option key={b.id} value={b.number}>{b.number}</option>)}</select></label>;
              }

              return <label className="field" key={name}><span>{label}{required===true?' *':''}</span><input type={fieldType} {...common} /></label>;
            })}
          </div>

          <div className="sheet-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Zrušit</button>
            <button type="submit" className="primary-button">Uložit</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
