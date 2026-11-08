// ============================================================
// Раздел 4: Массивы — map, filter, find, reduce (16–20)
// ============================================================

// ---------- Задача 16: Форматирование витрины товаров (.map) ----------
const priceFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export const formatShowcase = (products) =>
  products.map((product) => ({
    ...product, // исходные объекты не трогаем
    displayPrice: priceFormatter.format(product.price), // "150 000 ₽"
    isOrderable: product.inStock && product.price > 0,
  }));

// ---------- Задача 17: Комбинированный фильтр каталога (.filter) ----------
// Каждый критерий необязателен: если он не задан — не фильтруем по нему.
export const filterCatalog = (items, { category, maxPrice, onlyInStock } = {}) =>
  items.filter(
    (item) =>
      (category === undefined || item.category === category) &&
      (maxPrice === undefined || item.price <= maxPrice) &&
      (!onlyInStock || item.inStock)
  );

// ---------- Задача 18: Переключение флага в массиве объектов (.map) ----------
export const toggleTodoStatus = (todos, todoId) =>
  todos.map((todo) => (todo.id === todoId ? { ...todo, done: !todo.done } : todo));

// ---------- Задача 19: Группировка по категориям (.reduce) ----------
export const groupProductsByCategory = (items) =>
  items.reduce((groups, item) => {
    (groups[item.category] ??= []).push(item); // создаём массив при первом товаре категории
    return groups;
  }, {});

// ---------- Задача 20: Дедупликация по ключу ----------
// Сохраняем первое вхождение. Set даёт проверку за O(1), весь проход — O(N).
export function uniqueBy(array, key) {
  const seen = new Set();
  return array.filter((item) => {
    if (seen.has(item[key])) return false;
    seen.add(item[key]);
    return true;
  });
}
