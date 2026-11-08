// Задача 07: Скрипт проверки окружения перед сборкой
// Если мажорная версия Node.js ниже 18 — пишем ошибку и завершаем процесс с кодом 1.
// Запуск: node section2-env/07-check-env.js
import { pathToFileURL } from "node:url";

export const MIN_NODE_MAJOR = 18;

// "v20.17.0" -> 20
export const getMajor = (version) => Number(String(version).replace(/^v/, "").split(".")[0]);

// log и exit можно подменить в тестах
export function checkNodeVersion(
  version = process.version,
  { log = console.error, exit = process.exit } = {}
) {
  const major = getMajor(version);

  if (major < MIN_NODE_MAJOR) {
    log(`✗ Требуется Node.js >= ${MIN_NODE_MAJOR}, а установлена ${version}. Обновите Node.js.`);
    exit(1);
    return false;
  }

  console.log(`✓ Node.js ${version} подходит (нужна >= ${MIN_NODE_MAJOR}).`);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) checkNodeVersion();
