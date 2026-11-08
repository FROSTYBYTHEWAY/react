// Этап 3: Создание Promise вручную с эмуляцией задержек сети

// Утилита задержки на базе Promise:
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Мок-функция сетевого запроса с эмуляцией сбоев (Failure Rate):
export async function mockFetchUser(userId, { shouldFail = false, delayMs = 500 } = {}) {
  await delay(delayMs);

  if (shouldFail) {
    throw new Error(`[500 Server Error] Не удалось загрузить пользователя ID: ${userId}`);
  }

  return {
    id: userId,
    name: `Пользователь #${userId}`,
    role: userId === "u1" ? "admin" : "developer",
    loadedAt: new Date().toLocaleTimeString(),
  };
}

export default mockFetchUser;
