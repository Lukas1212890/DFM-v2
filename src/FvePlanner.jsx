import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./fve-planner.css";

const STATUS = {
  unpaid: ["Záloha nezaplacena", "#ef4444"],
  paid: ["Záloha zaplacena", "#f59e0b"],
  planned: ["Nafoceno", "#3b82f6"],
  done: ["Report založen", "#8b5cf6"],
  evaluated: ["Vyhodnoceno", "#22c55e"],
};
const blankPlant = () => ({
  id: crypto.randomUUID(), name: "", lat: "", lng: "", note: "", phone: "",
  contactPerson: "", installedPower: "", panels: "", inverters: "",
  commissioningDate: "", status: "unpaid", date: "",
});

function FveMap({ plants, selectedId, onSelect }) {
  const host = useRef(null), map = useRef(null), markers = useRef([]);
  useEffect(() => {
    if (!host.current || map.current) return;
    map.current = L.map(host.current, { zoomControl: false }).setView([49.2, 16.2], 7);
    L.control.zoom({ position: "bottomright" }).addTo(map.current);
    const layers = {
      "Základní": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, attribution: "© OpenStreetMap" }),
      "Letecká": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 20, attribution: "Esri" }),
      "Terén": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenTopoMap" }),
    };
    layers["Základní"].addTo(map.current);
    L.control.layers(layers, {}, { position: "topright" }).addTo(map.current);
    setTimeout(() => map.current?.invalidateSize(), 80);
    return () => { map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((m) => m.remove()); markers.current = [];
    const points = [];
    plants.forEach((plant) => {
      const lat = Number(plant.lat), lng = Number(plant.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const color = STATUS[plant.status]?.[1] || "#2563eb";
      const marker = L.marker([lat, lng], { icon: L.divIcon({ className: "fve-map-pin-wrap", html: `<span class="fve-map-pin${plant.id === selectedId ? " selected" : ""}" style="--pin:${color}"></span>`, iconSize: [26, 34], iconAnchor: [13, 30] }) })
        .addTo(map.current).bindTooltip(plant.name || "FVE").on("click", () => onSelect(plant.id));
      markers.current.push(marker); points.push([lat, lng]);
    });
    if (selectedId) {
      const p = plants.find((x) => x.id === selectedId), lat = Number(p?.lat), lng = Number(p?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) map.current.setView([lat, lng], Math.max(map.current.getZoom(), 14));
    } else if (points.length) map.current.fitBounds(points, { padding: [35, 35], maxZoom: 13 });
  }, [plants, selectedId, onSelect]);
  return <div ref={host} className="fve-map" aria-label="Mapa fotovoltaických elektráren" />;
}

