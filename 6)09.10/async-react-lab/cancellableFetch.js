// Этап 5: Асинхронный клиент с отменой запроса через AbortController
// Предотвращает утечки памяти и состояние гонки (Race Condition).
import { delay } from "./api.js"; // (оставлен по методичке)

// Асинхронная операция с поддержкой отмены по AbortSignal:
export async function fetchDataWithCancel(url, { signal } = {}) {
  // Проверяем, не был ли сигнал уже отменён до старта:
  if (signal?.aborted) {
    throw new DOMException("Операция отменена до старта", "AbortError");
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve({ data: `Ответ для ${url}`, timestamp: Date.now() });
    }, 1500);

    // Подписываемся на событие отмены:
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Запрос отменен пользователем", "AbortError"));
      },
      { once: true }
    );
  });
}
