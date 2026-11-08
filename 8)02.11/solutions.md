# Домашка 02.11 — Анализ Pull Request (20 кейсов)

Исправленный код для кейсов на чистом JS лежит в `fixes.js`, проверки — в `check.js`
(`node check.js`). Кейсы 4, 5, 6 — про конфигурацию, их решение приведено ниже.

---

## Блок 1. Архитектура SPA и роутинг

### Кейс 01. Зацикливание истории при редиректе

**Причина.** История браузера — это стек записей. `pushState` **добавляет** новую запись
сверху, `replaceState` **заменяет** текущую.

Цепочка в продакшене: пользователь на `/private` → код делает `pushState('/login')`
(в стеке `[/private, /login]`) → нажимает «Назад» → браузер возвращает на `/private` →
защита снова срабатывает и снова добавляет `/login`. «Назад» оказывается заблокированной.

**Исправление:**

```javascript
function checkAuthAndNavigate(isAuthenticated, currentPath) {
  if (!isAuthenticated && currentPath !== "/login") {
    window.history.replaceState({}, "", "/login"); // заменяем, а не добавляем запись
    renderLoginPage();
  }
}
```

Теперь «опасной» страницы `/private` в истории нет, и «Назад» уведёт пользователя туда, где он был раньше.

### Кейс 02. Утечка памяти в долгоживущей вкладке

**Причина.** `window` живёт всё время, пока открыта вкладка. Каждый вызов `mountHeader()`
добавляет **новый** анонимный обработчик `resize`, который замыкается на элемент `header`.
Пока слушатель висит на `window`, сборщик мусора не может удалить ни его, ни `header`
(даже если шапку давно убрали из DOM). За часы работы слушатели копятся, и на каждый
`resize` срабатывают все.

**Исправление** — именованная функция и метод очистки:

```javascript
function mountHeader() {
  const header = document.getElementById("header");

  function onResize() {
    const isMobile = window.innerWidth < 768;
    header.className = isMobile ? "header-mobile" : "header-desktop";
  }

  window.addEventListener("resize", onResize);
  onResize();

  return {
    header,
    cleanup() {
      window.removeEventListener("resize", onResize); // вызываем при размонтировании
    },
  };
}
```

`removeEventListener` работает только с той же самой ссылкой на функцию, поэтому анонимная стрелка не подходила.
В React это делается так: `useEffect(() => { … return () => window.removeEventListener(…) }, [])`.

### Кейс 03. Hard Reload вместо SPA-перехода

**Причина.** У ссылки `<a href="/cart">` есть **действие по умолчанию**: после всех
обработчиков события браузер переходит по `href`, загружая новую страницу целиком.
Inline-`onclick` успел смонтировать корзину, но потом браузер выполнил обычный переход, и состояние приложения сбросилось.
Чтобы отменить действие по умолчанию, нужен `event.preventDefault()`.

**Исправление** — один делегированный обработчик на документ вместо inline-атрибутов:

```javascript
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link) return;
  const href = link.getAttribute("href");
  if (!href.startsWith("/")) return; // внешние ссылки не трогаем

  event.preventDefault();      // отменяем переход браузера
  router.navigate(href);       // переходим средствами SPA (pushState)
});

function ProductCard({ product }) {
  return `
    <div class="card">
      <h3>${product.title}</h3>
      <a href="/cart">В корзину</a>
    </div>`;
}
```

Бонус: без `onclick` в разметке больше нет зависимости от глобальной переменной `router`
(в inline-обработчике внутри строки переменная-параметр `router` вообще не видна).

---

## Блок 2. Окружение, зависимости и бандлинг

### Кейс 04. Поломка продакшен-сборки из-за devDependencies

**Ошибка классификации** — всё перепутано:

- `react`, `react-dom`, `date-fns` — библиотеки, на которых работает приложение, их место в `dependencies`;
- `vite` — инструмент сборки, нужен разработчику и на этапе билда, его место в `devDependencies`.

**Почему падает.** На CI/CD часто стоит `NODE_ENV=production` или `npm ci --omit=dev`:
тогда `devDependencies` не ставятся, и сборка не находит `react`/`date-fns`.
А `vite` в `dependencies` раздувает продакшен-образ тяжёлым деревом пакетов (esbuild, rollup и т.д.).

