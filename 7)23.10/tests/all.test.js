// Тесты на все 30 задач. Запуск: npm test   (или: node --test tests/all.test.js)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ClientRouter, createVNode, shallowEqual, createParent, Child, renderToHTML } from "../section1-spa/tasks.js";
import { findLooseDependencies } from "../section2-env/06-validate-versions.js";
import { checkNodeVersion, getMajor } from "../section2-env/07-check-env.js";
import { createHmrServer } from "../section2-env/10-hmr-server.js";
import { deepFreeze, createCounter, memoize, createValidator, getNestedValue } from "../section3-closures/tasks.js";
import { formatShowcase, filterCatalog, toggleTodoStatus, groupProductsByCategory, uniqueBy } from "../section4-arrays/tasks.js";
import {
  toggleEmailNotification, extractDomProps, deepMerge,
  normalizeEntities, patchEntityById, removeEntityById, updateFormState,
} from "../section5-objects/tasks.js";
import { wait, loadDashboard, fetchWithTimeout, retry, AsyncQueue } from "../section6-async/tasks.js";

// ---------------------------------------------------------------- Раздел 1
describe("Раздел 1: SPA и основы React", () => {
  test("01 ClientRouter: клик по <a>, pushState, popstate", () => {
    const listeners = {};
    const pushes = [];
    const win = {
      location: { pathname: "/" },
      history: { pushState: (_s, _t, p) => { win.location.pathname = p; pushes.push(p); } },
      addEventListener: (t, f) => (listeners[t] = f),
      removeEventListener: (t) => delete listeners[t],
    };
    const doc = {
      addEventListener: (t, f) => (listeners["doc:" + t] = f),
      removeEventListener: (t) => delete listeners["doc:" + t],
    };
    const root = { innerHTML: "" };
    const router = new ClientRouter(
      { "/": () => "<h1>Главная</h1>", "/about": () => "<h1>О нас</h1>", "*": () => "<h1>404</h1>" },
      { root, win, doc }
    ).start();
    assert.equal(root.innerHTML, "<h1>Главная</h1>");

    // клик по внутренней ссылке
    let prevented = false;
    const link = { getAttribute: () => "/about", hasAttribute: () => false, target: "" };
    listeners["doc:click"]({ button: 0, target: { closest: () => link }, preventDefault: () => (prevented = true) });
    assert.equal(prevented, true);
    assert.deepEqual(pushes, ["/about"]);
    assert.equal(root.innerHTML, "<h1>О нас</h1>");

    // внешняя ссылка не перехватывается
    let prevented2 = false;
    const ext = { getAttribute: () => "https://example.com", hasAttribute: () => false, target: "" };
    listeners["doc:click"]({ button: 0, target: { closest: () => ext }, preventDefault: () => (prevented2 = true) });
    assert.equal(prevented2, false);

    // кнопка «назад»
    win.location.pathname = "/";
    listeners.popstate();
    assert.equal(root.innerHTML, "<h1>Главная</h1>");

    // неизвестный адрес -> 404
    router.navigate("/nope");
    assert.equal(root.innerHTML, "<h1>404</h1>");

    router.destroy();
    assert.equal(listeners.popstate, undefined);
  });

  test("02 createVNode", () => {
    assert.deepEqual(createVNode("p", null, "текст"), { type: "p", props: { children: "текст" }, key: null });
    assert.deepEqual(createVNode("p", { id: "a", key: 5 }, 42), { type: "p", props: { id: "a", children: 42 }, key: 5 });
    assert.deepEqual(createVNode("ul", null, "a", "b").props.children, ["a", "b"]);
    assert.equal("children" in createVNode("br").props, false);
  });

  test("03 shallowEqual", () => {
    const inner = {};
    assert.equal(shallowEqual({ a: 1, b: inner }, { a: 1, b: inner }), true);
    assert.equal(shallowEqual({ a: 1, b: {} }, { a: 1, b: {} }), false); // разные ссылки
    assert.equal(shallowEqual({ a: 1 }, { a: 1, b: 2 }), false);
    assert.equal(shallowEqual({ a: undefined }, { b: undefined }), false);
    assert.equal(shallowEqual({ a: NaN }, { a: NaN }), true); // Object.is
    assert.equal(shallowEqual(null, {}), false);
  });

  test("04 Lifting State Up", () => {
    const parent = createParent(5);
    parent.render().click();
    parent.render().click();
    assert.equal(parent.getCount(), 7);
    assert.equal(parent.render().text, "Счётчик: 7");
    let calls = 0;
    Child({ count: 0, onIncrement: () => calls++ }).click();
    assert.equal(calls, 1);
  });

  test("05 renderToHTML", () => {
    const Card = ({ title }) => createVNode("h2", { className: "t" }, title);
    const tree = createVNode(
      "div",
      { className: "box", id: "a", style: { backgroundColor: "red" }, onClick: () => {} },
      createVNode(Card, { title: "Привет <мир>" }),
      createVNode("input", { type: "text", disabled: true }),
      createVNode("label", { htmlFor: "x" }, 5, null)
    );
    assert.equal(
      renderToHTML(tree),
      '<div class="box" id="a" style="background-color:red"><h2 class="t">Привет &lt;мир&gt;</h2>' +
        '<input type="text" disabled /><label for="x">5</label></div>'
    );
  });
});

