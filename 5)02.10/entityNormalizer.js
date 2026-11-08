import { pathToFileURL } from "node:url";
// Задача 2: Нормализация реляционных данных (byId & allIds)
// Массив с сервера -> словарь для доступа за O(1) и атомарных апдейтов.

// Сырые данные с REST API:
export const rawServerUsers = [
  { id: "u1", name: "Анна", status: "active" },
  { id: "u2", name: "Борис", status: "pending" },
  { id: "u3", name: "Вера", status: "offline" },
];

// 1. Превращение массива в нормализованную структуру через Object.fromEntries
export const normalize = (users) => ({
  byId: Object.fromEntries(users.map((u) => [u.id, u])),
  allIds: users.map((u) => u.id),
});

// 2. Мгновенное обновление статуса юзера за O(1) через Spread вычисляемого свойства
export function patchUserStatus(state, userId, nextStatus) {
  if (!state.byId[userId]) return state; // такого юзера нет — ничего не меняем

  return {
    ...state,
    byId: {
      ...state.byId,
      [userId]: { ...state.byId[userId], status: nextStatus },
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const normalizedUsers = normalize(rawServerUsers);
  const updatedNormalized = patchUserStatus(normalizedUsers, "u2", "active");

  console.log("Юзер u2:", updatedNormalized.byId["u2"]);
  // { id: 'u2', name: 'Борис', status: 'active' }
  console.log(
    "Юзер u1 остался неизменен:",
    updatedNormalized.byId["u1"] === normalizedUsers.byId["u1"]
  ); // true
}
