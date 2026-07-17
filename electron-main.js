const { app, BrowserWindow } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, 'out')
const PORT = 3131

// MIME 타입 매핑
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0]

      // Next.js static export: 경로 → 파일 매핑
      let filePath = path.join(OUT_DIR, urlPath)

      // 디렉토리면 index.html
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html')
      }

      // 확장자 없는 경로 → .html 시도
      if (!fs.existsSync(filePath)) {
        filePath = filePath + '.html'
      }

      // 그래도 없으면 404
      if (!fs.existsSync(filePath)) {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const ext = path.extname(filePath)
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      fs.createReadStream(filePath).pipe(res)
    })

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(null) // 이미 실행 중이면 그냥 진행
      else throw err
    })
    server.listen(PORT, '127.0.0.1', () => resolve(server))
  })
}

async function createWindow() {
  await startServer()

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: '샐러리아 침산점 — 선결제 주문 시스템',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.loadURL(`http://127.0.0.1:${PORT}/pos/`)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
