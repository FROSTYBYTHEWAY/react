// postbuild: выводит размер указанной папки
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist";

const sizeOf = (path) => {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0);
};

const bytes = sizeOf(dir);
console.log(`📦 Размер папки ${dir}: ${bytes} байт (${(bytes / 1024).toFixed(2)} КБ)`);
