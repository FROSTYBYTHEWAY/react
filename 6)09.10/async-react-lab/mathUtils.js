// Этап 2: Каррирование и модульное разделение (named exports)

// 1. Каррированная фабрика проверки минимальной длины строки:
export const validateMinLength = (min) => (value) =>
  typeof value === "string" && value.length >= min
    ? { valid: true }
    : { valid: false, error: `Минимальная длина: ${min} символов` };

// 2. Каррированная фабрика проверки диапазона чисел:
export const validateRange = (min, max) => (value) => {
  return value >= min && value <= max
    ? { valid: true }
    : { valid: false, error: `Число должно быть в диапазоне от ${min} до ${max}` };
};

// Создаём специализированные валидаторы:
export const isPasswordSecure = validateMinLength(8);
export const isAgeValid = validateRange(18, 65);

// Дополнительно: каррирование на простой математике
export const multiply = (a) => (b) => a * b;
export const double = multiply(2);
