// Учебная «сборка»: копирует src/ в dist/
import { cpSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
cpSync("src", "dist", { recursive: true });
console.log("✓ Сборка завершена: src/ -> dist/");
