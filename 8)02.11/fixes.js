// Исправленный код для кейсов «Анализ Pull Request» (02.11).
// Кейсы 4, 5, 6 — про package.json / vite.config.js, их разбор в solutions.md.
// window / document / fetch передаются параметрами, чтобы код можно было проверить в Node.

// ---------- Кейс 01: редирект без засорения истории ----------
export function checkAuthAndNavigate(isAuthenticated, currentPath, { win = window, renderLoginPage }) {
  if (!isAuthenticated && currentPath !== "/login") {
    // replaceState ЗАМЕНЯЕТ текущую запись истории, а не добавляет новую
    win.history.replaceState({}, "", "/login");
    renderLoginPage();
  }
}

// ---------- Кейс 02: утечка памяти из-за слушателя resize ----------
export function mountHeader({ win = window, header }) {
  // Именованная функция: на неё есть ссылка, значит слушателя можно снять
  function onResize() {
    const isMobile = win.innerWidth < 768;
    header.className = isMobile ? "header-mobile" : "header-desktop";
  }

  win.addEventListener("resize", onResize);
  onResize(); // сразу выставляем правильный класс

  return {
    header,
    cleanup() {
      win.removeEventListener("resize", onResize); // вызывать при размонтировании!
    },
  };
}

// ---------- Кейс 03: SPA-переход без полной перезагрузки ----------
// Один делегированный обработчик на документ вместо inline onclick="..."
export function handleLinkClick(event, router) {
  const link = event.target.closest("a[href]");
  if (!link) return;
  const href = link.getAttribute("href");
  if (!href.startsWith("/")) return; // внешние ссылки не трогаем

  event.preventDefault(); // отменяем действие браузера по умолчанию (переход по href)
  router.navigate(href);
}

// ---------- Кейс 07: чистая функция вместо мутации общих объектов ----------
export function resetAttemptsForActiveUsers(usersList) {
  return usersList
    .filter((user) => user.isActive)
    .map((user) => ({ ...user, loginAttempts: 0 })); // копия каждого объекта
}

// ---------- Кейс 08: поверхностное копирование и вложенные структуры ----------
// Вариант А: иммутабельное обновление вложенного массива (новые ссылки по цепочке)
export const addRole = (profile, role) => ({
  ...profile,
  security: { ...profile.security, roles: [...profile.security.roles, role] },
});
// Вариант Б: глубокое клонирование (подходит, когда в данных нет функций)
export const deepClone = (value) => structuredClone(value);

// ---------- Кейс 09: var в цикле — два способа исправления ----------
// Способ 1: let — на каждой итерации своя переменная i
export function createPaginationButtonsLet(pagesCount) {
  const buttons = [];
  for (let i = 1; i <= pagesCount; i++) {
    buttons.push(() => i);
  }
  return buttons;
}
// Способ 2: фабрика-замыкание — значение page «запоминается» в параметре
export function createPaginationButtonsFactory(pagesCount) {
  var buttons = [];
  const makeHandler = (page) => () => page;
  for (var i = 1; i <= pagesCount; i++) {
    buttons.push(makeHandler(i));
  }
  return buttons;
}

// ---------- Кейс 10: потеря this — три варианта ----------
export function makeTrackers(log) {
  const analyticsTracker = {
    prefix: "ANALYTICS_EVENT",
    sendEvent(eventName) {
      log.push(`[${this.prefix}]: ${eventName}`);
    },
  };
  return {
    analyticsTracker,
    // 1. bind — жёстко привязываем this
    viaBind: analyticsTracker.sendEvent.bind(analyticsTracker),
    // 2. стрелка-обёртка — вызов снова идёт «через точку»
    viaArrow: (event) => analyticsTracker.sendEvent(event),
    // 3. объект с handleEvent: addEventListener вызывает его с this = этот объект
    viaHandleEvent: {
      prefix: "HANDLE_EVENT",
      handleEvent(event) {
        log.push(`[${this.prefix}]: ${event}`);
      },
    },
  };
}

