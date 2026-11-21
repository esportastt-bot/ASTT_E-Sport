import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { PollsProvider } from './contexts/PollsContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PollsProvider>
        <App />
      </PollsProvider>
    </AuthProvider>
  </StrictMode>,
)
