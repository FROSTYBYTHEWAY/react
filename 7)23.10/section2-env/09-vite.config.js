// Задача 09: Настройка абсолютных импортов в Vite
// В проекте этот файл называется vite.config.js (лежит в корне рядом с package.json).
// Теперь вместо  import X from "../../components/X"  можно писать  import X from "@/components/X".
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

// В ES-модулях нет __dirname, поэтому вычисляем его сами
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
