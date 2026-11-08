// Проверка исправлений: node check.js
import assert from "node:assert/strict";
import * as fx from "./fixes.js";

let n = 0;
const ok = (name) => console.log(`✓ Кейс ${name}`) || n++;

// 01
{
  const calls = [];
  const win = { history: { pushState: () => calls.push("push"), replaceState: () => calls.push("replace") } };
  let rendered = 0;
  fx.checkAuthAndNavigate(false, "/private", { win, renderLoginPage: () => rendered++ });
  assert.deepEqual(calls, ["replace"]);
  assert.equal(rendered, 1);
  fx.checkAuthAndNavigate(true, "/private", { win, renderLoginPage: () => rendered++ });
  assert.equal(rendered, 1); // авторизован — редиректа нет
  ok("01 replaceState вместо pushState");
}
// 02
{
  const listeners = new Set();
  const win = { innerWidth: 500, addEventListener: (_t, f) => listeners.add(f), removeEventListener: (_t, f) => listeners.delete(f) };
  const header = { className: "" };
  const m = fx.mountHeader({ win, header });
  assert.equal(listeners.size, 1);
  assert.equal(header.className, "header-mobile");
  win.innerWidth = 1200; [...listeners][0]();
  assert.equal(header.className, "header-desktop");
  m.cleanup();
  assert.equal(listeners.size, 0); // слушатель снят — утечки нет
  ok("02 cleanup снимает слушатель resize");
}
// 03
{
  let prevented = false, navigatedTo = null;
  const link = { getAttribute: () => "/cart" };
  fx.handleLinkClick({ target: { closest: () => link }, preventDefault: () => (prevented = true) }, { navigate: (p) => (navigatedTo = p) });
  assert.ok(prevented);
  assert.equal(navigatedTo, "/cart");
  ok("03 preventDefault + router.navigate");
}
// 07
{
  const users = [{ id: 1, isActive: true, loginAttempts: 3 }, { id: 2, isActive: false, loginAttempts: 5 }];
  const res = fx.resetAttemptsForActiveUsers(users);
  assert.deepEqual(res, [{ id: 1, isActive: true, loginAttempts: 0 }]);
  assert.equal(users[0].loginAttempts, 3); // исходный список не изменился
  ok("07 чистая функция без мутации");
}
// 08
{
  const profile = { id: 1, security: { roles: ["admin"], twoFactor: true } };
  const next = fx.addRole(profile, "superadmin");
  assert.deepEqual(profile.security.roles, ["admin"]);
  assert.deepEqual(next.security.roles, ["admin", "superadmin"]);
  const copy = fx.deepClone(profile);
  copy.security.roles.push("x");
  assert.deepEqual(profile.security.roles, ["admin"]);
  ok("08 иммутабельное обновление вложенного массива");
}
// 09
{
  assert.deepEqual(fx.createPaginationButtonsLet(3).map((f) => f()), [1, 2, 3]);
  assert.deepEqual(fx.createPaginationButtonsFactory(3).map((f) => f()), [1, 2, 3]);
  ok("09 let и фабрика вместо var");
}
// 10
{
  const log = [];
  const t = fx.makeTrackers(log);
  t.viaBind("click-1");
  t.viaArrow("click-2");
  t.viaHandleEvent.handleEvent.call(t.viaHandleEvent, "click-3");
  assert.deepEqual(log, ["[ANALYTICS_EVENT]: click-1", "[ANALYTICS_EVENT]: click-2", "[HANDLE_EVENT]: click-3"]);
  ok("10 три способа сохранить this");
}
// 11
{
  const products = [{ price: 1 }, { price: 5 }, { price: 3 }, { price: 9 }];
  const before = JSON.stringify(products);
  assert.deepEqual(fx.getTopExpensiveProducts(products).map((p) => p.price), [9, 5, 3]);
  assert.equal(JSON.stringify(products), before); // порядок каталога не изменился
  ok("11 sort на копии массива");
}
// 12
assert.deepEqual(fx.mapIdsToTasks(["a", "b"]), [{ taskId: "a", isDone: false }, { taskId: "b", isDone: false }]);
ok("12 map вместо forEach");
// 13
{
  assert.equal(fx.hasCode(fx.exitCodes, 0), true);
  assert.equal(fx.findIndexOfCode(fx.exitCodes, 0), true);
  assert.equal(fx.findCodeSafe(fx.exitCodes, 0), true);
  assert.equal(fx.findCodeSafe(fx.exitCodes, 99), false);
  assert.equal(!fx.exitCodes.find((c) => c === 0), true); // исходная ловушка: 0 — falsy
  ok("13 проверка !== undefined / includes");
}
// 14
assert.equal(fx.totalCost([{ price: 2000 }, { price: 1000 }]), 3000);
assert.equal(fx.totalCost([]), 0); // а без initialValue пустой массив бросил бы TypeError
ok("14 reduce с initialValue = 0");
// 15
assert.deepEqual(fx.onFieldChange({ name: "Иван", email: "a" }, "email", "b"), { name: "Иван", email: "b" });
ok("15 вычисляемое свойство [fieldName]");
// 16
assert.equal(fx.renderUserStats(null), "Просмотры: 0");
assert.equal(fx.renderUserStats({ stats: null }), "Просмотры: 0");
assert.equal(fx.renderUserStats({ stats: { views: 7 } }), "Просмотры: 7");
ok("16 безопасная деструктуризация null");
// 17
{
  const res = fx.TextInput({ type: "password", id: "pass", className: "big" });
  assert.equal(res.type, "password");
  assert.equal(res.className, "form-input big");
  assert.equal(fx.TextInput({ id: "x" }).type, "text"); // дефолт работает
  assert.equal(fx.TextInput({}).className, "form-input");
  ok("17 порядок Spread и объединение className");
}
// 18
{
  const doc = { createElement: () => ({}), head: { appendChild(s) { setTimeout(() => s.onload(), 5); } } };
  await assert.rejects(fx.loadCustomScript("x.js", doc), SyntaxError); // промис теперь отклоняется, а не висит
  const doc2 = { createElement: () => ({}), head: { appendChild(s) { setTimeout(() => s.onerror(), 5); } } };
  await assert.rejects(fx.loadCustomScript("y.js", doc2), /Не удалось загрузить/);
  ok("18 reject внутри колбэка");
}
// 19
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fakeFetch = (url, { signal }) =>
    new Promise((resolve, reject) => {
      const q = new URL(url, "http://x").searchParams.get("q");
      const ms = q === "react" ? 120 : 10; // «react» отвечает медленно
      const timer = setTimeout(() => resolve({ ok: true, json: async () => [`результат для ${q}`] }), ms);
      signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); });
    });
  const search = fx.createSearchService(fakeFetch);
  const [slow, fast] = await Promise.all([search("react"), sleep(5).then(() => search("vue"))]);
  assert.equal(slow, null); // устаревший ответ отброшен
  assert.deepEqual(fast, ["результат для vue"]);
  ok("19 AbortController отменяет устаревший запрос");
}
// 20
{
  let shown = null;
  const api = {
    fetchUserData: async () => ({ name: "Иван" }),
    fetchUserBalance: async () => 100,
    fetchPromoBanner: async () => { throw new Error("500"); },
    renderProfile: (data) => (shown = data),
  };
  await fx.loadFullProfilePage(1, api);
  assert.deepEqual(shown, { user: { name: "Иван" }, balance: 100, promo: null });
  api.fetchUserBalance = async () => { throw new Error("баланс недоступен"); };
  await assert.rejects(fx.loadFullProfilePage(1, api), /баланс недоступен/); // критичное падение не скрываем
  ok("20 Promise.allSettled: баннер не ломает страницу");
}

console.log(`\nГотово: ${n} проверок пройдено (кейсы 4, 5, 6 — конфигурация, см. solutions.md)`);
