"use client";

import { ChangeEvent, CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "./fve-current.css";
import importedPlants from "./fve-plants-seed.json";

type Status = "unpaid" | "paid" | "planned" | "done" | "evaluated";

type Plant = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  note: string;
  phone: string;
  contactPerson: string;
  installedPower: string;
  panels: string;
  inverters: string;
  commissioningDate: string;
  status: Status;
  date: string;
};

type FormState = Omit<Plant, "id" | "lat" | "lng"> & { coordinates: string };

const STORAGE_KEY = "fve-planner-plants-v1";
const ROUTE_STORAGE_KEY = "fve-planner-route-v1";
const MAP_LAYER_STORAGE_KEY = "fve-planner-map-layer-v1";

const statusMeta: Record<Status, { label: string; color: string; short: string }> = {
  unpaid: { label: "Záloha nezaplacena", color: "#f59e0b", short: "Nezaplaceno" },
  paid: { label: "Záloha zaplacena", color: "#22c55e", short: "Zaplaceno" },
  planned: { label: "Nafoceno", color: "#3b82f6", short: "Nafoceno" },
  done: { label: "Report založen", color: "#8b5cf6", short: "Report založen" },
  evaluated: { label: "Vyhodnoceno", color: "#64748b", short: "Vyhodnoceno" },
};

const emptyForm: FormState = {
  name: "",
  coordinates: "",
  note: "",
  phone: "",
  contactPerson: "",
  installedPower: "",
  panels: "",
  inverters: "",
  commissioningDate: "",
  status: "unpaid",
  date: "",
};

function parseCoordinates(input: string) {
  const cleaned = input.trim().replace(/[°NSEW]/gi, " ").replace(/\s+/g, " ");
  const matches = cleaned.match(/-?\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length < 2) return null;
  const lat = Number(matches[0].replace(",", "."));
  const lng = Number(matches[1].replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char] ?? char));
}

