// Запуск набора тестов асинхронных сценариев: node async-lab-verify.js
import assert from "node:assert/strict";
import mockFetchUserDefault, * as apiModule from "./api.js";
import { loadDashboardWidgets, loadDashboardFailFast } from "./main.js";
import { fetchDataWithCancel } from "./cancellableFetch.js";
import { isAgeValid, isPasswordSecure } from "./mathUtils.js";

// Заглушаем console.log внутри сценариев, чтобы вывод проверки был чистым
const realLog = console.log;
const quiet = async (fn) => {
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = realLog;
  }
};

// 1. ESM Module Loader: именованные и default экспорты
assert.equal(typeof apiModule.mockFetchUser, "function");
assert.equal(typeof apiModule.delay, "function");
assert.equal(mockFetchUserDefault, apiModule.mockFetchUser);
assert.equal(isPasswordSecure("12345678").valid, true);
assert.equal(isPasswordSecure("123").valid, false);
assert.equal(isAgeValid(17).valid, false);
assert.equal(isAgeValid(18).valid, true);
assert.equal(isAgeValid(65).valid, true);
assert.equal(isAgeValid(66).error, "Число должно быть в диапазоне от 18 до 65");
console.log("✓ ESM Module Loader: OK (Native Named & Default Exports)");

// 2. Promise.allSettled: 2 успеха + 1 ошибка, и Promise.all падает целиком
const { successfulUsers, failedErrors } = await quiet(loadDashboardWidgets);
assert.equal(successfulUsers.length, 2);
assert.equal(failedErrors.length, 1);
assert.equal(failedErrors[0].id, "u2_failed");
const failFastError = await quiet(loadDashboardFailFast);
assert.match(failFastError.message, /500 Server Error/);
console.log("✓ Promise Parallel Pipeline: OK (Promise.allSettled Matrix)");

// 3. AbortController: отмена во время запроса и до старта
const controller = new AbortController();
const pending = fetchDataWithCancel("/api/users", { signal: controller.signal });
setTimeout(() => controller.abort(), 100); // пользователь отменил запрос
await assert.rejects(pending, { name: "AbortError" });

const preAborted = new AbortController();
preAborted.abort();
await assert.rejects(fetchDataWithCancel("/x", { signal: preAborted.signal }), {
  name: "AbortError",
});

const ok = await fetchDataWithCancel("/api/ok"); // без сигнала — отвечает нормально
assert.equal(ok.data, "Ответ для /api/ok");
console.log("✓ AbortController Signal Dispatch: OK (Clean Abort on User Action)");
