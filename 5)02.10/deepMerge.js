import { pathToFileURL } from "node:url";
// Задача 5: Глубокий Merge конфигураций с валидацией типов
// Обычный { ...defaults, ...userConfig } перезаписывает вложенные объекты
// целиком и затирает дефолтные параметры. deepMerge объединяет деревья любой глубины.

const isObject = (item) => item && typeof item === "object" && !Array.isArray(item);

export function deepMerge(target, source) {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }

  return output;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Тест слияния настроек приложения:
  const defaultEnv = {
    api: { host: "api.site.com", port: 443, ssl: true },
    ui: { animations: true, theme: "system" },
  };

  const customEnv = {
    api: { port: 8080, ssl: false }, // host не указан, но должен сохраниться!
  };

  const mergedEnv = deepMerge(defaultEnv, customEnv);
  console.log(mergedEnv.api);
  // { host: 'api.site.com', port: 8080, ssl: false } — host НЕ пропал!
}
