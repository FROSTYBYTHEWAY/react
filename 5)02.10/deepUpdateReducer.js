import { pathToFileURL } from "node:url";
// Задача 1: Глубокое 3-уровневое обновление стейта без мутаций
// Меняем объект на 3-м уровне и создаём НОВЫЕ ссылки для всех его родителей
// до корня, а соседние ветки (posts) оставляем с прежними ссылками.

export const appState = {
  user: {
    id: "u100",
    profile: {
      firstName: "Иван",
      settings: {
        theme: "light",
        notifications: { email: true, push: false },
      },
    },
  },
  posts: ["post_1", "post_2"], // Соседняя ветка
};

// Обновить settings.notifications.push и theme с сохранением ссылочной целостности
export function updateNotificationSettings(state, newTheme, pushStatus) {
  return {
    ...state,
    user: {
      ...state.user,
      profile: {
        ...state.user.profile,
        settings: {
          ...state.user.profile.settings,
          theme: newTheme,
          notifications: {
            ...state.user.profile.settings.notifications,
            push: pushStatus,
          },
        },
      },
    },
  };
}

// Запуск файла напрямую: node deepUpdateReducer.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nextState = updateNotificationSettings(appState, "dark", true);

  // ПРОВЕРКА ССЫЛОК (критично для React.memo и селекторов Redux):
  console.log("1. Корень изменился:", appState !== nextState); // true
  console.log("2. Ветка user изменилась:", appState.user !== nextState.user); // true
  console.log(
    "3. Ветка posts СОХРАНИЛА ссылку:",
    appState.posts === nextState.posts
  ); // true (ререндера постов не будет!)
}
