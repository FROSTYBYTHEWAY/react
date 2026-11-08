# Домашка 07.11 — Lead Architecture Review (15 кейсов)

Код решений лежит в `fixes.js`, проверки — в `check.js` (`npm run check`).
Кейсы 8 и 13 завязаны на React, поэтому JSX-версии приведены здесь.

---

## Блок 1. Производительность рендеринга и браузерный конвейер

### Кейс 01. Layout Thrashing (принудительный reflow)

**Физика.** Чтобы показать страницу, браузер проходит конвейер: **Style → Layout → Paint → Composite**.
Layout — самая дорогая стадия: расчёт размеров и позиций всех элементов. Браузер старается делать её
**один раз за кадр**, откладывая пересчёт.

Но запись стиля (`style.height = …`) делает геометрию «грязной». Если сразу после этого прочитать
геометрию (`getBoundingClientRect`, `offsetHeight`…), браузер обязан дать **актуальное** значение и
пересчитывает layout **немедленно и синхронно** (forced reflow). Цикл `читать → писать → читать → писать`
превращается в 200 полных пересчётов вместо одного — это и есть layout thrashing (9 fps вместо 60).

**Решение — разделить фазы (Read-Write Batching):**

```javascript
function alignCardHeights(cardsContainer) {
  const cards = [...cardsContainer.querySelectorAll(".product-card")];

  // 1. Только чтение: один расчёт layout на все карточки
  const heights = cards.map((card) => card.getBoundingClientRect().height);

  // 2. Только запись: браузер пересчитает layout один раз после цикла
  cards.forEach((card, i) => {
    if (heights[i] < 300) card.style.height = "300px";
  });
}
```

Лучше всего эту задачу вообще решает CSS (`min-height: 300px` или CSS Grid с `align-items: stretch`), без JS.

### Кейс 02. Long Tasks при обработке 100k элементов

**Причина.** JavaScript в браузере выполняется в **одном главном потоке**. Event Loop берёт задачу из очереди и
выполняет её **до конца**: прервать её нельзя. Клики и ввод — тоже задачи в очереди, и они ждут, пока закончится текущая.
Задача длиннее **50 мс** считается Long Task; при 1,5 с вычислений страница «замирает», а INP уходит в красную зону.

**Решение 1 — нарезать работу на чанки и уступать поток** (`scheduler.yield()` или `setTimeout(0)` как запасной вариант):

```javascript
const yieldToMain = () =>
  globalThis.scheduler?.yield ? scheduler.yield() : new Promise((r) => setTimeout(r, 0));

async function processAnalytics(rawTransactions, filterCriteria, chunkSize = 5000) {
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
    if (end < rawTransactions.length) await yieldToMain(); // браузер обработает ввод и отрисует кадр
  }
  return totals;
}
```

Заодно цепочка `filter → map → reduce` заменена одним проходом: не создаётся два промежуточных массива по 100k объектов.

**Решение 2 — вынести расчёт в Web Worker** (отдельный поток, главный не блокируется):

```javascript
// analytics.worker.js
self.onmessage = ({ data: { rawTransactions, filterCriteria } }) => {
  let totalRevenue = 0, totalTax = 0;
  for (const t of rawTransactions) {
    if (t.amount > filterCriteria.min && t.status === "completed") {
      totalRevenue += t.amount;
      totalTax += t.amount * 0.2;
    }
  }
  self.postMessage({ totalRevenue, totalTax });
};

// main thread
const worker = new Worker(new URL("./analytics.worker.js", import.meta.url), { type: "module" });
const result = await new Promise((resolve) => {
  worker.onmessage = (e) => resolve(e.data);
  worker.postMessage({ rawTransactions, filterCriteria });
});
```

Нюанс: `postMessage` копирует данные (structured clone), поэтому для огромных массивов выгоднее загружать
данные прямо в воркере или передавать `ArrayBuffer` через transferable.

### Кейс 03. «DDoS» бэкенда через `Promise.all`

**Причина.** `files.map(upload)` запускает **все 150** запросов сразу. Браузер держит ограниченное число соединений
к одному хосту (в HTTP/1.1 — 6), остальные стоят в очереди (*Stalled*), а сервер получает лавину и отвечает `429`/`502`.
Плюс `Promise.all` — Fail-Fast: одна ошибка прерывает ожидание, а остальные запросы продолжают работать «в фоне».

