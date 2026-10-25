// ============================================================
// Radio Digital Local - Backend (Express + Socket.io + SQLite)
// ============================================================
const express = require('express');
const http = require('http');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Server } = require('socket.io');

// ---------- 1. Configuración ----------
const PORT = process.env.PORT || 3000;
const ICECAST_STATUS = process.env.ICECAST_STATUS || 'http://localhost:8000/status-json.xsl';
const POLL_MS = 5000; // cada cuánto se consulta Icecast

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 2. Base de datos SQLite ----------
const db = new sqlite3.Database(path.join(__dirname, 'radio.db'));

// Helpers que convierten los callbacks de sqlite3 en promesas
const run = (sql, p = []) => new Promise((res, rej) =>
  db.run(sql, p, function (err) { err ? rej(err) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) =>
  db.all(sql, p, (err, rows) => (err ? rej(err) : res(rows))));

async function initDB() {
  await run(`CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    file TEXT NOT NULL            -- ruta del MP3 en la Raspberry Pi
  )`);
  await run(`CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | played
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (song_id) REFERENCES songs(id)
  )`);

  // Canciones de ejemplo (cámbialas por tus archivos reales)
  const [{ n }] = await all('SELECT COUNT(*) AS n FROM songs');
  if (n === 0) {
    const demo = [
      ['Canción Uno', 'Artista A', '/home/pi/musica/uno.mp3'],
      ['Canción Dos', 'Artista B', '/home/pi/musica/dos.mp3'],
      ['Canción Tres', 'Artista C', '/home/pi/musica/tres.mp3'],
      ['Canción Cuatro', 'Artista D', '/home/pi/musica/cuatro.mp3'],
    ];
    for (const s of demo) await run('INSERT INTO songs (title, artist, file) VALUES (?,?,?)', s);
  }
}

// ---------- 3. Estado en memoria ----------
let nowPlaying = { title: 'Esperando transmisión…', artist: '' };
let listeners = 0;
let live = false;

const getSongs = () => all('SELECT id, title, artist FROM songs ORDER BY title');
const getQueue = () => all(`
  SELECT r.id, s.title, s.artist FROM requests r
  JOIN songs s ON s.id = r.song_id
  WHERE r.status = 'pending' ORDER BY r.id`);

// Envía el estado completo a todos los clientes conectados
async function broadcast() {
  io.emit('state', {
    nowPlaying, listeners, live,
    queue: await getQueue(),
    songs: await getSongs(),
  });
}

// ---------- 4. Consulta periódica a Icecast ----------
async function pollIcecast() {
  try {
    const data = await (await fetch(ICECAST_STATUS)).json();
    let src = data.icestats && data.icestats.source;
    if (Array.isArray(src)) src = src[0];
    live = !!src;
    listeners = src ? src.listeners || 0 : 0;
  } catch {
    live = false;     // Icecast apagado o inaccesible
    listeners = 0;
  }
  broadcast();
}

// ---------- 5. API para el reproductor (Liquidsoap / ices / script) ----------
// El reproductor de audio llama a este endpoint al terminar cada canción.
// Devuelve la ruta del archivo: primero la cola de peticiones, si no hay, una al azar.
app.get('/api/next', async (req, res) => {
  try {
    const [req1] = await all(`
      SELECT r.id AS rid, s.* FROM requests r JOIN songs s ON s.id = r.song_id
      WHERE r.status = 'pending' ORDER BY r.id LIMIT 1`);
    let song = req1;
    if (req1) {
      await run("UPDATE requests SET status='played' WHERE id=?", [req1.rid]);
    } else {
      [song] = await all('SELECT * FROM songs ORDER BY RANDOM() LIMIT 1');
    }
    if (!song) return res.status(404).send('Sin canciones');
    nowPlaying = { title: song.title, artist: song.artist };
    broadcast();
    res.type('text/plain').send(song.file);
  } catch (e) { res.status(500).send(e.message); }
});

// ---------- 6. WebSockets ----------
io.on('connection', async (socket) => {
  // Estado inicial para el cliente recién conectado
  socket.emit('state', {
    nowPlaying, listeners, live,
    queue: await getQueue(), songs: await getSongs(),
  });

  // El oyente pide una canción
  socket.on('request-song', async (songId) => {
    try {
      // Evita duplicados: la misma canción no puede estar dos veces pendiente
      const dup = await all("SELECT id FROM requests WHERE song_id=? AND status='pending'", [songId]);
      if (dup.length) return socket.emit('notice', 'Esa canción ya está en la cola.');
      await run('INSERT INTO requests (song_id) VALUES (?)', [songId]);
      socket.emit('notice', '¡Petición enviada!');
      broadcast();
    } catch {
      socket.emit('notice', 'No se pudo enviar la petición.');
    }
  });
});

// ---------- 7. Arranque ----------
initDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => console.log(`Radio en http://localhost:${PORT}`));
  setInterval(pollIcecast, POLL_MS);
  pollIcecast();
});