// ---------------------------------------------------------------- Раздел 2
describe("Раздел 2: Node.js, npm и Vite", () => {
  test("06 validate-versions", () => {
    const bad = findLooseDependencies({ dependencies: { a: "^1.0.0", b: "~2.0.0", c: "3.0.0" }, devDependencies: { d: "^1" } });
    assert.deepEqual(bad, [{ name: "a", version: "^1.0.0" }, { name: "b", version: "~2.0.0" }]);
    assert.deepEqual(findLooseDependencies({}), []);
  });

  test("07 check-env", () => {
    assert.equal(getMajor("v20.17.0"), 20);
    let code = null;
    const logs = [];
    checkNodeVersion("v16.20.0", { log: (m) => logs.push(m), exit: (c) => (code = c) });
    assert.equal(code, 1);
    assert.match(logs[0], /Требуется Node\.js >= 18/);
    code = null;
    assert.equal(checkNodeVersion("v18.0.0", { exit: (c) => (code = c) }), true);
    assert.equal(code, null);
  });

  test("08 package.json: prebuild -> build -> postbuild", () => {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
    assert.equal(pkg.scripts.prebuild, "npm run lint");
    assert.ok(pkg.scripts.build);
    assert.match(pkg.scripts.postbuild, /dir-size/);
  });

  test("09 vite.config.js (есть alias @ -> ./src)", () => {
    const text = fs.readFileSync(new URL("../section2-env/09-vite.config.js", import.meta.url), "utf-8");
    assert.match(text, /@vitejs\/plugin-react/);
    assert.match(text, /"@":\s*path\.resolve\(__dirname,\s*"\.\/src"\)/);
  });

  test("10 HMR: при изменении файла клиент получает { type: 'reload' }", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hmr-"));
    const file = path.join(dir, "test.js");
    fs.writeFileSync(file, "// v1\n");
    const hmr = await createHmrServer({ file, port: 0, debounceMs: 20 });

    const message = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("нет сообщения за 3 с")), 3000);
      http.get({ port: hmr.port, path: "/hmr" }, (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (chunk.startsWith(": connected")) {
            fs.appendFileSync(file, "// v2\n"); // «разработчик сохранил файл»
          } else if (chunk.startsWith("data:")) {
            clearTimeout(timeout);
            res.destroy();
            resolve(JSON.parse(chunk.slice(5)));
          }
        });
      });
    });

    assert.deepEqual(message, { type: "reload" });
    await hmr.close();
    fs.rmSync(dir, { recursive: true });
  });
});

// ---------------------------------------------------------------- Раздел 3
describe("Раздел 3: память, замыкания", () => {
  test("11 deepFreeze", () => {
    const obj = { a: { b: { c: [1, { d: 1 }] } } };
    obj.self = obj; // циклическая ссылка
    deepFreeze(obj);
    assert.throws(() => { obj.a = 1; }, TypeError);
    assert.throws(() => { obj.a.b.c.push(2); }, TypeError);
    assert.throws(() => { obj.a.b.c[1].d = 2; }, TypeError);
    assert.equal(Object.isFrozen(obj.a.b.c[1]), true);
  });

  test("12 createCounter", () => {
    const c = createCounter(10, 5);
    assert.equal(c.inc(), 15);
    assert.equal(c.dec(), 10);
    c.inc(); c.inc();
    assert.equal(c.get(), 20);
    assert.equal(c.reset(), 10);
    assert.equal(c.count, undefined); // снаружи переменной нет
    assert.equal(createCounter().get(), 0);
    const c2 = createCounter(); c2.inc();
    assert.equal(createCounter().get(), 0); // состояния изолированы
  });

  test("13 memoize", () => {
    let calls = 0;
    const slowSum = memoize((a, b) => { calls++; return a + b; });
    assert.equal(slowSum(1, 2), 3);
    assert.equal(slowSum(1, 2), 3);
    assert.equal(calls, 1); // второй вызов из кэша
    slowSum(2, 1);
    assert.equal(calls, 2);
    assert.equal(memoize((x) => x)(10n), 10n); // BigInt не ломает ключ
    assert.equal(slowSum.size(), 2);
  });

  test("14 createValidator", () => {
    const min8 = createValidator("minLength", 8);
    assert.deepEqual(min8("12345678"), { isValid: true, message: "" });
    assert.deepEqual(min8("123"), { isValid: false, message: "Минимум 8 символов" });
    assert.equal(createValidator("required")("   ").isValid, false);
    assert.equal(createValidator("email")("a@b.ru").isValid, true);
    assert.equal(createValidator("email")("abc").isValid, false);
    assert.equal(createValidator("pattern", /^\d+$/)("123").isValid, true);
    assert.throws(() => createValidator("nope"), /Неизвестное правило/);
  });

  test("15 getNestedValue", () => {
    assert.equal(getNestedValue({ payload: { user: { settings: { theme: "dark" } } } }, "light"), "dark");
    assert.equal(getNestedValue(null, "light"), "light");
    assert.equal(getNestedValue({ payload: null }, "light"), "light");
    assert.equal(getNestedValue({ payload: { user: { settings: { theme: "" } } } }, "light"), ""); // ?? не трогает ""
  });
});