**Решение — пул воркеров (Concurrency Pool).** Запускаем K воркеров, каждый берёт следующую задачу из общей очереди,
как только закончил предыдущую. Полный эталонный код — `asyncPool` в `fixes.js`:

```javascript
async function asyncPool(taskFactories, limit = 4) {
  const results = new Array(taskFactories.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < taskFactories.length) {
      const taskIndex = currentIndex++;
      try {
        results[taskIndex] = { status: "fulfilled", value: await taskFactories[taskIndex]() };
      } catch (error) {
        results[taskIndex] = { status: "rejected", reason: error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, taskFactories.length) }, worker));
  return results;
}
```

Задачи передаются как **функции** (`() => fetch(...)`), а не готовые промисы: промис стартует сразу при создании,
а нам нужно запускать задачу позже. Результаты записываются по индексу, поэтому порядок сохраняется.
`currentIndex++` безопасен: JavaScript однопоточный, между чтением и инкрементом никто не вклинится.

---

## Блок 2. Утечки памяти и сборщик мусора V8

### Кейс 04. Глобальный `Map` с DOM-узлами в ключах

**Как работает Mark-and-Sweep.** Сборщик мусора V8 начинает с **корней** (глобальный объект, стек вызовов,
активные замыкания) и **помечает** всё, до чего можно добраться по ссылкам. Всё непомеченное **удаляется**.
Объект собирается, только когда он недостижим из корней.

**Причина утечки.** `nodeMetadataCache` — глобальная переменная, то есть корень. Обычный `Map` хранит **сильные** ссылки
на ключи: DOM-узел достижим через `Map`, поэтому после удаления из документа он остаётся в памяти как *Detached HTMLElement*
вместе со всем своим поддеревом.

**Решение — `WeakMap`.** Ключи в нём держатся **слабо** (ключ обязан быть объектом): когда других ссылок на узел не осталось,
сборщик удаляет и узел, и связанную с ним запись.

```javascript
const nodeMetadataCache = new WeakMap(); // вместо new Map()

function attachComponentMetadata(domNode, metadata) {
  nodeMetadataCache.set(domNode, { ...metadata, attachedAt: Date.now() });
}
```

Цена: `WeakMap` нельзя перебрать и у него нет `size`, зато именно поэтому он не мешает сборке мусора.
В `check.js` это проверено на практике: через `WeakRef` и принудительный `gc()` видно, что объект из `Map` остаётся,
а из `WeakMap` исчезает.

### Кейс 05. Забытый `AbortSignal` и висящий сокет

**Причина.** `isAlive = false` только останавливает **цикл**, но не отменяет уже отправленный запрос: `fetch` продолжает ждать ответ,
а его промис и колбэк `onStatusUpdate` (вместе со всем, что тот захватил) удерживаются в памяти до таймаута.

**Решение.** Передаём в `fetch` сигнал отмены; `unsubscribe()` вызывает `abort()`, и браузер сразу закрывает соединение.
Паузу между опросами тоже делаем прерываемой.

```javascript
function pollServerStatus(onStatusUpdate) {
  const controller = new AbortController();
  const { signal } = controller;

  const sleep = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });

  async function loop() {
    while (!signal.aborted) {
      try {
        const res = await fetch("/api/health", { signal });
        const data = await res.json();
        if (!signal.aborted) onStatusUpdate(data);
      } catch (err) {
        if (err.name === "AbortError") return; // штатный выход
        console.error("Poll error", err);
      }
      await sleep(5000);
    }
  }

  loop();
  return function unsubscribe() {
    controller.abort();
  };
}
```

### Кейс 06. Утечка через замыкание на тяжёлом контексте

**Как V8 хранит замыкания.** Переменные внешней функции, на которые ссылается хотя бы одна вложенная функция, V8 кладёт
в объект **`Context`**. Все замыкания, созданные в одной области видимости, **делят один Context**.

