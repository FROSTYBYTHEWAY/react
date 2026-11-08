// Тестирование строгой ссылочной изоляции стейта
// Запуск: node advanced-state-test.js
import assert from "node:assert/strict";
import { appState, updateNotificationSettings } from "./deepUpdateReducer.js";
import { normalize, patchUserStatus, rawServerUsers } from "./entityNormalizer.js";
import { omit, rawButtonProps } from "./omitUtility.js";
import { createHistoryContainer } from "./undoRedoEngine.js";
import { deepMerge } from "./deepMerge.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

check("Deep Immutable State Transition: PASSED (New Root Ref, Isolated Sub-Tree)", () => {
  const next = updateNotificationSettings(appState, "dark", true);
  assert.notEqual(next, appState); // новый корень
  assert.notEqual(next.user, appState.user); // новая ветка user
  assert.equal(next.posts, appState.posts); // posts — та же ссылка
  assert.equal(next.user.profile.settings.theme, "dark");
  assert.equal(next.user.profile.settings.notifications.push, true);
  assert.equal(next.user.profile.settings.notifications.email, true); // соседнее поле цело
  assert.equal(appState.user.profile.settings.theme, "light"); // исходник не мутирован
});

check("Normalized Dictionary Merge: PASSED (O(1) Access Matrix)", () => {
  const norm = normalize(rawServerUsers);
  assert.deepEqual(norm.allIds, ["u1", "u2", "u3"]);
  const upd = patchUserStatus(norm, "u2", "active");
  assert.equal(upd.byId.u2.status, "active");
  assert.equal(upd.byId.u1, norm.byId.u1); // u1 не тронут
  assert.equal(norm.byId.u2.status, "pending"); // исходник не мутирован
  assert.equal(patchUserStatus(norm, "nope", "x"), norm); // нет юзера — тот же стейт
});

check("Dynamic Schema Form Extraction: PASSED (Rest Props Filtered)", () => {
  const { variant, isElevated, label, ...safe } = rawButtonProps;
  const viaOmit = omit(rawButtonProps, ["variant", "isElevated", "label"]);
  assert.deepEqual(Object.keys(safe), ["onClick", "disabled", "aria-label"]);
  assert.deepEqual(Object.keys(viaOmit), Object.keys(safe));
});

check("Undo / Redo Engine: PASSED (Immutable Snapshots)", () => {
  const doc = createHistoryContainer({ text: "Версия 1" });
  doc.set({ text: "Версия 2" });
  doc.set({ text: "Версия 3" });
  doc.undo();
  assert.equal(doc.getState().text, "Версия 2");
  doc.redo();
  assert.equal(doc.getState().text, "Версия 3");
  doc.undo();
  doc.set({ text: "Ветка" }); // новое действие сбрасывает future
  doc.redo(); // ничего не должно произойти
  assert.equal(doc.getState().text, "Ветка");
});

check("Deep Merge: PASSED (host не пропал)", () => {
  const merged = deepMerge(
    { api: { host: "api.site.com", port: 443, ssl: true }, ui: { theme: "system" } },
    { api: { port: 8080, ssl: false } }
  );
  assert.deepEqual(merged.api, { host: "api.site.com", port: 8080, ssl: false });
  assert.deepEqual(merged.ui, { theme: "system" });
});

console.log(`\nГотово: ${passed} проверок пройдено`);
