/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { StrictMode } from 'react'
import {createRoot} from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './src/components/App.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key")
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY} 
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      appearance={{
        elements: {
          formButtonPrimary: {
            fontSize: '14px',
            textTransform: 'none',
            backgroundColor: '#007AFF',
            '&:hover': {
              backgroundColor: '#0056CC'
            }
          }
        }
      }}
    >
      <App />
    </ClerkProvider>
  </StrictMode>
)