// ---------- Кейс 11: sort() мутирует массив ----------
export const getTopExpensiveProducts = (products) =>
  [...products] // копия, чтобы sort не трогал оригинал
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);
// Современный вариант (Node 20+, современные браузеры): products.toSorted(...)

// ---------- Кейс 12: декларативный map вместо forEach ----------
export const mapIdsToTasks = (ids) => ids.map((id) => ({ taskId: id, isDone: false }));

// ---------- Кейс 13: find() вернул 0 (falsy) ----------
export const exitCodes = [0, 5, 8, 12];
export const hasCode = (codes, code) => codes.includes(code); // сразу true/false
export const findIndexOfCode = (codes, code) => codes.findIndex((c) => c === code) !== -1;
export const findCodeSafe = (codes, code) => codes.find((c) => c === code) !== undefined;

// ---------- Кейс 14: reduce без initialValue ----------
export const totalCost = (cartItems) => cartItems.reduce((acc, item) => acc + item.price, 0);

// ---------- Кейс 15: вычисляемое имя свойства ----------
export const onFieldChange = (formState, fieldName, value) => ({
  ...formState,
  [fieldName]: value, // [ ] — ключ берётся из переменной
});

// ---------- Кейс 16: деструктуризация null ----------
export function renderUserStats(serverData) {
  const { stats } = serverData ?? {}; // null/undefined -> пустой объект
  const { views = 0, likes = 0 } = stats ?? {}; // stats тоже может быть null
  return `Просмотры: ${views}`;
}

// ---------- Кейс 17: порядок Spread ----------
export function TextInput(props) {
  return {
    type: "text", // дефолт — ВЫШЕ props, поэтому внешний type его переопределит
    ...props,
    className: ["form-input", props.className].filter(Boolean).join(" "), // классы объединяем
  };
}

// ---------- Кейс 18: ошибка внутри колбэка не попадала в reject ----------
export function loadCustomScript(src, doc = document) {
  return new Promise((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = src;

    script.onload = () => {
      try {
        const data = JSON.parse("НЕВАЛИДНЫЙ_JSON");
        resolve(data);
      } catch (error) {
        reject(error); // вручную передаём ошибку в промис
      }
    };
    script.onerror = () => reject(new Error(`Не удалось загрузить скрипт: ${src}`));

    doc.head.appendChild(script);
  });
}

// ---------- Кейс 19: Race Condition — AbortController ----------
export function createSearchService(fetchFn = globalThis.fetch) {
  let activeAbortController = null;

  return async function search(query) {
    if (activeAbortController) activeAbortController.abort(); // отменяем устаревший запрос

    activeAbortController = new AbortController();
    const { signal } = activeAbortController;

    try {
      const response = await fetchFn(`/api/search?q=${encodeURIComponent(query)}`, { signal });
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const results = await response.json();
      activeAbortController = null;
      return results;
    } catch (error) {
      if (error.name === "AbortError") return null; // штатная отмена — не ошибка
      activeAbortController = null;
      throw error;
    }
  };
}

// ---------- Кейс 20: Promise.allSettled вместо Promise.all ----------
export async function loadFullProfilePage(userId, api) {
  const [userRes, balanceRes, promoRes] = await Promise.allSettled([
    api.fetchUserData(userId),
    api.fetchUserBalance(userId),
    api.fetchPromoBanner(), // второстепенный виджет
  ]);

  // Критичные данные: без них страницу показывать нельзя
  if (userRes.status === "rejected") throw userRes.reason;
  if (balanceRes.status === "rejected") throw balanceRes.reason;

  // Второстепенные: при ошибке просто не показываем баннер
  const promo = promoRes.status === "fulfilled" ? promoRes.value : null;

  api.renderProfile({ user: userRes.value, balance: balanceRes.value, promo });
}
