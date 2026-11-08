import { pathToFileURL } from "node:url";
// Задача 4: Паттерн Undo / Redo через иммутабельные снимки
// Иммутабельность позволяет хранить историю просто как ссылки на
// предыдущие снимки стейта в массивах past и future.

export function createHistoryContainer(initialState) {
  let history = { past: [], present: initialState, future: [] };

  return {
    getState: () => history.present,

    // Переход к новому состоянию:
    set: (newPresent) => {
      history = {
        past: [...history.past, history.present],
        present: newPresent,
        future: [], // Сбрасываем future при новом действии
      };
    },

    // Шаг назад (Undo):
    undo: () => {
      if (history.past.length === 0) return;
      const previous = history.past[history.past.length - 1];
      const newPast = history.past.slice(0, history.past.length - 1);
      history = {
        past: newPast,
        present: previous,
        future: [history.present, ...history.future],
      };
    },

    // Шаг вперёд (Redo):
    redo: () => {
      if (history.future.length === 0) return;
      const next = history.future[0];
      const newFuture = history.future.slice(1);
      history = {
        past: [...history.past, history.present],
        present: next,
        future: newFuture,
      };
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Тестирование:
  const doc = createHistoryContainer({ text: "Версия 1", fontSize: 14 });
  doc.set({ text: "Версия 2", fontSize: 16 });
  doc.set({ text: "Версия 3", fontSize: 18 });

  doc.undo();
  console.log("После Undo:", doc.getState().text); // "Версия 2"

  doc.redo();
  console.log("После Redo:", doc.getState().text); // "Версия 3"
}
