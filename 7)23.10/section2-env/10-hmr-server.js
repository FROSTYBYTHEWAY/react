// Задача 10: Эмуляция протокола HMR
// Мини-сервер на нативном http (без сторонних пакетов): следит за файлом через
// fs.watch и при изменении отправляет клиенту JSON { type: 'reload' }.
// Канал связи — Server-Sent Events (SSE): сервер «стримит» сообщения в браузер.
// Запуск: node section2-env/10-hmr-server.js  и открыть http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import { once } from "node:events";
import { pathToFileURL } from "node:url";

const CLIENT_HTML = `<!doctype html>
<meta charset="utf-8"><title>HMR demo</title>
<h1>Страница обновится при изменении test.js</h1>
<script>
  const es = new EventSource("/hmr");
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "reload") location.reload();
  };
</script>`;

export async function createHmrServer({ file = "test.js", port = 3000, debounceMs = 50 } = {}) {
  const clients = new Set();

  const broadcast = (message) => {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    for (const res of clients) res.write(data);
  };

  const server = http.createServer((req, res) => {
    if (req.url === "/hmr") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(": connected\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(CLIENT_HTML);
  });

  // Редакторы часто шлют несколько событий за одно сохранение — склеиваем их (debounce)
  let timer;
  const watcher = fs.watch(file, () => {
    clearTimeout(timer);
    timer = setTimeout(() => broadcast({ type: "reload" }), debounceMs);
  });

  server.listen(port);
  await once(server, "listening");

  return {
    port: server.address().port,
    broadcast,
    async close() {
      clearTimeout(timer);
      watcher.close();
      for (const res of clients) res.end();
      server.close();
      await once(server, "close");
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!fs.existsSync("test.js")) fs.writeFileSync("test.js", "// измени меня\n");
  const hmr = await createHmrServer({ file: "test.js", port: 3000 });
  console.log(`HMR-сервер: http://localhost:${hmr.port}  (следит за test.js)`);
}