**Честная оговорка.** В том виде, как написан код в задании, `handleIconClick` использует только `iconId`, поэтому современный V8
`hugeDataPayload` в Context обычно не кладёт. Реальная утечка появляется, когда в той же функции есть **ещё одно замыкание**,
использующее `hugeDataPayload` (Context общий и держит всё), либо `eval`/`with`, либо отладчик. Поэтому правило надёжное и простое:
**долгоживущий обработчик нужно создавать в области, где тяжёлого объекта просто нет.**

```javascript
function createIconHandler(iconId) {
  // в этой области видимости hugeDataPayload не существует
  return function handleIconClick() {
    console.log("Clicked icon:", iconId);
  };
}

function setupIconClickHandler(hugeDataPayload) {
  const iconId = hugeDataPayload.meta.iconId; // берём только нужное примитивное значение
  return createIconHandler(iconId);
  // после выхода из функции hugeDataPayload доступен сборщику (если его не держит вызывающий код)
}
```

### Кейс 07. «Зомби»-слушатель шины событий

**Причина.** `bind` **каждый раз возвращает новую функцию**, поэтому `this.fn.bind(this) !== this.fn.bind(this)`.
`.off()` ищет обработчик по ссылке, а мы передаём другую функцию: ничего не находится, ничего не удаляется.
Каждый `new CartComponent()` оставляет в шине живого слушателя, а он держит `this` — весь старый компонент.

**Два правильных паттерна:**

```javascript
// Паттерн 1: bind один раз и хранить ссылку
class CartComponent {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.items = [];
    this.handleItemAdded = this.handleItemAdded.bind(this); // единая ссылка
    this.eventBus.on("ITEM_ADDED", this.handleItemAdded);
  }
  handleItemAdded(item) { this.items.push(item); }
  destroy() { this.eventBus.off("ITEM_ADDED", this.handleItemAdded); }
}

// Паттерн 2: стрелка-поле класса + функция отписки, которую возвращает on()
class CartComponent2 {
  items = [];
  handleItemAdded = (item) => { this.items.push(item); };
  constructor(eventBus) {
    this.unsubscribe = eventBus.on("ITEM_ADDED", this.handleItemAdded);
  }
  destroy() { this.unsubscribe(); }
}
```

Для DOM-событий есть ещё третий способ: `addEventListener("click", handler, { signal })`, и один `controller.abort()` снимает все подписки сразу.

---

## Блок 3. Логические асинхронные аварии и стейт

### Кейс 08. Устаревшее замыкание (Stale Closure)

**Причина.** Каждый рендер компонента — это новый вызов функции со **своим** набором констант. Эффект с `[]` выполняется
один раз, при первом рендере, и колбэк интервала навсегда «запоминает» `secondsLeft` из того рендера (там `60`).
Каждый тик делает `setSecondsLeft(60 - 1)`, то есть 59, поэтому счётчик залипает. Исходная обычная функция
`startOrderCountdown` работает правильно, потому что замыкается на **изменяемую** переменную `let`.

**Решение 1 — функциональный сеттер** (React сам подставит актуальное значение):

```jsx
useEffect(() => {
  const id = setInterval(() => {
    setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
  }, 1000);
  return () => clearInterval(id);
}, []);
```

**Решение 2 — `useRef`** (ref — один и тот же изменяемый объект на все рендеры):

```jsx
const [secondsLeft, setSecondsLeft] = useState(60);
const secondsRef = useRef(secondsLeft);
secondsRef.current = secondsLeft; // всегда хранит актуальное значение

useEffect(() => {
  const id = setInterval(() => {
    setSecondsLeft(secondsRef.current - 1); // читаем из ref, а не из «замороженного» замыкания
  }, 1000);
  return () => clearInterval(id);
}, []);
```

(Третий вариант: указать `secondsLeft` в зависимостях и пересоздавать интервал, но функциональный сеттер проще и надёжнее.)

### Кейс 09. Silent Failure

**Причина.** `catch` пишет в консоль и «проглатывает» ошибку: функция неявно возвращает `undefined`.
Вызывающий код не может отличить «ошибка» от «ничего не вернулось», а ветка `else` пустая.

**Решение — Result Tuple Pattern** `[error, data]`: вызывающий код вынужден разобрать оба случая.

