// Проверка решений: node --expose-gc check.js   (или: npm run check)
// Флаг --expose-gc нужен только для проверки кейса 04 (сборщик мусора).
import assert from "node:assert/strict";
import * as fx from "./fixes.js";

let n = 0;
const ok = (name) => console.log(`✓ Кейс ${name}`) || n++;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 01: чтение и запись разделены ----------
{
  const log = [];
  const makeCard = (h) => {
    const style = {};
    return {
      getBoundingClientRect: () => (log.push("read"), { height: h }),
      style: new Proxy(style, { set: (t, k, v) => (log.push("write"), (t[k] = v), true) }),
    };
  };
  const cards = [makeCard(100), makeCard(350), makeCard(200)];
  fx.alignCardHeights({ querySelectorAll: () => cards });
  assert.deepEqual(log, ["read", "read", "read", "write", "write"]); // сначала ВСЕ чтения, потом записи
  assert.equal(cards[0].style.height, "300px");
  assert.equal(cards[1].style.height, undefined);
  ok("01 Read-Write Batching");
}

// ---------- 02: чанки дают тот же результат и отдают управление ----------
{
  const raw = Array.from({ length: 100_000 }, (_, i) => ({
    amount: i % 1000,
    status: i % 3 === 0 ? "pending" : "completed",
    timestamp: 1700000000000 + i,
  }));
  const criteria = { min: 100 };
  const expected = fx.processAnalyticsSync(raw, criteria);
  let yields = 0;
  const actual = await fx.processAnalyticsChunked(raw, criteria, {
    chunkSize: 10_000,
    yieldFn: async () => { yields++; },
  });
  assert.equal(actual.totalRevenue, expected.totalRevenue);
  assert.ok(Math.abs(actual.totalTax - expected.totalTax) < 1e-6);
  assert.equal(yields, 9); // 10 чанков -> 9 пауз между ними
  assert.deepEqual(await fx.processAnalyticsChunked(raw, criteria), actual); // с реальным yield тоже
  ok("02 Long Task разбит на чанки (результат совпадает)");
}

// ---------- 03: пул ограничивает параллелизм ----------
{
  let active = 0, peak = 0;
  const tasks = Array.from({ length: 12 }, (_, i) => async () => {
    active++; peak = Math.max(peak, active);
    await sleep(10 + (i % 3) * 5);
    active--;
    if (i === 5) throw new Error("fail 5");
    return `r${i}`;
  });
  const results = await fx.asyncPool(tasks, 3);
  assert.equal(peak, 3);
  assert.equal(results.length, 12);
  assert.equal(results[0].value, "r0");
  assert.equal(results[5].status, "rejected"); // одна ошибка не ломает остальные
  assert.equal(results[11].value, "r11"); // порядок результатов исходный

  let calls = 0, inFlight = 0, maxInFlight = 0;
  globalThis.FormData ??= class { append() {} };
  const fetchFn = async () => { calls++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await sleep(5); inFlight--; return {}; };
  await fx.uploadAllFiles(Array.from({ length: 20 }, () => ({})), { limit: 4, fetchFn });
  assert.equal(calls, 20);
  assert.equal(maxInFlight, 4);
  ok("03 Concurrency Pool: не больше K запросов одновременно");
}

// ---------- 04: WeakMap не удерживает ключ, Map удерживает ----------
{
  if (typeof globalThis.gc !== "function") {
    console.log("- Кейс 04 пропущен (запусти с флагом --expose-gc: npm run check)");
  } else {
    const wasCollected = async (cache) => {
      const ref = (() => {
        const node = { html: "x".repeat(1_000_000) }; // «DOM-узел»
        cache.set(node, { attachedAt: Date.now() });
        return new WeakRef(node);
      })(); // после выхода из функции локальных ссылок на node нет
      for (let i = 0; i < 5; i++) { await sleep(10); globalThis.gc(); }
      return ref.deref() === undefined;
    };
    assert.equal(await wasCollected(new Map()), false); // Map держит ключ -> утечка
    assert.equal(await wasCollected(new WeakMap()), true); // WeakMap позволяет GC убрать узел
    ok("04 Map удерживает узел (утечка), WeakMap — нет");
  }
}

// ---------- 05: unsubscribe обрывает висящий запрос ----------
{
  let aborted = false, updates = 0, calls = 0;
  const fetchFn = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      calls++;
      signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); });
    });
  const unsubscribe = fx.pollServerStatus(() => updates++, { fetchFn, intervalMs: 10 });
  await sleep(20);
  assert.equal(aborted, false);
  unsubscribe(); // пользователь ушёл со страницы, а запрос всё ещё pending
  assert.equal(aborted, true); // соединение оборвано мгновенно
  await sleep(30);
  assert.equal(calls, 1); // новых запросов цикл не делает
  assert.equal(updates, 0);

  // нормальная работа: данные доходят, пока подписка жива
  let got = [];
  const okFetch = async () => ({ json: async () => ({ up: true }) });
  const unsub2 = fx.pollServerStatus((d) => got.push(d), { fetchFn: okFetch, intervalMs: 10 });
  await sleep(35);
  unsub2();
  const count = got.length;
  assert.ok(count >= 2);
  await sleep(30);
  assert.equal(got.length, count); // после отписки обновлений больше нет
  ok("05 AbortController обрывает long polling");
}

