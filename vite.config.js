import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        login: 'login.html',
        collector: 'collector.html',
        admin: 'admin.html',
        owner: 'owner.html',
      }
    }
  }
})