```javascript
async function safe(promise) {
  try {
    return [null, await promise];
  } catch (error) {
    return [error, null];
  }
}

async function processOrderPayment(paymentData) {
  const [tokenError, token] = await safe(generatePaymentToken(paymentData));
  if (tokenError) return [tokenError, null];

  const [chargeError, result] = await safe(chargeCard(token));
  if (chargeError) return [chargeError, null];

  return [null, result];
}

async function onCheckoutClick() {
  const [error, result] = await processOrderPayment(data);
  if (error) {
    showError(`Оплата не прошла: ${error.message}`); // пользователь видит причину
    return;
  }
  showSuccessModal(result);
}
```

### Кейс 10. Гонка при общем состоянии

**Причина.** Если `fetch` выбросит ошибку, строка `isFetching = false` не выполнится: флаг останется `true` навсегда,
и все остальные вызовы зависнут в `while (isFetching)` (бесконечный опрос каждые 50 мс). К тому же опрос
добавляет задержку до 50 мс и держит таймеры.

**Решение — кэшируем сам `Promise` (In-Flight Request Deduplication).** Первый вызов создаёт промис, все
остальные получают **тот же промис** и просто ждут его, без флагов и опроса.

```javascript
let userPromise = null;

function getAuthenticatedUser() {
  if (!userPromise) {
    userPromise = fetch("/api/me")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((error) => {
        userPromise = null; // при сбое сбрасываем, чтобы можно было повторить
        throw error;
      });
  }
  return userPromise;
}
```

Пять компонентов вызывают функцию одновременно, а в сеть уходит **один** запрос (проверено в `check.js`).

### Кейс 11. Неконтролируемая рекурсия повторов

**Причина.** `catch` сразу вызывает функцию снова: без паузы, без лимита и без остановки. Ошибка «Stack Overflow» здесь не наступит:
каждый `await` отдаёт управление, и стек не растёт. Но запросы летят потоком, пока не появится сеть,
поэтому и 100% CPU, и разряженный аккумулятор.

**Решение — Exponential Backoff + Jitter + лимит попыток:**

- **экспонента:** пауза растёт вдвое после каждой неудачи (`base · 2^attempt`) с потолком `maxDelay`;
- **jitter (случайность):** реальная пауза берётся случайно из `[0, экспонента]`, чтобы тысячи клиентов не ломились на восстановившийся сервер одновременно;
- **`maxRetries`:** после лимита ошибка пробрасывается дальше;
- **не повторяем 4xx** (кроме `429`): запрос неправильный, и ещё десять попыток не помогут; отмену (`AbortError`) тоже не повторяем.

```javascript
const backoffDelay = (attempt, base, max, random = Math.random) =>
  random() * Math.min(max, base * 2 ** attempt);

async function fetchWithRetry(url, { maxRetries = 5, baseDelayMs = 500, maxDelayMs = 30000, signal } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new HttpError(response.status);
      return await response.json();
    } catch (error) {
      if (error.name === "AbortError") throw error;
      if (!isRetryable(error) || attempt >= maxRetries) throw error;
      await new Promise((r) => setTimeout(r, backoffDelay(attempt, baseDelayMs, maxDelayMs)));
    }
  }
}
```

Полная версия (с классом `HttpError` и подменяемыми `sleep`/`random` для тестов) — в `fixes.js`.

---

## Блок 4. Иммутабельность, нормализация и структуры

### Кейс 12. `JSON.parse(JSON.stringify())` как «глубокий клон»

**Ограничения JSON-сериализации:**

| Что в объекте | Что получается после JSON-клона |
|---|---|
| `Date` | строка |
| `RegExp`, `Map`, `Set` | пустой объект `{}` |
| функция, `Symbol`, `undefined` | **теряются** (в массивах заменяются на `null`) |
| `BigInt` | `TypeError: Do not know how to serialize a BigInt` |
| `NaN`, `Infinity` | `null` |
| циклические ссылки | `TypeError` |

Плюс все объекты становятся **новыми**: теряется ссылочная целостность, а значит, `React.memo` и селекторы
видят «изменение» везде.

