// Задача 06: Валидатор версий в package.json
// Находит в "dependencies" версии с диапазонами (^ или ~), т.е. нарушающие
// строгую фиксацию версий (детерминизм сборки).
// Запуск: node section2-env/06-validate-versions.js [путь/к/package.json]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function findLooseDependencies(pkg) {
  const deps = pkg.dependencies ?? {};
  return Object.entries(deps)
    .filter(([, version]) => /^[\^~]/.test(String(version).trim()))
    .map(([name, version]) => ({ name, version }));
}

function main() {
  const file = process.argv[2] ?? "package.json";
  const pkg = JSON.parse(readFileSync(file, "utf-8"));
  const bad = findLooseDependencies(pkg);

  if (bad.length === 0) {
    console.log("✓ Все зависимости зафиксированы строго.");
    return;
  }

  console.log("✗ Пакеты, нарушающие строгую фиксацию версий:");
  bad.forEach(({ name, version }) => console.log(`  - ${name}: ${version}`));
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
