import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Mic, Image as ImageIcon, Link2, PenTool, FileText, Trash2, X, Network, Filter, Square, Eraser, Download, MoreVertical, Play, Pause, ArrowLeft, Star, Clock, Type, ChevronUp, ChevronDown, Lock, Unlock, Fingerprint, Shield, ShieldCheck, Eye, EyeOff, KeyRound, Folder, FolderPlus, Book, ChevronRight, FileDown, Clipboard, CheckSquare, Square as SquareEmpty, Sparkles, MessageSquare, Calendar, Tag as TagIcon, ListTodo, Wand2, Zap, Pin, PinOff, GripVertical, LayoutGrid, List as ListIcon, Rows3, Palette, Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle2, LogOut, Bold, Italic, Underline, Strikethrough, Heading1, Heading2, Heading3, List as ListBullet, ListOrdered } from 'lucide-react';

// ====================================================================
// GOOGLE DRIVE SYNC
// ====================================================================
// Client ID configurado en Google Cloud Console
const GOOGLE_CLIENT_ID = '136553914693-t0kdbeb0ejkhnps2hitcimue36k13uje.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_FILE_NAME = 'cerebro-data.json';

const GoogleAuth = {
  tokenClient: null,
  accessToken: null,
  expiresAt: 0,

  async loadGsi() {
    if (window.google?.accounts?.oauth2) return;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },

  async init() {
    await this.loadGsi();
    if (!this.tokenClient) {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {} // se sobreescribe en cada solicitud
      });
    }
  },

  async signIn() {
    await this.init();
    return new Promise((resolve, reject) => {
      this.tokenClient.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        this.accessToken = resp.access_token;
        this.expiresAt = Date.now() + (resp.expires_in - 60) * 1000;
        // Persistir token y datos básicos del usuario
        localStorage.setItem('gdrive-token', JSON.stringify({ token: this.accessToken, expiresAt: this.expiresAt }));
        resolve(resp.access_token);
      };
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  },

  async refreshToken() {
    await this.init();
    return new Promise((resolve, reject) => {
      this.tokenClient.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        this.accessToken = resp.access_token;
        this.expiresAt = Date.now() + (resp.expires_in - 60) * 1000;
        localStorage.setItem('gdrive-token', JSON.stringify({ token: this.accessToken, expiresAt: this.expiresAt }));
        resolve(resp.access_token);
      };
      this.tokenClient.requestAccessToken({ prompt: '' });
    });
  },

  loadFromStorage() {
    try {
      const raw = localStorage.getItem('gdrive-token');
      if (!raw) return false;
      const { token, expiresAt } = JSON.parse(raw);
      if (Date.now() > expiresAt) return false;
      this.accessToken = token;
      this.expiresAt = expiresAt;
      return true;
    } catch (e) { return false; }
  },

  signOut() {
    if (this.accessToken && window.google?.accounts?.oauth2) {
      try { window.google.accounts.oauth2.revoke(this.accessToken, () => {}); } catch (e) {}
    }
    this.accessToken = null;
    this.expiresAt = 0;
    localStorage.removeItem('gdrive-token');
    localStorage.removeItem('gdrive-fileid');
    localStorage.removeItem('gdrive-lastsync');
  },

  async getValidToken() {
    if (this.accessToken && Date.now() < this.expiresAt) return this.accessToken;
    if (this.loadFromStorage() && Date.now() < this.expiresAt) return this.accessToken;
    return await this.refreshToken();
  }
};

const DriveAPI = {
  async findFile() {
    const cached = localStorage.getItem('gdrive-fileid');
    if (cached) return cached;
    const token = await GoogleAuth.getValidToken();
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${DRIVE_FILE_NAME}'&fields=files(id,name,modifiedTime)`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` }});
    if (!res.ok) throw new Error('No se pudo listar archivos en Drive');
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      localStorage.setItem('gdrive-fileid', data.files[0].id);
      return data.files[0].id;
    }
    return null;
  },

  async createFile(content) {
    const token = await GoogleAuth.getValidToken();
    const metadata = { name: DRIVE_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
    const boundary = '-------cerebro' + Math.random().toString(36).slice(2);
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      content + `\r\n` +
      `--${boundary}--`;
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
    if (!res.ok) throw new Error('No se pudo crear el archivo en Drive');
    const data = await res.json();
    localStorage.setItem('gdrive-fileid', data.id);
    return data;
  },

  async updateFile(fileId, content) {
    const token = await GoogleAuth.getValidToken();
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: content
    });
    if (!res.ok) throw new Error('No se pudo actualizar el archivo');
    return await res.json();
  },

  async downloadFile(fileId) {
    const token = await GoogleAuth.getValidToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('No se pudo descargar el archivo');
    return await res.text();
  }
};

// Fusión inteligente con soporte de tombstones (notas marcadas como _deleted)
function mergeData(local, remote) {
  const localNotes = local.notes || [];
  const remoteNotes = remote.notes || [];
  const localNotebooks = local.notebooks || [];
  const remoteNotebooks = remote.notebooks || [];

  // Fusión por id: gana la versión con updatedAt más reciente, sea borrada o viva
  const noteMap = new Map();
  for (const n of localNotes) noteMap.set(n.id, n);
  for (const r of remoteNotes) {
    const ex = noteMap.get(r.id);
    if (!ex || (r.updatedAt || 0) > (ex.updatedAt || 0)) noteMap.set(r.id, r);
  }
  // Las tombstones se conservan en el archivo sincronizado por 30 días
  // pero NO se muestran en la UI (esa parte la maneja el filtro de visualización)
  const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 días
  const now = Date.now();
  const allNotes = Array.from(noteMap.values()).filter(n => {
    if (n._deleted && n.deletedAt && (now - n.deletedAt) > TOMBSTONE_TTL) return false;
    return true;
  });

  const nbMap = new Map();
  for (const nb of localNotebooks) nbMap.set(nb.id, nb);
  for (const r of remoteNotebooks) {
    const ex = nbMap.get(r.id);
    if (!ex || (r.createdAt || 0) > (ex.createdAt || 0)) nbMap.set(r.id, r);
  }
  return { notes: allNotes, notebooks: Array.from(nbMap.values()) };
}

// ====================================================================
// PALETA DE COLORES PARA NOTAS
// ====================================================================
const NOTE_COLORS = {
  default: { bg: 'bg-white', border: 'border-stone-200', borderHover: 'hover:border-stone-300', name: 'Por defecto', dot: '#ffffff', dotBorder: '#d6d3d1' },
  amber:   { bg: 'bg-amber-50', border: 'border-amber-200', borderHover: 'hover:border-amber-300', name: 'Ámbar', dot: '#fef3c7', dotBorder: '#fcd34d' },
  orange:  { bg: 'bg-orange-50', border: 'border-orange-200', borderHover: 'hover:border-orange-300', name: 'Naranja', dot: '#ffedd5', dotBorder: '#fdba74' },
  rose:    { bg: 'bg-rose-50', border: 'border-rose-200', borderHover: 'hover:border-rose-300', name: 'Rosa', dot: '#ffe4e6', dotBorder: '#fda4af' },
  green:   { bg: 'bg-emerald-50', border: 'border-emerald-200', borderHover: 'hover:border-emerald-300', name: 'Verde', dot: '#d1fae5', dotBorder: '#6ee7b7' },
  lime:    { bg: 'bg-lime-50', border: 'border-lime-200', borderHover: 'hover:border-lime-300', name: 'Lima', dot: '#ecfccb', dotBorder: '#bef264' },
  cyan:    { bg: 'bg-cyan-50', border: 'border-cyan-200', borderHover: 'hover:border-cyan-300', name: 'Cian', dot: '#cffafe', dotBorder: '#67e8f9' },
  blue:    { bg: 'bg-blue-50', border: 'border-blue-200', borderHover: 'hover:border-blue-300', name: 'Azul', dot: '#dbeafe', dotBorder: '#93c5fd' },
  indigo:  { bg: 'bg-indigo-50', border: 'border-indigo-200', borderHover: 'hover:border-indigo-300', name: 'Índigo', dot: '#e0e7ff', dotBorder: '#a5b4fc' },
  purple:  { bg: 'bg-purple-50', border: 'border-purple-200', borderHover: 'hover:border-purple-300', name: 'Lila', dot: '#f3e8ff', dotBorder: '#c4b5fd' },
  brown:   { bg: 'bg-amber-100/60', border: 'border-amber-300', borderHover: 'hover:border-amber-400', name: 'Tierra', dot: '#e7d5b3', dotBorder: '#a8825c' },
  gray:    { bg: 'bg-stone-100', border: 'border-stone-300', borderHover: 'hover:border-stone-400', name: 'Gris', dot: '#f5f5f4', dotBorder: '#a8a29e' }
};
const COLOR_KEYS = Object.keys(NOTE_COLORS);
const getNoteColor = (key) => NOTE_COLORS[key] || NOTE_COLORS.default;

// ====================================================================
// CRIPTO
// ====================================================================
const enc = new TextEncoder(); const dec = new TextDecoder();
async function deriveKey(p,s,it=250000){const b=await crypto.subtle.importKey('raw',enc.encode(p),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:s,iterations:it,hash:'SHA-256'},b,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
function bufToB64(b){const x=new Uint8Array(b);let s='';for(let i=0;i<x.length;i++)s+=String.fromCharCode(x[i]);return btoa(s);}
function b64ToBuf(b){const s=atob(b);const x=new Uint8Array(s.length);for(let i=0;i<s.length;i++)x[i]=s.charCodeAt(i);return x.buffer;}
async function encryptString(t,p){const s=crypto.getRandomValues(new Uint8Array(16));const iv=crypto.getRandomValues(new Uint8Array(12));const k=await deriveKey(p,s);const c=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(t));return{salt:bufToB64(s),iv:bufToB64(iv),data:bufToB64(c),v:1};}
async function decryptString(p,pw){const s=new Uint8Array(b64ToBuf(p.salt));const iv=new Uint8Array(b64ToBuf(p.iv));const k=await deriveKey(pw,s);const x=await crypto.subtle.decrypt({name:'AES-GCM',iv},k,b64ToBuf(p.data));return dec.decode(x);}
async function hashPin(p,s){const b=await crypto.subtle.importKey('raw',enc.encode(p),'PBKDF2',false,['deriveBits']);const x=await crypto.subtle.deriveBits({name:'PBKDF2',salt:s,iterations:100000,hash:'SHA-256'},b,256);return bufToB64(x);}

const Storage = {
  async get(k){if(typeof window!=='undefined'&&window.storage){const r=await window.storage.get(k);return r?r.value:null;}return localStorage.getItem(k);},
  async set(k,v){if(typeof window!=='undefined'&&window.storage)await window.storage.set(k,v);else localStorage.setItem(k,v);},
  async remove(k){if(typeof window!=='undefined'&&window.storage)await window.storage.delete(k);else localStorage.removeItem(k);}
};

// ====================================================================
// MOTOR DE BÚSQUEDA SEMÁNTICA (TF-IDF + similitud coseno)
// ====================================================================
const STOPWORDS = new Set(['el','la','los','las','un','una','unos','unas','de','del','al','a','en','y','o','u','que','es','son','para','por','con','sin','su','sus','este','esta','estos','estas','ese','esa','esos','esas','aquel','aquella','si','no','me','te','se','le','les','lo','mi','tu','yo','muy','mas','más','pero','porque','como','cuando','donde','cual','cuales','ya','también','tambien','algun','alguna','algo','todo','toda','todos','todas','ser','está','están','estaba','estaban','fue','fueron','tiene','tienen','tenía','hay','sobre','entre','desde','hasta','aunque','mientras','según','segun','cada','poco','poca','mucho','mucha','tanto','tanta','otro','otra','otros','otras','the','of','and','to','in','for','on','with','at','by','from','as','is','was','are','were','be','been','have','has','had','it','this','that','these','those']);

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9áéíóúñü\s]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

// Helpers para tareas: soporta tanto formato nuevo (items[]) como legacy ({text, done})
function getTaskItems(block) {
  if (!block || block.type !== 'task') return [];
  if (Array.isArray(block.items)) return block.items;
  if (block.text !== undefined) return [{ id: block.id, text: block.text, done: !!block.done, doneAt: block.doneAt || null }];
  return [];
}
function taskItemsTotal(blocks) {
  let total = 0, done = 0;
  for (const b of blocks) if (b.type === 'task') { const it = getTaskItems(b); total += it.length; done += it.filter(x => x.done).length; }
  return { total, done };
}
function hasAnyTask(blocks) { return blocks.some(b => b.type === 'task' && getTaskItems(b).length > 0); }
function pendingTasksCount(blocks) { let c = 0; for (const b of blocks) if (b.type === 'task') c += getTaskItems(b).filter(x => !x.done).length; return c; }
function firstTaskText(blocks) { for (const b of blocks) if (b.type === 'task') { const it = getTaskItems(b); if (it.length > 0 && it[0].text) return it[0].text; } return null; }

function noteText(note, decryptedBlocks = null) {
  const parts = [];
  if (note.title) parts.push(note.title);
  if (note.tags) parts.push(note.tags.join(' '));
  const blocks = note.encrypted ? (decryptedBlocks || []) : (note.blocks || []);
  for (const b of blocks) {
    if (b.type === 'text' && b.content) parts.push(richToPlain(b.content));
    if (b.type === 'link' && (b.url || b.content)) parts.push((b.url || '') + ' ' + (b.content || ''));
    if (b.type === 'image' && b.caption) parts.push(b.caption);
    if (b.type === 'task') {
      for (const it of getTaskItems(b)) if (it.text) parts.push(it.text);
    }
  }
  return parts.join(' ');
}

// Construye índice TF-IDF en memoria
function buildIndex(notes) {
  const docs = notes.filter(n => !n.encrypted).map(n => ({
    id: n.id,
    tokens: tokenize(noteText(n))
  }));
  const N = docs.length;
  const df = {}; // document frequency
  for (const d of docs) {
    const seen = new Set();
    for (const t of d.tokens) {
      if (!seen.has(t)) { df[t] = (df[t] || 0) + 1; seen.add(t); }
    }
  }
  const idf = {};
  for (const [t, f] of Object.entries(df)) idf[t] = Math.log(N / (1 + f));

  // vector tf-idf por documento
  const vectors = {};
  for (const d of docs) {
    const tf = {};
    for (const t of d.tokens) tf[t] = (tf[t] || 0) + 1;
    const v = {};
    let mag = 0;
    for (const [t, f] of Object.entries(tf)) {
      const w = (f / d.tokens.length) * (idf[t] || 0);
      v[t] = w;
      mag += w * w;
    }
    vectors[d.id] = { v, mag: Math.sqrt(mag), tokens: d.tokens };
  }
  return { vectors, idf, df, N };
}

function cosineSimilarity(query, docVec, idf) {
  const qtokens = tokenize(query);
  if (qtokens.length === 0 || !docVec) return 0;
  const qv = {};
  let qmag = 0;
  const qtf = {};
  for (const t of qtokens) qtf[t] = (qtf[t] || 0) + 1;
  for (const [t, f] of Object.entries(qtf)) {
    const w = (f / qtokens.length) * (idf[t] || 0);
    qv[t] = w;
    qmag += w * w;
  }
  qmag = Math.sqrt(qmag);
  if (qmag === 0 || docVec.mag === 0) return 0;
  let dot = 0;
  for (const [t, w] of Object.entries(qv)) {
    if (docVec.v[t]) dot += w * docVec.v[t];
  }
  return dot / (qmag * docVec.mag);
}

// Similitud entre dos notas (para sugerencias de conexión)
function noteSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.mag === 0 || vecB.mag === 0) return 0;
  let dot = 0;
  for (const [t, w] of Object.entries(vecA.v)) if (vecB.v[t]) dot += w * vecB.v[t];
  return dot / (vecA.mag * vecB.mag);
}

