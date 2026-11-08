// Этап 4: Параллельное исполнение: Promise.all vs Promise.allSettled
import { mockFetchUser } from "./api.js";
import { isPasswordSecure, isAgeValid } from "./mathUtils.js";

// СЦЕНАРИЙ 1: Отказоустойчивая загрузка виджетов дашборда через Promise.allSettled
export async function loadDashboardWidgets() {
  const userIds = ["u1", "u2_failed", "u3"];

  const requests = userIds.map((id) =>
    mockFetchUser(id, { shouldFail: id.includes("failed") })
  );

  const results = await Promise.allSettled(requests);

  const successfulUsers = [];
  const failedErrors = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successfulUsers.push(result.value);
    } else {
      failedErrors.push({ id: userIds[index], reason: result.reason.message });
    }
  });

  console.log("Успешно загружены:", successfulUsers);
  console.log("Ошибки загрузки виджетов:", failedErrors);
  return { successfulUsers, failedErrors };
}

// СЦЕНАРИЙ 2: Fail-Fast через Promise.all — одна ошибка роняет всё
export async function loadDashboardFailFast() {
  try {
    await Promise.all([
      mockFetchUser("u1"),
      mockFetchUser("u2_failed", { shouldFail: true }),
      mockFetchUser("u3"),
    ]);
  } catch (error) {
    console.log("Promise.all упал целиком (Fail-Fast):", error.message);
    return error;
  }
}

// Запускаем демонстрацию только при прямом запуске: node main.js
import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log("Пароль 'abc':", isPasswordSecure("abc"));
  console.log("Пароль 'supersecret':", isPasswordSecure("supersecret"));
  console.log("Возраст 17:", isAgeValid(17));
  console.log("Возраст 30:", isAgeValid(30));

  console.log("\n--- Promise.allSettled ---");
  await loadDashboardWidgets();

  console.log("\n--- Promise.all (Fail-Fast) ---");
  await loadDashboardFailFast();
}
