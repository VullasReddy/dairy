import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider, CartProvider, SiteProvider, ToastProvider } from './context'
import { ConfirmProvider } from './components/Confirm'
import { LocationProvider } from './components/Location'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/poppins/500-italic.css'
import '@fontsource/poppins/600-italic.css'
import '@fontsource/lora/600.css'
import '@fontsource/lora/700.css'
import '@fontsource/kaushan-script/400.css'
import './styles/global.css'
import './styles/app.css'
import './styles/tailwind.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SiteProvider>
          <AuthProvider>
            <CartProvider>
              <ConfirmProvider>
                <LocationProvider>
                  <App />
                </LocationProvider>
              </ConfirmProvider>
            </CartProvider>
          </AuthProvider>
        </SiteProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