// ====================================================================
// APP
// ====================================================================
export default function CerebroDigital() {
  const [notes, setNotes] = useState([]);
  const [notebooks, setNotebooks] = useState([]);
  const [viewMode, setViewMode] = useState('grid'); // grid | list | cards
  // === Sincronización con Google Drive ===
  const [driveConnected, setDriveConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | synced | error | offline
  const [syncError, setSyncError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const syncTimerRef = useRef(null);
  const isSyncingRef = useRef(false);
  const skipNextSaveRef = useRef(false); // para evitar re-sync inmediato cuando los datos vienen del servidor
  const [view, setView] = useState('grid');
  const [activeNote, setActiveNote] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [activeNotebook, setActiveNotebook] = useState(null);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [securityConfig, setSecurityConfig] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(null);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({ types: [], hasTask: false, dateFrom: null, dateTo: null, starred: false });

  useEffect(() => {
    (async () => {
      try {
        const cfg = await Storage.get('security-config');
        if (cfg) setSecurityConfig(JSON.parse(cfg));
        const stored = await Storage.get('brain-notes');
        if (stored) setNotes(JSON.parse(stored).map(migrateNote));
        const nb = await Storage.get('brain-notebooks');
        if (nb) setNotebooks(JSON.parse(nb));
        const vm = await Storage.get('brain-viewmode');
        if (vm && ['grid','list','cards'].includes(vm)) setViewMode(vm);
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded && !securityConfig) setUnlocked(true); }, [loaded, securityConfig]);
  useEffect(() => { if (loaded) Storage.set('brain-notes', JSON.stringify(notes)); }, [notes, loaded]);
  useEffect(() => { if (loaded) Storage.set('brain-notebooks', JSON.stringify(notebooks)); }, [notebooks, loaded]);
  useEffect(() => { if (loaded) Storage.set('brain-viewmode', viewMode); }, [viewMode, loaded]);

  // === SINCRONIZACIÓN: detectar conexión previa al cargar ===
  useEffect(() => {
    if (!loaded || !unlocked) return;
    const wasConnected = localStorage.getItem('gdrive-connected') === '1';
    if (wasConnected) {
      (async () => {
        try {
          await GoogleAuth.init();
          if (GoogleAuth.loadFromStorage()) {
            setDriveConnected(true);
            // sincronizar inmediatamente al abrir la app
            await performSync('initial');
          } else {
            // intentar refrescar el token silenciosamente
            try {
              await GoogleAuth.refreshToken();
              setDriveConnected(true);
              await performSync('initial');
            } catch (e) {
              setDriveConnected(false);
              localStorage.removeItem('gdrive-connected');
            }
          }
        } catch (e) {
          console.error('Error inicializando Drive:', e);
        }
      })();
    }
    // detectar online/offline
    const onOnline = () => { if (driveConnected) performSync('reconnect'); };
    const onOffline = () => setSyncStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (!navigator.onLine) setSyncStatus('offline');
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loaded, unlocked]);

  // === SINCRONIZACIÓN: programar sync cuando cambian los datos ===
  useEffect(() => {
    if (!loaded || !driveConnected) return;
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => { performSync('auto'); }, 4000);
    return () => clearTimeout(syncTimerRef.current);
  }, [notes, notebooks, driveConnected, loaded]);

  // Función central de sincronización
  const performSync = async (reason = 'manual') => {
    if (isSyncingRef.current) return;
    if (!navigator.onLine) { setSyncStatus('offline'); return; }
    isSyncingRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const localData = { notes, notebooks, syncedAt: Date.now() };
      let fileId = await DriveAPI.findFile();
      if (!fileId) {
        // primera vez: subir lo local
        const created = await DriveAPI.createFile(JSON.stringify(localData));
        fileId = created.id;
      } else {
        // descargar y fusionar
        const remoteRaw = await DriveAPI.downloadFile(fileId);
        let remoteData;
        try { remoteData = JSON.parse(remoteRaw); } catch (e) { remoteData = { notes: [], notebooks: [] }; }
        const merged = mergeData(localData, remoteData);
        // actualizar estado local con la fusión
        skipNextSaveRef.current = true;
        setNotes(merged.notes);
        setNotebooks(merged.notebooks);
        // subir el resultado
        await DriveAPI.updateFile(fileId, JSON.stringify({ ...merged, syncedAt: Date.now() }));
      }
      const now = Date.now();
      setLastSync(now);
      localStorage.setItem('gdrive-lastsync', String(now));
      setSyncStatus('synced');
      // volver a idle después de un rato
      setTimeout(() => setSyncStatus(s => s === 'synced' ? 'idle' : s), 3000);
    } catch (e) {
      console.error('Error en sincronización:', e);
      setSyncError(e.message || 'Error desconocido');
      setSyncStatus('error');
      // Si el token expiró, intentar reconectar
      if (e.message?.includes('401') || e.message?.includes('token')) {
        try {
          await GoogleAuth.refreshToken();
          isSyncingRef.current = false;
          return performSync(reason);
        } catch (er) {
          setDriveConnected(false);
          localStorage.removeItem('gdrive-connected');
        }
      }
    } finally {
      isSyncingRef.current = false;
    }
  };

  // Cargar último sync al inicio
  useEffect(() => {
    if (!loaded) return;
    const ls = localStorage.getItem('gdrive-lastsync');
    if (ls) setLastSync(parseInt(ls));
  }, [loaded]);

  // Conectar/desconectar Drive
  const connectDrive = async () => {
    try {
      setSyncStatus('syncing');
      await GoogleAuth.signIn();
      setDriveConnected(true);
      localStorage.setItem('gdrive-connected', '1');
      await performSync('connect');
    } catch (e) {
      console.error('Error conectando Drive:', e);
      setSyncError(e.message);
      setSyncStatus('error');
    }
  };
  const disconnectDrive = () => {
    GoogleAuth.signOut();
    setDriveConnected(false);
    setSyncStatus('idle');
    setLastSync(null);
    localStorage.removeItem('gdrive-connected');
  };
  const manualSync = () => performSync('manual');

  // Share target / atajos
  useEffect(() => {
    if (!loaded || !unlocked) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const sharedUrl = params.get('url') || params.get('shared_url');
    const sharedText = params.get('text') || params.get('shared_text');
    const sharedTitle = params.get('title');
    if (action === 'new' || sharedUrl || sharedText) {
      const newNote = {
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        title: sharedTitle || '', blocks: [], tags: [], connections: [], notebookId: null,
        starred: false, encrypted: false, createdAt: Date.now(), updatedAt: Date.now()
      };
      if (sharedUrl) newNote.blocks.push({ id: 'shared-' + Math.random(), type: 'link', url: sharedUrl, content: sharedText && sharedText !== sharedUrl ? sharedText : '' });
      else if (sharedText) newNote.blocks.push({ id: 'shared-' + Math.random(), type: 'text', content: sharedText });
      const initType = params.get('type');
      if (action === 'new' && initType && !sharedUrl && !sharedText) {
        const block = { id: 'init-' + Math.random(), type: initType };
        if (initType === 'text') block.content = '';
        if (initType === 'link') { block.url = ''; block.content = ''; }
        newNote.blocks.push(block);
      }
      setNotes(prev => [newNote, ...prev]);
      setActiveNote(newNote); setView('detail');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loaded, unlocked]);

  // Índice de búsqueda (recalculado al cambiar notas)
  const searchIndex = useMemo(() => buildIndex(notes.filter(n => !n._deleted)), [notes]);

  const allTags = useMemo(() => {
    const set = new Set();
    notes.filter(n => !n._deleted).forEach(n => (n.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [notes]);

  // Filtrado: usa búsqueda semántica si hay query
  const filteredNotes = useMemo(() => {
    // Excluir tombstones (notas marcadas como _deleted) de la UI
    let res = notes.filter(n => !n._deleted);

    if (activeNotebook === 'inbox') res = res.filter(n => !n.notebookId);
    else if (activeNotebook) res = res.filter(n => n.notebookId === activeNotebook);
    if (activeTag) res = res.filter(n => (n.tags || []).includes(activeTag));

    // Filtros avanzados
    if (advancedFilters.starred) res = res.filter(n => n.starred);
    if (advancedFilters.types.length > 0) {
      res = res.filter(n => {
        const blocks = n.blocks || [];
        return advancedFilters.types.some(t => blocks.some(b => b.type === t));
      });
    }
    if (advancedFilters.hasTask) {
      res = res.filter(n => hasAnyTask(n.blocks || []));
    }
    if (advancedFilters.dateFrom) {
      const from = new Date(advancedFilters.dateFrom).getTime();
      res = res.filter(n => n.updatedAt >= from);
    }
    if (advancedFilters.dateTo) {
      const to = new Date(advancedFilters.dateTo).getTime() + 86400000;
      res = res.filter(n => n.updatedAt <= to);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const isTextSearch = q.length < 4 || /^[\w]+$/.test(q.replace(/\s/g,'')) === false;
      // Búsqueda dual: substring rápido + ranking semántico
      const scored = res.map(n => {
        let score = 0;
        // bonus por substring exacto
        if ((n.title || '').toLowerCase().includes(q)) score += 2;
        if ((n.tags || []).some(t => t.toLowerCase().includes(q))) score += 1.5;
        if (!n.encrypted) {
          for (const b of (n.blocks || [])) {
            if (b.type === 'text' && richToPlain(b.content || '').toLowerCase().includes(q)) { score += 1; break; }
            if (b.type === 'link' && ((b.url || '').toLowerCase().includes(q) || (b.content || '').toLowerCase().includes(q))) { score += 1; break; }
            if (b.type === 'image' && (b.caption || '').toLowerCase().includes(q)) { score += 0.8; break; }
            if (b.type === 'task' && getTaskItems(b).some(it => (it.text || '').toLowerCase().includes(q))) { score += 1; break; }
          }
          // semántica
          const sim = cosineSimilarity(q, searchIndex.vectors[n.id], searchIndex.idf);
          score += sim * 3;
        }
        return { note: n, score };
      });
      res = scored.filter(s => s.score > 0.05).sort((a, b) => b.score - a.score).map(s => s.note);
    } else {
      res = [...res].sort((a, b) => {
        if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        return b.updatedAt - a.updatedAt;
      });
    }
    return res;
  }, [notes, searchQuery, activeTag, activeNotebook, advancedFilters, searchIndex]);

  const createNewNote = (overrides = {}) => {
    const newNote = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      title: '', blocks: [], tags: [], connections: [],
      notebookId: activeNotebook && activeNotebook !== 'inbox' ? activeNotebook : null,
      starred: false, encrypted: false,
      createdAt: Date.now(), updatedAt: Date.now(),
      ...overrides
    };
    setNotes(prev => [newNote, ...prev]);
    setActiveNote(newNote); setView('detail');
  };

  const updateNote = (id, updates) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n));
    if (activeNote && activeNote.id === id) setActiveNote(prev => ({ ...prev, ...updates, updatedAt: Date.now() }));
  };
  const deleteNote = (id) => {
    // Si Drive está conectado, usamos tombstone para que la eliminación se propague
    // Si no, eliminamos de verdad
    if (driveConnected) {
      setNotes(prev => prev.map(n => {
        if (n.id === id) return { ...n, _deleted: true, deletedAt: Date.now(), updatedAt: Date.now(), blocks: [], encryptedBlocks: null };
        return { ...n, connections: (n.connections || []).filter(c => c !== id) };
      }));
    } else {
      setNotes(prev => prev.map(n => ({ ...n, connections: (n.connections || []).filter(c => c !== id) })).filter(n => n.id !== id));
    }
    if (activeNote && activeNote.id === id) { setActiveNote(null); setView('grid'); }
  };

  const encryptNote = async (id, pw) => { const n = notes.find(x => x.id === id); if (!n) return; const p = await encryptString(JSON.stringify(n.blocks || []), pw); updateNote(id, { encrypted: true, encryptedBlocks: p, blocks: [] }); };
  const decryptNoteBlocks = async (n, pw) => { if (!n.encrypted || !n.encryptedBlocks) return n.blocks || []; const x = await decryptString(n.encryptedBlocks, pw); return JSON.parse(x); };
  const removeEncryption = async (id, pw) => { const n = notes.find(x => x.id === id); if (!n || !n.encrypted) return; const b = await decryptNoteBlocks(n, pw); updateNote(id, { encrypted: false, encryptedBlocks: null, blocks: b }); };

  const exportData = () => { const blob = new Blob([JSON.stringify({notes,notebooks},null,2)],{type:'application/json'}); const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = `cerebro-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(u); };

  const createNotebook = (name, color = '#3b82f6') => { const nb = { id: 'nb-'+Date.now(), name, color, createdAt: Date.now() }; setNotebooks(prev => [...prev, nb]); return nb; };
  const renameNotebook = (id, name) => setNotebooks(prev => prev.map(n => n.id === id ? {...n, name} : n));
  const recolorNotebook = (id, color) => setNotebooks(prev => prev.map(n => n.id === id ? {...n, color} : n));
  const deleteNotebook = (id) => { setNotebooks(prev => prev.filter(n => n.id !== id)); setNotes(prev => prev.map(n => n.notebookId === id ? {...n, notebookId: null} : n)); if (activeNotebook === id) setActiveNotebook(null); };

  if (loaded && securityConfig && !unlocked) return <LockScreen securityConfig={securityConfig} onUnlock={() => setUnlocked(true)} onReset={async () => { if (confirm('¿Eliminar TODOS los datos?')) { await Storage.remove('security-config'); await Storage.remove('brain-notes'); await Storage.remove('brain-notebooks'); await Storage.remove('brain-viewmode'); location.reload(); }}} />;
  if (!loaded) return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><div className="text-stone-400 text-sm">Cargando…</div></div>;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,600;9..144,800&family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .display { font-family: 'Fraunces', serif; font-optical-sizing: auto; letter-spacing: -0.02em; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.3s ease forwards; }
        @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); } 100% { box-shadow: 0 0 0 16px rgba(245, 158, 11, 0); } }
        .pulse-ring { animation: pulse-ring 1.5s infinite; }
        @keyframes shake { 0%,100% { transform:translateX(0); } 25% { transform:translateX(-6px); } 75% { transform:translateX(6px); } }
        .shake { animation: shake 0.4s; }
      `}</style>

      {view === 'grid' && (
        <GridView notes={filteredNotes} allNotes={notes.filter(n => !n._deleted)} notebooks={notebooks}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          activeTag={activeTag} setActiveTag={setActiveTag}
          activeNotebook={activeNotebook} setActiveNotebook={setActiveNotebook}
          allTags={allTags} showTagFilter={showTagFilter} setShowTagFilter={setShowTagFilter}
          advancedFilters={advancedFilters} setAdvancedFilters={setAdvancedFilters}
          showAdvancedSearch={showAdvancedSearch} setShowAdvancedSearch={setShowAdvancedSearch}
          viewMode={viewMode} setViewMode={setViewMode}
          onOpen={(n) => { setActiveNote(n); setView('detail'); }}
          onCreate={() => createNewNote()}
          onGraph={() => setView('graph')}
          onTasks={() => setView('tasks')}
          onChat={() => setView('chat')}
          onExport={exportData}
          onSettings={() => setShowSettings(true)}
          onNotebooks={() => setView('notebooks')}
          hasSecurity={!!securityConfig}
          onUpdate={updateNote}
          onDelete={deleteNote}
          driveConnected={driveConnected}
          syncStatus={syncStatus}
          onManualSync={manualSync}
        />
      )}
      {view === 'notebooks' && <NotebooksView notebooks={notebooks} notes={notes.filter(n => !n._deleted)} onBack={() => setView('grid')} onSelect={(id) => { setActiveNotebook(id); setView('grid'); }} onCreate={createNotebook} onRename={renameNotebook} onRecolor={recolorNotebook} onDelete={deleteNotebook} />}
      {view === 'tasks' && <TasksView notes={notes.filter(n => !n._deleted)} onBack={() => setView('grid')} onOpen={(n) => { setActiveNote(n); setView('detail'); }} onUpdate={updateNote} />}
      {view === 'chat' && <ChatView notes={notes.filter(n => !n._deleted)} searchIndex={searchIndex} onBack={() => setView('grid')} onOpen={(n) => { setActiveNote(n); setView('detail'); }} />}
      {view === 'detail' && activeNote && <DetailView note={activeNote} allNotes={notes.filter(n => !n._deleted)} notebooks={notebooks} searchIndex={searchIndex} onBack={() => { setView('grid'); setActiveNote(null); }} onUpdate={updateNote} onDelete={deleteNote} onOpenNote={(id) => { const n = notes.find(x => x.id === id && !x._deleted); if (n) setActiveNote(n); }} encryptNote={encryptNote} decryptNoteBlocks={decryptNoteBlocks} removeEncryption={removeEncryption} onExportNote={(n) => setShowExport(n)} allTags={allTags} />}
      {view === 'graph' && <GraphView notes={notes.filter(n => !n._deleted)} onBack={() => setView('grid')} onOpen={(n) => { setActiveNote(n); setView('detail'); }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} securityConfig={securityConfig} setSecurityConfig={setSecurityConfig} driveConnected={driveConnected} syncStatus={syncStatus} syncError={syncError} lastSync={lastSync} onConnectDrive={connectDrive} onDisconnectDrive={disconnectDrive} onManualSync={manualSync} />}
      {showExport && <ExportModal note={showExport} onClose={() => setShowExport(null)} />}
    </div>
  );
}

// ============== LOCK SCREEN (sin cambios) ==============
function LockScreen({ securityConfig, onUnlock, onReset }) {
  const [pin, setPin] = useState(''); const [error, setError] = useState(false); const [tryingBio, setTryingBio] = useState(false);
  const checkPin = async () => { const s = new Uint8Array(b64ToBuf(securityConfig.pinSalt)); const h = await hashPin(pin, s); if (h === securityConfig.pinHash) onUnlock(); else { setError(true); setTimeout(() => setError(false), 500); setPin(''); }};
  useEffect(() => { if (pin.length >= 4 && pin.length === (securityConfig.pinLength || 4)) checkPin(); }, [pin]);
  const tryBiometric = async () => { if (!securityConfig.biometricEnabled || !securityConfig.biometricCredId) return; if (!window.PublicKeyCredential) return; setTryingBio(true); try { const c = crypto.getRandomValues(new Uint8Array(32)); await navigator.credentials.get({ publicKey: { challenge: c, allowCredentials: [{ id: b64ToBuf(securityConfig.biometricCredId), type: 'public-key', transports: ['internal'] }], userVerification: 'required', timeout: 60000 }}); onUnlock(); } catch (e) {} setTryingBio(false); };
  useEffect(() => { if (securityConfig.biometricEnabled) tryBiometric(); }, []);
  const pinLength = securityConfig.pinLength || 4;
  const pads = ['1','2','3','4','5','6','7','8','9','','0','del'];
  return (
    <div className="min-h-screen bg-stone-900 text-stone-50 flex flex-col items-center justify-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-6"><Lock size={28} className="text-amber-400" /></div>
      <h1 style={{ fontFamily: "'Fraunces', serif" }} className="text-3xl font-semibold mb-2">Cerebro</h1>
      <p className="text-sm text-stone-400 mb-10">Introduce tu PIN</p>
      <div className={`flex gap-3 mb-10 ${error ? 'shake' : ''}`}>{Array.from({length:pinLength}).map((_,i)=><div key={i} className={`w-3 h-3 rounded-full transition ${i<pin.length?'bg-amber-400':'bg-stone-700'}`}/>)}</div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-8">
        {pads.map((k,i) => k==='' ? <div key={i}/> : k==='del' ? <button key={i} onClick={()=>setPin(p=>p.slice(0,-1))} className="h-16 rounded-2xl bg-stone-800/50 hover:bg-stone-800 text-stone-300 text-sm active:scale-95 transition">←</button> : <button key={i} onClick={()=>pin.length<pinLength&&setPin(p=>p+k)} className="h-16 rounded-2xl bg-stone-800/50 hover:bg-stone-800 text-2xl font-light active:scale-95 transition">{k}</button>)}
      </div>
      {securityConfig.biometricEnabled && <button onClick={tryBiometric} disabled={tryingBio} className="flex items-center gap-2 text-amber-400 text-sm font-medium px-5 py-3 rounded-full border border-amber-400/30 hover:bg-amber-400/10 transition mb-6"><Fingerprint size={18} />{tryingBio ? 'Esperando…' : 'Usar huella'}</button>}
      <button onClick={onReset} className="text-xs text-stone-600 underline mt-4">Olvidé mi PIN</button>
    </div>
  );
}

// ============== SETTINGS (sin cambios funcionales) ==============
function SettingsModal({ onClose, securityConfig, setSecurityConfig, driveConnected, syncStatus, syncError, lastSync, onConnectDrive, onDisconnectDrive, onManualSync }) {
  const [step, setStep] = useState('main'); const [pin1, setPin1] = useState(''); const [pin2, setPin2] = useState(''); const [error, setError] = useState(''); const [info, setInfo] = useState(''); const pinLength = 6;
  const setupPin = async () => { if (pin1.length !== pinLength) return; if (pin1 !== pin2) { setError('Los PIN no coinciden'); setPin1(''); setPin2(''); setStep('set-pin-1'); setTimeout(() => setError(''), 3000); return; } const s = crypto.getRandomValues(new Uint8Array(16)); const h = await hashPin(pin1, s); const c = { ...(securityConfig || {}), pinSalt: bufToB64(s), pinHash: h, pinLength }; await Storage.set('security-config', JSON.stringify(c)); setSecurityConfig(c); setInfo('PIN configurado'); setStep('main'); setPin1(''); setPin2(''); };
  const setupBiometric = async () => { if (!window.PublicKeyCredential) { alert('Tu dispositivo no soporta biometría'); return; } try { const c = crypto.getRandomValues(new Uint8Array(32)); const u = crypto.getRandomValues(new Uint8Array(16)); const cr = await navigator.credentials.create({ publicKey: { challenge: c, rp: { name: 'Cerebro' }, user: { id: u, name: 'cerebro-user', displayName: 'Cerebro' }, pubKeyCredParams: [{alg:-7,type:'public-key'},{alg:-257,type:'public-key'}], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }, timeout: 60000, attestation: 'none' } }); const id = bufToB64(cr.rawId); const cfg = { ...securityConfig, biometricEnabled: true, biometricCredId: id }; await Storage.set('security-config', JSON.stringify(cfg)); setSecurityConfig(cfg); setInfo('Huella registrada'); } catch (e) { alert('No se pudo registrar la huella.'); } };
  const disableBio = async () => { const cfg = { ...securityConfig, biometricEnabled: false, biometricCredId: null }; await Storage.set('security-config', JSON.stringify(cfg)); setSecurityConfig(cfg); setInfo('Huella desactivada'); };
  const removeAll = async () => { if (!confirm('¿Quitar protección con PIN?')) return; await Storage.remove('security-config'); setSecurityConfig(null); setInfo('Seguridad desactivada'); };
  const renderPad = (val, set, label) => (<><p className="text-sm text-stone-600 text-center mb-6">{label}</p><div className="flex gap-2 justify-center mb-8">{Array.from({length:pinLength}).map((_,i)=><div key={i} className={`w-3 h-3 rounded-full transition ${i<val.length?'bg-stone-900':'bg-stone-300'}`}/>)}</div><div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">{['1','2','3','4','5','6','7','8','9','','0','del'].map((k,i)=>k===''?<div key={i}/>:k==='del'?<button key={i} onClick={()=>set(v=>v.slice(0,-1))} className="h-14 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 active:scale-95 transition">←</button>:<button key={i} onClick={()=>val.length<pinLength&&set(v=>v+k)} className="h-14 rounded-xl bg-stone-100 hover:bg-stone-200 text-xl font-light active:scale-95 transition">{k}</button>)}</div></>);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto fade-up" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">{step !== 'main' && <button onClick={() => { setStep('main'); setPin1(''); setPin2(''); }} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center"><ArrowLeft size={16} /></button>}<h2 className="display text-xl font-semibold">Seguridad</h2></div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-stone-100 flex items-center justify-center"><X size={18} /></button>
        </div>
        <div className="p-5">
          {info && <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 rounded-xl text-sm">{info}</div>}
          {error && <div className="mb-4 p-3 bg-rose-50 text-rose-800 rounded-xl text-sm">{error}</div>}
          {step === 'main' && (
            <div className="space-y-3">
              {/* === SINCRONIZACIÓN CON GOOGLE DRIVE === */}
              <div className="bg-gradient-to-br from-blue-50 to-emerald-50 rounded-2xl p-4 border border-blue-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white text-blue-600 flex items-center justify-center flex-shrink-0">
                    {driveConnected ? <Cloud size={18} className="text-emerald-600" /> : <CloudOff size={18} className="text-stone-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">Sincronización con Google Drive</h3>
                    <p className="text-xs text-stone-600 mt-0.5">
                      {driveConnected ? (
                        syncStatus === 'syncing' ? 'Sincronizando…' :
                        syncStatus === 'error' ? `Error: ${syncError || 'desconocido'}` :
                        syncStatus === 'offline' ? 'Sin conexión · se sincronizará al volver' :
                        lastSync ? `Última sincronización: ${formatRelativeTime(lastSync)}` :
                        'Conectado · sin sincronizaciones aún'
                      ) : 'Tus notas solo están en este dispositivo'}
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {driveConnected ? (
                        <>
                          <button onClick={onManualSync} disabled={syncStatus === 'syncing'} className="text-xs px-3 py-1.5 bg-stone-900 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-1">
                            <RefreshCw size={11} className={syncStatus === 'syncing' ? 'animate-spin' : ''} /> Sincronizar ahora
                          </button>
                          <button onClick={() => { if (confirm('¿Desconectar Drive? Las notas locales se mantienen.')) onDisconnectDrive(); }} className="text-xs px-3 py-1.5 border border-stone-300 rounded-lg flex items-center gap-1">
                            <LogOut size={11} /> Desconectar
                          </button>
                        </>
                      ) : (
                        <button onClick={onConnectDrive} disabled={syncStatus === 'syncing'} className="text-xs px-3 py-1.5 bg-stone-900 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-1.5">
                          <Cloud size={12} /> Conectar con Google Drive
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-stone-50 rounded-2xl p-4"><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><KeyRound size={18} /></div><div className="flex-1"><h3 className="font-semibold text-sm">PIN</h3><p className="text-xs text-stone-500">{securityConfig?.pinHash ? 'Configurado' : 'Sin configurar'}</p><div className="flex gap-2 mt-3"><button onClick={() => setStep('set-pin-1')} className="text-xs px-3 py-1.5 bg-stone-900 text-white rounded-lg font-medium">{securityConfig?.pinHash ? 'Cambiar' : 'Configurar'}</button>{securityConfig?.pinHash && <button onClick={removeAll} className="text-xs px-3 py-1.5 border border-stone-300 rounded-lg">Quitar</button>}</div></div></div></div>
              <div className={`bg-stone-50 rounded-2xl p-4 ${!securityConfig?.pinHash?'opacity-50 pointer-events-none':''}`}><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center"><Fingerprint size={18} /></div><div className="flex-1"><h3 className="font-semibold text-sm">Huella</h3><p className="text-xs text-stone-500">{!securityConfig?.pinHash?'Configura PIN primero':securityConfig?.biometricEnabled?'Activada':'Desactivada'}</p><div className="flex gap-2 mt-3">{securityConfig?.biometricEnabled?<button onClick={disableBio} className="text-xs px-3 py-1.5 border border-stone-300 rounded-lg">Desactivar</button>:<button onClick={setupBiometric} className="text-xs px-3 py-1.5 bg-stone-900 text-white rounded-lg font-medium">Activar</button>}</div></div></div></div>
            </div>
          )}
          {step === 'set-pin-1' && <div>{renderPad(pin1, setPin1, `Crea un PIN de ${pinLength} dígitos`)}<button onClick={() => pin1.length === pinLength && setStep('set-pin-2')} disabled={pin1.length !== pinLength} className="w-full mt-6 py-3 bg-stone-900 text-white rounded-xl text-sm font-medium disabled:opacity-40">Continuar</button></div>}
          {step === 'set-pin-2' && <div>{renderPad(pin2, setPin2, 'Confirma el PIN')}<button onClick={setupPin} disabled={pin2.length !== pinLength} className="w-full mt-6 py-3 bg-stone-900 text-white rounded-xl text-sm font-medium disabled:opacity-40">Confirmar</button></div>}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(ts) {
  if (!ts) return 'nunca';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return 'ahora';
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} ${hr === 1 ? 'hora' : 'horas'}`;
  const d = Math.floor(hr / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

function migrateNote(n) {
  if (n.blocks !== undefined) {
    if (n.notebookId === undefined) n.notebookId = null;
    return n;
  }
  const blocks = [];
  if (n.content) blocks.push({ id: 'mig-' + Math.random(), type: 'text', content: n.content });
  if (n.imageData) blocks.push({ id: 'mig-' + Math.random(), type: 'image', imageData: n.imageData });
  if (n.drawingData) blocks.push({ id: 'mig-' + Math.random(), type: 'drawing', drawingData: n.drawingData });
  if (n.audioData) blocks.push({ id: 'mig-' + Math.random(), type: 'voice', audioData: n.audioData, duration: n.duration });
  if (n.url) blocks.push({ id: 'mig-' + Math.random(), type: 'link', url: n.url, content: n.content || '' });
  return { ...n, blocks, notebookId: null };
}
const newBlockId = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

// ============== INDICADOR DE SINCRONIZACIÓN ==============
function SyncBadge({ status, onClick }) {
  const config = {
    idle:    { Icon: Cloud,         color: 'text-emerald-600 bg-emerald-50 border-emerald-200', spin: false, title: 'Sincronizado · toca para sincronizar ahora' },
    syncing: { Icon: RefreshCw,     color: 'text-blue-600 bg-blue-50 border-blue-200',          spin: true,  title: 'Sincronizando…' },
    synced:  { Icon: CheckCircle2,  color: 'text-emerald-600 bg-emerald-50 border-emerald-200', spin: false, title: 'Cambios guardados en Drive' },
    error:   { Icon: AlertCircle,   color: 'text-rose-600 bg-rose-50 border-rose-200',          spin: false, title: 'Error al sincronizar · toca para reintentar' },
    offline: { Icon: CloudOff,      color: 'text-stone-500 bg-stone-100 border-stone-200',      spin: false, title: 'Sin conexión' }
  }[status] || { Icon: Cloud, color: 'text-stone-500 bg-stone-100 border-stone-200', spin: false, title: '' };
  const { Icon, color, spin, title } = config;
  return (
    <button onClick={onClick} title={title} className={`w-10 h-10 rounded-full border flex items-center justify-center active:scale-95 transition ${color}`}>
      <Icon size={15} className={spin ? 'animate-spin' : ''} />
    </button>
  );
}

// ============== GRID VIEW ==============
function GridView({ notes, allNotes, notebooks, searchQuery, setSearchQuery, activeTag, setActiveTag, activeNotebook, setActiveNotebook, allTags, showTagFilter, setShowTagFilter, advancedFilters, setAdvancedFilters, showAdvancedSearch, setShowAdvancedSearch, viewMode, setViewMode, onOpen, onCreate, onGraph, onTasks, onChat, onExport, onSettings, onNotebooks, hasSecurity, onUpdate, onDelete, driveConnected, syncStatus, onManualSync }) {
  const [showMenu, setShowMenu] = useState(false);
  const starred = notes.filter(n => n.starred);
  const currentNotebook = activeNotebook && activeNotebook !== 'inbox' ? notebooks.find(n => n.id === activeNotebook) : null;
  const inboxCount = allNotes.filter(n => !n.notebookId).length;
  const pendingTaskCount = allNotes.reduce((acc, n) => acc + (n.encrypted ? 0 : pendingTasksCount(n.blocks || [])), 0);
  const hasActiveFilters = advancedFilters.types.length > 0 || advancedFilters.hasTask || advancedFilters.starred || advancedFilters.dateFrom || advancedFilters.dateTo;

  return (
    <div className="pb-32">
      <header className="sticky top-0 z-40 bg-stone-50/90 backdrop-blur-xl border-b border-stone-200">
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center justify-between mb-5">
            <div>
              {activeNotebook ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => setActiveNotebook(null)} className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center"><ArrowLeft size={16} /></button>
                  {currentNotebook ? <><div className="w-3 h-3 rounded-full" style={{backgroundColor:currentNotebook.color}}/><h1 className="display text-2xl font-semibold">{currentNotebook.name}</h1></> : <h1 className="display text-2xl font-semibold">Bandeja</h1>}
                </div>
              ) : (
                <><h1 className="display text-3xl font-semibold">Cerebro</h1><p className="text-xs text-stone-500 mt-0.5">{allNotes.length} notas · {notebooks.length} cuadernos · {allTags.length} etiquetas</p></>
              )}
            </div>
            <div className="flex items-center gap-2">
              {driveConnected && <SyncBadge status={syncStatus} onClick={onManualSync} />}
              <button onClick={onChat} className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center active:scale-95 transition" title="Pregúntale a tu cerebro"><Sparkles size={16} /></button>
              <button onClick={onGraph} className="w-10 h-10 rounded-full bg-stone-900 text-stone-50 flex items-center justify-center active:scale-95 transition"><Network size={18} /></button>
              <button onClick={() => setShowMenu(!showMenu)} className="w-10 h-10 rounded-full border border-stone-300 flex items-center justify-center active:scale-95 transition"><MoreVertical size={18} /></button>
            </div>
          </div>
          {showMenu && (
            <div className="absolute right-5 top-20 bg-white border border-stone-200 rounded-2xl shadow-xl p-2 z-50 min-w-[200px] fade-up">
              <button onClick={() => { onTasks(); setShowMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 rounded-xl text-left text-sm">
                <ListTodo size={16} /> Tareas
                {pendingTaskCount > 0 && <span className="ml-auto bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingTaskCount}</span>}
              </button>
              <button onClick={() => { onNotebooks(); setShowMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 rounded-xl text-left text-sm"><Book size={16} /> Cuadernos</button>
              <button onClick={() => { onSettings(); setShowMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 rounded-xl text-left text-sm">{hasSecurity ? <ShieldCheck size={16} className="text-emerald-600" /> : <Shield size={16} />}Seguridad</button>
              <button onClick={() => { onExport(); setShowMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 rounded-xl text-left text-sm"><Download size={16} /> Exportar todo</button>
            </div>
          )}
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar (entiende sinónimos)..." className="w-full pl-11 pr-20 py-3.5 bg-white border border-stone-200 rounded-2xl text-sm focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 transition" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-20 top-1/2 -translate-y-1/2 text-stone-400"><X size={16} /></button>}
            <button onClick={() => setShowAdvancedSearch(!showAdvancedSearch)} className={`absolute right-11 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center transition ${hasActiveFilters || showAdvancedSearch ? 'bg-amber-500 text-white' : 'text-stone-400'}`} title="Filtros avanzados"><Wand2 size={14} /></button>
            <button onClick={() => setShowTagFilter(!showTagFilter)} className={`absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center transition ${activeTag || showTagFilter ? 'bg-amber-500 text-white' : 'text-stone-400'}`}><Filter size={14} /></button>
          </div>

          {showAdvancedSearch && <AdvancedSearchPanel filters={advancedFilters} setFilters={setAdvancedFilters} />}

          {/* Selector de vista */}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-stone-500">{notes.length} {notes.length === 1 ? 'resultado' : 'resultados'}</p>
            <div className="flex items-center bg-white border border-stone-200 rounded-full p-0.5">
              <button onClick={() => setViewMode('grid')} title="Cuadrícula" className={`w-7 h-7 rounded-full flex items-center justify-center transition ${viewMode === 'grid' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-900'}`}>
                <LayoutGrid size={13} />
              </button>
              <button onClick={() => setViewMode('list')} title="Lista" className={`w-7 h-7 rounded-full flex items-center justify-center transition ${viewMode === 'list' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-900'}`}>
                <ListIcon size={13} />
              </button>
              <button onClick={() => setViewMode('cards')} title="Tarjetas grandes" className={`w-7 h-7 rounded-full flex items-center justify-center transition ${viewMode === 'cards' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-900'}`}>
                <Rows3 size={13} />
              </button>
            </div>
          </div>

          {showTagFilter && allTags.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1 fade-up">
              <button onClick={() => setActiveTag(null)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${!activeTag?'bg-stone-900 text-white border-stone-900':'bg-white text-stone-600 border-stone-200'}`}>Todas</button>
              {allTags.map(tag => <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${activeTag===tag?'bg-amber-500 text-white border-amber-500':'bg-white text-stone-600 border-stone-200'}`}>#{tag}</button>)}
            </div>
          )}
        </div>

        {!activeNotebook && (notebooks.length > 0 || inboxCount > 0) && (
          <div className="px-5 pb-4 flex gap-2 overflow-x-auto scrollbar-hide">
            <button onClick={() => setActiveNotebook('inbox')} className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-white border border-stone-200 rounded-full text-xs"><Folder size={12} className="text-stone-500" /><span className="font-medium">Bandeja</span><span className="text-stone-400">{inboxCount}</span></button>
            {notebooks.map(nb => { const c = allNotes.filter(n => n.notebookId === nb.id).length; return <button key={nb.id} onClick={() => setActiveNotebook(nb.id)} className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-white border border-stone-200 rounded-full text-xs"><div className="w-2 h-2 rounded-full" style={{backgroundColor:nb.color}}/><span className="font-medium">{nb.name}</span><span className="text-stone-400">{c}</span></button>; })}
            <button onClick={onNotebooks} className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border border-dashed border-stone-300 rounded-full text-xs text-stone-500"><Plus size={12} /> Cuaderno</button>
          </div>
        )}
      </header>

      {allNotes.length === 0 && (
        <div className="px-5 pt-16 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center"><Network size={32} className="text-amber-700" /></div>
          <h2 className="display text-2xl font-semibold mb-2">Tu cerebro está vacío</h2>
          <p className="text-sm text-stone-500 max-w-xs mx-auto leading-relaxed">Captura ideas, tareas, fotos, audios y enlaces. Conéctalas para construir tu segundo cerebro.</p>
          <button onClick={onCreate} className="mt-8 inline-flex items-center gap-2 px-5 py-3 bg-stone-900 text-white rounded-full text-sm font-medium active:scale-95 transition"><Plus size={16} /> Crear primera nota</button>
        </div>
      )}

      {allNotes.length > 0 && notes.length === 0 && <div className="px-5 pt-16 text-center"><p className="text-sm text-stone-500">No se encontraron resultados</p></div>}

      {searchQuery && notes.length > 0 && <div className="px-5 pt-3 pb-1"><p className="text-xs text-stone-500 flex items-center gap-1"><Sparkles size={11} className="text-amber-500" /> Resultados ordenados por relevancia</p></div>}

      {/* FIJADAS: solo cuando no hay filtros activos */}
      {(() => {
        const pinned = notes.filter(n => n.pinned);
        const unpinned = notes.filter(n => !n.pinned);
        const showSections = !searchQuery && !activeTag && !hasActiveFilters;

        // Layout dinámico según viewMode
        const containerClass = viewMode === 'grid' ? 'grid grid-cols-2 gap-3'
          : viewMode === 'list' ? 'flex flex-col gap-1.5'
          : 'flex flex-col gap-3'; // cards

        const renderNote = (n, i) => (
          <NoteCardWrapper key={n.id} note={n} notebooks={notebooks} viewMode={viewMode} onOpen={onOpen} onUpdate={onUpdate} onDelete={onDelete} delayMs={i*30} />
        );

        if (!showSections) {
          return notes.length > 0 && (
            <div className="px-5 pt-5">
              <div className={containerClass}>
                {notes.map(renderNote)}
              </div>
            </div>
          );
        }
        return (
          <>
            {pinned.length > 0 && (
              <div className="px-5 pt-5">
                <div className="flex items-center gap-1.5 mb-3"><Pin size={14} className="text-amber-600 fill-amber-600" /><h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Fijadas</h3></div>
                <div className={containerClass}>
                  {pinned.map(renderNote)}
                </div>
              </div>
            )}
            {starred.length > 0 && !activeNotebook && viewMode === 'grid' && (
              <div className="px-5 pt-5">
                <div className="flex items-center gap-1.5 mb-3"><Star size={14} className="text-amber-500 fill-amber-500" /><h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Destacadas</h3></div>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-2">{starred.slice(0, 5).map(n => <div key={n.id} className="flex-shrink-0 w-44"><NoteCardWrapper note={n} notebooks={notebooks} viewMode="grid" onOpen={onOpen} onUpdate={onUpdate} onDelete={onDelete} /></div>)}</div>
              </div>
            )}
            {unpinned.length > 0 && (
              <div className="px-5 pt-5">
                {(pinned.length > 0 || (starred.length > 0 && viewMode === 'grid')) && <div className="flex items-center gap-1.5 mb-3"><Clock size={14} className="text-stone-400" /><h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{activeNotebook ? 'Notas' : 'Recientes'}</h3></div>}
                <div className={containerClass}>
                  {unpinned.map(renderNote)}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {allNotes.length > 0 && <button onClick={onCreate} className="fixed bottom-6 right-5 z-40 w-14 h-14 rounded-full bg-stone-900 text-white flex items-center justify-center shadow-xl active:scale-90 transition"><Plus size={24} /></button>}
    </div>
  );
}

// ============== PANEL DE BÚSQUEDA AVANZADA ==============
function AdvancedSearchPanel({ filters, setFilters }) {
  const types = [
    { v: 'text', l: 'Texto', icon: Type },
    { v: 'image', l: 'Foto', icon: ImageIcon },
    { v: 'voice', l: 'Voz', icon: Mic },
    { v: 'drawing', l: 'Dibujo', icon: PenTool },
    { v: 'link', l: 'Enlace', icon: Link2 }
  ];
  const toggleType = (t) => setFilters(f => ({ ...f, types: f.types.includes(t) ? f.types.filter(x => x !== t) : [...f.types, t] }));
  return (
    <div className="mt-3 p-3 bg-white border border-stone-200 rounded-2xl space-y-3 fade-up">
      <div>
        <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Contiene</p>
        <div className="flex flex-wrap gap-1.5">
          {types.map(t => { const Icon = t.icon; const on = filters.types.includes(t.v); return <button key={t.v} onClick={() => toggleType(t.v)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${on ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}><Icon size={11} />{t.l}</button>; })}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFilters(f => ({...f, starred: !f.starred}))} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${filters.starred ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-600'}`}><Star size={11} className={filters.starred ? 'fill-white' : ''}/>Destacadas</button>
        <button onClick={() => setFilters(f => ({...f, hasTask: !f.hasTask}))} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${filters.hasTask ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-600'}`}><CheckSquare size={11}/>Con tareas</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><p className="text-[10px] font-semibold text-stone-500 uppercase mb-1">Desde</p><input type="date" value={filters.dateFrom || ''} onChange={e => setFilters(f => ({...f, dateFrom: e.target.value || null}))} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-stone-900" /></div>
        <div><p className="text-[10px] font-semibold text-stone-500 uppercase mb-1">Hasta</p><input type="date" value={filters.dateTo || ''} onChange={e => setFilters(f => ({...f, dateTo: e.target.value || null}))} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-stone-900" /></div>
      </div>
      <button onClick={() => setFilters({ types: [], hasTask: false, dateFrom: null, dateTo: null, starred: false })} className="text-xs text-stone-500 underline">Limpiar filtros</button>
    </div>
  );
}

// ============== NOTE CARD WRAPPER (long-press + menú contextual) ==============
function NoteCardWrapper({ note, notebooks, viewMode = 'grid', onOpen, onUpdate, onDelete, delayMs = 0 }) {
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pressTimer = useRef(null);
  const movedRef = useRef(false);

  // Long-press: 500ms manteniendo presionado
  const startPress = (e) => {
    movedRef.current = false;
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(30);
      setShowMenu(true);
    }, 500);
  };
  const cancelPress = () => { clearTimeout(pressTimer.current); };
  const onTouchMove = () => { movedRef.current = true; clearTimeout(pressTimer.current); };

  const handleClick = (e) => {
    if (showMenu) { e.stopPropagation(); return; }
    onOpen(note);
  };

  const togglePin = (e) => { e?.stopPropagation(); onUpdate(note.id, { pinned: !note.pinned }); setShowMenu(false); };
  const toggleStar = (e) => { e?.stopPropagation(); onUpdate(note.id, { starred: !note.starred }); setShowMenu(false); };
  const askDelete = (e) => { e?.stopPropagation(); setShowMenu(false); setConfirmDelete(true); };
  const setColor = (color) => { onUpdate(note.id, { color }); };

  return (
    <>
      <div
        onClick={handleClick}
        onMouseDown={startPress}
        onMouseUp={cancelPress}
        onMouseLeave={cancelPress}
        onTouchStart={startPress}
        onTouchEnd={cancelPress}
        onTouchMove={onTouchMove}
        onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
        className="cursor-pointer fade-up relative select-none"
        style={{ animationDelay: `${delayMs}ms` }}
      >
        <NoteCard note={note} notebooks={notebooks} viewMode={viewMode} />
        {/* Botón siempre visible para abrir el menú */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(true); }}
          className={`absolute z-20 w-7 h-7 rounded-full bg-white/90 backdrop-blur border border-stone-200 hover:bg-white hover:border-stone-400 flex items-center justify-center shadow-sm active:scale-90 transition ${viewMode === 'list' ? 'top-1/2 -translate-y-1/2 right-2' : 'bottom-2 right-2'}`}
          title="Opciones"
          aria-label="Abrir opciones de la nota"
        >
          <MoreVertical size={14} className="text-stone-600" />
        </button>
        {note.pinned && viewMode !== 'list' && (
          <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md">
            <Pin size={11} className="fill-white" />
          </div>
        )}
      </div>

      {showMenu && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowMenu(false)}>
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl fade-up" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-stone-100 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-stone-500 mb-1">Nota</p>
                <p className="text-sm font-medium truncate">{note.title || (note.encrypted ? '🔒 Nota privada' : 'Sin título')}</p>
              </div>
              <button onClick={() => setShowMenu(false)} className="w-9 h-9 rounded-full hover:bg-stone-100 flex items-center justify-center flex-shrink-0" aria-label="Cerrar">
                <X size={18} className="text-stone-500" />
              </button>
            </div>
            <div className="p-2">
              {!note.encrypted && (
                <div className="px-3 pt-2 pb-3 border-b border-stone-100 mb-1">
                  <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Palette size={11} /> Color</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLOR_KEYS.map(key => {
                      const cfg = NOTE_COLORS[key];
                      const isActive = (note.color || 'default') === key;
                      return (
                        <button
                          key={key}
                          onClick={(e) => { e.stopPropagation(); setColor(key); }}
                          title={cfg.name}
                          className={`w-8 h-8 rounded-full transition flex items-center justify-center ${isActive ? 'ring-2 ring-offset-2 ring-stone-900' : ''}`}
                          style={{ backgroundColor: cfg.dot, border: `1px solid ${cfg.dotBorder}` }}
                        >
                          {isActive && <span className="text-stone-700 text-xs font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={togglePin} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-stone-50 rounded-xl text-left text-sm">
                {note.pinned ? <PinOff size={18} className="text-amber-600" /> : <Pin size={18} />}
                {note.pinned ? 'Desfijar de arriba' : 'Fijar arriba'}
              </button>
              <button onClick={toggleStar} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-stone-50 rounded-xl text-left text-sm">
                <Star size={18} className={note.starred ? 'text-amber-500 fill-amber-500' : ''} />
                {note.starred ? 'Quitar de destacadas' : 'Destacar'}
              </button>
              <button onClick={(e) => { e.stopPropagation(); onOpen(note); setShowMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-stone-50 rounded-xl text-left text-sm">
                <FileText size={18} /> Abrir
              </button>
              <div className="h-px bg-stone-100 my-1" />
              <button onClick={askDelete} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-rose-50 rounded-xl text-left text-sm text-rose-600">
                <Trash2 size={18} /> Eliminar nota
              </button>
            </div>
            <button onClick={() => setShowMenu(false)} className="w-full py-3 text-sm text-stone-500 border-t border-stone-100">Cancelar</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-5" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="display text-xl font-semibold mb-2">¿Eliminar nota?</h3>
            <p className="text-sm text-stone-500 mb-5">Esta acción no se puede deshacer. {note.encrypted && 'Las notas privadas también se eliminan permanentemente.'}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 border border-stone-300 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={() => { onDelete(note.id); setConfirmDelete(false); }} className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-medium">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============== NOTE CARD ==============
function NoteCard({ note, notebooks = [], viewMode = 'grid' }) {
  const blocks = note.blocks || [];
  const firstImage = blocks.find(b => b.type === 'image' && b.imageData);
  const firstDrawing = blocks.find(b => b.type === 'drawing' && b.drawingData);
  const firstText = blocks.find(b => b.type === 'text' && b.content);
  const firstLink = blocks.find(b => b.type === 'link' && b.url);
  const hasVoice = blocks.some(b => b.type === 'voice');
  const taskBlocks = blocks.filter(b => b.type === 'task');
  const { total: tasksTotal, done: tasksDone } = taskItemsTotal(blocks);
  const firstTaskTxt = firstTaskText(blocks);
  const counts = blocks.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
  const visualPreview = note.encrypted ? null : (firstImage || firstDrawing);
  const notebook = notebooks.find(n => n.id === note.notebookId);

  // Helper: título a mostrar (fallback en cascada)
  const displayTitle = note.title
    || (firstText && richToPlain(firstText.content).slice(0, 80))
    || (firstLink && firstLink.url)
    || (hasVoice && 'Nota de voz')
    || (taskBlocks.length > 0 && (firstTaskTxt || 'Lista de tareas'))
    || (blocks.length === 0 && 'Nota vacía')
    || 'Sin título';

  const isEmpty = !note.title && !firstText && !firstLink && !hasVoice && blocks.length === 0;
  const dateStr = new Date(note.updatedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' });

  // ========== MODO LISTA ==========
  if (viewMode === 'list') {
    if (note.encrypted) {
      return (
        <div className="bg-stone-900 text-stone-50 rounded-xl px-3 py-2.5 flex items-center gap-3">
          {note.pinned && <Pin size={11} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0"><Lock size={14} className="text-amber-400" /></div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{note.title || 'Nota privada'}</p>
            <p className="text-[10px] text-stone-400 uppercase tracking-wider">Cifrada</p>
          </div>
          {note.starred && <Star size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
        </div>
      );
    }
    const lcfg = getNoteColor(note.color);
    return (
      <div className={`${lcfg.bg} border ${lcfg.border} rounded-xl px-3 py-2.5 flex items-center gap-3 hover:shadow-sm transition`}>
        {note.pinned && <Pin size={11} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
        {visualPreview ? (
          <div className="w-10 h-10 rounded-lg bg-stone-100 overflow-hidden flex-shrink-0"><img src={visualPreview.imageData || visualPreview.drawingData} alt="" className="w-full h-full object-cover" /></div>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-white/70 flex items-center justify-center flex-shrink-0">
            {hasVoice ? <Mic size={14} className="text-rose-500" />
              : taskBlocks.length > 0 ? <CheckSquare size={14} className="text-emerald-600" />
              : firstLink ? <Link2 size={14} className="text-amber-600" />
              : <FileText size={14} className="text-stone-400" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm truncate ${isEmpty ? 'text-stone-400 italic' : 'font-medium text-stone-900'}`}>{displayTitle}</p>
            {note.starred && <Star size={11} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] text-stone-400">{dateStr}</p>
            {notebook && <><span className="text-stone-300 text-[10px]">·</span><span className="text-[10px] text-stone-500 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:notebook.color}}/>{notebook.name}</span></>}
            {tasksTotal > 0 && <><span className="text-stone-300 text-[10px]">·</span><span className="text-[10px] text-emerald-700">{tasksDone}/{tasksTotal}</span></>}
            {note.tags?.length > 0 && <><span className="text-stone-300 text-[10px]">·</span><span className="text-[10px] text-stone-400 truncate">#{note.tags[0]}{note.tags.length > 1 && ` +${note.tags.length-1}`}</span></>}
          </div>
        </div>
        <ChevronRight size={14} className="text-stone-300 flex-shrink-0" />
      </div>
    );
  }

  // ========== MODO TARJETAS GRANDES ==========
  if (viewMode === 'cards') {
    if (note.encrypted) {
      return (
        <div className="bg-gradient-to-br from-stone-900 to-stone-700 rounded-2xl border border-stone-700 overflow-hidden text-stone-50 relative p-5">
          <div className="absolute inset-0 opacity-10" style={{backgroundImage:'repeating-linear-gradient(45deg, white 0, white 1px, transparent 1px, transparent 8px)'}}/>
          <div className="relative flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0"><Lock size={20} className="text-amber-400" /></div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base">{note.title || 'Nota privada'}</h3>
              <p className="text-xs text-stone-400 uppercase tracking-wider mt-0.5">Cifrada · toca para desbloquear</p>
            </div>
            {note.starred && <Star size={14} className="text-amber-400 fill-amber-400" />}
          </div>
        </div>
      );
    }
    const ccfg = getNoteColor(note.color);
    return (
      <div className={`${ccfg.bg} rounded-2xl border ${ccfg.border} ${ccfg.borderHover} overflow-hidden hover:shadow-sm transition flex`}>
        {visualPreview && (
          <div className="w-32 sm:w-40 flex-shrink-0 bg-stone-100 overflow-hidden">
            <img src={visualPreview.imageData || visualPreview.drawingData} alt="" className={`w-full h-full ${firstImage ? 'object-cover' : 'object-contain'}`} style={{ minHeight: '128px' }} />
          </div>
        )}
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {notebook && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 border" style={{borderColor:notebook.color+'40', color:notebook.color}}><div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:notebook.color}}/>{notebook.name}</span>}
            <p className="text-[10px] text-stone-400">{dateStr}</p>
            {note.starred && <Star size={11} className="text-amber-500 fill-amber-500" />}
          </div>
          <h3 className={`font-semibold text-base line-clamp-2 ${isEmpty ? 'text-stone-400 italic' : 'text-stone-900'}`}>{displayTitle}</h3>
          {note.title && firstText && <p className="text-sm text-stone-500 line-clamp-2 mt-1 leading-relaxed">{richToPlain(firstText.content)}</p>}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {counts.text > 0 && <span className="w-5 h-5 rounded bg-blue-50 text-blue-600 flex items-center justify-center"><Type size={11} /></span>}
            {counts.image > 0 && <span className="w-5 h-5 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center"><ImageIcon size={11} /></span>}
            {counts.drawing > 0 && <span className="w-5 h-5 rounded bg-purple-50 text-purple-600 flex items-center justify-center"><PenTool size={11} /></span>}
            {counts.voice > 0 && <span className="w-5 h-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center"><Mic size={11} /></span>}
            {counts.link > 0 && <span className="w-5 h-5 rounded bg-amber-50 text-amber-600 flex items-center justify-center"><Link2 size={11} /></span>}
            {tasksTotal > 0 && <span className="px-1.5 h-5 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-bold">{tasksDone}/{tasksTotal}</span>}
            {note.tags?.slice(0, 3).map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded">#{t}</span>)}
            {note.tags?.length > 3 && <span className="text-[10px] text-stone-400">+{note.tags.length - 3}</span>}
          </div>
        </div>
      </div>
    );
  }

  // ========== MODO CUADRÍCULA (default) ==========
  if (note.encrypted) {
    return (
      <div className="bg-gradient-to-br from-stone-900 to-stone-700 rounded-2xl border border-stone-700 overflow-hidden text-stone-50 min-h-[160px] relative">
        <div className="absolute inset-0 opacity-10" style={{backgroundImage:'repeating-linear-gradient(45deg, white 0, white 1px, transparent 1px, transparent 8px)'}}/>
        <div className="p-4 relative h-full flex flex-col justify-between min-h-[160px]">
          <div className="flex items-center justify-between"><div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center"><Lock size={16} className="text-amber-400" /></div>{note.starred && <Star size={12} className="text-amber-400 fill-amber-400" />}</div>
          <div>{note.title?<h3 className="font-semibold text-sm line-clamp-2 mb-1">{note.title}</h3>:<h3 className="font-semibold text-sm text-stone-400 italic mb-1">Nota privada</h3>}<p className="text-[10px] text-stone-400 uppercase tracking-wider">Cifrada</p></div>
        </div>
      </div>
    );
  }

  const colorCfg = getNoteColor(note.color);

  return (
    <div className={`${colorCfg.bg} rounded-2xl border ${colorCfg.border} ${colorCfg.borderHover} overflow-hidden hover:shadow-sm transition relative`}>
      {notebook && <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-white/90 backdrop-blur rounded-full text-[10px] font-medium flex items-center gap-1 border border-stone-200"><div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:notebook.color}}/>{notebook.name}</div>}
      {visualPreview && <div className="aspect-square bg-stone-100 overflow-hidden"><img src={visualPreview.imageData||visualPreview.drawingData} alt="" className={`w-full h-full ${firstImage?'object-cover':'object-contain'}`}/></div>}
      <div className="p-3">
        <div className="flex items-center gap-1 mb-2">
          {counts.text > 0 && <span className="w-5 h-5 rounded bg-blue-50 text-blue-600 flex items-center justify-center"><Type size={11} /></span>}
          {counts.image > 0 && <span className="w-5 h-5 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center"><ImageIcon size={11} /></span>}
          {counts.drawing > 0 && <span className="w-5 h-5 rounded bg-purple-50 text-purple-600 flex items-center justify-center"><PenTool size={11} /></span>}
          {counts.voice > 0 && <span className="w-5 h-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center"><Mic size={11} /></span>}
          {counts.link > 0 && <span className="w-5 h-5 rounded bg-amber-50 text-amber-600 flex items-center justify-center"><Link2 size={11} /></span>}
          {tasksTotal > 0 && <span className="w-auto px-1.5 h-5 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-bold">{tasksDone}/{tasksTotal}</span>}
          {note.starred && <Star size={12} className="text-amber-500 fill-amber-500 ml-auto" />}
        </div>
        {note.title && <h3 className="font-semibold text-sm text-stone-900 line-clamp-2 mb-1">{note.title}</h3>}
        {!note.title && firstText && <h3 className="font-semibold text-sm text-stone-900 line-clamp-2 mb-1">{richToPlain(firstText.content).slice(0,60)}</h3>}
        {!note.title && !firstText && firstLink && <h3 className="font-semibold text-sm text-stone-900 line-clamp-1 mb-1">{firstLink.url}</h3>}
        {!note.title && !firstText && !firstLink && hasVoice && <h3 className="font-semibold text-sm text-stone-500 italic mb-1">Nota de voz</h3>}
        {!note.title && !firstText && !firstLink && !hasVoice && taskBlocks.length > 0 && <h3 className="font-semibold text-sm text-stone-900 line-clamp-2 mb-1">{firstTaskTxt || 'Lista de tareas'}</h3>}
        {!note.title && !firstText && !firstLink && !hasVoice && blocks.length === 0 && <h3 className="font-semibold text-sm text-stone-400 italic mb-1">Nota vacía</h3>}
        {firstText && note.title && <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">{richToPlain(firstText.content)}</p>}
        {note.tags?.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{note.tags.slice(0,2).map(t=><span key={t} className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded">#{t}</span>)}{note.tags.length>2&&<span className="text-[10px] text-stone-400">+{note.tags.length-2}</span>}</div>}
      </div>
    </div>
  );
}

// ============== VISTA DE TAREAS GLOBAL ==============
function TasksView({ notes, onBack, onOpen, onUpdate }) {
  const [showCompleted, setShowCompleted] = useState(false);
  const allTasks = useMemo(() => {
    const tasks = [];
    notes.forEach(n => {
      if (n.encrypted) return;
      (n.blocks || []).forEach(b => {
        if (b.type !== 'task') return;
        // Nuevo formato: items[]
        if (Array.isArray(b.items)) {
          b.items.forEach(it => {
            tasks.push({ id: it.id, text: it.text, done: !!it.done, doneAt: it.doneAt || null, blockId: b.id, noteId: n.id, noteTitle: n.title || 'Sin título', noteTags: n.tags || [] });
          });
        } else if (b.text !== undefined) {
          // Legacy: bloque con un solo texto
          tasks.push({ id: b.id, text: b.text, done: !!b.done, doneAt: b.doneAt || null, blockId: b.id, noteId: n.id, noteTitle: n.title || 'Sin título', noteTags: n.tags || [], legacy: true });
        }
      });
    });
    return tasks;
  }, [notes]);
  const pending = allTasks.filter(t => !t.done);
  const done = allTasks.filter(t => t.done);
  const visible = showCompleted ? done : pending;

  const toggleTask = (task) => {
    const note = notes.find(n => n.id === task.noteId);
    if (!note) return;
    const newBlocks = note.blocks.map(b => {
      if (b.id !== task.blockId) return b;
      if (task.legacy) {
        return { ...b, done: !b.done, doneAt: !b.done ? Date.now() : null };
      }
      const items = (b.items || []).map(it => it.id === task.id ? { ...it, done: !it.done, doneAt: !it.done ? Date.now() : null } : it);
      return { ...b, items };
    });
    onUpdate(task.noteId, { blocks: newBlocks });
  };

  return (
    <div className="pb-20">
      <header className="sticky top-0 z-30 bg-stone-50/90 backdrop-blur-xl border-b border-stone-200 px-5 py-3 flex items-center justify-between">
        <button onClick={onBack} className="w-10 h-10 rounded-full hover:bg-stone-200 flex items-center justify-center"><ArrowLeft size={18} /></button>
        <h2 className="display text-xl font-semibold">Tareas</h2>
        <div className="w-10" />
      </header>
      <div className="px-5 py-6">
        <div className="flex gap-2 mb-5">
          <button onClick={() => setShowCompleted(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${!showCompleted ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>Pendientes ({pending.length})</button>
          <button onClick={() => setShowCompleted(true)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${showCompleted ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>Hechas ({done.length})</button>
        </div>

        {visible.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-100 flex items-center justify-center"><CheckSquare size={28} className="text-emerald-600" /></div>
            <p className="display text-xl font-semibold mb-2">{showCompleted ? 'Aún no hay tareas hechas' : '¡Todo al día!'}</p>
            <p className="text-sm text-stone-500">{showCompleted ? 'Cuando completes tareas aparecerán aquí.' : 'Añade un bloque de tipo "Tarea" dentro de cualquier nota.'}</p>
          </div>
        )}

        <div className="space-y-2">
          {visible.map((task, i) => (
            <div key={`${task.noteId}-${task.id}`} className="bg-white border border-stone-200 rounded-xl p-3 flex items-start gap-3 fade-up" style={{animationDelay: `${i*20}ms`}}>
              <button onClick={() => toggleTask(task)} className="mt-0.5 flex-shrink-0">
                {task.done ? <CheckSquare size={18} className="text-emerald-600" /> : <SquareEmpty size={18} className="text-stone-400" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${task.done ? 'line-through text-stone-400' : 'text-stone-900'}`}>{task.text || <span className="italic text-stone-400">Tarea sin texto</span>}</p>
                <button onClick={() => { const n = notes.find(x => x.id === task.noteId); if (n) onOpen(n); }} className="text-xs text-stone-500 hover:text-stone-900 mt-1 flex items-center gap-1">
                  <FileText size={11} /> {task.noteTitle}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============== CHAT CON EL CEREBRO (búsqueda inteligente) ==============
function ChatView({ notes, searchIndex, onBack, onOpen }) {
  const [messages, setMessages] = useState([{ role: 'system', content: 'Hola! Soy tu cerebro 🧠 Hazme una pregunta y buscaré en todas tus notas las que sean más relevantes. Por ejemplo: "¿qué guardé sobre fotografía?" o "ideas para regalos".' }]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const messagesEndRef = useRef();
  useEffect(() => { messagesEndRef.current?.scrollIntoView({behavior:'smooth'}); }, [messages, thinking]);

  const ask = () => {
    if (!input.trim()) return;
    const q = input.trim();
    setMessages(m => [...m, { role: 'user', content: q }]);
    setInput('');
    setThinking(true);

    setTimeout(() => {
      // Buscar las top notas más relevantes
      const candidates = notes.filter(n => !n.encrypted);
      const scored = candidates.map(n => {
        const sim = cosineSimilarity(q, searchIndex.vectors[n.id], searchIndex.idf);
        // bonus si el título matchea
        const qlc = q.toLowerCase();
        let bonus = 0;
        if ((n.title || '').toLowerCase().includes(qlc)) bonus += 0.3;
        if ((n.tags || []).some(t => qlc.includes(t.toLowerCase()) || t.toLowerCase().includes(qlc))) bonus += 0.2;
        return { note: n, score: sim + bonus };
      }).filter(x => x.score > 0.05).sort((a,b) => b.score - a.score).slice(0, 5);

      let response;
      if (scored.length === 0) {
        response = { role: 'assistant', content: 'No encontré nada relevante en tus notas para esa pregunta. Probá reformularla con otras palabras o usá la búsqueda normal con un término específico.' };
      } else {
        const intro = scored.length === 1 
          ? 'Encontré 1 nota relevante:'
          : `Encontré ${scored.length} notas relevantes (las más relacionadas primero):`;
        response = { role: 'assistant', content: intro, results: scored };
      }
      setMessages(m => [...m, response]);
      setThinking(false);
    }, 400);
  };

  const suggestions = ['¿Qué tengo pendiente?', 'Ideas guardadas', 'Notas de esta semana'];

  return (
    <div className="h-screen flex flex-col bg-stone-50">
      <header className="px-5 py-3 flex items-center justify-between border-b border-stone-200 bg-stone-50/90 backdrop-blur-xl">
        <button onClick={onBack} className="w-10 h-10 rounded-full hover:bg-stone-200 flex items-center justify-center"><ArrowLeft size={18} /></button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"><Sparkles size={14} className="text-white" /></div>
          <h2 className="display text-lg font-semibold">Pregúntale a tu cerebro</h2>
        </div>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`fade-up ${m.role === 'user' ? 'flex justify-end' : ''}`}>
            {m.role === 'system' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 max-w-[90%]">
                <p className="text-sm text-amber-900 leading-relaxed">{m.content}</p>
              </div>
            )}
            {m.role === 'user' && (
              <div className="bg-stone-900 text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                <p className="text-sm">{m.content}</p>
              </div>
            )}
            {m.role === 'assistant' && (
              <div className="max-w-[90%]">
                <div className="flex items-start gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5"><Sparkles size={12} className="text-white" /></div>
                  <p className="text-sm text-stone-800 leading-relaxed">{m.content}</p>
                </div>
                {m.results && (
                  <div className="ml-9 space-y-2 mt-2">
                    {m.results.map((r, j) => (
                      <button key={j} onClick={() => onOpen(r.note)} className="w-full bg-white border border-stone-200 hover:border-stone-900 rounded-xl p-3 text-left transition fade-up" style={{animationDelay: `${j*60}ms`}}>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0"><FileText size={14} className="text-stone-600" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-stone-900 truncate">{r.note.title || 'Sin título'}</p>
                            <p className="text-xs text-stone-500 line-clamp-2 mt-0.5">{getFirstTextContent(r.note) || 'Sin contenido textual'}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{Math.round(r.score * 100)}% relevancia</span>
                              {r.note.tags?.slice(0, 2).map(t => <span key={t} className="text-[10px] text-stone-500">#{t}</span>)}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {thinking && <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"><Sparkles size={12} className="text-white animate-pulse" /></div><p className="text-sm text-stone-500 italic">Buscando…</p></div>}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 1 && (
        <div className="px-5 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {suggestions.map(s => <button key={s} onClick={() => { setInput(s); setTimeout(ask, 50); }} className="flex-shrink-0 px-3 py-1.5 bg-white border border-stone-200 rounded-full text-xs hover:border-stone-900 transition">{s}</button>)}
        </div>
      )}

      <div className="px-5 py-4 border-t border-stone-200 bg-white">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Pregúntame algo sobre tus notas..." className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-stone-900" />
          <button onClick={ask} disabled={!input.trim()} className="px-4 bg-stone-900 text-white rounded-xl text-sm font-medium disabled:opacity-40 flex items-center gap-1"><Sparkles size={14} /></button>
        </div>
        <p className="text-[10px] text-stone-400 mt-2 text-center">Búsqueda 100% local. Las notas cifradas no se incluyen.</p>
      </div>
    </div>
  );
}

function getFirstTextContent(note) {
  for (const b of (note.blocks || [])) {
    if (b.type === 'text' && b.content) return richToPlain(b.content);
    if (b.type === 'link' && b.content) return b.content;
    if (b.type === 'image' && b.caption) return b.caption;
    if (b.type === 'task') {
      const items = getTaskItems(b);
      if (items.length > 0 && items[0].text) return items[0].text;
    }
  }
  return null;
}

// ============== NOTEBOOKS ==============
function NotebooksView({ notebooks, notes, onBack, onSelect, onCreate, onRename, onRecolor, onDelete }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState(''); const [color, setColor] = useState('#3b82f6'); const [editing, setEditing] = useState(null);
  const colors = ['#3b82f6','#10b981','#f59e0b','#f43f5e','#9333ea','#06b6d4','#84cc16','#ec4899'];
  const handleCreate = () => { if (!name.trim()) return; onCreate(name.trim(), color); setName(''); setColor('#3b82f6'); setShowCreate(false); };
  return (
    <div className="pb-20">
      <header className="sticky top-0 z-30 bg-stone-50/90 backdrop-blur-xl border-b border-stone-200 px-5 py-3 flex items-center justify-between">
        <button onClick={onBack} className="w-10 h-10 rounded-full hover:bg-stone-200 flex items-center justify-center"><ArrowLeft size={18} /></button>
        <h2 className="display text-xl font-semibold">Cuadernos</h2>
        <button onClick={() => setShowCreate(true)} className="w-10 h-10 rounded-full bg-stone-900 text-white flex items-center justify-center"><Plus size={18} /></button>
      </header>
      <div className="px-5 py-6 space-y-2">
        <button onClick={() => onSelect('inbox')} className="w-full bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-3 hover:border-stone-900 transition">
          <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center"><Folder size={18} className="text-stone-600" /></div>
          <div className="flex-1 text-left"><h3 className="font-semibold text-sm">Bandeja</h3><p className="text-xs text-stone-500">Notas sin asignar</p></div>
          <span className="text-xs text-stone-400">{notes.filter(n => !n.notebookId).length}</span>
          <ChevronRight size={16} className="text-stone-400" />
        </button>
        {notebooks.map(nb => { const c = notes.filter(n => n.notebookId === nb.id).length; const ed = editing === nb.id; return (
          <div key={nb.id} className="bg-white border border-stone-200 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <button onClick={() => ed ? null : onSelect(nb.id)} className="w-10 h-10 rounded-xl flex items-center justify-center" style={{backgroundColor:nb.color+'20'}}><Book size={18} style={{color:nb.color}}/></button>
              <div className="flex-1">{ed ? <input value={nb.name} onChange={e => onRename(nb.id, e.target.value)} className="w-full font-semibold text-sm bg-transparent border-b border-stone-300 focus:outline-none focus:border-stone-900 pb-1" autoFocus /> : <button onClick={() => onSelect(nb.id)} className="text-left w-full"><h3 className="font-semibold text-sm">{nb.name}</h3><p className="text-xs text-stone-500">{c} {c===1?'nota':'notas'}</p></button>}</div>
              <button onClick={() => setEditing(ed ? null : nb.id)} className="text-xs text-stone-500 underline">{ed ? 'Listo' : 'Editar'}</button>
            </div>
            {ed && <div className="mt-3 pt-3 border-t border-stone-100"><p className="text-xs text-stone-500 mb-2">Color</p><div className="flex gap-2 mb-3">{colors.map(cc=><button key={cc} onClick={()=>onRecolor(nb.id,cc)} className={`w-7 h-7 rounded-full transition ${nb.color===cc?'ring-2 ring-offset-2 ring-stone-900':''}`} style={{backgroundColor:cc}}/>)}</div><button onClick={()=>{if(confirm(`¿Eliminar "${nb.name}"? Las notas vuelven a la bandeja.`))onDelete(nb.id);}} className="text-xs text-rose-600 underline">Eliminar cuaderno</button></div>}
          </div>
        ); })}
        {notebooks.length === 0 && <div className="text-center py-10"><FolderPlus size={32} className="mx-auto mb-3 text-stone-300" /><p className="text-sm text-stone-500">Aún no tienes cuadernos.</p></div>}
      </div>
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 fade-up" onClick={e => e.stopPropagation()}>
            <h3 className="display text-xl font-semibold mb-4">Nuevo cuaderno</h3>
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} placeholder="Nombre" autoFocus className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-stone-900 mb-4" />
            <p className="text-xs text-stone-500 mb-2">Color</p>
            <div className="flex gap-2 mb-6">{colors.map(c => <button key={c} onClick={() => setColor(c)} className={`w-9 h-9 rounded-full transition ${color===c?'ring-2 ring-offset-2 ring-stone-900':''}`} style={{backgroundColor:c}}/>)}</div>
            <div className="flex gap-2"><button onClick={() => setShowCreate(false)} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium">Cancelar</button><button onClick={handleCreate} disabled={!name.trim()} className="flex-1 py-3 bg-stone-900 text-white rounded-xl text-sm font-medium disabled:opacity-40">Crear</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============== DETAIL VIEW ==============
function DetailView({ note, allNotes, notebooks, searchIndex, onBack, onUpdate, onDelete, onOpenNote, encryptNote, decryptNoteBlocks, removeEncryption, onExportNote, allTags }) {
  const [title, setTitle] = useState(note.title || '');
  const [tagInput, setTagInput] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [showEncryptDialog, setShowEncryptDialog] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showNotebookPicker, setShowNotebookPicker] = useState(false);
  const [decryptedBlocks, setDecryptedBlocks] = useState(null);
  const [decryptPassword, setDecryptPassword] = useState(null);
  const [askDecrypt, setAskDecrypt] = useState(false);
  const titleTimeoutRef = useRef();

  useEffect(() => { setTitle(note.title || ''); if (note.encrypted && !decryptedBlocks) setAskDecrypt(true); }, [note.id]);

  // Pegar imagen
  useEffect(() => {
    const handlePaste = (e) => {
      if (note.encrypted && !decryptedBlocks) return;
      const items = e.clipboardData?.items; if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (ev) => { const nb = { id: newBlockId(), type: 'image', imageData: ev.target.result }; updateBlocks([...visibleBlocks, nb]); };
          reader.readAsDataURL(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [note.id, decryptedBlocks, decryptPassword]);

  const handleTitleChange = (val) => { setTitle(val); clearTimeout(titleTimeoutRef.current); titleTimeoutRef.current = setTimeout(() => onUpdate(note.id, { title: val }), 400); };

  const visibleBlocks = note.encrypted ? (decryptedBlocks || []) : (note.blocks || []);
  const canEdit = !note.encrypted || decryptedBlocks !== null;
  const currentNotebook = notebooks.find(n => n.id === note.notebookId);

  const updateBlocks = async (newBlocks) => {
    if (note.encrypted && decryptPassword) {
      const p = await encryptString(JSON.stringify(newBlocks), decryptPassword);
      onUpdate(note.id, { encryptedBlocks: p });
      setDecryptedBlocks(newBlocks);
    } else onUpdate(note.id, { blocks: newBlocks });
  };

  const addBlock = (type) => {
    const nb = { id: newBlockId(), type };
    if (type === 'text') nb.content = '';
    if (type === 'link') { nb.url = ''; nb.content = ''; }
    if (type === 'task') { nb.text = ''; nb.done = false; }
    updateBlocks([...visibleBlocks, nb]);
    setShowAddBlock(false);
  };
  const updateBlock = (id, updates) => {
    // Caso especial: si vienen múltiples imágenes adicionales, creamos bloques nuevos detrás
    if (updates._additionalImages && Array.isArray(updates._additionalImages)) {
      const { _additionalImages, ...cleanUpdates } = updates;
      const idx = visibleBlocks.findIndex(b => b.id === id);
      if (idx === -1) return;
      const updatedSelf = { ...visibleBlocks[idx], ...cleanUpdates };
      const newImageBlocks = _additionalImages.map(data => ({
        id: newBlockId(),
        type: 'image',
        imageData: data
      }));
      const next = [
        ...visibleBlocks.slice(0, idx),
        updatedSelf,
        ...newImageBlocks,
        ...visibleBlocks.slice(idx + 1)
      ];
      updateBlocks(next);
      return;
    }
    updateBlocks(visibleBlocks.map(b => b.id === id ? {...b, ...updates} : b));
  };
  const removeBlock = (id) => updateBlocks(visibleBlocks.filter(b => b.id !== id));
  const moveBlock = (id, dir) => { const i = visibleBlocks.findIndex(b => b.id === id); if (i === -1) return; const ni = dir === 'up' ? i-1 : i+1; if (ni < 0 || ni >= visibleBlocks.length) return; const arr = [...visibleBlocks]; [arr[i], arr[ni]] = [arr[ni], arr[i]]; updateBlocks(arr); };

  const pasteImageFromClipboard = async () => {
    try { if (!navigator.clipboard?.read) { alert('Probá con Ctrl+V'); return; } const items = await navigator.clipboard.read(); for (const item of items) { for (const type of item.types) { if (type.startsWith('image/')) { const blob = await item.getType(type); const reader = new FileReader(); reader.onload = (ev) => { const nb = { id: newBlockId(), type: 'image', imageData: ev.target.result }; updateBlocks([...visibleBlocks, nb]); }; reader.readAsDataURL(blob); return; }}} alert('No hay imagen en el portapapeles.'); } catch (e) { alert('No se pudo leer el portapapeles.'); }
  };

  const addTag = () => { const c = tagInput.trim().replace(/^#/, '').toLowerCase(); if (c && !(note.tags || []).includes(c)) onUpdate(note.id, { tags: [...(note.tags || []), c] }); setTagInput(''); };
  const removeTag = (t) => onUpdate(note.id, { tags: (note.tags || []).filter(x => x !== t) });
  const addSuggestedTag = (t) => { if (!(note.tags || []).includes(t)) onUpdate(note.id, { tags: [...(note.tags || []), t] }); };

  // ===== TAGS SUGERIDAS (mejora 17) =====
  const suggestedTags = useMemo(() => {
    if (!canEdit) return [];
    const text = noteText(note, decryptedBlocks);
    const tokens = new Set(tokenize(text));
    if (tokens.size === 0) return [];
    // Tags existentes que aparecen en el texto pero aún no están aplicadas
    const matches = allTags.filter(t => !((note.tags || []).includes(t)) && (tokens.has(t) || t.split(/\s+/).every(w => tokens.has(w))));
    // Si hay pocas tags existentes, sugerir palabras clave del propio texto
    if (matches.length < 3 && tokens.size > 5) {
      const tf = {};
      tokenize(text).forEach(t => tf[t] = (tf[t] || 0) + 1);
      const candidates = Object.entries(tf).filter(([t, f]) => f >= 2 && t.length >= 4 && !(note.tags || []).includes(t)).sort((a, b) => b[1] - a[1]).slice(0, 3 - matches.length).map(([t]) => t);
      return [...matches, ...candidates].slice(0, 5);
    }
    return matches.slice(0, 5);
  }, [note, decryptedBlocks, allTags, canEdit]);

  // ===== SUGERENCIAS DE CONEXIÓN (mejora 14) =====
  const suggestedConnections = useMemo(() => {
    if (note.encrypted || !searchIndex.vectors[note.id]) return [];
    const myVec = searchIndex.vectors[note.id];
    const existing = new Set(note.connections || []);
    return allNotes
      .filter(n => n.id !== note.id && !n.encrypted && !existing.has(n.id) && searchIndex.vectors[n.id])
      .map(n => ({ note: n, sim: noteSimilarity(myVec, searchIndex.vectors[n.id]) }))
      .filter(x => x.sim > 0.15)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);
  }, [note, allNotes, searchIndex]);

  const toggleConnection = (otherId) => {
    const conns = note.connections || [];
    const newConns = conns.includes(otherId) ? conns.filter(c => c !== otherId) : [...conns, otherId];
    onUpdate(note.id, { connections: newConns });
    const other = allNotes.find(n => n.id === otherId);
    if (other) {
      const oc = other.connections || [];
      const adding = !conns.includes(otherId);
      const noc = adding ? (oc.includes(note.id) ? oc : [...oc, note.id]) : oc.filter(c => c !== note.id);
      onUpdate(otherId, { connections: noc });
    }
  };

  const connectedNotes = (note.connections || []).map(id => allNotes.find(n => n.id === id)).filter(Boolean);
  const candidatesToConnect = allNotes.filter(n => n.id !== note.id);
  const date = new Date(note.updatedAt);
  const dateStr = date.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

  const noteColorCfg = getNoteColor(note.color);
  const detailBg = note.encrypted ? 'bg-stone-50' : (note.color && note.color !== 'default' ? noteColorCfg.bg : 'bg-stone-50');

  return (
    <div className={`pb-32 min-h-screen ${detailBg} transition-colors`}>
      <header className={`sticky top-0 z-30 ${detailBg}/90 backdrop-blur-xl border-b border-stone-200 px-5 py-3 flex items-center justify-between`}>
        <button onClick={onBack} className="w-10 h-10 rounded-full hover:bg-stone-200 flex items-center justify-center"><ArrowLeft size={18} /></button>
        <div className="flex items-center gap-1">
          {note.encrypted && <div className="px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-[10px] font-medium flex items-center gap-1"><Lock size={10} /> Privada</div>}
          {!note.encrypted && (
            <button onClick={() => setShowColorPicker(!showColorPicker)} className="w-10 h-10 rounded-full hover:bg-stone-200 flex items-center justify-center" title="Cambiar color">
              <Palette size={17} className={note.color && note.color !== 'default' ? 'text-stone-700' : 'text-stone-400'} />
            </button>
          )}
          <button onClick={() => onExportNote(note)} className="w-10 h-10 rounded-full hover:bg-stone-200 flex items-center justify-center" title="Exportar"><FileDown size={18} className="text-stone-500" /></button>
          <button onClick={() => setShowEncryptDialog(true)} className="w-10 h-10 rounded-full hover:bg-stone-200 flex items-center justify-center">{note.encrypted ? <Unlock size={18} className="text-amber-600" /> : <Lock size={18} className="text-stone-500" />}</button>
          <button onClick={() => onUpdate(note.id, { pinned: !note.pinned })} className="w-10 h-10 rounded-full hover:bg-stone-200 flex items-center justify-center" title={note.pinned ? 'Desfijar' : 'Fijar arriba'}>
            <Pin size={17} className={note.pinned ? 'text-amber-600 fill-amber-600' : 'text-stone-400'} />
          </button>
          <button onClick={() => onUpdate(note.id, { starred: !note.starred })} className="w-10 h-10 rounded-full hover:bg-stone-200 flex items-center justify-center"><Star size={18} className={note.starred?'text-amber-500 fill-amber-500':'text-stone-400'}/></button>
          <button onClick={() => setConfirmDelete(true)} className="w-10 h-10 rounded-full hover:bg-rose-50 flex items-center justify-center"><Trash2 size={18} className="text-rose-500" /></button>
        </div>
      </header>

      <div className="px-5 py-6">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs text-stone-500">{dateStr}</p>
          <span className="text-stone-300">·</span>
          <button onClick={() => setShowNotebookPicker(true)} className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900">
            {currentNotebook ? <><div className="w-2 h-2 rounded-full" style={{backgroundColor:currentNotebook.color}}/>{currentNotebook.name}</> : <><Folder size={11} /> Bandeja</>}
          </button>
        </div>

        <input value={title} onChange={e => handleTitleChange(e.target.value)} placeholder="Título de la nota..." className="w-full display text-3xl font-semibold bg-transparent focus:outline-none mb-6 placeholder-stone-300" />

        {note.encrypted && !decryptedBlocks && (
          <div className="bg-gradient-to-br from-stone-900 to-stone-700 rounded-2xl p-8 text-center text-stone-50">
            <Lock size={32} className="mx-auto mb-4 text-amber-400" />
            <h3 className="display text-xl font-semibold mb-2">Nota privada</h3>
            <p className="text-sm text-stone-300 mb-6">El contenido está cifrado.<br/>Introduce la contraseña.</p>
            <button onClick={() => setAskDecrypt(true)} className="px-5 py-2.5 bg-amber-500 text-stone-900 rounded-full text-sm font-semibold">Desbloquear</button>
          </div>
        )}

        {(canEdit || decryptedBlocks) && (
          <>
            <div className="space-y-3">
              {visibleBlocks.map((block, idx) => (
                <BlockEditor key={block.id} block={block} isFirst={idx===0} isLast={idx===visibleBlocks.length-1} onUpdate={(u) => updateBlock(block.id, u)} onRemove={() => removeBlock(block.id)} onMoveUp={() => moveBlock(block.id, 'up')} onMoveDown={() => moveBlock(block.id, 'down')} />
              ))}
              {visibleBlocks.length === 0 && <div className="text-center py-8 text-sm text-stone-400">Esta nota aún no tiene contenido.<br />Añade tu primer bloque abajo.</div>}
            </div>

            <div className="mt-4">
              {!showAddBlock ? (
                <div className="flex gap-2">
                  <button onClick={() => setShowAddBlock(true)} className="flex-1 py-3 border-2 border-dashed border-stone-300 hover:border-stone-900 rounded-2xl text-sm font-medium text-stone-500 hover:text-stone-900 transition flex items-center justify-center gap-2"><Plus size={16} /> Añadir contenido</button>
                  <button onClick={pasteImageFromClipboard} title="Pegar imagen" className="px-4 py-3 border-2 border-dashed border-stone-300 hover:border-emerald-500 hover:text-emerald-700 rounded-2xl text-sm text-stone-500 transition flex items-center justify-center"><Clipboard size={16} /></button>
                </div>
              ) : (
                <div className="bg-white border border-stone-200 rounded-2xl p-2 grid grid-cols-6 gap-1 fade-up">
                  {[
                    {type:'text',icon:Type,label:'Texto',color:'text-blue-600 bg-blue-50'},
                    {type:'task',icon:CheckSquare,label:'Tarea',color:'text-emerald-600 bg-emerald-50'},
                    {type:'image',icon:ImageIcon,label:'Foto',color:'text-emerald-600 bg-emerald-50'},
                    {type:'drawing',icon:PenTool,label:'Dibujo',color:'text-purple-600 bg-purple-50'},
                    {type:'voice',icon:Mic,label:'Voz',color:'text-rose-600 bg-rose-50'},
                    {type:'link',icon:Link2,label:'Enlace',color:'text-amber-600 bg-amber-50'}
                  ].map(opt => { const Icon = opt.icon; return <button key={opt.type} onClick={() => addBlock(opt.type)} className="flex flex-col items-center gap-1 py-3 rounded-xl hover:bg-stone-50 transition active:scale-95"><div className={`w-8 h-8 rounded-lg ${opt.color} flex items-center justify-center`}><Icon size={14}/></div><span className="text-[9px] font-medium text-stone-700">{opt.label}</span></button>; })}
                  <button onClick={() => setShowAddBlock(false)} className="col-span-6 mt-1 py-2 text-xs text-stone-500 border-t border-stone-100">Cancelar</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ===== TAGS ===== */}
        <div className="mt-8 pt-6 border-t border-stone-200">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Etiquetas</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {(note.tags || []).map(t => <span key={t} className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">#{t}<button onClick={() => removeTag(t)}><X size={12}/></button></span>)}
          </div>
          {suggestedTags.length > 0 && canEdit && (
            <div className="mb-3 fade-up">
              <p className="text-[10px] text-stone-500 mb-1.5 flex items-center gap-1"><Zap size={10} className="text-amber-500" /> Sugerencias automáticas:</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedTags.map(t => <button key={t} onClick={() => addSuggestedTag(t)} className="px-2.5 py-1 bg-stone-100 hover:bg-amber-100 hover:text-amber-800 text-stone-600 rounded-full text-xs font-medium transition flex items-center gap-1"><Plus size={10}/>#{t}</button>)}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); }}} placeholder="Añadir etiqueta..." className="flex-1 bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-stone-900" />
            <button onClick={addTag} className="px-4 bg-stone-900 text-white rounded-xl text-sm font-medium">Añadir</button>
          </div>
        </div>

        {/* ===== SUGERENCIAS DE CONEXIÓN ===== */}
        {suggestedConnections.length > 0 && (
          <div className="mt-8 pt-6 border-t border-stone-200 fade-up">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3 flex items-center gap-1"><Sparkles size={12} className="text-amber-500" /> Conexiones sugeridas</h3>
            <p className="text-xs text-stone-500 mb-3">Notas que parecen relacionadas con esta:</p>
            <div className="space-y-2">
              {suggestedConnections.map(s => (
                <div key={s.note.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                  <button onClick={() => onOpenNote(s.note.id)} className="flex-1 text-left flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0"><FileText size={14} className="text-stone-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.note.title || 'Sin título'}</p>
                      <p className="text-[10px] text-amber-700">{Math.round(s.sim * 100)}% similitud</p>
                    </div>
                  </button>
                  <button onClick={() => toggleConnection(s.note.id)} className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-medium">Conectar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== CONEXIONES ===== */}
        <div className="mt-8 pt-6 border-t border-stone-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Conectado con ({connectedNotes.length})</h3>
            <button onClick={() => setShowConnect(!showConnect)} className="text-xs font-medium text-stone-900 underline">{showConnect ? 'Cerrar' : 'Gestionar'}</button>
          </div>
          {connectedNotes.length > 0 && !showConnect && <div className="space-y-2">{connectedNotes.map(n => <button key={n.id} onClick={() => onOpenNote(n.id)} className="w-full bg-white border border-stone-200 rounded-xl p-3 text-left hover:border-stone-900 transition flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">{n.encrypted?<Lock size={14} className="text-amber-600"/>:<FileText size={14} className="text-stone-600"/>}</div><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{n.title||(n.encrypted?'Nota privada':'Sin título')}</p></div></button>)}</div>}
          {showConnect && <div className="space-y-2 max-h-80 overflow-y-auto">{candidatesToConnect.length===0&&<p className="text-sm text-stone-500 text-center py-4">No hay otras notas para conectar</p>}{candidatesToConnect.map(n => { const ic = (note.connections || []).includes(n.id); return <button key={n.id} onClick={() => toggleConnection(n.id)} className={`w-full rounded-xl p-3 text-left transition flex items-center gap-3 border ${ic?'bg-amber-50 border-amber-300':'bg-white border-stone-200'}`}><div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${ic?'bg-amber-500 border-amber-500':'border-stone-300'}`}>{ic&&<span className="text-white text-xs">✓</span>}</div><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{n.title||(n.encrypted?'Nota privada':'Sin título')}</p></div></button>; })}</div>}
        </div>

        {/* BOTÓN GRANDE GUARDAR Y CERRAR */}
        <div className="mt-10 pt-6">
          <button
            onClick={() => {
              // Forzar guardado de cualquier cambio pendiente del título antes de salir
              clearTimeout(titleTimeoutRef.current);
              if (title !== (note.title || '')) onUpdate(note.id, { title });
              onBack();
            }}
            className="w-full py-4 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl text-base font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg shadow-stone-900/10"
          >
            <CheckSquare size={18} />
            Guardar nota
          </button>
          <p className="text-[10px] text-stone-400 text-center mt-2">Tus cambios ya se guardan automáticamente mientras escribes</p>
        </div>
      </div>

      {confirmDelete && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-5" onClick={() => setConfirmDelete(false)}><div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}><h3 className="display text-xl font-semibold mb-2">¿Eliminar nota?</h3><p className="text-sm text-stone-500 mb-5">Esta acción no se puede deshacer.</p><div className="flex gap-2"><button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 border border-stone-300 rounded-xl text-sm font-medium">Cancelar</button><button onClick={() => onDelete(note.id)} className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-medium">Eliminar</button></div></div></div>}
      {/* SELECTOR DE COLOR */}
      {showColorPicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowColorPicker(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl fade-up" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 via-rose-100 to-blue-100 flex items-center justify-center"><Palette size={18} className="text-stone-700" /></div>
                <div>
                  <h3 className="display text-lg font-semibold leading-tight">Color de la nota</h3>
                  <p className="text-xs text-stone-500 mt-0.5">{getNoteColor(note.color).name}</p>
                </div>
              </div>
              <button onClick={() => setShowColorPicker(false)} className="w-9 h-9 rounded-full hover:bg-stone-100 flex items-center justify-center"><X size={18} /></button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-5 sm:grid-cols-7 gap-3 sm:gap-4 justify-items-center">
                {COLOR_KEYS.map(key => {
                  const cfg = NOTE_COLORS[key];
                  const isActive = (note.color || 'default') === key;
                  return (
                    <button
                      key={key}
                      onClick={() => { onUpdate(note.id, { color: key }); setShowColorPicker(false); }}
                      title={cfg.name}
                      className={`relative w-12 h-12 rounded-full transition active:scale-90 hover:scale-105 ${isActive ? 'ring-2 ring-offset-2 ring-stone-900' : 'ring-1 ring-offset-1 ring-stone-200'}`}
                      style={{ backgroundColor: cfg.dot }}
                      aria-label={cfg.name}
                    >
                      {isActive && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="w-6 h-6 rounded-full bg-stone-900 text-white text-xs font-bold flex items-center justify-center">✓</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {askDecrypt && <PasswordDialog mode="decrypt" onClose={() => { setAskDecrypt(false); if (!decryptedBlocks) onBack(); }} onSubmit={async (pwd) => { try { const b = await decryptNoteBlocks(note, pwd); setDecryptedBlocks(b); setDecryptPassword(pwd); setAskDecrypt(false); return true; } catch (e) { return false; }}} />}
      {showEncryptDialog && <PasswordDialog mode={note.encrypted?'remove-encryption':'set-encryption'} onClose={() => setShowEncryptDialog(false)} onSubmit={async (pwd) => { try { if (note.encrypted) { await removeEncryption(note.id, pwd); setDecryptedBlocks(null); setDecryptPassword(null); } else { await encryptNote(note.id, pwd); setDecryptPassword(pwd); setDecryptedBlocks(note.blocks || []); } setShowEncryptDialog(false); return true; } catch (e) { return false; }}} />}
      {showNotebookPicker && <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowNotebookPicker(false)}><div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 fade-up max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}><h3 className="display text-xl font-semibold mb-4">Mover a cuaderno</h3><div className="space-y-2"><button onClick={() => { onUpdate(note.id, { notebookId: null }); setShowNotebookPicker(false); }} className={`w-full p-3 rounded-xl flex items-center gap-3 border transition ${!note.notebookId?'bg-stone-900 text-white border-stone-900':'bg-white border-stone-200'}`}><Folder size={16}/><span className="text-sm font-medium">Bandeja</span></button>{notebooks.map(nb => <button key={nb.id} onClick={() => { onUpdate(note.id, { notebookId: nb.id }); setShowNotebookPicker(false); }} className={`w-full p-3 rounded-xl flex items-center gap-3 border transition ${note.notebookId===nb.id?'border-stone-900 bg-stone-50':'bg-white border-stone-200'}`}><div className="w-3 h-3 rounded-full" style={{backgroundColor:nb.color}}/><span className="text-sm font-medium">{nb.name}</span></button>)}{notebooks.length===0&&<p className="text-sm text-stone-500 text-center py-6">No tienes cuadernos creados aún.</p>}</div></div></div>}
    </div>
  );
}

// ============== EXPORT ==============
function ExportModal({ note, onClose }) {
  const [exporting, setExporting] = useState(false);
  const exportMarkdown = () => { const md = noteToMarkdown(note); const blob = new Blob([md], {type:'text/markdown'}); const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = `${(note.title||'nota').replace(/[^a-z0-9]/gi,'-').toLowerCase()}.md`; a.click(); URL.revokeObjectURL(u); };
  const exportPDF = async () => { setExporting(true); try { const html = noteToPrintableHTML(note); const w = window.open('', '_blank'); if (!w) { alert('Permite ventanas emergentes'); setExporting(false); return; } w.document.write(html); w.document.close(); w.onload = () => setTimeout(() => { w.focus(); w.print(); setExporting(false); }, 500); } catch (e) { alert('Error: '+e.message); setExporting(false); } };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 fade-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><FileDown size={18}/></div><h3 className="display text-xl font-semibold">Exportar nota</h3></div><button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center"><X size={16}/></button></div>
        {note.encrypted && <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">⚠️ Nota cifrada. Solo se exportará título y etiquetas.</div>}
        <div className="space-y-2">
          <button onClick={exportPDF} disabled={exporting} className="w-full bg-stone-50 hover:bg-stone-100 rounded-2xl p-4 flex items-center gap-3 transition disabled:opacity-50"><div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center text-xl">📄</div><div className="flex-1 text-left"><p className="font-semibold text-sm">PDF</p><p className="text-xs text-stone-500">Listo para imprimir o compartir</p></div><ChevronRight size={16} className="text-stone-400"/></button>
          <button onClick={exportMarkdown} className="w-full bg-stone-50 hover:bg-stone-100 rounded-2xl p-4 flex items-center gap-3 transition"><div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-mono">{`{}`}</div><div className="flex-1 text-left"><p className="font-semibold text-sm">Markdown (.md)</p><p className="text-xs text-stone-500">Para Obsidian, Notion, etc.</p></div><ChevronRight size={16} className="text-stone-400"/></button>
        </div>
        {exporting && <p className="text-xs text-stone-500 text-center mt-4">Generando PDF…</p>}
      </div>
    </div>
  );
}
function noteToMarkdown(note) {
  const lines = [`# ${note.title || 'Sin título'}`, '', `*${new Date(note.updatedAt).toLocaleDateString('es',{day:'numeric',month:'long',year:'numeric'})}*`, ''];
  if (note.tags?.length) { lines.push(note.tags.map(t => `#${t}`).join(' ')); lines.push(''); }
  if (note.encrypted) { lines.push('*[Nota cifrada]*'); return lines.join('\n'); }
  for (const b of (note.blocks || [])) {
    if (b.type === 'text' && b.content) {
      // Convertir HTML rico a Markdown básico
      let md = b.content;
      if (isRichContent(md)) {
        md = md
          .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
          .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
          .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
          .replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, '**$2**')
          .replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, '*$2*')
          .replace(/<u[^>]*>(.*?)<\/u>/gi, '$1')
          .replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~')
          .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
          .replace(/<\/?(ul|ol)[^>]*>/gi, '')
          .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
      }
      lines.push(md.trim());
      lines.push('');
    }
    else if (b.type === 'task') { for (const it of getTaskItems(b)) lines.push(`- [${it.done?'x':' '}] ${it.text || ''}`); if (getTaskItems(b).length > 0) lines.push(''); }
    else if (b.type === 'link' && b.url) { lines.push(`[${b.url}](${b.url})`); if (b.content) lines.push(`> ${b.content}`); lines.push(''); }
    else if (b.type === 'image' && b.imageData) { lines.push(`![imagen](${b.imageData})`); if (b.caption) lines.push(`*${b.caption}*`); lines.push(''); }
    else if (b.type === 'drawing' && b.drawingData) { lines.push(`![dibujo](${b.drawingData})`); lines.push(''); }
    else if (b.type === 'voice') { lines.push(`🎤 *Nota de voz (${b.duration||'?'})*`); lines.push(''); }
  }
  return lines.join('\n');
}
function noteToPrintableHTML(note) {
  const date = new Date(note.updatedAt).toLocaleDateString('es',{day:'numeric',month:'long',year:'numeric'});
  const tagsHTML = note.tags?.length ? `<div class="tags">${note.tags.map(t=>`<span class="tag">#${t}</span>`).join('')}</div>` : '';
  let body = '';
  if (note.encrypted) body = '<p style="color:#999;font-style:italic">[Nota cifrada]</p>';
  else for (const b of (note.blocks || [])) {
    if (b.type === 'text' && b.content) {
      if (isRichContent(b.content)) {
        body += `<div class="rich">${sanitizeRichHTML(b.content)}</div>`;
      } else {
        body += `<p>${esc(b.content).replace(/\n/g,'<br>')}</p>`;
      }
    }
    else if (b.type === 'task') { const items = getTaskItems(b); if (items.length > 0) body += `<div class="tasklist">${items.map(it => `<p class="task ${it.done?'done':''}">${it.done?'☑':'☐'} ${esc(it.text||'')}</p>`).join('')}</div>`; }
    else if (b.type === 'link' && b.url) body += `<div class="link"><a href="${esc(b.url)}">${esc(b.url)}</a>${b.content?`<p class="ln">${esc(b.content)}</p>`:''}</div>`;
    else if (b.type === 'image' && b.imageData) body += `<div class="img"><img src="${b.imageData}"/>${b.caption?`<p class="cap">${esc(b.caption)}</p>`:''}</div>`;
    else if (b.type === 'drawing' && b.drawingData) body += `<div class="img"><img src="${b.drawingData}"/></div>`;
    else if (b.type === 'voice') body += `<p class="voice">🎤 Nota de voz (${b.duration||'?'})</p>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(note.title||'Nota')}</title><style>@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Inter:wght@400;500;700&display=swap');body{font-family:'Inter',sans-serif;max-width:720px;margin:40px auto;padding:0 30px;color:#1c1917;line-height:1.7}h1{font-family:'Fraunces',serif;font-size:32px;letter-spacing:-0.02em;margin:0 0 8px}.meta{color:#78716c;font-size:13px;margin-bottom:20px}.tags{margin-bottom:30px}.tag{display:inline-block;background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:12px;font-size:12px;margin-right:6px}p{margin:0 0 14px;font-size:15px}.task.done{text-decoration:line-through;color:#999}.link{background:#fef3c7;border-left:3px solid #f59e0b;padding:12px 16px;margin:14px 0;border-radius:6px}.link a{color:#b45309;word-break:break-all}.ln{color:#57534e;font-size:13px;margin:6px 0 0}.img{margin:18px 0}.img img{max-width:100%;border-radius:8px}.cap{font-size:12px;color:#78716c;text-align:center;margin:6px 0 0;font-style:italic}.voice{color:#be185d;font-style:italic}.rich h1{font-family:'Fraunces',serif;font-size:26px;font-weight:700;margin:14px 0 8px;letter-spacing:-0.02em}.rich h2{font-family:'Fraunces',serif;font-size:21px;font-weight:600;margin:12px 0 6px;letter-spacing:-0.01em}.rich h3{font-size:17px;font-weight:600;margin:10px 0 5px}.rich p{margin:0 0 10px;font-size:15px}.rich ul{list-style:disc;padding-left:24px;margin:8px 0}.rich ol{list-style:decimal;padding-left:24px;margin:8px 0}.rich li{margin:3px 0}.rich strong,.rich b{font-weight:700}.rich em,.rich i{font-style:italic}.rich u{text-decoration:underline}.rich s{text-decoration:line-through}@media print{body{margin:0;padding:20px}}</style></head><body><h1>${esc(note.title||'Sin título')}</h1><p class="meta">${date}</p>${tagsHTML}${body}</body></html>`;
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

// ============== PASSWORD DIALOG ==============
function PasswordDialog({ mode, onClose, onSubmit }) {
  const [pwd, setPwd] = useState(''); const [pwd2, setPwd2] = useState(''); const [show, setShow] = useState(false); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const titles = {'set-encryption':'Convertir en nota privada','remove-encryption':'Quitar cifrado','decrypt':'Desbloquear nota privada'};
  const desc = {'set-encryption':'Crea una contraseña. Solo con ella podrás leer esta nota. ⚠️ Si la olvidas, se pierde.','remove-encryption':'Introduce la contraseña actual.','decrypt':'Introduce la contraseña.'};
  const handleSubmit = async () => { setError(''); if (mode === 'set-encryption') { if (pwd.length < 4) { setError('Mínimo 4 caracteres'); return; } if (pwd !== pwd2) { setError('No coinciden'); return; }} setLoading(true); const ok = await onSubmit(pwd); setLoading(false); if (!ok) { setError('Contraseña incorrecta'); setPwd(''); }};
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 fade-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-2"><div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><Lock size={18}/></div><h3 className="display text-xl font-semibold">{titles[mode]}</h3></div>
        <p className="text-sm text-stone-600 mb-5 leading-relaxed">{desc[mode]}</p>
        <div className="relative mb-3">
          <input type={show?'text':'password'} value={pwd} onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === 'Enter' && mode !== 'set-encryption' && handleSubmit()} placeholder="Contraseña" autoFocus className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-stone-900" />
          <button onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">{show?<EyeOff size={16}/>:<Eye size={16}/>}</button>
        </div>
        {mode === 'set-encryption' && <input type={show?'text':'password'} value={pwd2} onChange={e => setPwd2(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="Confirmar" className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-stone-900 mb-3" />}
        {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
        <div className="flex gap-2 mt-4"><button onClick={onClose} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium">Cancelar</button><button onClick={handleSubmit} disabled={loading||!pwd} className="flex-1 py-3 bg-stone-900 text-white rounded-xl text-sm font-medium disabled:opacity-40">{loading?'Procesando…':mode==='set-encryption'?'Cifrar':mode==='remove-encryption'?'Descifrar':'Desbloquear'}</button></div>
      </div>
    </div>
  );
}

// ============== BLOQUES ==============
function BlockEditor({ block, isFirst, isLast, onUpdate, onRemove, onMoveUp, onMoveDown }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const showControls = hovered || focused;

  // Espaciado vertical entre bloques: texto más compacto, imágenes con aire
  const spacing = block.type === 'text' ? 'mb-1' : block.type === 'task' ? 'mb-2' : 'mb-4';

  return (
    <div
      className={`group relative ${spacing}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setTimeout(() => setFocused(false), 200)}
    >
      <div className="block-content">
        {block.type === 'text' && <TextBlock block={block} onUpdate={onUpdate}/>}
        {block.type === 'task' && <TaskBlock block={block} onUpdate={onUpdate}/>}
        {block.type === 'image' && <ImageBlock block={block} onUpdate={onUpdate}/>}
        {block.type === 'drawing' && <DrawingBlock block={block} onUpdate={onUpdate}/>}
        {block.type === 'voice' && <VoiceBlock block={block} onUpdate={onUpdate}/>}
        {block.type === 'link' && <LinkBlock block={block} onUpdate={onUpdate}/>}
      </div>
      {/* Controles flotantes minimalistas */}
      <div className={`absolute -right-1 top-0 flex flex-col gap-0.5 transition-opacity ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button onMouseDown={(e) => e.preventDefault()} onClick={onMoveUp} disabled={isFirst} className="w-6 h-6 rounded-md bg-white/95 backdrop-blur border border-stone-200 hover:bg-stone-50 flex items-center justify-center disabled:opacity-30 shadow-sm" title="Subir">
          <ChevronUp size={12}/>
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={onMoveDown} disabled={isLast} className="w-6 h-6 rounded-md bg-white/95 backdrop-blur border border-stone-200 hover:bg-stone-50 flex items-center justify-center disabled:opacity-30 shadow-sm" title="Bajar">
          <ChevronDown size={12}/>
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={onRemove} className="w-6 h-6 rounded-md bg-white/95 backdrop-blur border border-stone-200 hover:bg-rose-50 hover:border-rose-300 text-stone-500 hover:text-rose-500 flex items-center justify-center shadow-sm" title="Eliminar bloque">
          <Trash2 size={12}/>
        </button>
      </div>
    </div>
  );
}

// Helper: detecta si el contenido es HTML (nuevo) o texto plano (legacy)
function isRichContent(str) {
  if (!str) return false;
  // Si contiene tags HTML básicos consideramos que es rich
  return /<(p|h1|h2|h3|ul|ol|li|strong|em|b|i|u|s|br|div)[\s>]/i.test(str);
}

// Sanea HTML para evitar inserciones peligrosas (XSS) y limita las etiquetas permitidas
function sanitizeRichHTML(html) {
  if (!html) return '';
  // Quitar scripts, iframes, eventos inline
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
  return clean;
}

// Convierte texto plano (con saltos de línea) a HTML básico para inicializar el editor
function plainToRich(text) {
  if (!text) return '';
  // Cada párrafo separado por salto de línea va en un <p>
  return text.split('\n').map(line => {
    if (!line.trim()) return '<p><br></p>';
    return `<p>${escapeHTMLBasic(line)}</p>`;
  }).join('');
}
function escapeHTMLBasic(s) {
  return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);
}

// Convierte HTML (de los bloques de texto rich) a texto plano para búsqueda y previews
function richToPlain(htmlOrText) {
  if (!htmlOrText) return '';
  if (!isRichContent(htmlOrText)) return htmlOrText;
  // Insertar saltos donde haya bloques, convertir <li> en líneas
  let s = htmlOrText
    .replace(/<\/(p|h1|h2|h3|div|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  // Quitar el resto de tags
  s = s.replace(/<[^>]+>/g, '');
  // Decodificar entidades básicas
  s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  // Colapsar múltiples saltos
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

function TextBlock({ block, onUpdate }) {
  const editorRef = useRef();
  const timeoutRef = useRef();
  const [showToolbar, setShowToolbar] = useState(false);
  const [focused, setFocused] = useState(false);
  // Estado actual del formato bajo el cursor: { bold, italic, underline, strikethrough, blockTag, list }
  const [activeFormats, setActiveFormats] = useState({});

  // Inicializar contenido (una sola vez al montar o al cambiar de bloque)
  useEffect(() => {
    if (!editorRef.current) return;
    const raw = block.content || '';
    const initial = isRichContent(raw) ? sanitizeRichHTML(raw) : plainToRich(raw);
    if (editorRef.current.innerHTML !== initial) {
      editorRef.current.innerHTML = initial;
    }
  }, [block.id]);

  // Detectar qué formatos están activos donde está el cursor
  const updateActiveFormats = () => {
    if (!editorRef.current) return;
    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      // Verificar que la selección está dentro de este editor
      const range = selection.getRangeAt(0);
      if (!editorRef.current.contains(range.commonAncestorContainer)) return;

      const formats = {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikethrough: document.queryCommandState('strikethrough'),
      };

      // Detectar tag del bloque padre (h1, h2, h3, p) y si es item de lista
      let node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      let blockTag = 'p';
      let inUL = false, inOL = false;
      while (node && node !== editorRef.current) {
        const tag = (node.tagName || '').toLowerCase();
        if (['h1','h2','h3','p','div'].includes(tag) && blockTag === 'p') {
          blockTag = tag === 'div' ? 'p' : tag;
        }
        if (tag === 'ul') inUL = true;
        if (tag === 'ol') inOL = true;
        node = node.parentNode;
      }
      formats.blockTag = blockTag;
      formats.unorderedList = inUL;
      formats.orderedList = inOL;
      setActiveFormats(formats);
    } catch (e) { /* ignorar errores de selección */ }
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onUpdate({ content: html }), 300);
    updateActiveFormats();
  };

  // Aplica un comando de formato sobre la selección actual
  const applyFormat = (command, value) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value || null);
    handleInput();
  };

  // Cambiar el tipo de bloque (párrafo, h1, h2, h3)
  const applyBlock = (tag) => {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, tag);
    handleInput();
  };

  // Atajos de teclado
  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); applyFormat('bold'); }
      else if (e.key === 'i') { e.preventDefault(); applyFormat('italic'); }
      else if (e.key === 'u') { e.preventDefault(); applyFormat('underline'); }
    }
    // Actualizar formato activo después de mover el cursor con flechas
    setTimeout(updateActiveFormats, 10);
  };

  // Listener global para actualizar formato activo al cambiar la selección dentro del editor
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
        updateActiveFormats();
      }
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  // Estilos para el contenido renderizado (afectan h1, h2, h3, ul, ol dentro del editor)
  return (
    <div className="relative">
      <style>{`
        .rich-text-editor h1 { font-size: 1.75rem; font-weight: 700; line-height: 1.2; margin: 0.5rem 0 0.25rem; font-family: 'Fraunces', serif; letter-spacing: -0.02em; }
        .rich-text-editor h2 { font-size: 1.4rem; font-weight: 600; line-height: 1.3; margin: 0.4rem 0 0.2rem; font-family: 'Fraunces', serif; letter-spacing: -0.01em; }
        .rich-text-editor h3 { font-size: 1.15rem; font-weight: 600; line-height: 1.4; margin: 0.3rem 0 0.15rem; }
        .rich-text-editor p { margin: 0.15rem 0; line-height: 1.65; }
        .rich-text-editor ul { list-style: disc; padding-left: 1.5rem; margin: 0.3rem 0; }
        .rich-text-editor ol { list-style: decimal; padding-left: 1.5rem; margin: 0.3rem 0; }
        .rich-text-editor li { margin: 0.1rem 0; line-height: 1.5; }
        .rich-text-editor strong, .rich-text-editor b { font-weight: 700; }
        .rich-text-editor em, .rich-text-editor i { font-style: italic; }
        .rich-text-editor u { text-decoration: underline; }
        .rich-text-editor s { text-decoration: line-through; }
        .rich-text-editor:empty:before {
          content: attr(data-placeholder);
          color: #a8a29e;
          pointer-events: none;
        }
        .rich-text-editor:focus { outline: none; }
      `}</style>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Escribe lo que pase por tu mente..."
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        className="rich-text-editor w-full text-base focus:outline-none leading-relaxed bg-transparent"
        style={{ minHeight: '1.75rem' }}
      />

      {/* Botón Aa para abrir el menú de formato */}
      <div className={`absolute -left-9 top-0.5 transition-opacity ${focused || showToolbar ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowToolbar(!showToolbar)}
          className={`w-7 h-7 rounded-md flex items-center justify-center transition shadow-sm ${showToolbar ? 'bg-stone-900 text-white' : 'bg-white/95 backdrop-blur border border-stone-200 hover:bg-stone-100 text-stone-700'}`}
          title="Formato de texto"
        >
          <span className="text-xs font-bold">Aa</span>
        </button>
      </div>

      {/* Toolbar desplegable */}
      {showToolbar && (
        <div
          className="absolute z-30 left-0 top-9 bg-white border border-stone-200 rounded-xl shadow-lg p-2 fade-up"
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* Helper para resaltar botón activo: bg gris fuerte + texto oscuro */}
          {(() => null)()}
          <div className="grid grid-cols-4 gap-1 mb-2 pb-2 border-b border-stone-100">
            <button onClick={() => applyBlock('p')} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md transition ${activeFormats.blockTag === 'p' ? 'bg-stone-200' : 'hover:bg-stone-100'}`} title="Párrafo">
              <Type size={14} className="text-stone-700"/>
              <span className="text-[9px] text-stone-600">Normal</span>
            </button>
            <button onClick={() => applyBlock('h1')} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md transition ${activeFormats.blockTag === 'h1' ? 'bg-stone-200' : 'hover:bg-stone-100'}`} title="Título grande">
              <Heading1 size={14} className="text-stone-700"/>
              <span className="text-[9px] text-stone-600">Título</span>
            </button>
            <button onClick={() => applyBlock('h2')} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md transition ${activeFormats.blockTag === 'h2' ? 'bg-stone-200' : 'hover:bg-stone-100'}`} title="Subtítulo">
              <Heading2 size={14} className="text-stone-700"/>
              <span className="text-[9px] text-stone-600">Subt.</span>
            </button>
            <button onClick={() => applyBlock('h3')} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md transition ${activeFormats.blockTag === 'h3' ? 'bg-stone-200' : 'hover:bg-stone-100'}`} title="Subtítulo chico">
              <Heading3 size={14} className="text-stone-700"/>
              <span className="text-[9px] text-stone-600">Subt. ch.</span>
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 mb-2 pb-2 border-b border-stone-100">
            <button onClick={() => applyFormat('bold')} className={`px-2 py-1.5 rounded-md transition flex items-center justify-center ${activeFormats.bold ? 'bg-stone-200' : 'hover:bg-stone-100'}`} title="Negrita (Ctrl+B)">
              <Bold size={14} className="text-stone-700"/>
            </button>
            <button onClick={() => applyFormat('italic')} className={`px-2 py-1.5 rounded-md transition flex items-center justify-center ${activeFormats.italic ? 'bg-stone-200' : 'hover:bg-stone-100'}`} title="Cursiva (Ctrl+I)">
              <Italic size={14} className="text-stone-700"/>
            </button>
            <button onClick={() => applyFormat('underline')} className={`px-2 py-1.5 rounded-md transition flex items-center justify-center ${activeFormats.underline ? 'bg-stone-200' : 'hover:bg-stone-100'}`} title="Subrayado (Ctrl+U)">
              <Underline size={14} className="text-stone-700"/>
            </button>
            <button onClick={() => applyFormat('strikethrough')} className={`px-2 py-1.5 rounded-md transition flex items-center justify-center ${activeFormats.strikethrough ? 'bg-stone-200' : 'hover:bg-stone-100'}`} title="Tachado">
              <Strikethrough size={14} className="text-stone-700"/>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => applyFormat('insertUnorderedList')} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition ${activeFormats.unorderedList ? 'bg-stone-200' : 'hover:bg-stone-100'}`} title="Viñetas">
              <ListBullet size={14} className="text-stone-700"/>
              <span className="text-[10px] text-stone-600">Viñetas</span>
            </button>
            <button onClick={() => applyFormat('insertOrderedList')} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition ${activeFormats.orderedList ? 'bg-stone-200' : 'hover:bg-stone-100'}`} title="Lista numerada">
              <ListOrdered size={14} className="text-stone-700"/>
              <span className="text-[10px] text-stone-600">Numerada</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Lista de tareas tipo Wunderlist: Enter crea otro item, Enter en vacío termina la lista, Backspace en vacío borra el item
function TaskBlock({ block, onUpdate }) {
  const initial = block.items || (block.text !== undefined ? [{ id: 'mig-' + Math.random(), text: block.text, done: !!block.done, doneAt: block.doneAt || null }] : []);
  const [localItems, setLocalItems] = useState(initial);
  const [autoSort, setAutoSort] = useState(block.autoSort !== false); // por defecto activado
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const inputRefs = useRef({});
  const focusRequest = useRef(null);
  const timeoutRef = useRef();
  const touchData = useRef(null); // para drag táctil

  useEffect(() => {
    const incoming = block.items || (block.text !== undefined ? [{ id: 'mig-' + Math.random(), text: block.text, done: !!block.done, doneAt: block.doneAt || null }] : []);
    setLocalItems(incoming);
    if (block.autoSort !== undefined) setAutoSort(block.autoSort);
  }, [block.id]);

  useEffect(() => {
    if (focusRequest.current && inputRefs.current[focusRequest.current]) {
      const el = inputRefs.current[focusRequest.current];
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
      focusRequest.current = null;
    }
  }, [localItems]);

  const persist = (newItems, opts = {}) => {
    setLocalItems(newItems);
    clearTimeout(timeoutRef.current);
    const payload = { items: newItems, text: undefined, done: undefined, doneAt: undefined };
    if (opts.autoSort !== undefined) payload.autoSort = opts.autoSort;
    timeoutRef.current = setTimeout(() => onUpdate(payload), 250);
  };

  const newItemId = () => 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

  // Reordenar: si autoSort, los hechos van al final manteniendo orden interno
  const reorder = (items) => {
    if (!autoSort) return items;
    const pending = items.filter(it => !it.done);
    const completed = items.filter(it => it.done);
    return [...pending, ...completed];
  };

  const updateItemText = (id, text) => persist(localItems.map(it => it.id === id ? { ...it, text } : it));

  const toggleItem = (id) => {
    const next = localItems.map(it => it.id === id ? { ...it, done: !it.done, doneAt: !it.done ? Date.now() : null } : it);
    persist(reorder(next));
  };

  const removeItem = (id) => persist(localItems.filter(it => it.id !== id));

  const handleKeyDown = (e, item, idx) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (item.text.trim() === '' && localItems.length > 1) {
        const filtered = localItems.filter(it => it.id !== item.id);
        persist(filtered);
        e.target.blur();
        return;
      }
      const newItem = { id: newItemId(), text: '', done: false, doneAt: null };
      const next = [...localItems];
      next.splice(idx + 1, 0, newItem);
      focusRequest.current = newItem.id;
      persist(next);
    } else if (e.key === 'Backspace' && item.text === '' && localItems.length > 1) {
      e.preventDefault();
      const prev = localItems[idx - 1];
      const next = localItems.filter(it => it.id !== item.id);
      if (prev) focusRequest.current = prev.id;
      persist(next);
    } else if (e.key === 'ArrowDown' && idx < localItems.length - 1) {
      e.preventDefault();
      inputRefs.current[localItems[idx + 1].id]?.focus();
    } else if (e.key === 'ArrowUp' && idx > 0) {
      e.preventDefault();
      inputRefs.current[localItems[idx - 1].id]?.focus();
    }
  };

  const addFirstItem = () => {
    const item = { id: newItemId(), text: '', done: false, doneAt: null };
    focusRequest.current = item.id;
    persist([item]);
  };
  const addItemAtEnd = () => {
    const item = { id: newItemId(), text: '', done: false, doneAt: null };
    focusRequest.current = item.id;
    // insertar antes de los completados si autoSort
    if (autoSort) {
      const pending = localItems.filter(it => !it.done);
      const completed = localItems.filter(it => it.done);
      persist([...pending, item, ...completed]);
    } else {
      persist([...localItems, item]);
    }
  };

  // ===== DRAG & DROP (mouse) =====
  const onDragStart = (e, id) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch(_) {}
  };
  const onDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) setDragOverId(id);
  };
  const onDragLeave = () => setDragOverId(null);
  const onDrop = (e, targetId) => {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return; }
    const fromIdx = localItems.findIndex(it => it.id === draggingId);
    const toIdx = localItems.findIndex(it => it.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggingId(null); setDragOverId(null); return; }
    const next = [...localItems];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persist(next);
    setDraggingId(null);
    setDragOverId(null);
  };
  const onDragEnd = () => { setDraggingId(null); setDragOverId(null); };

  // ===== DRAG TÁCTIL (móvil) =====
  const onTouchStart = (e, id) => {
    const touch = e.touches[0];
    touchData.current = { id, startY: touch.clientY };
    setDraggingId(id);
  };
  const onTouchMove = (e) => {
    if (!touchData.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    // Buscar el elemento bajo el dedo
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const itemEl = el?.closest('[data-task-item-id]');
    if (itemEl) {
      const id = itemEl.dataset.taskItemId;
      if (id !== dragOverId) setDragOverId(id);
    }
  };
  const onTouchEnd = () => {
    if (!touchData.current || !dragOverId || dragOverId === touchData.current.id) {
      setDraggingId(null);
      setDragOverId(null);
      touchData.current = null;
      return;
    }
    const fromIdx = localItems.findIndex(it => it.id === touchData.current.id);
    const toIdx = localItems.findIndex(it => it.id === dragOverId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const next = [...localItems];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      persist(next);
    }
    setDraggingId(null);
    setDragOverId(null);
    touchData.current = null;
  };

  const toggleAutoSort = () => {
    const newVal = !autoSort;
    setAutoSort(newVal);
    persist(newVal ? reorder([...localItems]) : localItems, { autoSort: newVal });
  };

  const doneCount = localItems.filter(it => it.done).length;

  if (localItems.length === 0) {
    return (
      <button onClick={addFirstItem} className="w-full py-2 flex items-center gap-3 hover:bg-stone-50/50 rounded-lg transition text-left">
        <SquareEmpty size={18} className="text-stone-300 flex-shrink-0 ml-1" />
        <span className="text-sm text-stone-400">Toca para empezar la lista de tareas…</span>
      </button>
    );
  }

  return (
    <div className="my-1">
      <div className="px-1 pt-1 pb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">{localItems.length > 1 ? 'Lista de tareas' : 'Tarea'}</span>
        <div className="flex items-center gap-2">
          {localItems.length > 1 && <span className="text-[10px] text-stone-500">{doneCount}/{localItems.length}</span>}
          <button onClick={toggleAutoSort} title={autoSort ? 'Desactivar: mover hechas al final' : 'Activar: mover hechas al final'}
            className={`text-[10px] px-2 py-0.5 rounded-full transition ${autoSort ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
            {autoSort ? '↓ hechas abajo' : '○ orden libre'}
          </button>
        </div>
      </div>

      <div onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {localItems.map((item, idx) => {
          const isDragging = draggingId === item.id;
          const isDragOver = dragOverId === item.id && draggingId !== item.id;
          return (
            <div
              key={item.id}
              data-task-item-id={item.id}
              draggable
              onDragStart={(e) => onDragStart(e, item.id)}
              onDragOver={(e) => onDragOver(e, item.id)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, item.id)}
              onDragEnd={onDragEnd}
              className={`flex items-start gap-2 py-1 transition ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'bg-amber-50 border-t-2 border-amber-400 rounded' : ''}`}
              style={{ touchAction: draggingId ? 'none' : 'auto' }}
            >
              <button
                onTouchStart={(e) => onTouchStart(e, item.id)}
                className="mt-1.5 flex-shrink-0 cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 transition touch-none"
                aria-label="Arrastrar para reordenar"
                style={{ touchAction: 'none' }}
              >
                <GripVertical size={14} />
              </button>
              <button onClick={() => toggleItem(item.id)} className="mt-1.5 flex-shrink-0" aria-label="Marcar como hecha">
                {item.done ? <CheckSquare size={18} className="text-emerald-600" /> : <SquareEmpty size={18} className="text-stone-300 hover:text-stone-600" />}
              </button>
              <input
                ref={el => { if (el) inputRefs.current[item.id] = el; }}
                type="text"
                value={item.text}
                onChange={e => updateItemText(item.id, e.target.value)}
                onKeyDown={e => handleKeyDown(e, item, idx)}
                placeholder="Tarea…"
                className={`flex-1 min-w-0 bg-transparent focus:outline-none text-sm leading-relaxed placeholder-stone-400 py-0.5 ${item.done ? 'line-through text-stone-400' : 'text-stone-900'}`}
              />
              <button
                onClick={() => removeItem(item.id)}
                className="mt-1.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-stone-300 hover:text-rose-500 hover:bg-rose-50 transition"
                aria-label="Eliminar tarea"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <button onClick={addItemAtEnd} className="w-full px-1 py-1.5 flex items-center gap-3 text-stone-400 hover:text-stone-700 transition text-left">
        <Plus size={14} />
        <span className="text-xs">Añadir tarea</span>
      </button>
    </div>
  );
}

function ImageBlock({ block, onUpdate }) {
  const fileRef = useRef();
  const [caption, setCaption] = useState(block.caption || '');
  const timeoutRef = useRef();

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    // Primera imagen: va a este bloque
    const [first, ...rest] = files;
    const r = new FileReader();
    r.onload = (ev) => {
      // Si hay más imágenes, las pasamos al padre para que cree bloques nuevos
      if (rest.length === 0) {
        onUpdate({ imageData: ev.target.result });
      } else {
        // Leemos las restantes en paralelo
        const readers = rest.map(f => new Promise(resolve => {
          const fr = new FileReader();
          fr.onload = (e2) => resolve(e2.target.result);
          fr.readAsDataURL(f);
        }));
        Promise.all(readers).then(additionalData => {
          onUpdate({ imageData: ev.target.result, _additionalImages: additionalData });
        });
      }
    };
    r.readAsDataURL(first);
    // limpiar el input para permitir re-selección de la misma foto
    e.target.value = '';
  };

  const handleCaption = (val) => {
    setCaption(val);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onUpdate({ caption: val }), 300);
  };

  if (block.imageData) {
    return (
      <div className="my-2">
        <img src={block.imageData} alt="" className="w-full max-h-96 object-contain rounded-lg" />
        <input
          value={caption}
          onChange={e => handleCaption(e.target.value)}
          placeholder="Pie de foto (opcional)"
          className="w-full mt-1.5 text-xs text-stone-500 italic bg-transparent focus:outline-none placeholder-stone-400 text-center"
        />
      </div>
    );
  }

  return (
    <div className="my-2">
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
      <button
        onClick={() => fileRef.current.click()}
        className="w-full py-8 border-2 border-dashed border-stone-300 hover:border-stone-500 rounded-lg flex flex-col items-center justify-center gap-1.5 hover:bg-stone-50/50 transition"
      >
        <ImageIcon size={24} className="text-stone-400" />
        <span className="text-sm font-medium text-stone-600">Seleccionar imágenes</span>
        <span className="text-[10px] text-stone-400">podés elegir varias a la vez</span>
      </button>
    </div>
  );
}

function DrawingBlock({ block, onUpdate }) {
  const [editing, setEditing] = useState(!block.drawingData);
  const canvasRef = useRef(); const [color, setColor] = useState('#1c1917'); const [size, setSize] = useState(3); const [drawing, setDrawing] = useState(false);
  const colors = ['#1c1917','#dc2626','#2563eb','#16a34a','#f59e0b','#9333ea'];
  useEffect(() => { if (!editing) return; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0,0,canvas.width,canvas.height); if (block.drawingData) { const img = new Image(); img.onload = () => ctx.drawImage(img,0,0,canvas.width,canvas.height); img.src = block.drawingData; }}, [editing]);
  const getPos = (e) => { const r = canvasRef.current.getBoundingClientRect(); const t = e.touches?e.touches[0]:e; return { x: ((t.clientX-r.left)/r.width)*canvasRef.current.width, y: ((t.clientY-r.top)/r.height)*canvasRef.current.height }; };
  const start = (e) => { e.preventDefault(); setDrawing(true); const ctx = canvasRef.current.getContext('2d'); const {x,y} = getPos(e); ctx.beginPath(); ctx.moveTo(x,y); };
  const draw = (e) => { if (!drawing) return; e.preventDefault(); const ctx = canvasRef.current.getContext('2d'); const {x,y} = getPos(e); ctx.lineTo(x,y); ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); };
  const stop = () => setDrawing(false);
  const save = () => { onUpdate({ drawingData: canvasRef.current.toDataURL('image/png') }); setEditing(false); };
  const clear = () => { const ctx = canvasRef.current.getContext('2d'); ctx.fillStyle='white'; ctx.fillRect(0,0,canvasRef.current.width,canvasRef.current.height); };
  if (!editing && block.drawingData) return (
    <div onClick={() => setEditing(true)} className="cursor-pointer my-2">
      <img src={block.drawingData} alt="" className="w-full rounded-lg bg-white"/>
      <p className="text-[10px] text-stone-400 italic text-center mt-1">Toca para editar el dibujo</p>
    </div>
  );
  return (
    <div className="my-2 rounded-lg overflow-hidden border border-stone-200">
      <canvas ref={canvasRef} width={800} height={600} onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={draw} onTouchEnd={stop} className="w-full aspect-[4/3] bg-white touch-none" style={{touchAction:'none'}}/>
      <div className="flex items-center justify-between p-3 bg-stone-50 border-t border-stone-200 flex-wrap gap-2">
        <div className="flex items-center gap-1.5">{colors.map(c => <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full transition ${color===c?'ring-2 ring-offset-1 ring-stone-900':''}`} style={{backgroundColor:c}}/>)}</div>
        <div className="flex items-center gap-2"><input type="range" min="1" max="20" value={size} onChange={e => setSize(+e.target.value)} className="w-16"/><button onClick={clear} className="w-8 h-8 rounded-lg bg-white border border-stone-300 flex items-center justify-center"><Eraser size={14}/></button><button onClick={save} className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-medium">{block.drawingData?'Guardar':'Listo'}</button></div>
      </div>
    </div>
  );
}

function VoiceBlock({ block, onUpdate }) {
  const [recording, setRecording] = useState(false); const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false);
  const mrRef = useRef(); const chunksRef = useRef([]); const audioRef = useRef(); const timerRef = useRef();
  const startRec = async () => { try { const s = await navigator.mediaDevices.getUserMedia({audio:true}); const mr = new MediaRecorder(s); chunksRef.current = []; mr.ondataavailable = e => chunksRef.current.push(e.data); mr.onstop = () => { const b = new Blob(chunksRef.current, {type:'audio/webm'}); const r = new FileReader(); r.onload = () => { const m = Math.floor(time/60); const sec = time%60; onUpdate({ audioData: r.result, duration: `${m}:${sec.toString().padStart(2,'0')}` }); }; r.readAsDataURL(b); s.getTracks().forEach(t => t.stop()); }; mrRef.current = mr; mr.start(); setRecording(true); setTime(0); timerRef.current = setInterval(() => setTime(t=>t+1), 1000); } catch (e) { alert('No se pudo acceder al micrófono.'); }};
  const stopRec = () => { mrRef.current?.stop(); setRecording(false); clearInterval(timerRef.current); };
  const fmt = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  if (block.audioData) return (
    <div className="my-2 py-2 px-3 bg-rose-50/50 rounded-lg flex items-center gap-3">
      <audio ref={audioRef} src={block.audioData} onEnded={() => setPlaying(false)} className="hidden"/>
      <button onClick={() => { if (playing) { audioRef.current.pause(); setPlaying(false); } else { audioRef.current.play(); setPlaying(true); }}} className="w-10 h-10 rounded-full bg-rose-500 text-white flex items-center justify-center flex-shrink-0">{playing?<Pause size={16}/>:<Play size={16} className="ml-0.5"/>}</button>
      <div className="flex-1"><p className="text-sm font-medium">Nota de voz</p><p className="text-xs text-stone-500">{block.duration||'0:00'}</p></div>
      <button onClick={() => onUpdate({ audioData: null, duration: null })} className="text-xs text-rose-600 underline">Regrabar</button>
    </div>
  );
  return (
    <div className="my-2 py-6 text-center bg-stone-50/50 rounded-lg">
      <button onClick={recording?stopRec:startRec} className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center transition ${recording?'bg-rose-500 pulse-ring':'bg-stone-900'} text-white`}>{recording?<Square size={20} fill="white"/>:<Mic size={20}/>}</button>
      <p className="mt-2 text-lg font-mono font-semibold">{fmt(time)}</p>
      <p className="text-xs text-stone-500 mt-0.5">{recording?'Grabando…':'Toca para grabar'}</p>
    </div>
  );
}

function LinkBlock({ block, onUpdate }) {
  const [url, setUrl] = useState(block.url || ''); const [content, setContent] = useState(block.content || ''); const [editing, setEditing] = useState(!block.url);
  const handleSave = () => { onUpdate({ url, content }); setEditing(false); };
  if (!editing && block.url) return (
    <div className="my-2 py-2.5 px-3 bg-amber-50/60 rounded-lg flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0"><Link2 size={15}/></div>
      <div className="flex-1 min-w-0">
        <a href={block.url} target="_blank" rel="noreferrer" className="text-sm text-amber-800 break-all underline">{block.url}</a>
        {block.content && <p className="text-xs text-stone-600 mt-1">{block.content}</p>}
        <button onClick={() => setEditing(true)} className="text-xs text-stone-500 underline mt-1">Editar</button>
      </div>
    </div>
  );
  return (
    <div className="my-2 space-y-2">
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="w-full bg-white/50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-stone-900"/>
      <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Notas (opcional)" rows={2} className="w-full bg-white/50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-stone-900 resize-none"/>
      <button onClick={handleSave} disabled={!url.trim()} className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-medium disabled:opacity-40">Guardar enlace</button>
    </div>
  );
}

// ============== GRAFO ==============
function GraphView({ notes, onBack, onOpen }) {
  const [positions, setPositions] = useState({}); const [hovered, setHovered] = useState(null); const [pan, setPan] = useState({x:0,y:0}); const [dragging, setDragging] = useState(false); const [dragStart, setDragStart] = useState({x:0,y:0}); const containerRef = useRef();
  useEffect(() => {
    if (notes.length === 0) return;
    const w = containerRef.current?.offsetWidth || 400; const h = containerRef.current?.offsetHeight || 600; const cx = w/2, cy = h/2;
    const pos = {};
    notes.forEach((n,i) => { const a = (i/notes.length)*Math.PI*2; const r = Math.min(w,h)*0.3; pos[n.id] = { x: cx+Math.cos(a)*r+(Math.random()-0.5)*40, y: cy+Math.sin(a)*r+(Math.random()-0.5)*40 }; });
    for (let it = 0; it < 100; it++) { const f = {}; notes.forEach(n => f[n.id] = {x:0,y:0}); for (let i = 0; i < notes.length; i++) for (let j = i+1; j < notes.length; j++) { const a = notes[i], b = notes[j]; const dx = pos[a.id].x-pos[b.id].x, dy = pos[a.id].y-pos[b.id].y; const d = Math.sqrt(dx*dx+dy*dy)||1; const fc = 3000/(d*d); f[a.id].x+=(dx/d)*fc; f[a.id].y+=(dy/d)*fc; f[b.id].x-=(dx/d)*fc; f[b.id].y-=(dy/d)*fc; } notes.forEach(n => { (n.connections||[]).forEach(c => { if (!pos[c]) return; const dx = pos[c].x-pos[n.id].x, dy = pos[c].y-pos[n.id].y; const d = Math.sqrt(dx*dx+dy*dy)||1; const fc = d*0.02; f[n.id].x+=(dx/d)*fc; f[n.id].y+=(dy/d)*fc; }); }); notes.forEach(n => { f[n.id].x+=(cx-pos[n.id].x)*0.005; f[n.id].y+=(cy-pos[n.id].y)*0.005; }); notes.forEach(n => { pos[n.id].x+=f[n.id].x*0.3; pos[n.id].y+=f[n.id].y*0.3; }); }
    setPositions(pos);
  }, [notes.length]);
  const handleStart = (e) => { setDragging(true); const t = e.touches?e.touches[0]:e; setDragStart({x:t.clientX-pan.x,y:t.clientY-pan.y}); };
  const handleMove = (e) => { if (!dragging) return; const t = e.touches?e.touches[0]:e; setPan({x:t.clientX-dragStart.x,y:t.clientY-dragStart.y}); };
  const handleEnd = () => setDragging(false);
  const nodeColor = (n) => { if (n.encrypted) return '#f59e0b'; const b = n.blocks||[]; if (b.length === 0) return '#78716c'; const c = {}; b.forEach(x => c[x.type] = (c[x.type]||0)+1); const d = Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0]; return {text:'#3b82f6',voice:'#f43f5e',image:'#10b981',drawing:'#9333ea',link:'#f59e0b',task:'#10b981'}[d]||'#78716c'; };
  return (
    <div className="h-screen flex flex-col bg-stone-900 text-stone-50">
      <header className="px-5 py-3 flex items-center justify-between border-b border-stone-800"><button onClick={onBack} className="w-10 h-10 rounded-full hover:bg-stone-800 flex items-center justify-center"><ArrowLeft size={18}/></button><div className="text-center"><h2 className="display text-lg font-semibold">Mapa Mental</h2><p className="text-[10px] text-stone-500">{notes.length} nodos · arrastra</p></div><div className="w-10"/></header>
      <div ref={containerRef} className="flex-1 relative overflow-hidden cursor-move" onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleEnd} onMouseLeave={handleEnd} onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd} style={{touchAction:'none'}}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-10"><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/></svg>
        {notes.length === 0 ? <div className="absolute inset-0 flex items-center justify-center text-center px-8"><div><Network size={48} className="mx-auto mb-4 text-stone-600"/><p className="text-stone-400">Crea notas y conéctalas</p></div></div> : (
          <div style={{transform:`translate(${pan.x}px,${pan.y}px)`,position:'absolute',inset:0}}>
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{overflow:'visible'}}>{notes.map(n => (n.connections||[]).map(c => { if (!positions[n.id]||!positions[c]) return null; if (n.id > c) return null; const a = positions[n.id], b = positions[c]; const h = hovered === n.id || hovered === c; return <line key={`${n.id}-${c}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={h?'#f59e0b':'#44403c'} strokeWidth={h?2:1} opacity={h?1:0.5}/>; }))}</svg>
            {notes.map(n => { const p = positions[n.id]; if (!p) return null; const c = nodeColor(n); const cc = (n.connections||[]).length; const r = 18+Math.min(cc*2,12); return <div key={n.id} onClick={(e)=>{e.stopPropagation();onOpen(n);}} onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)} className="absolute cursor-pointer transition-transform hover:scale-110" style={{left:p.x-r,top:p.y-r,width:r*2,height:r*2}}><div className="w-full h-full rounded-full flex items-center justify-center text-white font-semibold border-2" style={{backgroundColor:c,borderColor:hovered===n.id?'#fff':'rgba(255,255,255,0.2)',boxShadow:hovered===n.id?`0 0 20px ${c}`:'none'}}>{n.encrypted?<Lock size={r*0.55}/>:<FileText size={r*0.6}/>}</div>{hovered===n.id&&<div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-stone-800 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap border border-stone-700 z-10">{n.title||(n.encrypted?'🔒 Privada':'Sin título')}</div>}</div>; })}
          </div>
        )}
      </div>
    </div>
  );
}
