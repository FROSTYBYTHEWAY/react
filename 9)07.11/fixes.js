// Решения кейсов «Lead Architecture Review» (07.11).
// Кейсы 8 и 13 (React-хуки и React.memo) разобраны в solutions.md с JSX-кодом;
// здесь — их «чистая» часть, проверяемая в Node.

// ============ Блок 1. Производительность ============

// ---------- Кейс 01: Layout Thrashing -> разделяем чтение и запись ----------
export function alignCardHeights(cardsContainer, minHeight = 300) {
  const cards = [...cardsContainer.querySelectorAll(".product-card")];

  // ФАЗА 1 — ТОЛЬКО ЧТЕНИЕ: один расчёт геометрии на все карточки
  const heights = cards.map((card) => card.getBoundingClientRect().height);

  // ФАЗА 2 — ТОЛЬКО ЗАПИСЬ: браузер пересчитает layout один раз, после цикла
  cards.forEach((card, i) => {
    if (heights[i] < minHeight) card.style.height = `${minHeight}px`;
  });
}

// ---------- Кейс 02: Long Task -> нарезаем работу на куски ----------
// Исходная версия (для сравнения результатов)
export function processAnalyticsSync(rawTransactions, filterCriteria) {
  return rawTransactions
    .filter((t) => t.amount > filterCriteria.min && t.status === "completed")
    .map((t) => ({ ...t, tax: t.amount * 0.2 }))
    .reduce(
      (acc, t) => {
        acc.totalRevenue += t.amount;
        acc.totalTax += t.tax;
        return acc;
      },
      { totalRevenue: 0, totalTax: 0 }
    );
}

// Отдаём управление главному потоку: браузер успевает обработать клики и отрисовать кадр
export const yieldToMain = () =>
  globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0));

// Один проход по данным (без промежуточных массивов на 100k объектов) + пауза после каждого чанка
export async function processAnalyticsChunked(
  rawTransactions,
  filterCriteria,
  { chunkSize = 5000, yieldFn = yieldToMain } = {}
) {
  const totals = { totalRevenue: 0, totalTax: 0 };

  for (let start = 0; start < rawTransactions.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, rawTransactions.length);

    for (let i = start; i < end; i++) {
      const t = rawTransactions[i];
      if (t.amount > filterCriteria.min && t.status === "completed") {
        totals.totalRevenue += t.amount;
        totals.totalTax += t.amount * 0.2;
      }
    }

    if (end < rawTransactions.length) await yieldFn(); // уступаем очередь событий
  }

  return totals;
}

// ---------- Кейс 03: Concurrency Pool (эталон из разбора) ----------
/**
 * Concurrency Runner: запуск массива асинхронных задач с лимитом параллелизма
 * @param {Array<() => Promise<any>>} taskFactories - массив функций, возвращающих промисы
 * @param {number} limit - максимальное число одновременно выполняемых задач
 * @returns {Promise<Array<any>>} - результаты в исходном порядке
 */
export async function asyncPool(taskFactories, limit = 4) {
  if (!Array.isArray(taskFactories)) {
    throw new TypeError("taskFactories must be an array of functions");
  }

  // Результаты складываем по индексу — порядок сохраняется
  const results = new Array(taskFactories.length);

  // Указатель на следующую задачу в очереди
  let currentIndex = 0;

  // Воркер крутится в цикле, пока в очереди есть задачи
  async function worker() {
    while (currentIndex < taskFactories.length) {
      const taskIndex = currentIndex++; // забираем индекс и сдвигаем указатель
      const taskFn = taskFactories[taskIndex];

      try {
        const result = await taskFn();
        results[taskIndex] = { status: "fulfilled", value: result };
      } catch (error) {
        results[taskIndex] = { status: "rejected", reason: error };
      }
    }
  }

  // Запускаем K независимых воркеров
  const workerCount = Math.min(limit, taskFactories.length);
  const workers = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers); // ждём, пока все воркеры исчерпают очередь
  return results;
}

// Применение к исходной задаче: загрузка 150 файлов по 4 штуки одновременно
export function uploadAllFiles(fileList, { limit = 4, fetchFn = globalThis.fetch } = {}) {
  const tasks = fileList.map((file) => () => {
    const formData = new FormData();
    formData.append("file", file);
    return fetchFn("/api/upload", { method: "POST", body: formData });
  });
  return asyncPool(tasks, limit);
}

// ============ Блок 2. Утечки памяти ============