// ---------- 06: обработчик работает и не принимает payload ----------
{
  const handler = fx.setupIconClickHandler({ meta: { iconId: "star" }, rows: new Array(10).fill(0) });
  const log = console.log; console.log = () => {};
  const id = handler();
  console.log = log;
  assert.equal(id, "star");
  ok("06 замыкание хранит только iconId");
}

// ---------- 07: исходный баг и два корректных паттерна ----------
{
  // Исходный код: bind создаёт новую функцию при каждом вызове
  class BuggyCart {
    constructor(bus) { this.bus = bus; this.items = []; this.bus.on("ITEM_ADDED", this.handleItemAdded.bind(this)); }
    handleItemAdded(item) { this.items.push(item); }
    destroy() { this.bus.off("ITEM_ADDED", this.handleItemAdded.bind(this)); }
  }
  const f = function () {};
  assert.notEqual(f.bind(null), f.bind(null)); // каждый bind — новая функция

  const bus1 = new fx.EventBus();
  for (let i = 0; i < 10; i++) new BuggyCart(bus1).destroy();
  assert.equal(bus1.listenerCount("ITEM_ADDED"), 10); // 10 «зомби»-слушателей остались

  for (const Cart of [fx.CartComponentBound, fx.CartComponentUnsub]) {
    const bus = new fx.EventBus();
    const carts = Array.from({ length: 10 }, () => new Cart(bus));
    carts.forEach((c) => c.destroy());
    assert.equal(bus.listenerCount("ITEM_ADDED"), 0);
    const live = new Cart(bus);
    bus.emit("ITEM_ADDED", { id: 1 });
    assert.deepEqual(live.items, [{ id: 1 }]);
    assert.deepEqual(carts[0].items, []); // уничтоженные компоненты не получают события
  }
  ok("07 bind-ссылка хранится/возвращается, зомби-слушателей нет");
}

// ---------- 08: счётчик читает актуальное значение ----------
{
  let tick, cleared = false;
  const ticks = [];
  const stop = fx.createCountdown(3, (s) => ticks.push(s), {
    setIntervalFn: (fn) => ((tick = fn), 1),
    clearIntervalFn: () => (cleared = true),
  });
  tick(); tick(); tick(); tick();
  assert.deepEqual(ticks, [2, 1, 0]);
  assert.equal(cleared, true);
  stop();
  ok("08 таймер не залипает на старом значении (React-версия — в solutions.md)");
}

// ---------- 09: Result Tuple ----------
{
  const log = [];
  const deps = {
    generatePaymentToken: async (d) => `tok_${d.card}`,
    chargeCard: async (t) => ({ charged: t }),
    showSuccessModal: (r) => log.push(["ok", r]),
    showError: (m) => log.push(["err", m]),
  };
  await fx.onCheckoutClick({ card: "4242" }, deps);
  assert.deepEqual(log[0], ["ok", { charged: "tok_4242" }]);

  deps.chargeCard = async () => { throw new Error("Банк отклонил операцию"); };
  await fx.onCheckoutClick({ card: "4242" }, deps);
  assert.deepEqual(log[1], ["err", "Оплата не прошла: Банк отклонил операцию"]); // ошибка видна пользователю

  const [err, data] = await fx.safe(Promise.reject(new Error("x")));
  assert.equal(err.message, "x");
  assert.equal(data, null);
  ok("09 [error, data]: ошибку нельзя «потерять»");
}

// ---------- 10: один запрос на всех ----------
{
  let fetches = 0;
  const fetchFn = async () => { fetches++; await sleep(20); return { ok: true, json: async () => ({ id: 1 }) }; };
  const getUser = fx.createUserLoader(fetchFn);
  const users = await Promise.all([getUser(), getUser(), getUser(), getUser(), getUser()]); // Header, Sidebar, Analytics, Chat, Cart
  assert.equal(fetches, 1);
  assert.ok(users.every((u) => u === users[0])); // один и тот же результат
  assert.equal(await getUser(), users[0]); // и позже — из кэша
  assert.equal(fetches, 1);

  // сбой не «замораживает» загрузчик навсегда
  let attempt = 0;
  const flaky = fx.createUserLoader(async () => (++attempt === 1 ? { ok: false, status: 500 } : { ok: true, json: async () => ({ id: 2 }) }));
  await assert.rejects(flaky(), /HTTP 500/);
  assert.deepEqual(await flaky(), { id: 2 });
  ok("10 Promise Memoization: дедупликация запросов");
}

