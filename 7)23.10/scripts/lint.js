// «Линтер» без зависимостей: проверяет синтаксис всех .js файлов (node --check).
// Если есть ошибка — завершаемся с кодом 1, и npm НЕ запустит сам build.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SKIP = new Set(["node_modules", "dist", ".git"]);

function collect(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return collect(full);
    return full.endsWith(".js") ? [full] : [];
  });
}

const files = collect(".");
let failed = 0;

for (const file of files) {
  const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf-8" });
  if (res.status !== 0) {
    failed++;
    console.error(`✗ ${file}\n${res.stderr}`);
  }
}

if (failed) {
  console.error(`Линтинг не пройден: ошибок в файлах — ${failed}`);
  process.exit(1);
}
console.log(`✓ Линтинг пройден (${files.length} файлов)`);
