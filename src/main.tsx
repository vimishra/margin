import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './styles.css'
import App from './App'
import { applyAppearance, applyTheme } from './store'

applyTheme()
applyAppearance()
createRoot(document.getElementById('root')!).render(<App />)
