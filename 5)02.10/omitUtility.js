import { pathToFileURL } from "node:url";
// Задача 3: Исключение полей (Omit Keys) и фильтрация DOM-пропсов
// Проблема React: кастомный prop (например isSpecial) на нативном теге даёт
// предупреждение "React does not recognize the `isSpecial` prop on a DOM element".

// Универсальная функция исключения списка ключей из объекта
export function omit(obj, keysToOmit) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (!keysToOmit.includes(key)) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

// Тестовые пропсы, пришедшие в UI-компонент:
export const rawButtonProps = {
  label: "Отправить",
  onClick: () => {},
  variant: "primary", // Кастомный prop (не для DOM)
  isElevated: true, // Кастомный prop (не для DOM)
  disabled: false,
  "aria-label": "Submit form",
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // 1. Быстрое извлечение конкретных полей через Rest в компоненте:
  const { variant, isElevated, label, ...safeDomProps } = rawButtonProps;
  console.log("Безопасные DOM атрибуты (Rest):", safeDomProps);
  // { onClick: [Function], disabled: false, 'aria-label': 'Submit form' }

  // 2. Или динамический omit по списку:
  const cleanDomAttributes = omit(rawButtonProps, ["variant", "isElevated", "label"]);
  console.log("Безопасные DOM атрибуты (omit):", cleanDomAttributes);
}