**Исправление:**

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "date-fns": "^3.6.0"
  },
  "devDependencies": {
    "vite": "^5.4.0"
  }
}
```

Если билд идёт в CI, там нужно ставить зависимости **вместе** с dev (`npm ci`), собирать, а в финальный
образ класть только результат (`dist/`) — например, через multi-stage Docker.

### Кейс 05. Недетерминизм из-за `npm install`

**Причина.** Символ `^` в `"react": "^18.3.1"` означает «любая версия `>=18.3.1` и `<19.0.0`».
`npm install` при отсутствии (или рассинхроне) `package-lock.json` выбирает **самую свежую версию из
диапазона**, а lock-файл при этом может переписать. В пятницу вышла бы версия 18.3.1, а в понедельник
библиотека выпустила 18.4.0 с багом — и тот же коммит собирается уже с другим набором пакетов.

**Что использовать на сервере:** `npm ci`.

```bash
git pull origin main
npm ci            # ставит ТОЧНО то, что записано в package-lock.json
npm run build
```

Чем `npm ci` отличается: он требует `package-lock.json`, удаляет `node_modules`, ставит строго версии
из lock-файла, **никогда не обновляет** его и падает, если `package.json` и lock не совпадают.
Сам `package-lock.json` обязательно должен лежать в репозитории.

### Кейс 06. Серверные модули Node.js в клиентском коде

**Причина.** Это две разные среды выполнения:

| | Node.js (сервер, сборщик) | Браузер (песочница) |
|---|---|---|
| Доступ к файлам (`fs`) | да | **нет**, из соображений безопасности |
| `process`, `path`, `os` | да | нет |
| `window`, `document` | нет | да |

Код из `src/` Vite собирает для браузера, где модуля `fs` не существует, отсюда ошибка *externalized for browser compatibility*.

**Исправление.** Читаем `package.json` там, где есть Node.js, то есть в `vite.config.js`, и «вшиваем» значение в код при сборке через `define`:

```javascript
// vite.config.js (выполняется в Node.js)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version), // подставится в код как строка
  },
});
```

```javascript
// src/components/Footer.jsx (выполняется в браузере)
export function Footer() {
  return <footer>Версия: {__APP_VERSION__}</footer>;
}
```

Альтернатива: `import { version } from "../../package.json"` — Vite умеет импортировать JSON напрямую,
а именованный импорт вырежет всё лишнее.

---

## Блок 3. Модель памяти, ссылки и мутации

### Кейс 07. Мутация через общую ссылку

**Причина.** Объекты и массивы лежат в куче (Heap), а переменные хранят **ссылки** на них.
`.filter()` создаёт новый массив, но кладёт в него **те же самые объекты** (ссылки копируются, а не сами объекты).
Поэтому `user.loginAttempts = 0` меняет объект, который виден и из исходного `usersList`.

**Исправление** — чистая функция: копируем каждый объект.

```javascript
function resetAttemptsForActiveUsers(usersList) {
  return usersList
    .filter((user) => user.isActive)
    .map((user) => ({ ...user, loginAttempts: 0 }));
}
```

### Кейс 08. Поверхностное копирование (Shallow Copy)

**Причина.** `{ ...userProfile }` копирует только **первый уровень**. Поле `security` — это ссылка на объект,
и в копию попадает та же ссылка. `userCopy.security.roles` и `userProfile.security.roles` — один и тот же массив.

**Исправление.** Вариант А — иммутабельное обновление (новые ссылки на всём пути):

```javascript
const userCopy = {
  ...userProfile,
  security: {
    ...userProfile.security,
    roles: [...userProfile.security.roles, "superadmin"],
  },
};
```

Вариант Б — глубокое клонирование: `const userCopy = structuredClone(userProfile);`
(не умеет копировать функции).

### Кейс 09. `var` в цикле и замыкание

**Причина.** `var` имеет **функциональную** область видимости: на весь цикл одна переменная `i`.
Стрелки замыкаются на неё и читают значение **в момент вызова**, а к этому времени цикл закончился (`i === 6`).
`let` создаёт новую переменную на каждую итерацию.

**Два способа исправить:**

```javascript
// 1. let вместо var
for (let i = 1; i <= pagesCount; i++) {
  buttons.push(() => console.log(`Переход на страницу: ${i}`));
}