export default function FvePlanner({ plants = [], onChange, onCreateFlight, canEdit }) {
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("active"),
    [selectedId, setSelectedId] = useState(null), [editing, setEditing] = useState(null),
    [routeIds, setRouteIds] = useState([]), importRef = useRef(null);
  const visible = useMemo(() => plants.filter((p) => {
    const archived = p.status === "evaluated";
    if (filter === "active" && archived) return false;
    if (filter !== "active" && filter !== "all" && p.status !== filter) return false;
    const q = search.trim().toLocaleLowerCase("cs-CZ");
    return !q || [p.name, p.contactPerson, p.phone, p.note].some((v) => String(v || "").toLocaleLowerCase("cs-CZ").includes(q));
  }), [plants, search, filter]);
  const selected = plants.find((p) => p.id === selectedId) || null;
  const savePlant = (event) => {
    event.preventDefault();
    const normalized = { ...editing, lat: String(editing.lat).replace(",", "."), lng: String(editing.lng).replace(",", ".") };
    onChange(plants.some((p) => p.id === normalized.id) ? plants.map((p) => p.id === normalized.id ? normalized : p) : [...plants, normalized]);
    setEditing(null); setSelectedId(normalized.id);
  };
  const remove = (plant) => {
    if (!confirm(`Opravdu smazat FVE ${plant.name}?`)) return;
    onChange(plants.filter((p) => p.id !== plant.id)); setSelectedId(null);
  };
  const route = () => {
    const chosen = routeIds.map((id) => plants.find((p) => p.id === id)).filter(Boolean).slice(0, 16);
    if (!chosen.length) return;
    const points = chosen.map((p) => encodeURIComponent(`${p.lat},${p.lng}`)).join("&rc=");
    open(`https://mapy.com/zakladni?planovani-trasy&rc=${points}&mrp=%7B%22c%22%3A111%7D`, "_blank", "noopener");
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(plants, null, 2)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `dfm-fve-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const importJson = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const next = JSON.parse(await file.text()); if (!Array.isArray(next)) throw new Error(); onChange(next.map((p) => ({ ...blankPlant(), ...p, id: p.id || crypto.randomUUID() }))); }
    catch { alert("Soubor neobsahuje platný export Plánovače FVE."); }
    event.target.value = "";
  };
  return <section className="fve-page">
    <header className="fve-head"><div><p className="eyebrow">Integrovaný modul</p><h2>Plánovač FVE</h2><p>Zakázky, technické údaje, trasy a převod na let v DFM.</p></div>{canEdit && <button className="fve-primary" onClick={() => setEditing(blankPlant())}>+ Přidat FVE</button>}</header>
    <div className="fve-stats">
      <article><strong>{plants.filter((p) => p.status !== "evaluated").length}</strong><span>aktivních FVE</span></article>
      <article><strong>{plants.filter((p) => p.status === "paid").length}</strong><span>připraveno k letu</span></article>
      <article><strong>{plants.filter((p) => p.status === "evaluated").length}</strong><span>vyhodnoceno</span></article>
    </div>
    <div className="fve-toolbar"><input type="search" placeholder="Hledat FVE, kontakt nebo poznámku…" value={search} onChange={(e) => setSearch(e.target.value)} /><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="active">Aktivní</option><option value="all">Všechny</option>{Object.entries(STATUS).map(([id, [label]]) => <option key={id} value={id}>{label}</option>)}</select><button onClick={route} disabled={!routeIds.length}>Trasa ({routeIds.length})</button><button onClick={exportJson}>Export</button>{canEdit && <><button onClick={() => importRef.current?.click()}>Import</button><input ref={importRef} hidden type="file" accept="application/json" onChange={importJson} /></>}</div>
    <div className="fve-layout"><div className="fve-map-card"><FveMap plants={visible} selectedId={selectedId} onSelect={setSelectedId} /></div><div className="fve-list">
      {visible.map((plant) => <article key={plant.id} className={`fve-card ${selectedId === plant.id ? "selected" : ""}`} onClick={() => setSelectedId(plant.id)}><label className="fve-route-check" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={routeIds.includes(plant.id)} onChange={() => setRouteIds((ids) => ids.includes(plant.id) ? ids.filter((id) => id !== plant.id) : ids.length < 16 ? [...ids, plant.id] : ids)} /></label><div><span className="fve-status" style={{ "--status": STATUS[plant.status]?.[1] }}>{STATUS[plant.status]?.[0] || "Bez stavu"}</span><h3>{plant.name || "Nepojmenovaná FVE"}</h3><p>{plant.contactPerson || "Kontakt neuveden"}{plant.phone ? ` · ${plant.phone}` : ""}</p><small>{plant.installedPower ? `${plant.installedPower} kWp` : "Výkon neuveden"}{plant.date ? ` · ${new Date(plant.date).toLocaleDateString("cs-CZ")}` : ""}</small></div><b>›</b></article>)}
      {!visible.length && <div className="fve-empty">Zatím zde nejsou žádné odpovídající elektrárny.</div>}
    </div></div>
    {selected && <div className="fve-detail-backdrop" onClick={() => setSelectedId(null)}><aside className="fve-detail" onClick={(e) => e.stopPropagation()}><header><div><span className="fve-status" style={{ "--status": STATUS[selected.status]?.[1] }}>{STATUS[selected.status]?.[0]}</span><h2>{selected.name}</h2></div><button onClick={() => setSelectedId(null)}>×</button></header><dl><div><dt>GPS</dt><dd>{selected.lat && selected.lng ? `${selected.lat}, ${selected.lng}` : "Neuvedeno"}</dd></div><div><dt>Kontakt</dt><dd>{selected.contactPerson || "—"}{selected.phone ? ` · ${selected.phone}` : ""}</dd></div><div><dt>Instalovaný výkon</dt><dd>{selected.installedPower ? `${selected.installedPower} kWp` : "—"}</dd></div><div><dt>Panely / střídače</dt><dd>{selected.panels || "—"} / {selected.inverters || "—"}</dd></div><div><dt>Uvedení do provozu</dt><dd>{selected.commissioningDate ? new Date(selected.commissioningDate).toLocaleDateString("cs-CZ") : "—"}</dd></div><div><dt>Poznámka</dt><dd>{selected.note || "—"}</dd></div></dl><div className="fve-detail-actions"><button className="fve-primary" onClick={() => onCreateFlight(selected)}>Naplánovat let v DFM</button>{selected.lat && selected.lng && <><a href={`https://mapy.com/zakladni?x=${selected.lng}&y=${selected.lat}&z=17`} target="_blank" rel="noreferrer">Otevřít Mapy</a><a href={`https://earth.google.com/web/search/${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer">Google Earth</a><button onClick={() => navigator.clipboard.writeText(`${selected.lat}, ${selected.lng}`)}>Kopírovat GPS</button></>}{canEdit && <><button onClick={() => setEditing({ ...selected })}>Upravit</button><button className="danger" onClick={() => remove(selected)}>Smazat</button></>}</div></aside></div>}
    {editing && <div className="fve-detail-backdrop"><form className="fve-editor" onSubmit={savePlant}><header><div><p className="eyebrow">Plánovač FVE</p><h2>{plants.some((p) => p.id === editing.id) ? "Upravit elektrárnu" : "Nová elektrárna"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></header><div className="fve-form-grid"><label className="wide">Název FVE<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></label><label>GPS šířka<input inputMode="decimal" value={editing.lat} onChange={(e) => setEditing({ ...editing, lat: e.target.value })} placeholder="49.224" /></label><label>GPS délka<input inputMode="decimal" value={editing.lng} onChange={(e) => setEditing({ ...editing, lng: e.target.value })} placeholder="17.667" /></label><label>Kontaktní osoba<input value={editing.contactPerson} onChange={(e) => setEditing({ ...editing, contactPerson: e.target.value })} /></label><label>Telefon<input type="tel" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></label><label>Stav<select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>{Object.entries(STATUS).map(([id, [label]]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Termín<input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></label><label>Výkon (kWp)<input type="number" step="0.01" value={editing.installedPower} onChange={(e) => setEditing({ ...editing, installedPower: e.target.value })} /></label><label>Počet panelů<input type="number" value={editing.panels} onChange={(e) => setEditing({ ...editing, panels: e.target.value })} /></label><label>Počet střídačů<input type="number" value={editing.inverters} onChange={(e) => setEditing({ ...editing, inverters: e.target.value })} /></label><label>Uvedení do provozu<input type="date" value={editing.commissioningDate} onChange={(e) => setEditing({ ...editing, commissioningDate: e.target.value })} /></label><label className="wide">Poznámka<textarea value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></label></div><button className="fve-primary">Uložit FVE</button></form></div>}
  </section>;
}
