'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 8090);
const TOKEN = process.env.CAMERA_TOKEN || 'change-me';
const RTSP_TARGET = process.env.RTSP_TARGET || 'rtsp://mediamtx:8554/phonecam';
const PUBLIC = path.join(__dirname, 'public');
let publisher = null;

const types = {
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.css':'text/css; charset=utf-8'
};

function send(ws, type, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type, message}));
}
function stopPublisher(ws) {
  if (!ws || !ws.ffmpeg) return;
  const child = ws.ffmpeg;
  ws.ffmpeg = null;
  if (publisher === ws) publisher = null;
  try { child.stdin.end(); } catch {}
  const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 4000);
  child.once('exit', () => clearTimeout(killer));
}
function startPublisher(ws) {
  if (publisher && publisher !== ws) {
    send(ws, 'error', 'Камера уже передаёт видео с другого телефона.');
    return;
  }
  const args = [
    '-hide_banner','-loglevel','warning','-fflags','+genpts',
    '-f','webm','-i','pipe:0','-an',
    '-vf','fps=15,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
    '-c:v','libx264','-preset','ultrafast','-tune','zerolatency',
    '-pix_fmt','yuv420p','-profile:v','baseline','-g','30','-keyint_min','30',
    '-f','rtsp','-rtsp_transport','tcp',RTSP_TARGET
  ];
  const child = spawn('ffmpeg', args, {stdio:['pipe','ignore','pipe']});
  ws.ffmpeg = child;
  publisher = ws;
  child.stderr.on('data', chunk => {
    const line = chunk.toString().trim();
    if (line) console.error('[ffmpeg]', line);
  });
  child.on('error', err => send(ws, 'error', 'Не удалось запустить FFmpeg: ' + err.message));
  child.on('exit', code => {
    if (ws.ffmpeg === child) ws.ffmpeg = null;
    if (publisher === ws) publisher = null;
    if (code && code !== 255) send(ws, 'error', 'FFmpeg завершился с кодом ' + code + '. Проверьте журнал сервера.');
  });
  send(ws, 'status', 'FFmpeg подключается к RTSP-серверу.');
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type':'application/json'}).end(JSON.stringify({ok:true,publishing:!!publisher}));
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad Request'); return; }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(PUBLIC, '.' + pathname);
  if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC,'index.html')) {
    res.writeHead(403).end('Forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not Found'); return; }
    res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream','cache-control':'no-cache'});
    res.end(data);
  });
});

const wss = new WebSocketServer({server, path:'/ws', maxPayload:2 * 1024 * 1024});
wss.on('connection', ws => {
  ws.authed = false;
  ws.ffmpeg = null;
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      if (ws.authed && ws.ffmpeg && ws.ffmpeg.stdin.writable) {
        try { ws.ffmpeg.stdin.write(data); } catch (e) { send(ws,'error','Ошибка записи видеоданных: '+e.message); }
      }
      return;
    }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { send(ws,'error','Некорректная команда.'); return; }
    if (!ws.authed) {
      if (msg.type !== 'auth' || typeof msg.token !== 'string' || msg.token !== TOKEN) {
        send(ws,'error','Неверный ключ подключения.'); ws.close(1008,'Unauthorized'); return;
      }
      ws.authed = true;
      ws.send(JSON.stringify({type:'auth-ok'}));
      return;
    }
    if (msg.type === 'start') startPublisher(ws);
    if (msg.type === 'stop') { stopPublisher(ws); send(ws,'status','Видеопоток остановлен.'); }
  });
  ws.on('close', () => stopPublisher(ws));
  ws.on('error', err => console.error('[ws]', err.message));
});

server.listen(PORT, '0.0.0.0', () => console.log('Phone IP Camera bridge listening on :' + PORT));