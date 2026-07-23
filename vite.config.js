import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        login: 'login.html',
        coach: 'coach.html',
        siswa: 'siswa.html',
        parent: 'parent.html' // <-- Tambahin ini
      }
    }
  }
})