// ---------------------------------------------------------------- Раздел 4
describe("Раздел 4: массивы", () => {
  const products = [
    { id: 1, name: "Ноутбук", category: "pc", price: 150000, inStock: true },
    { id: 2, name: "Мышь", category: "pc", price: 2500, inStock: false },
    { id: 3, name: "Подарок", category: "misc", price: 0, inStock: true },
  ];

  test("16 formatShowcase", () => {
    const res = formatShowcase(products);
    assert.match(res[0].displayPrice.replace(/\s/g, " "), /^150 000 ₽$/);
    assert.deepEqual(res.map((p) => p.isOrderable), [true, false, false]);
    assert.equal("displayPrice" in products[0], false); // исходник не изменён
  });

  test("17 filterCatalog", () => {
    assert.equal(filterCatalog(products, {}).length, 3);
    assert.deepEqual(filterCatalog(products, { category: "pc" }).map((p) => p.id), [1, 2]);
    assert.deepEqual(filterCatalog(products, { maxPrice: 3000 }).map((p) => p.id), [2, 3]);
    assert.deepEqual(filterCatalog(products, { onlyInStock: true, category: "pc" }).map((p) => p.id), [1]);
  });

  test("18 toggleTodoStatus", () => {
    const todos = [{ id: 1, done: false }, { id: 2, done: true }];
    const next = toggleTodoStatus(todos, 1);
    assert.deepEqual(next, [{ id: 1, done: true }, { id: 2, done: true }]);
    assert.equal(next[1], todos[1]); // нетронутый элемент — та же ссылка
    assert.equal(todos[0].done, false); // исходный не мутирован
  });

  test("19 groupProductsByCategory", () => {
    const g = groupProductsByCategory(products);
    assert.deepEqual(Object.keys(g), ["pc", "misc"]);
    assert.equal(g.pc.length, 2);
    assert.equal(g.misc[0].name, "Подарок");
  });

  test("20 uniqueBy", () => {
    const arr = [{ id: 1, v: "a" }, { id: 2, v: "b" }, { id: 1, v: "c" }];
    assert.deepEqual(uniqueBy(arr, "id"), [{ id: 1, v: "a" }, { id: 2, v: "b" }]);
    assert.equal(arr.length, 3);
  });
});

