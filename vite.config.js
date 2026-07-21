import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      // Di sini kita daftarin semua halaman HTML lo biar ikut ke-deploy
      input: {
        main: 'index.html',
        login: 'login.html',
        coach: 'coach.html',
        siswa: 'siswa.html'
        // Kalau nanti lo bikin file event.html atau training.html, tambahin juga di sini ya
      }
    }
  }
})
