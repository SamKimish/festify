import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/festify/").
// Locally and on Netlify / kimish.co.uk the app is served from the root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // 404.html is served by GitHub Pages for any unknown URL.
  build: { rollupOptions: { input: { main: 'index.html', notFound: '404.html' } } },
  // Spotify no longer accepts "localhost" redirect URIs, only 127.0.0.1.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