// ---------------------------------------------------------------- Раздел 5
describe("Раздел 5: объекты", () => {
  test("21 toggleEmailNotification", () => {
    const state = { user: { id: 1, profile: { notifications: { email: true, push: false }, bio: {} } }, posts: [1] };
    const next = toggleEmailNotification(state);
    assert.equal(next.user.profile.notifications.email, false);
    assert.equal(state.user.profile.notifications.email, true);
    assert.notEqual(next, state);
    assert.notEqual(next.user, state.user);
    assert.notEqual(next.user.profile, state.user.profile);
    assert.equal(next.posts, state.posts); // соседняя ветка не тронута
    assert.equal(next.user.profile.bio, state.user.profile.bio);
  });

  test("22 extractDomProps", () => {
    const props = { id: "x", variant: "primary", isElevated: true, "aria-label": "a" };
    assert.deepEqual(extractDomProps(props, ["variant", "isElevated"]), { id: "x", "aria-label": "a" });
    assert.deepEqual(extractDomProps(props, []), props);
  });

  test("23 deepMerge", () => {
    const merged = deepMerge(
      { api: { host: "h", port: 1, ssl: true }, list: [1, 2], ui: { theme: "x" } },
      { api: { port: 2, ssl: false }, list: [3] }
    );
    assert.deepEqual(merged, { api: { host: "h", port: 2, ssl: false }, list: [3], ui: { theme: "x" } });
    // защита от prototype pollution
    deepMerge({}, JSON.parse('{"__proto__": {"hacked": true}}'));
    assert.equal({}.hacked, undefined);
  });

  test("24 нормализация и патч O(1)", () => {
    const raw = [{ id: "usr_101", name: "Алексей", status: "active" }, { id: "usr_102", name: "Мария", status: "pending" }];
    const state = normalizeEntities(raw);
    const next = patchEntityById(state, "usr_102", { status: "active" });
    assert.notEqual(state, next);
    assert.notEqual(state.byId.usr_102, next.byId.usr_102);
    assert.equal(state.byId.usr_101, next.byId.usr_101);
    assert.equal(state.allIds, next.allIds);
    assert.equal(next.byId.usr_102.status, "active");
    const removed = removeEntityById(next, "usr_101");
    assert.deepEqual(removed.allIds, ["usr_102"]);
    assert.equal("usr_101" in removed.byId, false);
    assert.equal(next.allIds.length, 2); // исходник цел
    assert.throws(() => normalizeEntities("nope"), TypeError);
  });

  test("25 updateFormState", () => {
    const s = { name: "Иван", email: "a@a.ru" };
    assert.deepEqual(updateFormState(s, "email", "b@b.ru"), { name: "Иван", email: "b@b.ru" });
    assert.deepEqual(updateFormState(s, "age", 20), { name: "Иван", email: "a@a.ru", age: 20 });
    assert.equal(s.email, "a@a.ru");
  });
});

// ---------------------------------------------------------------- Раздел 6
describe("Раздел 6: Promise и async/await", () => {
  test("26 wait", async () => {
    const t = Date.now();
    await wait(60);
    assert.ok(Date.now() - t >= 55);
  });

  test("27 loadDashboard: ошибка одного запроса не ломает остальные", async () => {
    const t = Date.now();
    const { successData, errors } = await loadDashboard();
    assert.equal(successData.length, 2);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /500/);
    assert.ok(Date.now() - t < 190); // параллельно (~100 мс), а не последовательно (~210 мс)
  });

  test("28 fetchWithTimeout", async () => {
    // «зависший» сервер: отвечает только если его не прервали
    const slowFetch = (_url, { signal }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve("ok"), 500);
        signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); });
      });
    await assert.rejects(fetchWithTimeout("/x", 50, { fetchFn: slowFetch }), { name: "AbortError" });

    const fastFetch = async () => "быстро";
    assert.equal(await fetchWithTimeout("/x", 500, { fetchFn: fastFetch }), "быстро");

    // обычная ошибка сети не маскируется под AbortError
    const broken = async () => { throw new TypeError("network"); };
    await assert.rejects(fetchWithTimeout("/x", 500, { fetchFn: broken }), { name: "TypeError" });
  });

  test("29 retry", async () => {
    let calls = 0;
    const flaky = async () => { if (++calls < 3) throw new Error("fail"); return "успех"; };
    assert.equal(await retry(flaky, 3, 1), "успех");
    assert.equal(calls, 3);

    let calls2 = 0;
    const alwaysFail = async () => { calls2++; throw new Error(`fail #${calls2}`); };
    await assert.rejects(retry(alwaysFail, 3, 1), { message: "fail #4" }); // 1 + 3 повтора
    assert.equal(calls2, 4);
  });

  test("30 AsyncQueue: строго по очереди", async () => {
    const queue = new AsyncQueue();
    const log = [];
    let active = 0, peak = 0;
    const task = (name, ms, fail = false) => async () => {
      active++; peak = Math.max(peak, active);
      log.push(`start ${name}`);
      await wait(ms);
      log.push(`end ${name}`);
      active--;
      if (fail) throw new Error(name);
      return name;
    };

    const results = await Promise.allSettled([
      queue.enqueue(task("A", 30)),
      queue.enqueue(task("B", 5, true)),
      queue.enqueue(task("C", 5)),
    ]);

    assert.equal(peak, 1); // никогда больше одной задачи одновременно
    assert.deepEqual(log, ["start A", "end A", "start B", "end B", "start C", "end C"]);
    assert.equal(results[0].value, "A");
    assert.equal(results[1].status, "rejected");
    assert.equal(results[2].value, "C"); // после ошибки очередь продолжила работу
  });
});
