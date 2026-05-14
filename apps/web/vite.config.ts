import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all interfaces so http://<tailscale-ip>:5173 works; use with Tailscale Serve / tailnet access.
    host: true,
    // Allow MagicDNS hostnames (e.g. https://…ts.net via `tailscale serve`) without Vite dropping the request.
    allowedHosts: true,
    proxy: {
      '^/(cases|config|health|docs|openapi\\.json)': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
