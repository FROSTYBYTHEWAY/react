import { useState } from "react";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      {/* Шаг 7 практики (HMR): текст заголовка заменён с "Vite + React" */}
      <h1>Окружение React настроено идеально!</h1>
      <div className="card">
        <button onClick={() => setCount((c) => c + 1)}>
          Счётчик кликов: {count}
        </button>
        <p>
          Измени текст в <code>src/App.jsx</code> и сохрани файл — страница
          обновится мгновенно, а счётчик сохранит значение (HMR).
        </p>
      </div>
    </div>
  );
}

export default App;
