// Практическая работа №3 — Основы современного JavaScript для React
// Запуск: node practice.js

// ============ 2. Стрелочные функции и неявный возврат объектов ============

// 1. Стрелочная функция с неявным возвратом форматированной строки
const formatCurrency = (amount, currency = "RUB") =>
  `${amount.toLocaleString("ru-RU")} ${currency}`;

// 2. Неявный возврат объекта: круглые скобки ({ ... }) обязательны!
// Без них движок JS решит, что { } — это тело функции, а не объект.
const createProduct = (id, title, price) => ({
  id,
  title,
  price,
  formattedPrice: formatCurrency(price),
  inStock: true,
});

console.log("--- 2. Стрелочные функции ---");
console.log(formatCurrency(150000)); // "150 000 RUB"
console.log(createProduct(101, "MacBook Air M3", 125000));

// ============ 3. Деструктуризация объектов и массивов ============

// Входной объект (аналог props компонента)
const incomingProps = {
  id: "btn-42",
  label: "Оформить заказ",
  variant: "success",
  config: { timeout: 3000 },
};

// Извлекаем поля: variant с дефолтом, timeout из вложенного объекта
function renderButtonProps({ label, variant = "primary", config: { timeout } }) {
  console.log(`Кнопка: "${label}" | Стиль: ${variant} | Таймаут: ${timeout}мс`);
}

console.log("\n--- 3. Деструктуризация ---");
renderButtonProps(incomingProps);

// Деструктуризация массива (эмуляция хука useState)
function mockUseState(initialValue) {
  let val = initialValue;
  const setter = (newVal) => {
    val = newVal;
  };
  return [val, setter];
}

const [currentCount, setCount] = mockUseState(10);
console.log("Начальный счетчик:", currentCount); // 10

// ============ 4. Spread и Rest: иммутабельное обновление ============

const initialUser = { id: 1, name: "Алексей", role: "Junior Developer" };

// 1. Создаём нового пользователя с обновлённой должностью через Spread
const promotedUser = {
  ...initialUser,
  role: "Middle React Developer",
  updatedAt: Date.now(),
};

// 2. Проверяем ссылочную идентичность (так делает React, Object.is)
console.log("\n--- 4. Spread и Rest ---");
console.log("Ссылки равны?", initialUser === promotedUser); // false
console.log("Исходный объект остался цел:", initialUser.role); // "Junior Developer"

// 3. Сбор остаточных пропсов (Rest)
const { id, role, ...displayData } = promotedUser;
console.log("Остаточные свойства (Rest):", displayData); // { name, updatedAt }

// ============ 5. Иммутабельные операции с массивами ============

const initialCart = [
  { id: 1, name: "Клавиатура", price: 4000, quantity: 1 },
  { id: 2, name: "Мышь", price: 2500, quantity: 2 },
  { id: 3, name: "Коврик", price: 1000, quantity: 1 },
];

// А. ДОБАВЛЕНИЕ → Spread в новый массив
const newItem = { id: 4, name: "Наушники", price: 6000, quantity: 1 };
const cartAfterAdd = [...initialCart, newItem];

// Б. УДАЛЕНИЕ → .filter() по ID
const removeId = 2; // Удаляем мышь
const cartAfterDelete = cartAfterAdd.filter((item) => item.id !== removeId);

// В. ИЗМЕНЕНИЕ → .map() с проверкой ID
const targetId = 1; // Увеличиваем количество клавиатур до 2
const cartAfterUpdate = cartAfterDelete.map((item) =>
  item.id === targetId ? { ...item, quantity: item.quantity + 1 } : item
);

// Г. ПОДСЧЁТ ИТОГА → .reduce()
const totalPrice = cartAfterUpdate.reduce(
  (acc, item) => acc + item.price * item.quantity,
  0
);

console.log("\n--- 5. Массивы ---");
console.log("Итоговая корзина:", cartAfterUpdate);
console.log(`Общая сумма: ${totalPrice} руб.`); // 15000
console.log("Исходная корзина не изменилась:", initialCart.length, "товара");
