// ============================================================
// Radio Digital Local - Frontend
// ============================================================

const $ = (id) => document.getElementById(id);

const audio = $('audio');
const playerCard = document.querySelector('.player');
const songsEl = $('songs');
const queueEl = $('queue');
const emptyEl = $('queue-empty');
const toast = $('toast');

// Reproductor: apunta al stream de Icecast en el mismo host
if (audio) {
  audio.src = `http://${location.hostname}:8000/stream`;
  if (playerCard) {
    audio.addEventListener('play', () => playerCard.classList.add('is-playing'));
    audio.addEventListener('pause', () => playerCard.classList.remove('is-playing'));
    audio.addEventListener('ended', () => playerCard.classList.remove('is-playing'));
  }
}

// Conexión Socket.IO (segura si se abre index.html directo sin servidor)
const socket = typeof io === 'function' ? io() : null;

function renderSongs(songs = []) {
  songsEl.innerHTML = '';

  songs.forEach((song) => {
    const li = document.createElement('li');
    li.className = 'song';
    li.innerHTML = `<span><strong></strong><small></small></span><button type="button">Pedir canción</button>`;

    li.querySelector('strong').textContent = song.title;
    li.querySelector('small').textContent = song.artist;
    li.querySelector('button').addEventListener('click', () => {
      if (socket) socket.emit('request-song', song.id);
    });

    songsEl.appendChild(li);
  });
}

function renderQueue(queue = []) {
  queueEl.innerHTML = '';

  queue.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="t"></span>';
    li.querySelector('.t').textContent = `${item.title} — ${item.artist}`;
    queueEl.appendChild(li);
  });

  emptyEl.hidden = queue.length > 0;
}

if (socket) {
  socket.on('state', ({ nowPlaying, listeners, live, queue, songs }) => {
    $('song-title').textContent = nowPlaying?.title || 'Esperando transmisión…';
    $('song-artist').textContent = nowPlaying?.artist || '';

    $('live').dataset.live = live;
    $('live-text').textContent = live ? 'EN VIVO' : 'SIN SEÑAL';
    $('listeners').textContent = listeners;

    renderSongs(songs);
    renderQueue(queue);
  });

  let toastTimer;
  socket.on('notice', (msg) => {
    toast.textContent = msg;
    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  });
}