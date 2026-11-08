// ============================================================
// Раздел 1: Архитектура SPA и основы React (задачи 01–05)
// ============================================================

// ---------- Задача 01: Клиентский роутер на History API ----------
// Роутер принимает словарь маршрутов { '/path': () => 'HTML content' },
// перехватывает клики по <a>, вызывает history.pushState и подставляет HTML
// без перезагрузки страницы. Кнопки «назад/вперёд» ловим через событие popstate.
//
// window/document передаются параметрами, поэтому класс можно проверить в Node
// с «подставными» объектами (в браузере берутся настоящие).
export class ClientRouter {
  constructor(routes, { root, win = globalThis.window, doc = globalThis.document } = {}) {
    this.routes = routes;
    this.root = root; // элемент, в который монтируем содержимое страницы
    this.win = win;
    this.doc = doc;

    // Сохраняем обработчики, чтобы потом можно было снять (destroy)
    this._onClick = (event) => this.#handleClick(event);
    this._onPopState = () => this.render(this.win.location.pathname);
  }

  // Запуск: подписки + первая отрисовка текущего адреса
  start() {
    this.doc.addEventListener("click", this._onClick);
    this.win.addEventListener("popstate", this._onPopState);
    this.render(this.win.location.pathname);
    return this;
  }

  // Остановка: снимаем подписки (чтобы не было утечек памяти)
  destroy() {
    this.doc.removeEventListener("click", this._onClick);
    this.win.removeEventListener("popstate", this._onPopState);
  }

  // Переход на новый адрес без перезагрузки документа
  navigate(path) {
    this.win.history.pushState({}, "", path);
    this.render(path);
  }

  // Монтирование содержимого маршрута
  render(path) {
    const view = this.routes[path] ?? this.routes["*"] ?? (() => "<h1>404</h1>");
    this.root.innerHTML = view();
  }

  #handleClick(event) {
    // Не трогаем ctrl/cmd-клик (новая вкладка), правую кнопку и т.п.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target?.closest?.("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return; // якорь — пусть работает браузер
    if (link.target === "_blank" || link.hasAttribute("download")) return;
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return; // внешняя ссылка (http:, mailto:, //)

    event.preventDefault(); // отменяем полную перезагрузку страницы
    this.navigate(href);
  }
}

// ---------- Задача 02: Эмуляция React.createElement ----------
// Возвращает виртуальный узел { type, props: { ...props, children }, key }.
// Один дочерний элемент остаётся как есть (строка/число), без лишнего массива.
export function createVNode(type, props, ...children) {
  const { key = null, ...restProps } = props ?? {};
  const nodeProps = { ...restProps };

  if (children.length === 1) {
    nodeProps.children = children[0]; // одиночный ребёнок — не оборачиваем
  } else if (children.length > 1) {
    nodeProps.children = children;
  }

  return { type, props: nodeProps, key };
}

// ---------- Задача 03: Shallow Equal ----------
// true, если пропсы первого уровня идентичны (так React.memo решает, нужен ли ререндер).
export function shallowEqual(objA, objB) {
  if (Object.is(objA, objB)) return true;

  if (
    typeof objA !== "object" || objA === null ||
    typeof objB !== "object" || objB === null
  ) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false; // разное число ключей

  return keysA.every(
    (key) => Object.prototype.hasOwnProperty.call(objB, key) && Object.is(objA[key], objB[key])
  );
}

// ---------- Задача 04: Поднятие состояния (Lifting State Up) ----------
// Parent хранит count и колбэк onIncrement. Child получает их через пропсы
// и НЕ меняет count сам, а только вызывает колбэк родителя.
export function Child({ count, onIncrement }) {
  return {
    text: `Счётчик: ${count}`,
    click: () => onIncrement(), // вместо count++ вызываем колбэк родителя
  };
}

export function createParent(initialCount = 0) {
  let count = initialCount; // состояние живёт только здесь

  const onIncrement = () => {
    count += 1;
  };

  return {
    getCount: () => count,
    render: () => Child({ count, onIncrement }),
  };
}

// ---------- Задача 05: Рендерер виртуального дерева в строку (SSR) ----------
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img",
  "input", "link", "meta", "source", "track", "wbr",
]);
const ATTR_NAMES = { className: "class", htmlFor: "for" };

const escapeText = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s) => escapeText(s).replace(/"/g, "&quot;");

const styleToString = (style) =>
  Object.entries(style)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`)
    .join(";");

function renderAttrs(props) {
  let out = "";
  for (const [name, rawValue] of Object.entries(props)) {
    if (name === "children" || name === "key") continue; // служебные
    if (/^on[A-Z]/.test(name)) continue; // обработчики событий в HTML не пишем
    if (rawValue == null || rawValue === false) continue;

    const attr = ATTR_NAMES[name] ?? name; // className -> class
    const value =
      name === "style" && typeof rawValue === "object" ? styleToString(rawValue) : rawValue;

    out += value === true ? ` ${attr}` : ` ${attr}="${escapeAttr(value)}"`;
  }
  return out;
}

export function renderToHTML(vNode) {
  if (vNode == null || typeof vNode === "boolean") return ""; // null/false ничего не рисуют
  if (Array.isArray(vNode)) return vNode.map(renderToHTML).join("");
  if (typeof vNode === "string" || typeof vNode === "number") return escapeText(vNode);

  const { type, props = {} } = vNode;

  // Функциональный компонент: вызываем и рендерим результат
  if (typeof type === "function") return renderToHTML(type(props));

  const open = `<${type}${renderAttrs(props)}`;
  if (VOID_TAGS.has(type)) return `${open} />`;

  return `${open}>${renderToHTML(props.children)}</${type}>`;
}
