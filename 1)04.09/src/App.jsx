import { useState } from 'react'
import './App.css'

// Компонент-карточка товара (Props)
function ProductCard({ title, price, isStock }) {
  return (
    <div className="card" style={{ border: '1px solid #ccc', padding: '16px', margin: '10px 0', borderRadius: '8px' }}>
      <h3>{title}</h3>
      <p>Цена: {price} руб.</p>
      <span style={{ color: isStock ? 'green' : 'orange' }}>
        {isStock ? '✓ В наличии' : 'Под заказ'}
      </span>
    </div>
  )
}

// Счётчик (useState)
function Counter() {
  const [count, setCount] = useState(0)

  function handleIncrement() {
    setCount(count + 1)
  }

  function handleReset() {
    setCount(0)
  }

  return (
    <div style={{ padding: '20px', background: '#F1F5F9', borderRadius: '8px', margin: '20px 0' }}>
      <h2>Текущий счёт: {count}</h2>
      <button onClick={handleIncrement}>+ Увеличить</button>
      <button onClick={handleReset} style={{ marginLeft: '10px' }}>Сбросить</button>
    </div>
  )
}

// Форма (Controlled Inputs)
function SimpleForm() {
  const [name, setName] = useState('')
  const [submittedText, setSubmittedText] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setSubmittedText(`Привет, ${name}! Форма успешно отправлена.`)
    setName('')
  }

  return (
    <form onSubmit={handleSubmit} style={{ margin: '20px 0' }}>
      <label>Ваше имя: </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Введите имя..."
        style={{ margin: '0 10px', padding: '6px' }}
      />
      <button type="submit">Отправить</button>
      {submittedText && (
        <p style={{ color: 'green', marginTop: '10px' }}>{submittedText}</p>
      )}
    </form>
  )
}

// Список задач (.map + key)
function TodoList() {
  const tasks = [
    { id: 1, text: 'Установить Node.js и Vite' },
    { id: 2, text: 'Понять пропсы и состояние' },
    { id: 3, text: 'Собрать своё первое SPA' },
  ]

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>{task.text}</li>
      ))}
    </ul>
  )
}

// Главный компонент — мини-SPA с переключением вкладок
function App() {
  const [currentTab, setCurrentTab] = useState('home')

  return (
    <div className="app-wrap" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ textAlign: 'center' }}>Мой первый SPA на React</h1>

      {/* Навигационное меню */}
      <nav style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center' }}>
        <button
          onClick={() => setCurrentTab('home')}
          style={{ padding: '8px 16px', cursor: 'pointer', background: currentTab === 'home' ? '#3b82f6' : '#e5e7eb', color: currentTab === 'home' ? 'white' : 'black', border: 'none', borderRadius: '6px' }}
        >
          Главная
        </button>
        <button
          onClick={() => setCurrentTab('products')}
          style={{ padding: '8px 16px', cursor: 'pointer', background: currentTab === 'products' ? '#3b82f6' : '#e5e7eb', color: currentTab === 'products' ? 'white' : 'black', border: 'none', borderRadius: '6px' }}
        >
          Каталог
        </button>
        <button
          onClick={() => setCurrentTab('contact')}
          style={{ padding: '8px 16px', cursor: 'pointer', background: currentTab === 'contact' ? '#3b82f6' : '#e5e7eb', color: currentTab === 'contact' ? 'white' : 'black', border: 'none', borderRadius: '6px' }}
        >
          Контакты
        </button>
        <button
          onClick={() => setCurrentTab('demo')}
          style={{ padding: '8px 16px', cursor: 'pointer', background: currentTab === 'demo' ? '#3b82f6' : '#e5e7eb', color: currentTab === 'demo' ? 'white' : 'black', border: 'none', borderRadius: '6px' }}
        >
          Демо-компоненты
        </button>
      </nav>

      {/* Условный рендеринг нужного экрана */}
      {currentTab === 'home' && (
        <section>
          <h2>Добро пожаловать на Главную страницу</h2>
          <p>Это SPA работает без единой перезагрузки окна!</p>
          <p>Переключайте вкладки выше — страница не перезагружается.</p>
        </section>
      )}

      {currentTab === 'products' && (
        <section>
          <h2>Наши продукты</h2>
          <p>Здесь отображается список товаров из массива данных (Props).</p>
          <ProductCard title="Смартфон" price={45000} isStock={true} />
          <ProductCard title="Ноутбук" price={85000} isStock={false} />
          <ProductCard title="Наушники" price={5000} isStock={true} />
        </section>
      )}

      {currentTab === 'contact' && (
        <section>
          <h2>Свяжитесь с нами</h2>
          <p>Телефон: +7 (999) 988-08-68</p>
          <p>Email: hello@example.com</p>
          <SimpleForm />
        </section>
      )}

      {currentTab === 'demo' && (
        <section>
          <h2>Демонстрация ключевых концепций React</h2>
          
          <h3>1. useState — Счётчик</h3>
          <Counter />

          <h3>2. Списки и .map() + key</h3>
          <TodoList />

          <h3>3. Управляемая форма</h3>
          <SimpleForm />
        </section>
      )}
    </div>
  )
}

export default App
