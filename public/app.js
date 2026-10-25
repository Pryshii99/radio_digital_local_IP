// ============================================================
// Radio Digital Local - Frontend
// ============================================================

// 1. Reproductor: apunta al stream de Icecast en el mismo equipo que sirve la web
const audio = document.getElementById('audio');
audio.src = `http://${location.hostname}:8000/stream`;

// 2. Conexión Socket.io
const socket = io();

// Referencias al DOM
const $ = (id) => document.getElementById(id);
const songsEl = $('songs'), queueEl = $('queue'), emptyEl = $('queue-empty');

// 3. Recibir el estado en tiempo real y pintar la interfaz
socket.on('state', ({ nowPlaying, listeners, live, queue, songs }) => {
  // Canción actual
  $('song-title').textContent = nowPlaying.title;
  $('song-artist').textContent = nowPlaying.artist;

  // Indicador EN VIVO + oyentes
  $('live').dataset.live = live;
  $('live-text').textContent = live ? 'EN VIVO' : 'SIN SEÑAL';
  $('listeners').textContent = listeners;

  // Lista de canciones con botón "Pedir canción"
  songsEl.innerHTML = '';
  songs.forEach((s) => {
    const li = document.createElement('li');
    li.className = 'song';
    li.innerHTML = `<span><strong></strong><small></small></span><button>Pedir canción</button>`;
    li.querySelector('strong').textContent = s.title;      // textContent evita inyección de HTML
    li.querySelector('small').textContent = s.artist;
    li.querySelector('button').addEventListener('click', () => socket.emit('request-song', s.id));
    songsEl.appendChild(li);
  });

  // Cola de peticiones
  queueEl.innerHTML = '';
  queue.forEach((q) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="t"></span>';
    li.querySelector('.t').textContent = `${q.title} — ${q.artist}`;
    queueEl.appendChild(li);
  });
  emptyEl.hidden = queue.length > 0;
});

// 4. Mensajes breves del servidor (petición enviada, duplicada, etc.)
const toast = $('toast');
let timer;
socket.on('notice', (msg) => {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => toast.classList.remove('show'), 2500);
});