// ---------- Кейс 04: WeakMap вместо Map ----------
// Ключ-объект в WeakMap удерживается «слабо»: когда на DOM-узел больше никто не
// ссылается, он (и его метаданные) исчезает из кэша и собирается GC.
export const nodeMetadataCache = new WeakMap();

export function attachComponentMetadata(domNode, metadata) {
  nodeMetadataCache.set(domNode, { ...metadata, attachedAt: Date.now() });
}

// ---------- Кейс 05: polling с AbortController ----------
export function pollServerStatus(
  onStatusUpdate,
  { fetchFn = globalThis.fetch, url = "/api/health", intervalMs = 5000 } = {}
) {
  const controller = new AbortController();
  const { signal } = controller;

  // Пауза, которую тоже можно прервать (иначе таймер на 5 с продолжал бы жить)
  const sleep = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });

  async function loop() {
    while (!signal.aborted) {
      try {
        const res = await fetchFn(url, { signal }); // signal обрывает сокет на уровне браузера
        const data = await res.json();
        if (!signal.aborted) onStatusUpdate(data);
      } catch (err) {
        if (err.name === "AbortError") return; // штатный выход после unsubscribe()
        console.error("Poll error", err);
      }
      await sleep(intervalMs);
    }
  }

  loop();

  // unsubscribe мгновенно обрывает висящий запрос и останавливает цикл
  return function unsubscribe() {
    controller.abort();
  };
}

// ---------- Кейс 06: тяжёлый объект не должен жить в замыкании ----------
// Обработчик создаётся в ОТДЕЛЬНОЙ функции, где hugeDataPayload просто не существует.
function createIconHandler(iconId) {
  return function handleIconClick() {
    console.log("Clicked icon:", iconId);
    return iconId;
  };
}

export function setupIconClickHandler(hugeDataPayload) {
  const iconId = hugeDataPayload.meta.iconId; // вытаскиваем нужное примитивное значение
  return createIconHandler(iconId); // payload после выхода из функции никому не нужен
}

// ---------- Кейс 07: Event Bus и корректная отписка ----------
export class EventBus {
  #handlers = new Map();

  on(eventName, handler) {
    if (!this.#handlers.has(eventName)) this.#handlers.set(eventName, new Set());
    this.#handlers.get(eventName).add(handler);
    return () => this.off(eventName, handler); // «ручка» для отписки
  }

  off(eventName, handler) {
    this.#handlers.get(eventName)?.delete(handler);
  }

  emit(eventName, ...args) {
    this.#handlers.get(eventName)?.forEach((handler) => handler(...args));
  }

  listenerCount(eventName) {
    return this.#handlers.get(eventName)?.size ?? 0;
  }
}

// Паттерн 1: bind ОДИН раз в конструкторе и храним ссылку
export class CartComponentBound {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.items = [];
    this.handleItemAdded = this.handleItemAdded.bind(this); // та же ссылка для on и off
    this.eventBus.on("ITEM_ADDED", this.handleItemAdded);
  }

  handleItemAdded(item) {
    this.items.push(item);
  }

  destroy() {
    this.eventBus.off("ITEM_ADDED", this.handleItemAdded);
  }
}

// Паттерн 2: стрелка-поле класса + функция отписки, которую вернул on()
export class CartComponentUnsub {
  items = [];
  handleItemAdded = (item) => {
    this.items.push(item); // this привязан лексически
  };

  constructor(eventBus) {
    this.unsubscribe = eventBus.on("ITEM_ADDED", this.handleItemAdded);
  }

  destroy() {
    this.unsubscribe();
  }
}

// ============ Блок 3. Асинхронные аварии и стейт ============

