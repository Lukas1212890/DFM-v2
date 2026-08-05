import React, { useEffect, useRef, useState } from 'react';
import AppV2 from './AppV2';
import './cloud-shell.css';

const STORAGE_KEY = 'dfm_react_pwa_v1';
const API_URL_KEY = 'dfm_cloud_api_url';
const SESSION_KEY = 'dfm_auth_session';
const DEFAULT_API_URL = 'https://dfm-cloud-api.bednarik.workers.dev';
const EMPTY = { drones: [], pilots: [], flights: [], tasks: [] };

const normalizeUrl = value => String(value || '').trim().replace(/\/+$/, '');
const hasRecords = data => (data?.drones?.length || 0) + (data?.pilots?.length || 0) + (data?.flights?.length || 0) + (data?.tasks?.length || 0) > 0;

export default function CloudShell() {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem(API_URL_KEY) || DEFAULT_API_URL);
  const [sessionToken, setSessionToken] = useState(() => localStorage.getItem(SESSION_KEY) || '');
  const [authState, setAuthState] = useState('checking');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [authStep, setAuthStep] = useState('email');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [status, setStatus] = useState('Připojuji…');
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const lastRemote = useRef('');
  const syncing = useRef(false);
  const saveTimer = useRef(null);

  const headers = (extra = {}) => ({
    'content-type': 'application/json',
    ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
    ...extra
  });

  const request = async (path, options = {}, useAuth = true) => {
    const response = await fetch(`${normalizeUrl(apiUrl)}${path}`, {
      ...options,
      headers: useAuth ? headers(options.headers) : { 'content-type': 'application/json', ...(options.headers || {}) }
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* empty response */ }
    if (!response.ok) {
      const error = new Error(payload.error || `Cloud odpověděl ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_KEY);
    setSessionToken('');
    setUser(null);
    setAuthState('login');
    setAuthStep('email');
    setPin('');
  };

  const verifyExistingSession = async () => {
    if (!sessionToken) {
      setAuthState('login');
      return;
    }
    try {
      const result = await request('/auth/me');
      setUser(result.user);
      setAuthState('ready');
      setStatus('Online');
    } catch (error) {
      if (error.status === 401) clearSession();
      else {
        setAuthState('offline');
        setStatus('Cloud nedostupný');
      }
    }
  };

  useEffect(() => {
    localStorage.setItem(API_URL_KEY, normalizeUrl(apiUrl));
    verifyExistingSession();
  }, []);

  const requestPin = async event => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      await request('/auth/request', { method: 'POST', body: JSON.stringify({ email }) }, false);
      setAuthStep('pin');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const verifyPin = async event => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      const result = await request('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ email, code: pin })
      }, false);
      localStorage.setItem(SESSION_KEY, result.token);
      setSessionToken(result.token);
      setUser(result.user);
      setAuthState('ready');
      setStatus('Online');
      setPin('');
      setTimeout(() => window.location.reload(), 100);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    try { await request('/auth/logout', { method: 'POST' }); } catch { /* local logout still applies */ }
    setProfileOpen(false);
    clearSession();
  };

  const pushState = async data => {
    if (!sessionToken || syncing.current) return;
    try {
      setStatus('Ukládám…');
      const serialized = JSON.stringify(data || EMPTY);
      await request('/state', { method: 'PUT', body: JSON.stringify({ data }) });
      lastRemote.current = serialized;
      setStatus('Online');
    } catch (error) {
      console.error(error);
      if (error.status === 401) clearSession();
      else setStatus('Offline, změny zůstaly v telefonu');
    }
  };

  const initialSync = async () => {
    if (!sessionToken || authState !== 'ready') return;
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
      if (error.status === 401) clearSession();
      else setStatus('Cloud nedostupný');
    }
  };

  useEffect(() => {
    if (authState !== 'ready' || !sessionToken) return undefined;
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
      } catch (error) {
        if (error.status === 401) clearSession();
        else setStatus('Offline, změny zůstaly v telefonu');
      }
    }, 8000);

    return () => {
      Storage.prototype.setItem = original;
      clearInterval(poll);
      clearTimeout(saveTimer.current);
    };
  }, [authState, sessionToken, apiUrl]);

  const saveSetup = event => {
    event.preventDefault();
    const normalized = normalizeUrl(apiUrl);
    if (!normalized) return;
    localStorage.setItem(API_URL_KEY, normalized);
    setApiUrl(normalized);
    setSetupOpen(false);
    setTimeout(() => window.location.reload(), 100);
  };

  const loadChat = async () => {
    if (!sessionToken) return;
    try {
      const result = await request('/chat');
      setMessages(result.messages || []);
    } catch (error) {
      if (error.status === 401) clearSession();
      else console.error(error);
    }
  };

  useEffect(() => {
    if (!chatOpen || authState !== 'ready') return undefined;
    loadChat();
    const poll = setInterval(loadChat, 5000);
    return () => clearInterval(poll);
  }, [chatOpen, authState, sessionToken]);

  const sendMessage = async event => {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setChatBusy(true);
    try {
      await request('/chat', { method: 'POST', body: JSON.stringify({ message: text }) });
      setMessage('');
      await loadChat();
    } finally {
      setChatBusy(false);
    }
  };

  if (authState === 'checking') {
    return <div className="auth-screen"><div className="auth-card auth-loading"><div className="auth-logo">DFM</div><p>Ověřuji přihlášení…</p></div></div>;
  }

  if (authState === 'login') {
    return <div className="auth-screen"><section className="auth-card">
      <div className="auth-logo">DFM</div>
      <p className="auth-kicker">Drone Fleet Manager</p>
      <h1>{authStep === 'email' ? 'Přihlášení' : 'Zadejte PIN'}</h1>
      {authStep === 'email' ? <form onSubmit={requestPin}>
        <label>Firemní e-mail<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="jmeno@dronetech.cz" autoComplete="email" required /></label>
        {authError && <p className="auth-error">{authError}</p>}
        <button disabled={authBusy}>{authBusy ? 'Odesílám…' : 'Poslat přihlašovací PIN'}</button>
      </form> : <form onSubmit={verifyPin}>
        <p className="auth-help">Šestimístný kód jsme poslali na <strong>{email}</strong>. Platí 10 minut.</p>
        <label>PIN<input className="pin-input" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} placeholder="000000" autoComplete="one-time-code" required /></label>
        {authError && <p className="auth-error">{authError}</p>}
        <button disabled={authBusy || pin.length !== 6}>{authBusy ? 'Ověřuji…' : 'Přihlásit se'}</button>
        <button className="auth-secondary" type="button" onClick={() => { setAuthStep('email'); setPin(''); setAuthError(''); }}>Změnit e-mail</button>
      </form>}
      <button className="auth-settings" onClick={() => setSetupOpen(true)}>Nastavení cloudu</button>
    </section>
    {setupOpen && <div className="cloud-overlay"><form className="cloud-panel" onSubmit={saveSetup}><h2>DFM Cloud</h2><label>Adresa API<input type="url" value={apiUrl} onChange={event => setApiUrl(event.target.value)} required /></label><div><button type="button" onClick={() => setSetupOpen(false)}>Zrušit</button><button type="submit">Uložit</button></div></form></div>}
    </div>;
  }

  if (authState === 'offline') {
    return <div className="auth-screen"><section className="auth-card"><div className="auth-logo">DFM</div><h1>Cloud není dostupný</h1><p className="auth-help">Zkontrolujte internetové připojení nebo adresu API.</p><button onClick={() => window.location.reload()}>Zkusit znovu</button><button className="auth-secondary" onClick={() => setSetupOpen(true)}>Nastavení cloudu</button></section>{setupOpen && <div className="cloud-overlay"><form className="cloud-panel" onSubmit={saveSetup}><h2>DFM Cloud</h2><label>Adresa API<input type="url" value={apiUrl} onChange={event => setApiUrl(event.target.value)} required /></label><div><button type="button" onClick={() => setSetupOpen(false)}>Zrušit</button><button type="submit">Uložit</button></div></form></div>}</div>;
  }

  return <>
    <AppV2 />
    <button className="cloud-status" onClick={() => setSetupOpen(true)}>{status}</button>
    <button className="user-chip" onClick={() => setProfileOpen(value => !value)}><span>{user?.name?.charAt(0) || 'U'}</span><div><strong>{user?.name}</strong><small>{user?.role === 'admin' ? 'Administrátor' : 'Uživatel'}</small></div></button>
    <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Otevřít DFM chat">💬</button>

    {profileOpen && <aside className="profile-menu"><strong>{user?.name}</strong><span>{user?.email}</span><em>{user?.role === 'admin' ? 'Administrátor' : 'Uživatel'}</em><button onClick={logout}>Odhlásit se</button></aside>}

    {setupOpen && <div className="cloud-overlay"><form className="cloud-panel" onSubmit={saveSetup}><h2>DFM Cloud</h2><label>Adresa API<input type="url" value={apiUrl} onChange={event => setApiUrl(event.target.value)} required /></label><div><button type="button" onClick={() => setSetupOpen(false)}>Zrušit</button><button type="submit">Uložit</button></div></form></div>}

    {chatOpen && <div className="chat-overlay"><section className="chat-panel">
      <header><div><small>Společná místnost</small><h2>DFM Chat</h2></div><button onClick={() => setChatOpen(false)}>×</button></header>
      <div className="chat-messages">{messages.map(item => <article key={item.id}><strong>{item.author}</strong><p>{item.message}</p><time>{new Date(`${item.created_at}Z`).toLocaleString('cs-CZ')}</time></article>)}{!messages.length && <p className="chat-empty">Zatím tu nikdo nic nenapsal.</p>}</div>
      <form onSubmit={sendMessage}><textarea value={message} onChange={event => setMessage(event.target.value)} placeholder={`Napiš zprávu jako ${user?.name}…`} required /><button disabled={chatBusy}>{chatBusy ? 'Odesílám…' : 'Odeslat'}</button></form>
    </section></div>}
  </>;
}