**Когда `structuredClone()`:** разовое глубокое копирование **чистых данных**: он сохраняет `Date`, `RegExp`, `Map`, `Set`,
`BigInt`, `undefined`, циклические ссылки. Но функции он не копирует (`DataCloneError`), у экземпляров классов теряется прототип.

**Когда структурный Spread в редьюсерах:** для обновления стейта в приложении. Копируются только объекты **на пути
к изменяемому полю** (O(глубина)), все остальные ветки сохраняют ссылки, а значит, мемоизация работает.
Клонировать весь стейт целиком для этого не нужно.

### Кейс 13. Каскадный ререндер из-за новых литералов

**Как работает `React.memo`.** Перед ререндером React сравнивает старые и новые пропсы функцией **`shallowEqual`**:
для каждого ключа проверяется `Object.is(prev[key], next[key])`. Вложенность не анализируется, сравниваются **ссылки**.

**Причина.** Выражения `{ padding: "8px" }`, `{ canSelect: true }` и `() => …` **создают новый объект/функцию при каждом рендере** `Table`.
Новая ссылка ≠ старая, `shallowEqual` возвращает `false` для всех 500 строк, и `React.memo` бесполезен.

**Решение:** статичные объекты выносим за компонент, обработчик делаем стабильным через `useCallback`, `id` передаём при вызове.

```jsx
const ROW_STYLE = { padding: "8px", borderBottom: "1px solid #eee" };
const ROW_OPTIONS = { canSelect: true, canEdit: false };

const TableRow = React.memo(function TableRow({ data, style, options, onDelete }) {
  return (
    <div style={style}>
      {data.name}
      {options.canEdit && <button>✎</button>}
      <button onClick={() => onDelete(data.id)}>×</button>
    </div>
  );
});

function Table({ rows, onDeleteRow }) {
  const handleDelete = useCallback((id) => onDeleteRow(id), [onDeleteRow]);

  return (
    <div>
      {rows.map((row) => (
        <TableRow key={row.id} data={row} style={ROW_STYLE} options={ROW_OPTIONS} onDelete={handleDelete} />
      ))}
    </div>
  );
}
```

Условие: строки в стейте должны обновляться **иммутабельно** (изменилась одна, остальные сохранили ссылки), тогда перерисуется только одна строка.
Если `options` зависят от пропсов, их оборачивают в `useMemo`.

### Кейс 14. Дубликаты при пагинации

**Причина.** Пагинация со сдвигом (`offset`) на меняющихся данных может прислать элемент, который уже был на предыдущей странице.
Простой Spread `[...old, ...new]` ничего не проверяет, и в списке оказываются два элемента с одним `id` (и предупреждение про `key`).

**Решение.** Множество `Set` из уже имеющихся `id` даёт проверку за O(1), весь проход — O(N):

```javascript
function appendUniqueById(posts, newPosts) {
  const seen = new Set(posts.map((p) => p.id));
  const fresh = newPosts.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id); // дубликаты и внутри самой новой страницы отсекаются
    return true;
  });
  return fresh.length > 0 ? [...posts, ...fresh] : posts; // нет новых — прежняя ссылка, лишнего рендера не будет
}

const appendNextPage = (feedState, newPostsFromApi) => ({
  ...feedState,
  posts: appendUniqueById(feedState.posts, newPostsFromApi),
});
```

### Кейс 15. `null` из БД и значения по умолчанию

**Спецификация ECMAScript.** Значение по умолчанию в деструктуризации (`{ color = "blue" }`) подставляется **только если значение
равно `undefined`** (свойства нет или оно явно `undefined`). `null`, `0`, `""`, `false` и `NaN` считаются полноценными значениями
и **не** заменяются. В SQL пустое поле приходит как `null`, поэтому дефолты не срабатывают.

**Решение — нормализация через `??`:** оператор подставляет запасное значение и для `null`, и для `undefined`, но не трогает `""` и `0`.

```javascript
const normalizeBadgeConfig = ({ color, text, icon } = {}) => ({
  color: color ?? "blue",
  text: text ?? "Новинка",
  icon: icon ?? "star",
});

function renderBadgeConfig(config) {
  const { color, text, icon } = normalizeBadgeConfig(config);
  return `<span class="badge ${color}">${icon} ${text}</span>`;
}
```