// 2. Фабрика: значение запоминается в параметре page
const makeHandler = (page) => () => console.log(`Переход на страницу: ${page}`);
for (var i = 1; i <= pagesCount; i++) {
  buttons.push(makeHandler(i));
}
```

### Кейс 10. Потеря `this`

**Причина.** `this` определяется **в момент вызова**: если функция вызвана как `obj.method()`, то `this === obj`.
`addEventListener("click", analyticsTracker.sendEvent)` передаёт только саму функцию, «дот» теряется,
и браузер вызывает её с `this` = элемент (а в строгом режиме `undefined`). Поэтому `this.prefix` пуст, а `eventName` — объект события.

**Три решения:**

```javascript
const btn = document.getElementById("checkout-btn");

// 1. bind: жёстко привязываем this
btn.addEventListener("click", analyticsTracker.sendEvent.bind(analyticsTracker));

// 2. стрелка-обёртка: вызов снова идёт «через точку»
btn.addEventListener("click", (e) => analyticsTracker.sendEvent(e.type));

// 3. объект с методом handleEvent: браузер сам вызовет его с this = этот объект
const tracker = {
  prefix: "ANALYTICS_EVENT",
  handleEvent(e) { console.log(`[${this.prefix}]: ${e.type}`); },
};
btn.addEventListener("click", tracker);
```

---

## Блок 4. Методы массивов

### Кейс 11. Мутирующий `.sort()`

**Причина.** `sort` сортирует массив **на месте**, то есть меняет исходный `products`. Он же отрисован на главной.

- **Мутируют:** `sort`, `reverse`, `splice`, `push`, `pop`, `shift`, `unshift`, `fill`, `copyWithin`.
- **Чистые (возвращают новое):** `map`, `filter`, `slice`, `concat`, `find`, `reduce`, а также `toSorted`, `toReversed`, `toSpliced`, `with`.

```javascript
function getTopExpensiveProducts(products) {
  return [...products].sort((a, b) => b.price - a.price).slice(0, 3);
  // или: products.toSorted((a, b) => b.price - a.price).slice(0, 3)
}
```

### Кейс 12. `forEach` вместо `map`

```javascript
const mapIdsToTasks = (ids) => ids.map((id) => ({ taskId: id, isDone: false }));
```

В React предпочитают функциональный стиль: `map` — выражение, которое **возвращает** результат,
без внешней переменной и ручных индексов (меньше мест для ошибок). Он ложится прямо в JSX
(`items.map(item => <li key={item.id}>…</li>)`) и не мутирует данные, а React строится на иммутабельности.

### Кейс 13. Ловушка falsy-значения `0`

**Примечание:** в условии массив записан с опечаткой (`const exitCodes =;[0][5]…`), рабочий вариант: `const exitCodes = [0, 5, 8, 12];`.

**Причина.** `.find()` возвращает **сам найденный элемент**, а он здесь равен `0`. А `0` — falsy (как `""`, `null`,
`undefined`, `NaN`, `false`), поэтому `!targetCode` истинно, и программа считает, что элемента нет.
Когда не нашёл, `find` возвращает `undefined`, но отличить «нашёл 0» от «не нашёл» через truthy-проверку нельзя.

```javascript
const exitCodes = [0, 5, 8, 12];

