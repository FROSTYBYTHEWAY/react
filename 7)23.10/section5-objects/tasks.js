// ============================================================
// Раздел 5: Объекты, деструктуризация, Spread и Rest (21–25)
// ============================================================

// ---------- Задача 21: Трёхуровневое иммутабельное обновление ----------
// Инвертируем state.user.profile.notifications.email. Новые ссылки получают
// все родители по цепочке до корня, а state.posts остаётся с прежней ссылкой.
export const toggleEmailNotification = (state) => ({
  ...state,
  user: {
    ...state.user,
    profile: {
      ...state.user.profile,
      notifications: {
        ...state.user.profile.notifications,
        email: !state.user.profile.notifications.email,
      },
    },
  },
});

// ---------- Задача 22: Исключение кастомных пропсов (Omit Props) ----------
// Возвращает объект без кастомных ключей — его безопасно отдать нативному тегу.
export function extractDomProps(allProps, customKeysArray) {
  const custom = new Set(customKeysArray);
  return Object.fromEntries(Object.entries(allProps).filter(([key]) => !custom.has(key)));
}

// ---------- Задача 23: Рекурсивный Deep Merge ----------
// Вложенные объекты объединяются, а не затираются. Массивы и примитивы
// из source заменяют значения из target. Ключи __proto__/constructor/prototype
// пропускаем (защита от prototype pollution).
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function deepMerge(target, source) {
  const output = { ...target };

  for (const key of Object.keys(source)) {
    if (UNSAFE_KEYS.has(key)) continue;

    output[key] =
      isPlainObject(source[key]) && isPlainObject(target[key])
        ? deepMerge(target[key], source[key]) // оба объекты — сливаем глубже
        : source[key]; // иначе берём значение из source
  }

  return output;
}

// ---------- Задача 24: Нормализатор сущностей (byId & allIds) ----------
// Эталонное решение из условия.
/**
 * Преобразует плоский массив в нормализованную структуру.
 * @param {Array<{ id: string }>} array
 * @returns {{ byId: Record<string, Object>, allIds: string[] }}
 */
export function normalizeEntities(array) {
  if (!Array.isArray(array)) {
    throw new TypeError("Входной параметр должен быть массивом");
  }

  return {
    byId: Object.fromEntries(array.map((item) => [item.id, { ...item }])),
    allIds: array.map((item) => item.id),
  };
}

/**
 * Точечно обновляет поля сущности за O(1) с сохранением ссылочной целостности.
 */
export function patchEntityById(state, id, patch) {
  const currentEntity = state.byId[id];

  // Если сущности нет в словаре, возвращаем стейт без изменений
  if (!currentEntity) {
    console.warn(`Сущность с ID "${id}" не найдена.`);
    return state;
  }

  return {
    ...state,
    byId: {
      ...state.byId,
      [id]: {
        ...currentEntity,
        ...patch,
        updatedAt: Date.now(),
      },
    },
    // allIds не изменился — сохраняем старую ссылку на массив!
  };
}

/**
 * Удаляет сущность из словаря и индексного массива.
 */
export function removeEntityById(state, idToDelete) {
  if (!state.byId[idToDelete]) {
    return state;
  }

  // Деструктуризация с Rest для удаления ключа без мутации исходного объекта
  const { [idToDelete]: removed, ...remainingById } = state.byId;

  return {
    byId: remainingById,
    allIds: state.allIds.filter((id) => id !== idToDelete),
  };
}

// ---------- Задача 25: Обработчик формы с вычисляемыми ключами ----------
// [fieldName]: значение — ключ берётся из переменной. Без квадратных скобок
// создался бы буквальный ключ "fieldName".
export const updateFormState = (prevState, fieldName, fieldValue) => ({
  ...prevState,
  [fieldName]: fieldValue,
});