function phoneHref(value: string | undefined) {
  const raw = value?.trim() ?? "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return raw.startsWith("+") ? `+${digits}` : digits;
}

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export default function FvePlanner({ plants: externalPlants = [], onChange, onCreateFlight, canEdit = false }: {
  plants?: Plant[];
  onChange?: (plants: Plant[]) => void;
  onCreateFlight?: (plant: Plant) => void;
  canEdit?: boolean;
}) {
  const [plants, setPlantsState] = useState<Plant[]>(externalPlants);
  const plantsRef = useRef<Plant[]>(externalPlants);
  const seedSyncDone = useRef(false);
  function setPlants(update: Plant[] | ((current: Plant[]) => Plant[])) {
    const next = typeof update === "function" ? update(plantsRef.current) : update;
    plantsRef.current = next;
    setPlantsState(next);
    onChange?.(next);
  }
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [routeStart, setRouteStart] = useState("");
  const [returnToStart, setReturnToStart] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [detailPlantId, setDetailPlantId] = useState<string | null>(null);

  useEffect(() => {
    if (!formOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [formOpen]);
  const [viewMode, setViewMode] = useState<"active" | "archive" | "all">("active");
  const [message, setMessage] = useState("");
  const [loaded] = useState(true);
  const [syncStatus] = useState<"online">("online");
  const [mapReady, setMapReady] = useState(false);
  const [compactMap, setCompactMap] = useState(true);
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const knownIds = new Set(externalPlants.map((plant) => plant.id));
    const missingPlants = importedPlants.filter((plant) => !knownIds.has(plant.id));
    const mergedPlants = missingPlants.length ? [...externalPlants, ...missingPlants] : externalPlants;
    plantsRef.current = mergedPlants;
    setPlantsState(mergedPlants);
    if (missingPlants.length && canEdit && !seedSyncDone.current) {
      seedSyncDone.current = true;
      onChange?.(mergedPlants);
    }
  }, [externalPlants, canEdit, onChange]);

  useEffect(() => {
    if (loaded) localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify({ start: routeStart, returnToStart }));
  }, [routeStart, returnToStart, loaded]);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then(({ default: L }) => {
      if (cancelled || !mapElement.current || mapRef.current) return;
      leafletRef.current = L;
      mapRef.current = L.map(mapElement.current, { zoomControl: false }).setView([49.82, 15.48], 7);
      L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

      const standardMap = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      });
      const aerialMap = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Tiles &copy; Esri",
        },
      );
      const terrainMap = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        maxZoom: 17,
        attribution:
          'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, map style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      });

      const baseLayers = {
        "Běžná mapa": standardMap,
        "Letecká mapa": aerialMap,
        "Turistická mapa": terrainMap,
      };
      const savedLayer = localStorage.getItem(MAP_LAYER_STORAGE_KEY);
      const initialLayer =
        savedLayer === "aerial"
          ? aerialMap
          : savedLayer === "terrain"
            ? terrainMap
            : standardMap;
      initialLayer.addTo(mapRef.current);
      const compactMapControls = window.matchMedia("(max-width: 780px) and (pointer: coarse)").matches;
      L.control.layers(baseLayers, undefined, {
        position: "topright",
        collapsed: compactMapControls,
      }).addTo(mapRef.current);
      mapRef.current.on("baselayerchange", (event: { name: string }) => {
        const layerKey =
          event.name === "Letecká mapa"
            ? "aerial"
            : event.name === "Turistická mapa"
              ? "terrain"
              : "standard";
        localStorage.setItem(MAP_LAYER_STORAGE_KEY, layerKey);
      });

      layerRef.current = L.layerGroup().addTo(mapRef.current);
      routeLayerRef.current = L.layerGroup().addTo(mapRef.current);
      setMapReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => mapRef.current?.invalidateSize(), 220);
    return () => window.clearTimeout(timeout);
  }, [compactMap]);

  const visiblePlants = useMemo(() => plants.filter((plant) => {
    const matchesArchive =
      viewMode === "all" ||
      (viewMode === "archive" ? plant.status === "evaluated" : plant.status !== "evaluated");
    const matchesFilter = filter === "all" || plant.status === filter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [plant.name, plant.note, plant.contactPerson, plant.phone, plant.installedPower, plant.panels, plant.inverters, plant.commissioningDate]
      .some((value) => (value ?? "").toLowerCase().includes(query));
    return matchesArchive && matchesFilter && matchesSearch;
  }), [plants, filter, search, viewMode]);

  const routePlants = useMemo(() => {
    return selected.map((id) => plants.find((plant) => plant.id === id)).filter(Boolean) as Plant[];
  }, [plants, selected]);

  const routeOrder = useMemo(() => new Map(routePlants.map((plant, index) => [plant.id, index + 1])), [routePlants]);
  const detailPlant = detailPlantId ? plants.find((plant) => plant.id === detailPlantId) ?? null : null;

  useEffect(() => {
    if (!mapReady || !leafletRef.current || !layerRef.current) return;
    const L = leafletRef.current;
    layerRef.current.clearLayers();
    visiblePlants.forEach((plant) => {
      const meta = statusMeta[plant.status];
      const marker = L.marker([plant.lat, plant.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="map-pin ${selected.includes(plant.id) ? "is-selected" : ""}" style="--pin:${meta.color}"><span>${routeOrder.get(plant.id) ?? ""}</span></div>`,
          iconSize: [34, 42],
          iconAnchor: [17, 39],
          popupAnchor: [0, -36],
        }),
      });
      marker.bindTooltip(escapeHtml(plant.name), { direction: "top", offset: [0, -32], className: "plant-tooltip" });
      marker.bindPopup(`
        <div class="plant-popup">
          <p class="popup-kicker">${escapeHtml(meta.label)}</p>
          <h3>${escapeHtml(plant.name)}</h3>
          ${plant.contactPerson ? `<p><strong>Kontakt:</strong> ${escapeHtml(plant.contactPerson)}</p>` : ""}
          ${plant.phone && phoneHref(plant.phone) ? `<a class="phone-link" href="tel:${phoneHref(plant.phone)}">☎ Zavolat · ${escapeHtml(plant.phone)}</a>` : ""}
          <div class="popup-tech-details">
            ${plant.installedPower ? `<p><strong>Instalovaný výkon:</strong> ${escapeHtml(plant.installedPower)}</p>` : ""}
            ${plant.panels ? `<p><strong>Použité panely:</strong> ${escapeHtml(plant.panels)}</p>` : ""}
            ${plant.inverters ? `<p><strong>Použité střídače:</strong> ${escapeHtml(plant.inverters)}</p>` : ""}
            ${plant.commissioningDate ? `<p><strong>Uvedení do provozu:</strong> ${escapeHtml(new Date(`${plant.commissioningDate}T12:00:00`).toLocaleDateString("cs-CZ"))}</p>` : ""}
          </div>
          ${plant.note ? `<p><strong>Poznámky:</strong><br>${escapeHtml(plant.note).replace(/\n/g, "<br>")}</p>` : "<p>Bez poznámky</p>"}
          <div class="popup-status-actions">
            <span>Rychle změnit stav</span>
            <div>
              ${(Object.keys(statusMeta) as Status[]).map((status) => `<button type="button" data-quick-status="${status}" class="${plant.status === status ? "active" : ""}" style="--status-color:${statusMeta[status].color}">${escapeHtml(statusMeta[status].short)}</button>`).join("")}
            </div>
          </div>
          <button type="button" data-open-dronemap style="display:block;width:100%;margin-top:8px;padding:8px 10px;border:0;border-radius:7px;background:#13233d;color:#fff;font-size:11px;font-weight:800;text-align:center;cursor:pointer">Zkopírovat GPS a otevřít DroneMap ↗</button>
          <a class="earth-link" target="_blank" rel="noreferrer" href="https://earth.google.com/web/search/${plant.lat},${plant.lng}" style="display:block;width:100%;margin-top:6px;padding:8px 10px;border-radius:7px;background:#2563eb;color:#fff;font-size:11px;font-weight:800;text-align:center;text-decoration:none">🌍 ${plant.lat.toFixed(6)}, ${plant.lng.toFixed(6)} · Google Earth ↗</a>
          <a target="_blank" rel="noreferrer" href="https://mapy.com/fnc/v1/route?mapset=traffic&end=${plant.lng},${plant.lat}&routeType=car_fast_traffic&navigate=true">Navigovat přes Mapy.com →</a>
        </div>
      `);
      marker.on("popupopen", (event: any) => {
        const popupElement = event.popup.getElement();
        const statusButtons = popupElement?.querySelectorAll("[data-quick-status]") as NodeListOf<HTMLButtonElement> | undefined;
        statusButtons?.forEach((statusButton) => {
          statusButton.onclick = () => {
            const nextStatus = statusButton.dataset.quickStatus as Status;
            if (!statusMeta[nextStatus] || nextStatus === plant.status) return;
            setPlants((current) => current.map((item) => item.id === plant.id ? { ...item, status: nextStatus } : item));
            setMessage(`${plant.name}: ${statusMeta[nextStatus].label}.`);
            window.setTimeout(() => setMessage(""), 2800);
          };
        });
        const button = event.popup.getElement()?.querySelector("[data-open-dronemap]") as HTMLButtonElement | null;
        if (!button) return;
        button.onclick = () => {
          const coordinates = `${plant.lat}, ${plant.lng}`;
          const textarea = document.createElement("textarea");
          textarea.value = coordinates;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
          if (navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(coordinates).catch(() => undefined);
          }
          setMessage(`Souřadnice ${coordinates} byly zkopírovány. Vlož je do vyhledávání DroneMap.`);
          window.setTimeout(() => setMessage(""), 4200);
          openDroneMap(plant);
        };
      });
      const useFloatingDetail = window.matchMedia("(max-width: 780px) and (pointer: coarse)").matches;
      if (useFloatingDetail) {
        marker.unbindPopup();
        marker.on("click", () => setDetailPlantId(plant.id));
      }
      marker.addTo(layerRef.current);
    });
  }, [visiblePlants, selected, mapReady, routeOrder]);

  useEffect(() => {
    if (!mapReady || !leafletRef.current || !routeLayerRef.current) return;
    const L = leafletRef.current;
    routeLayerRef.current.clearLayers();
    const start = parseCoordinates(routeStart);
    if (!start || !routePlants.length) return;
    const points = [[start.lat, start.lng], ...routePlants.map((plant) => [plant.lat, plant.lng])];
    if (returnToStart) points.push([start.lat, start.lng]);
    L.polyline(points, { color: "#13233d", weight: 3, opacity: .72, dashArray: "7 8" }).addTo(routeLayerRef.current);
    L.circleMarker([start.lat, start.lng], {
      radius: 8, color: "#ffffff", weight: 3, fillColor: "#13233d", fillOpacity: 1,
    }).bindTooltip("Místo odjezdu", { direction: "top" }).addTo(routeLayerRef.current);
  }, [mapReady, routePlants, routeStart, returnToStart]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function savePlant(event: FormEvent) {
    event.preventDefault();
    const coords = parseCoordinates(form.coordinates);
    if (!form.name.trim() || !coords) {
      setMessage("Vyplň název a platné souřadnice, například 49.1951, 16.6068.");
      return;
    }
    const plant: Plant = {
      id: editingId ?? makeId(),
      name: form.name.trim(),
      lat: coords.lat,
      lng: coords.lng,
      note: form.note.trim(),
      phone: form.phone.trim(),
      contactPerson: form.contactPerson.trim(),
      installedPower: form.installedPower.trim(),
      panels: form.panels.trim(),
      inverters: form.inverters.trim(),
      commissioningDate: form.commissioningDate,
      status: form.status,
      date: form.date,
    };
    setPlants((current) => editingId ? current.map((item) => item.id === editingId ? plant : item) : [...current, plant]);
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(false);
    setMessage(editingId ? "FVE byla upravena." : "FVE byla přidána do mapy.");
    setTimeout(() => setMessage(""), 2800);
    mapRef.current?.setView([plant.lat, plant.lng], 13);
  }

  function editPlant(plant: Plant) {
    setEditingId(plant.id);
    setForm({
      name: plant.name,
      coordinates: `${plant.lat}, ${plant.lng}`,
      note: plant.note,
      phone: plant.phone ?? "",
      contactPerson: plant.contactPerson ?? "",
      installedPower: plant.installedPower ?? "",
      panels: plant.panels ?? "",
      inverters: plant.inverters ?? "",
      commissioningDate: plant.commissioningDate ?? "",
      status: plant.status,
      date: plant.date,
    });
    setFormOpen(true);
  }

  function removePlant(id: string) {
    if (!confirm("Opravdu chceš tuto FVE odstranit?")) return;
    setPlants((current) => current.filter((plant) => plant.id !== id));
    setSelected((current) => current.filter((item) => item !== id));
  }

  function toggleSelected(id: string) {
    if (!selected.includes(id) && selected.length >= 16) {
      setMessage("Do jedné trasy lze přes Mapy.com přidat nejvýše 16 FVE.");
      return;
    }
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(plants, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fve-inspekce-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error();
        setPlants(parsed);
        setMessage(`Importováno ${parsed.length} záznamů.`);
      } catch {
        setMessage("Soubor nemá správný formát.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function openDroneMap(plant: Plant) {
    const coordinates = `${plant.lat}, ${plant.lng}`;
    const textarea = document.createElement("textarea");
    textarea.value = coordinates;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(coordinates).catch(() => undefined);
    }
    setMessage(`Souřadnice ${coordinates} byly zkopírovány. Vlož je do vyhledávání DroneMap.`);
    window.setTimeout(() => setMessage(""), 4200);
    const isIPhone =
      /iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIPhone) {
      const shortcutUrl = `shortcuts://run-shortcut?name=${encodeURIComponent("DroneMap")}`;
      window.location.assign(shortcutUrl);
    } else {
      window.open("https://dronemap.gov.cz/", "_blank", "noopener,noreferrer");
    }
  }

  function openRoute() {
    const start = parseCoordinates(routeStart);
    if (!start) {
      setMessage("Zadej platné GPS souřadnice místa odjezdu.");
      return;
    }
    if (!routePlants.length) {
      setMessage("Nejdřív označ FVE, které chceš zařadit do trasy.");
      return;
    }
    if (returnToStart && routePlants.length > 15) {
      setMessage("Při návratu do místa odjezdu lze vybrat nejvýše 15 FVE.");
      return;
    }
    const destination = returnToStart ? start : routePlants[routePlants.length - 1];
    const waypointPlants = returnToStart ? routePlants : routePlants.slice(0, -1);
    const url = new URL("https://mapy.com/fnc/v1/route");
    url.searchParams.set("mapset", "traffic");
    url.searchParams.set("start", `${start.lng},${start.lat}`);
    url.searchParams.set("end", `${destination.lng},${destination.lat}`);
    url.searchParams.set("routeType", "car_fast_traffic");
    if (waypointPlants.length) {
      url.searchParams.set("waypoints", waypointPlants.map((plant) => `${plant.lng},${plant.lat}`).join(";"));
    }
    const isIPhone =
      /iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIPhone) {
      window.location.assign(url.toString());
      return;
    }
    const routeWindow = window.open(url.toString(), "_blank", "noopener,noreferrer");
    if (!routeWindow) {
      setMessage("Prohlížeč zablokoval nové okno. Povol pro tento web vyskakovací okna.");
    }
  }

  function openRouteDialog() {
    setRouteOpen(true);
    if (!routeStart.trim()) useCurrentLocation();
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Tento prohlížeč neumí zjistit aktuální polohu.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setRouteStart(`${coords.latitude.toFixed(7)}, ${coords.longitude.toFixed(7)}`);
        const locationMessage = "Aktuální poloha byla nastavena jako místo odjezdu.";
        setMessage(locationMessage);
        window.setTimeout(() => setMessage((current) => current === locationMessage ? "" : current), 2000);
      },
      () => setMessage("Polohu se nepodařilo získat. Zadej souřadnice ručně."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const stats = {
    total: plants.filter((plant) => plant.status !== "evaluated").length,
    archived: plants.filter((plant) => plant.status === "evaluated").length,
    ready: plants.filter((p) => p.status === "paid").length,
    planned: plants.filter((p) => p.status === "planned").length,
  };

  return (
    <main className="app-shell fve-current-native">
      <section className={`workspace ${compactMap ? "map-compact" : ""}`}>
        <aside className="sidebar">
          <div className="summary">
            <div><span>Celkem</span><strong>{stats.total}</strong></div>
            <div><span>Záloha zaplacena</span><strong className="green">{stats.ready}</strong></div>
            <div><span>Nafoceno</span><strong className="blue">{stats.planned}</strong></div>
          </div>

          <div className="search-row">
            <label className="search">
              <span>⌕</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hledat FVE…" aria-label="Hledat FVE" />
            </label>
          </div>

          <div className="filters" aria-label="Filtr podle stavu">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Vše</button>
            {(Object.keys(statusMeta) as Status[]).map((status) => (
              <button key={status} className={filter === status ? "active" : ""} onClick={() => { setFilter(status); setViewMode(status === "evaluated" ? "archive" : "active"); }} title={statusMeta[status].label}>
                <i style={{ background: statusMeta[status].color }} />{statusMeta[status].short}
              </button>
            ))}
          </div>

          <div className="list-heading">
            <span>{viewMode === "active" ? "Aktivní" : viewMode === "archive" ? "Archiv" : "Vše"} · {visiblePlants.length} {visiblePlants.length === 1 ? "lokalita" : "lokalit"}</span>
            <div className="list-heading-actions">
              {selected.length > 0 && <button onClick={() => setSelected([])}>Zrušit výběr</button>}
              <button className={viewMode === "active" ? "view-active" : ""} onClick={() => { setViewMode("active"); setFilter("all"); setSelected([]); }}>{`Aktivní${stats.total > 0 ? ` (${stats.total})` : ""}`}</button>
              <button className={viewMode === "archive" ? "view-active" : ""} onClick={() => { setViewMode("archive"); setFilter("all"); setSelected([]); }}>{`Archiv${stats.archived > 0 ? ` (${stats.archived})` : ""}`}</button>
              <button className={viewMode === "all" ? "view-active" : ""} onClick={() => { setViewMode("all"); setFilter("all"); setSelected([]); }}>{`Vše${plants.length > 0 ? ` (${plants.length})` : ""}`}</button>
            </div>
          </div>

          <div className="plant-list">
            {!plants.length && (
              <div className="empty-state">
                <div>⌖</div><strong>Zatím tu není žádná FVE</strong>
                <p>Přidej první lokalitu pomocí názvu a GPS souřadnic.</p>
                <button onClick={() => setFormOpen(true)}>Přidat první FVE</button>
              </div>
            )}
            {plants.length > 0 && !visiblePlants.length && <div className="empty-filter">{viewMode === "archive" ? "Archiv je zatím prázdný." : "Filtru neodpovídá žádná lokalita."}</div>}
            {visiblePlants.map((plant) => (
              <article className={`plant-card ${selected.includes(plant.id) ? "selected" : ""}`} key={plant.id}>
                <button className="select-box" onClick={() => toggleSelected(plant.id)} aria-label={`Vybrat ${plant.name}`}>
                  {selected.includes(plant.id) ? routeOrder.get(plant.id) : ""}
                </button>
                <button className="plant-main" onClick={() => mapRef.current?.setView([plant.lat, plant.lng], 14)}>
                  <span className="status-dot" style={{ background: statusMeta[plant.status].color }} />
                  <span><strong>{plant.name}</strong><small>{statusMeta[plant.status].label}{plant.contactPerson ? ` · ${plant.contactPerson}` : ""}</small></span>
                </button>
                <div className="card-actions">
                  {canEdit && <button onClick={() => editPlant(plant)} aria-label={`Upravit ${plant.name}`}>✎</button>}
                  {canEdit && <button onClick={() => removePlant(plant.id)} aria-label={`Odstranit ${plant.name}`}>×</button>}
                </div>
              </article>
            ))}
          </div>

        </aside>

        <section className="map-wrap">
          <div ref={mapElement} className="map" aria-label="Mapa inspekcí FVE" />
          <button
            type="button"
            className="map-size-toggle"
            onClick={() => setCompactMap((current) => !current)}
            aria-label={compactMap ? "Zvětšit mapu" : "Zmenšit mapu"}
          >
            {compactMap ? "⌃ Zvětšit mapu" : "⌄ Zmenšit mapu"}
          </button>
          <div className="map-legend">
            {(Object.keys(statusMeta) as Status[]).map((status) => <span key={status}><i style={{ background: statusMeta[status].color }} />{statusMeta[status].short}</span>)}
          </div>
        </section>
      </section>

      {selected.length > 0 && (
        <button type="button" className="fve-route-fab" onClick={openRouteDialog} aria-label={`Naplánovat trasu přes ${selected.length} FVE`}>
          <span>↗</span> Trasa <b>{selected.length}</b>
        </button>
      )}

      {canEdit && (
        <button
          type="button"
          className="fab fve-add-fab"
          onClick={() => { setEditingId(null); setForm(emptyForm); setFormOpen(true); }}
          aria-label="Přidat FVE"
        >
          +
        </button>
      )}

      {routeOpen && selected.length > 0 && (
        <div className="route-modal-backdrop" role="presentation" onClick={() => setRouteOpen(false)}>
          <section className="route-modal" role="dialog" aria-modal="true" aria-labelledby="route-modal-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><small>Plánování cesty</small><h2 id="route-modal-title">Trasa přes {selected.length} {selected.length === 1 ? "FVE" : "FVE"}</h2></div>
              <button type="button" onClick={() => setRouteOpen(false)} aria-label="Zavřít plánování trasy">×</button>
            </header>
            <div className="route-options">
              <label>
                Místo odjezdu
                <div className="start-row">
                  <input value={routeStart} onChange={(event) => setRouteStart(event.target.value)} placeholder="49.1951, 16.6068" aria-label="GPS místa odjezdu" />
                  <button type="button" onClick={useCurrentLocation} title="Použít aktuální polohu" aria-label="Použít aktuální polohu">◎</button>
                </div>
                <small>Zadej GPS souřadnice nebo použij aktuální polohu.</small>
              </label>
              <label className="return-check">
                <input type="checkbox" checked={returnToStart} onChange={(event) => setReturnToStart(event.target.checked)} />
                Vrátit se do místa odjezdu
              </label>
              <p className="route-hint">FVE jsou v trase seřazené podle pořadí, ve kterém jste je označili.</p>
              <button className="mapy-button" onClick={openRoute}>Naplánovat přes Mapy.com ↗</button>
            </div>
          </section>
        </div>
      )}

      {detailPlant && (
        <div className="plant-detail-backdrop" role="presentation">
          <section className="plant-detail-modal" role="dialog" aria-modal="true" aria-labelledby="plant-detail-title">
            <header className="plant-detail-head">
              <div>
                <p style={{ color: statusMeta[detailPlant.status].color }}>{statusMeta[detailPlant.status].label}</p>
                <h2 id="plant-detail-title">{detailPlant.name}</h2>
              </div>
              <button type="button" onClick={() => setDetailPlantId(null)} aria-label="Zavřít detail">×</button>
            </header>
            <div className="plant-detail-body">
              {detailPlant.contactPerson && <p><strong>Kontakt:</strong> {detailPlant.contactPerson}</p>}
              {detailPlant.phone && phoneHref(detailPlant.phone) && (
                <a className="detail-phone-button" href={`tel:${phoneHref(detailPlant.phone)}`}>☎ Zavolat · {detailPlant.phone}</a>
              )}

              <div className="detail-tech-grid">
                {detailPlant.installedPower && <p><strong>Instalovaný výkon</strong><span>{detailPlant.installedPower}</span></p>}
                {detailPlant.panels && <p><strong>Použité panely</strong><span>{detailPlant.panels}</span></p>}
                {detailPlant.inverters && <p><strong>Použité střídače</strong><span>{detailPlant.inverters}</span></p>}
                {detailPlant.commissioningDate && <p><strong>Uvedení do provozu</strong><span>{new Date(`${detailPlant.commissioningDate}T12:00:00`).toLocaleDateString("cs-CZ")}</span></p>}
              </div>

              <div className="detail-notes">
                <strong>Poznámky</strong>
                <p>{detailPlant.note || "Bez poznámky"}</p>
              </div>

              <div className="detail-status-actions">
                <span>Rychle změnit stav</span>
                <div>
                  {(Object.keys(statusMeta) as Status[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={detailPlant.status === status ? "active" : ""}
                      style={{ "--status-color": statusMeta[status].color } as CSSProperties}
                      onClick={() => {
                        setPlants((current) => current.map((item) => item.id === detailPlant.id ? { ...item, status } : item));
                        setMessage(`${detailPlant.name}: ${statusMeta[status].label}.`);
                        window.setTimeout(() => setMessage(""), 2800);
                      }}
                    >
                      {statusMeta[status].short}
                    </button>
                  ))}
                </div>
              </div>

              <div className="detail-link-actions">
                {onCreateFlight && <button type="button" className="detail-dfm-flight" onClick={() => onCreateFlight(detailPlant)}>Naplánovat let v DFM</button>}
                <button type="button" onClick={() => openDroneMap(detailPlant)}>Zkopírovat GPS a otevřít DroneMap ↗</button>
                <a target="_blank" rel="noreferrer" href={`https://earth.google.com/web/search/${detailPlant.lat},${detailPlant.lng}`}>🌍 {detailPlant.lat.toFixed(6)}, {detailPlant.lng.toFixed(6)} · Google Earth ↗</a>
                <a target="_blank" rel="noreferrer" href={`https://mapy.com/fnc/v1/route?mapset=traffic&end=${detailPlant.lng},${detailPlant.lat}&routeType=car_fast_traffic&navigate=true`}>Navigovat přes Mapy.com →</a>
              </div>
            </div>
          </section>
        </div>
      )}

      {formOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setFormOpen(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="form-title">
            <div className="modal-head">
              <div><p>LOKALITA INSPEKCE</p><h2 id="form-title">{editingId ? "Upravit FVE" : "Přidat novou FVE"}</h2></div>
              <button onClick={() => setFormOpen(false)} aria-label="Zavřít">×</button>
            </div>
            <form onSubmit={savePlant}>
              <label>Název FVE / zákazníka<input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="např. FVE Bojanovice" required /></label>
              <label>GPS souřadnice<input value={form.coordinates} onChange={(e) => updateField("coordinates", e.target.value)} placeholder="49.1951, 16.6068" required /><small>Vlož zeměpisnou šířku a délku oddělenou čárkou.</small></label>
              <label>Kontaktní osoba<input value={form.contactPerson} onChange={(e) => updateField("contactPerson", e.target.value)} placeholder="např. Jan Novák" /></label>
              <label>Telefonní číslo<input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="+420 123 456 789" /><small>V detailu FVE se zobrazí tlačítko pro přímé vytočení čísla.</small></label>
              <fieldset className="status-picker">
                <legend>Stav</legend>
                <div>
                  {(Object.keys(statusMeta) as Status[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={form.status === status ? "active" : ""}
                      style={form.status === status ? { backgroundColor: statusMeta[status].color, borderColor: statusMeta[status].color } : undefined}
                      onClick={() => updateField("status", status)}
                      aria-pressed={form.status === status}
                    >
                      <i style={{ background: statusMeta[status].color }} />{statusMeta[status].label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label>Instalovaný výkon<input value={form.installedPower} onChange={(e) => updateField("installedPower", e.target.value)} placeholder="např. 499,5 kWp" /></label>
              <label>Použité panely<input value={form.panels} onChange={(e) => updateField("panels", e.target.value)} placeholder="např. Jinko Solar JKM555N-72HL4" /></label>
              <label>Použité střídače<input value={form.inverters} onChange={(e) => updateField("inverters", e.target.value)} placeholder="např. 5× Huawei SUN2000-100KTL" /></label>
              <label>Datum uvedení do provozu<input type="date" value={form.commissioningDate} onChange={(e) => updateField("commissioningDate", e.target.value)} /></label>
              <label>Poznámky<textarea rows={4} value={form.note} onChange={(e) => updateField("note", e.target.value)} placeholder="Kontakt, přístup na střechu, zvláštní podmínky…" /></label>
              <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setFormOpen(false)}>Zrušit</button><button className="button primary" type="submit">{editingId ? "Uložit změny" : "Přidat do mapy"}</button></div>
            </form>
          </section>
        </div>
      )}

      {message && <div className="toast" role="status">{message}</div>}
    </main>
  );
}
