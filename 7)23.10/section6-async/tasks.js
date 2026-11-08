// ============================================================
// Раздел 6: Функции, модули, Promise и async/await (26–30)
// ============================================================

// ---------- Задача 26: Промисификация задержки ----------
export const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// ---------- Задача 27: Отказоустойчивый дашборд (Promise.allSettled) ----------
// Три «сетевых запроса» (моки). Баннер намеренно падает, как рекламный сервис.
export const fetchProfile = async () => {
  await wait(100);
  return { widget: "profile", name: "Иван" };
};
export const fetchBalance = async () => {
  await wait(100);
  return { widget: "balance", amount: 1500 };
};
export const fetchPromoBanner = async () => {
  await wait(10);
  throw new Error("500: рекламный сервис недоступен");
};

// Все запросы стартуют ПАРАЛЛЕЛЬНО; падение одного не ломает остальные.
export async function loadDashboard(requests = [fetchProfile, fetchBalance, fetchPromoBanner]) {
  const results = await Promise.allSettled(requests.map((request) => request()));

  const successData = [];
  const errors = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successData.push(result.value);
    } else {
      errors.push({ request: requests[index].name || `#${index}`, message: result.reason.message });
    }
  });

  return { successData, errors };
}

// ---------- Задача 28: fetch с таймаутом (AbortController) ----------
// Если сервер не ответил за timeoutMs — прерываем запрос и бросаем AbortError.
// fetchFn можно подменить (для тестов), по умолчанию используется настоящий fetch.
export async function fetchWithTimeout(url, timeoutMs, { fetchFn = globalThis.fetch, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new DOMException(`Сервер не ответил за ${timeoutMs} мс`, "AbortError");
    }
    throw error; // другие ошибки (сеть и т.п.) пробрасываем как есть
  } finally {
    clearTimeout(timer); // таймер больше не нужен — не держим его в памяти
  }
}

// ---------- Задача 29: Автоматические повторы (Retry) ----------
// Первая попытка + до `retries` повторов с паузой delayMs между ними.
// Если все попытки неудачны — бросаем последнюю ошибку.
export async function retry(asyncFn, retries = 3, delayMs = 500) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await asyncFn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await wait(delayMs); // после последней попытки не ждём
    }
  }

  throw lastError;
}

// ---------- Задача 30: Последовательная асинхронная очередь ----------
// Задачи выполняются строго по одной (Concurrency = 1). enqueue возвращает
// Promise с результатом конкретной задачи; ошибка одной задачи не останавливает очередь.
export class AsyncQueue {
  #queue = [];
  #running = false;

  get size() {
    return this.#queue.length;
  }

  enqueue(taskFn) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ taskFn, resolve, reject });
      this.#drain();
    });
  }

  async #drain() {
    if (this.#running) return; // цикл уже идёт
    this.#running = true;

    while (this.#queue.length > 0) {
      const { taskFn, resolve, reject } = this.#queue.shift();
      try {
        resolve(await taskFn());
      } catch (error) {
        reject(error);
      }
    }

    this.#running = false;
  }
}
