// ============================================================
// Раздел 3: Память, переменные, области видимости и замыкания (11–15)
// ============================================================

// ---------- Задача 11: Рекурсивный Deep Freeze ----------
// Object.freeze замораживает только первый уровень, поэтому обходим вложенные
// объекты рекурсивно. WeakSet защищает от зацикливания на циклических ссылках.
export function deepFreeze(object, seen = new WeakSet()) {
  if (object === null || typeof object !== "object" || seen.has(object)) return object;
  seen.add(object);

  for (const key of Reflect.ownKeys(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if ("value" in descriptor) deepFreeze(descriptor.value, seen); // геттеры не вызываем
  }

  return Object.freeze(object);
}

// ---------- Задача 12: Фабрика счётчиков с изолированным состоянием ----------
// Переменная count живёт в замыкании: снаружи до неё не добраться.
export function createCounter(initialValue = 0, step = 1) {
  let count = initialValue;

  return {
    inc() {
      count += step;
      return count;
    },
    dec() {
      count -= step;
      return count;
    },
    reset() {
      count = initialValue;
      return count;
    },
    get() {
      return count;
    },
  };
}

// ---------- Задача 13: Универсальный мемоизатор ----------
// Кэшируем результаты по ключу — сериализованным аргументам.
// BigInt и undefined JSON.stringify не умеет, поэтому добавлен replacer.
// (Ограничение: функции/Symbol как аргументы не различаются.)
const serializeArgs = (args) =>
  JSON.stringify(args, (_key, value) => {
    if (typeof value === "bigint") return `${value}n`;
    if (value === undefined) return "__undefined__";
    return value;
  });

export function memoize(fn) {
  const cache = new Map();

  const memoized = function (...args) {
    const key = serializeArgs(args);
    if (cache.has(key)) return cache.get(key); // попадание в кэш
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };

  memoized.clear = () => cache.clear();
  memoized.size = () => cache.size;
  return memoized;
}

// ---------- Задача 14: Каррированная фабрика валидаторов ----------
// createValidator(ruleName, param) -> функция (строка) -> { isValid, message }
const ok = { isValid: true, message: "" };
const fail = (message) => ({ isValid: false, message });

const RULES = {
  required: () => (v) => (v.trim().length > 0 ? ok : fail("Поле обязательно для заполнения")),
  minLength: (n) => (v) => (v.length >= n ? ok : fail(`Минимум ${n} символов`)),
  maxLength: (n) => (v) => (v.length <= n ? ok : fail(`Максимум ${n} символов`)),
  pattern: (re) => (v) => (re.test(v) ? ok : fail("Неверный формат")),
  email: () => (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? ok : fail("Введите корректный email")),
};

export function createValidator(ruleName, param) {
  const makeRule = RULES[ruleName];
  if (!makeRule) throw new Error(`Неизвестное правило валидации: ${ruleName}`);

  const check = makeRule(param); // «запоминаем» параметр (каррирование)
  return (value) => check(String(value ?? ""));
}

// ---------- Задача 15: Безопасный экстрактор с fallback ----------
// ?. не даёт упасть с TypeError, ?? подставляет запасное значение
// (только для null/undefined — пустая строка и 0 останутся как есть).
export const getNestedValue = (data, fallback) =>
  data?.payload?.user?.settings?.theme ?? fallback;
