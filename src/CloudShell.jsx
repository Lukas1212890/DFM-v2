import React, { useEffect, useRef, useState } from 'react';
import AppV2 from './AppV2';
import './cloud-shell.css';

const STORAGE_KEY = 'dfm_react_pwa_v1';
const API_URL_KEY = 'dfm_cloud_api_url';
const API_TOKEN_KEY = 'dfm_cloud_api_token';
const USER_KEY = 'dfm_chat_user';
const EMPTY = { drones: [], pilots: [], flights: [], tasks: [] };

const normalizeUrl = value => value.trim().replace(/\/+$/, '');
const hasRecords = data => (data?.drones?.length || 0) + (data?.pilots?.length || 0) + (data?.flights?.length || 0) + (data?.tasks?.length || 0) > 0;

export default function CloudShell() {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem(API_URL_KEY) || '');
  const [token, setToken] = useState(() => localStorage.getItem(API_TOKEN_KEY) || '');
  const [setupOpen, setSetupOpen] = useState(() => !localStorage.getItem(API_URL_KEY));
  const [status, setStatus] = useState(apiUrl ? 'Připojuji…' : 'Cloud není připojen');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUser, setChatUser] = useState(() => localStorage.getItem(USER_KEY) || '');
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const lastRemote = useRef('');
  const syncing = useRef(false);
  const saveTimer = useRef(null);

  const headers = (extra = {}) => ({
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extra
  });

  const request = async (path, options = {}) => {
    const response = await fetch(`${normalizeUrl(apiUrl)}${path}`, { ...options, headers: headers(options.headers) });
    if (!response.ok) throw new Error(`Cloud odpověděl ${response.status}`);
    return response.json();
  };

  const pushState = async data => {
    if (!apiUrl || syncing.current) return;
    try {
      setStatus('Ukládám…');
      const serialized = JSON.stringify(data || EMPTY);
      await request('/state', { method: 'PUT', body: JSON.stringify({ data }) });
      lastRemote.current = serialized;
      setStatus('Online');
    } catch (error) {
      console.error(error);
      setStatus('Offline, změny zůstaly v telefonu');
    }
  };

  const initialSync = async () => {
    if (!apiUrl) return;
    try {
      setStatus('Synchronizuji…');
      const result = await request('/state');
      const remote = result.data || EMPTY;
      const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || EMPTY;
      if (!hasRecords(remote) && hasRecords(local)) {
        await pushState(local);
      } else if (JSON.stringify(remote) !== JSON.stringify(local)) {
        syncing.current = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
        lastRemote.current = JSON.stringify(remote);
        syncing.current = false;
        window.location.reload();
        return;
      } else {
        lastRemote.current = JSON.stringify(remote);
      }
      setStatus('Online');
    } catch (error) {
      console.error(error);
      setStatus('Cloud nedostupný');
    }
  };

  useEffect(() => {
    if (!apiUrl) return undefined;
    initialSync();

    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      original.call(this, key, value);
      if (this === localStorage && key === STORAGE_KEY && !syncing.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          try { pushState(JSON.parse(value)); } catch { /* ignore invalid state */ }
        }, 500);
      }
    };

    const poll = setInterval(async () => {
      if (document.hidden || syncing.current) return;
      try {
        const result = await request('/state');
        const serialized = JSON.stringify(result.data || EMPTY);
        const local = localStorage.getItem(STORAGE_KEY) || JSON.stringify(EMPTY);
        if (lastRemote.current && serialized !== lastRemote.current && serialized !== local) {
          syncing.current = true;
          original.call(localStorage, STORAGE_KEY, serialized);
          syncing.current = false;
          window.location.reload();
        }
        lastRemote.current = serialized;
        setStatus('Online');
      } catch {
        setStatus('Offline, změny zůstaly v telefonu');
      }
    }, 8000);

    return () => {
      Storage.prototype.setItem = original;
      clearInterval(poll);
      clearTimeout(saveTimer.current);
    };
  }, [apiUrl, token]);

  const saveSetup = async event => {
    event.preventDefault();
    const normalized = normalizeUrl(apiUrl);
    if (!normalized) return;
    setApiUrl(normalized);
    localStorage.setItem(API_URL_KEY, normalized);
    localStorage.setItem(API_TOKEN_KEY, token.trim());
    setSetupOpen(false);
    setTimeout(() => window.location.reload(), 100);
  };

  const loadChat = async () => {
    if (!apiUrl) return;
    try {
      const result = await request('/chat');
      setMessages(result.messages || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!chatOpen) return undefined;
    loadChat();
    const poll = setInterval(loadChat, 5000);
    return () => clearInterval(poll);
  }, [chatOpen, apiUrl, token]);

  const sendMessage = async event => {
    event.preventDefault();
    const author = chatUser.trim();
    const text = message.trim();
    if (!author || !text) return;
    setChatBusy(true);
    try {
      localStorage.setItem(USER_KEY, author);
      await request('/chat', { method: 'POST', body: JSON.stringify({ author, message: text }) });
      setMessage('');
      await loadChat();
    } finally {
      setChatBusy(false);
    }
  };

  return <>
    <AppV2 />
    <button className="cloud-status" onClick={() => setSetupOpen(true)}>{status}</button>
    <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Otevřít DFM chat">💬</button>

    {setupOpen && <div className="cloud-overlay"><form className="cloud-panel" onSubmit={saveSetup}>
      <h2>DFM Cloud</h2>
      <p>Vlož adresu nasazeného Cloudflare Workeru. Token může zůstat prázdný, pokud ho ve Workeru nenastavíme.</p>
      <label>Adresa API<input type="url" value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://dfm-cloud-api.…workers.dev" required /></label>
      <label>Sdílený token<input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="volitelné" /></label>
      <div><button type="button" onClick={() => apiUrl && setSetupOpen(false)}>Zrušit</button><button type="submit">Připojit cloud</button></div>
    </form></div>}

    {chatOpen && <div className="chat-overlay"><section className="chat-panel">
      <header><div><small>Společná místnost</small><h2>DFM Chat</h2></div><button onClick={() => setChatOpen(false)}>×</button></header>
      <div className="chat-messages">{messages.map(item => <article key={item.id}><strong>{item.author}</strong><p>{item.message}</p><time>{new Date(`${item.created_at}Z`).toLocaleString('cs-CZ')}</time></article>)}{!messages.length && <p className="chat-empty">Zatím tu nikdo nic nenapsal.</p>}</div>
      <form onSubmit={sendMessage}>
        <input value={chatUser} onChange={e => setChatUser(e.target.value)} placeholder="Tvoje jméno" required />
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Napiš zprávu…" required />
        <button disabled={chatBusy}>{chatBusy ? 'Odesílám…' : 'Odeslat'}</button>
      </form>
    </section></div>}
  </>;
}
