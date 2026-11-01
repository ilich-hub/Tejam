import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Shop from './Shop.jsx'
import './styles.css'

// Второй вход для магазинов: ссылка вида https://ваш-сайт/?mode=shop (отдельное Mini App в BotFather).
const isShop = new URLSearchParams(window.location.search).get('mode') === 'shop'
  || window.Telegram?.WebApp?.initDataUnsafe?.start_param === 'shop'

createRoot(document.getElementById('root')).render(isShop ? <Shop /> : <App />)
