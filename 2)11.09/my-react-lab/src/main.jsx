import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// Находим <div id="root"> из index.html и монтируем туда React-приложение
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