// ---------- 11: backoff + jitter + лимит ----------
{
  const delays = [];
  let calls = 0;
  const always500 = async () => { calls++; return { ok: false, status: 500 }; };
  await assert.rejects(
    fx.fetchWithRetry("/x", { maxRetries: 4, baseDelayMs: 100, maxDelayMs: 500, fetchFn: always500, sleep: async (ms) => delays.push(ms), random: () => 1 }),
    { name: "HttpError", status: 500 }
  );
  assert.equal(calls, 5); // 1 попытка + 4 повтора, а не бесконечность
  assert.deepEqual(delays, [100, 200, 400, 500]); // экспонента с потолком (random=1 -> верхняя граница)

  assert.equal(fx.backoffDelay(3, 100, 10_000, () => 0.5), 400); // джиттер: от 0 до 800, тут середина
  assert.equal(fx.backoffDelay(0, 100, 10_000, () => 0), 0);

  calls = 0;
  await assert.rejects(fx.fetchWithRetry("/x", { fetchFn: async () => (calls++, { ok: false, status: 404 }), sleep: async () => {} }), { status: 404 });
  assert.equal(calls, 1); // 404 повторять бессмысленно

  calls = 0;
  const flaky = async () => (++calls < 3 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ done: true }) });
  assert.deepEqual(await fx.fetchWithRetry("/x", { fetchFn: flaky, sleep: async () => {} }), { done: true });

  const ac = new AbortController(); ac.abort();
  calls = 0;
  await assert.rejects(
    fx.fetchWithRetry("/x", { signal: ac.signal, sleep: async () => {}, fetchFn: async () => { calls++; throw new DOMException("a", "AbortError"); } }),
    { name: "AbortError" }
  );
  assert.equal(calls, 1);
  ok("11 Exponential Backoff + Jitter + maxRetries");
}

// ---------- 12: ограничения JSON-клонирования ----------
{
  const state = { activeDate: new Date(0), pattern: /^[a-z]+$/i, calculateTax: () => 100, history: undefined, set: new Set([1]) };
  const viaJson = JSON.parse(JSON.stringify(state));
  assert.equal(typeof viaJson.activeDate, "string"); // Date -> строка
  assert.deepEqual(viaJson.pattern, {}); // RegExp -> {}
  assert.equal("calculateTax" in viaJson, false); // функция потерялась
  assert.equal("history" in viaJson, false); // undefined потерялся
  assert.deepEqual(viaJson.set, {}); // Set -> {}
  assert.throws(() => JSON.stringify({ balance: 1000n }), TypeError); // BigInt

  const { calculateTax, ...cloneable } = state;
  const viaStructured = structuredClone({ ...cloneable, balance: 1000n });
  assert.ok(viaStructured.activeDate instanceof Date);
  assert.ok(viaStructured.pattern instanceof RegExp);
  assert.ok(viaStructured.set instanceof Set);
  assert.equal(viaStructured.balance, 1000n);
  assert.equal("history" in viaStructured, true); // undefined сохранён
  assert.throws(() => structuredClone(state), { name: "DataCloneError" }); // а функции — нет
  ok("12 JSON-клон ломает типы; structuredClone лучше, но без функций");
}

// ---------- 13: литералы ломают shallowEqual ----------
{
  const row = { id: 1, name: "A" };
  assert.equal(fx.shallowEqual(fx.rowPropsBad(row), fx.rowPropsBad(row)), false); // «рендер» 2 = все пропсы новые
  const onDelete = () => {};
  assert.equal(fx.shallowEqual(fx.rowPropsGood(row, onDelete), fx.rowPropsGood(row, onDelete)), true);
  assert.equal(fx.shallowEqual(fx.rowPropsGood(row, onDelete), fx.rowPropsGood({ ...row }, onDelete)), false); // изменилась только строка
  ok("13 стабильные ссылки -> React.memo срабатывает (JSX — в solutions.md)");
}

// ---------- 14: дедупликация страниц ----------
{
  const state = { posts: [{ id: 1 }, { id: 2 }] };
  const next = fx.appendNextPage(state, [{ id: 2 }, { id: 3 }, { id: 3 }]);
  assert.deepEqual(next.posts.map((p) => p.id), [1, 2, 3]);
  assert.equal(state.posts.length, 2);
  assert.equal(fx.appendNextPage(state, [{ id: 1 }]).posts, state.posts); // ничего нового — та же ссылка
  ok("14 слияние без дубликатов за O(N)");
}

// ---------- 15: null из БД ----------
{
  const row = { color: null, text: null, icon: null };
  assert.equal(fx.renderBadgeConfig(row), '<span class="badge blue">star Новинка</span>');
  assert.equal(fx.renderBadgeConfig({}), '<span class="badge blue">star Новинка</span>');
  assert.equal(fx.renderBadgeConfig({ color: "red", text: "" }), '<span class="badge red">star </span>'); // "" сохраняется
  assert.equal(fx.renderBadgeConfig(), '<span class="badge blue">star Новинка</span>');
  // исходная ловушка:
  const { color = "blue" } = row;
  assert.equal(color, null); // дефолт не сработал
  ok("15 ?? вместо дефолтов деструктуризации");
}

console.log(`\nГотово: ${n} проверок пройдено`);