exitCodes.includes(0);                                     // true — проще всего
exitCodes.some((code) => code === 0);                      // true
exitCodes.find((code) => code === 0) !== undefined;        // true — явная проверка
exitCodes.findIndex((code) => code === 0) !== -1;          // true
```

### Кейс 14. `reduce` без `initialValue`

**Причина.** Если второй аргумент не передан, аккумулятором становится **первый элемент массива**, а обход
начинается со второго. Здесь первый элемент — объект `{ id: 1, … }`, и `acc + item.price` превращается в
конкатенацию: `"[object Object]" + 1000`.

```javascript
const totalCost = cartItems.reduce((acc, item) => acc + item.price, 0); // 3000
```

Без `initialValue` на пустом массиве `reduce` ещё и бросает `TypeError`.

---

## Блок 5. Деструктуризация, Rest и вычисляемые свойства

### Кейс 15. Статический ключ вместо вычисляемого

**Причина.** В литерале `{ fieldName: value }` ключ — это **буквальное имя** `"fieldName"`, а не значение переменной.
Чтобы взять ключ из переменной, нужны квадратные скобки (*Computed Property Names*).

```javascript
function onFieldChange(fieldName, value) {
  formState = { ...formState, [fieldName]: value };
}
```

### Кейс 16. Деструктуризация `null`

**Причина.** Значение по умолчанию подставляется **только при `undefined`**. Здесь вообще не дошло
до поля `stats`: сам `serverData` равен `null`, а деструктурировать `null` и `undefined` нельзя (`TypeError`).
Даже если бы объект пришёл, но `stats: null`, дефолт тоже не сработал бы: `null` — это осмысленное значение, а не «пусто».

```javascript
function renderUserStats(serverData) {
  const { stats } = serverData ?? {};          // null -> пустой объект
  const { views = 0, likes = 0 } = stats ?? {}; // null в stats тоже безопасен
  return `Просмотры: ${views}`;
}
```

### Кейс 17. Порядок Spread и перезапись ключей

**Правило.** Если у объекта несколько одинаковых ключей, **побеждает последний**. В исходном коде
`type: "text"` стоит после `...props`, поэтому перетирает `type: "password"`.

**Исправление:** дефолты ставим **перед** `...props` (тогда пользователь может переопределить), а `className` объединяем вручную:

```javascript
function TextInput(props) {
  return {
    type: "text",
    ...props,
    className: ["form-input", props.className].filter(Boolean).join(" "),
  };
}
```

---

## Блок 6. Асинхронный JS

### Кейс 18. «Проглоченная» ошибка в `new Promise`

**Причина.** Конструктор `new Promise` ловит исключения только **синхронно** внутри функции-исполнителя.
`script.onload` вызывается позже, из очереди событий, когда исполнитель давно завершился. Выброшенная там ошибка
попадает в глобальный `Uncaught`, а сам промис так и остаётся `pending` (ни `resolve`, ни `reject` не вызваны).

```javascript
function loadCustomScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;

    script.onload = () => {
      try {
        resolve(JSON.parse("НЕВАЛИДНЫЙ_JSON"));
      } catch (error) {
        reject(error); // передаём ошибку в промис вручную
      }
    };
    script.onerror = () => reject(new Error(`Не удалось загрузить скрипт: ${src}`));

    document.head.appendChild(script);
  });
}
```

### Кейс 19. Race Condition в поиске

**Природа.** Сетевые ответы приходят не в том порядке, в котором отправлены запросы. Запрос по `"react"`
стартовал раньше, но ответил позже запроса по `"vue"` и перезаписал свежие результаты устаревшими.

**Решение.** Перед каждым новым запросом отменяем предыдущий через `AbortController`
(для отменённого `fetch` бросается `AbortError`, это штатная ситуация, а не сбой). Полный код — в `fixes.js`
(`createSearchService`) и в проверке `check.js`:

```javascript
function createSearchService() {
  let activeAbortController = null;

  return async function search(query) {
    if (activeAbortController) activeAbortController.abort(); // отменяем устаревший
    activeAbortController = new AbortController();
    const { signal } = activeAbortController;

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const results = await response.json();
      activeAbortController = null;
      return results;
    } catch (error) {
      if (error.name === "AbortError") return null; // отмена — не ошибка
      activeAbortController = null;
      throw error;
    }
  };
}
```

В React тот же приём делается в `useEffect`: `const controller = new AbortController(); … return () => controller.abort();`.

### Кейс 20. Fail-Fast у `Promise.all`

**Причина.** `Promise.all` отклоняется **сразу**, как только отклонён любой из промисов. Сбой стороннего рекламного
сервиса роняет весь `await`, и пользователь не видит ни профиль, ни баланс.
`Promise.allSettled` дожидается всех и для каждого возвращает `{ status, value | reason }`.

```javascript
async function loadFullProfilePage(userId) {
  const [userRes, balanceRes, promoRes] = await Promise.allSettled([
    fetchUserData(userId),
    fetchUserBalance(userId),
    fetchPromoBanner(), // второстепенный виджет
  ]);

  // Критичные данные: без них страница не имеет смысла
  if (userRes.status === "rejected") throw userRes.reason;
  if (balanceRes.status === "rejected") throw balanceRes.reason;

  // Второстепенные: при ошибке просто не показываем баннер
  const promo = promoRes.status === "fulfilled" ? promoRes.value : null;

  renderProfile({ user: userRes.value, balance: balanceRes.value, promo });
}
```