// ---------- Кейс 08 (чистая часть): таймер без устаревшего замыкания ----------
// В React: setSecondsLeft(prev => prev - 1)  или  useRef — см. solutions.md.
// Здесь: тот же принцип — не читаем «зафиксированное» значение, а берём актуальное.
export function createCountdown(seconds, onTick, { setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  let secondsLeft = seconds;
  const id = setIntervalFn(() => {
    if (secondsLeft <= 0) return clearIntervalFn(id);
    secondsLeft -= 1;
    onTick(secondsLeft);
  }, 1000);
  return () => clearIntervalFn(id);
}

// ---------- Кейс 09: Result Tuple Pattern [error, data] ----------
export async function safe(promise) {
  try {
    return [null, await promise];
  } catch (error) {
    return [error, null];
  }
}

export async function processOrderPayment(paymentData, { generatePaymentToken, chargeCard }) {
  const [tokenError, token] = await safe(generatePaymentToken(paymentData));
  if (tokenError) return [tokenError, null];

  const [chargeError, result] = await safe(chargeCard(token));
  if (chargeError) return [chargeError, null];

  return [null, result];
}

export async function onCheckoutClick(data, { showSuccessModal, showError, ...api }) {
  const [error, result] = await processOrderPayment(data, api);
  if (error) {
    showError(`Оплата не прошла: ${error.message}`); // пользователь ВСЕГДА видит причину
    return;
  }
  showSuccessModal(result);
}

// ---------- Кейс 10: Promise Memoization (In-Flight Deduplication) ----------
export function createUserLoader(fetchFn = globalThis.fetch) {
  let userPromise = null; // кэшируем сам Promise, а не данные

  function getAuthenticatedUser() {
    if (!userPromise) {
      userPromise = fetchFn("/api/me")
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .catch((error) => {
          userPromise = null; // при сбое сбрасываем кэш, чтобы можно было повторить
          throw error;
        });
    }
    return userPromise; // все 5 компонентов получают ОДИН И ТОТ ЖЕ промис
  }

  getAuthenticatedUser.reset = () => {
    userPromise = null;
  };
  return getAuthenticatedUser;
}

// ---------- Кейс 11: Exponential Backoff + Jitter ----------
export class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
  }
}

// «Полный джиттер»: случайная задержка от 0 до min(cap, base * 2^attempt)
export const backoffDelay = (attempt, baseDelayMs, maxDelayMs, random = Math.random) =>
  random() * Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);

const isRetryable = (error) =>
  !(error.status >= 400 && error.status < 500 && error.status !== 429); // 4xx (кроме 429) повторять бессмысленно

export async function fetchWithRetry(
  url,
  {
    maxRetries = 5,
    baseDelayMs = 500,
    maxDelayMs = 30000,
    signal,
    fetchFn = globalThis.fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    random = Math.random,
  } = {}
) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetchFn(url, { signal });
      if (!response.ok) throw new HttpError(response.status);
      return await response.json();
    } catch (error) {
      if (error.name === "AbortError") throw error; // пользователь отменил — не повторяем
      if (!isRetryable(error) || attempt >= maxRetries) throw error;
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs, random));
    }
  }
}

// ============ Блок 4. Иммутабельность и структуры ============

// ---------- Кейс 13 (чистая часть): shallowEqual и стабильные ссылки ----------
export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is(a[k], b[k]));
}

// Плохо: каждый «рендер» создаёт новые литералы -> новые ссылки
export const rowPropsBad = (row) => ({
  data: row,
  style: { padding: "8px", borderBottom: "1px solid #eee" },
  options: { canSelect: true, canEdit: false },
  onDelete: () => console.log("Delete", row.id),
});

// Хорошо: константы вынесены за пределы компонента, обработчик общий и стабильный
const ROW_STYLE = Object.freeze({ padding: "8px", borderBottom: "1px solid #eee" });
const ROW_OPTIONS = Object.freeze({ canSelect: true, canEdit: false });
export const rowPropsGood = (row, onDelete) => ({
  data: row,
  style: ROW_STYLE,
  options: ROW_OPTIONS,
  onDelete, // один и тот же колбэк (useCallback) для всех строк; id передаётся при вызове
});

// ---------- Кейс 14: слияние страниц с дедупликацией за O(N) ----------
export function appendUniqueById(posts, newPosts) {
  const seen = new Set(posts.map((p) => p.id)); // O(N)
  const fresh = newPosts.filter((p) => {
    if (seen.has(p.id)) return false; // уже есть — пропускаем дубликат
    seen.add(p.id);
    return true;
  });
  return fresh.length > 0 ? [...posts, ...fresh] : posts; // нет новых — сохраняем ссылку (без лишнего рендера)
}

export const appendNextPage = (feedState, newPostsFromApi) => ({
  ...feedState,
  posts: appendUniqueById(feedState.posts, newPostsFromApi),
});

// ---------- Кейс 15: null из БД и значения по умолчанию ----------
// Дефолт при деструктуризации срабатывает ТОЛЬКО для undefined, но не для null.
// Оператор ?? подставляет запасное значение и для null, и для undefined.
export const normalizeBadgeConfig = ({ color, text, icon } = {}) => ({
  color: color ?? "blue",
  text: text ?? "Новинка",
  icon: icon ?? "star",
});

export function renderBadgeConfig(config) {
  const { color, text, icon } = normalizeBadgeConfig(config);
  return `<span class="badge ${color}">${icon} ${text}</span>`;
}
