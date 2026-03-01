export default {
  build: {
    sourcemap: true,
  },
  server: {
    proxy: {
      '/cgi-bin': {
        target: 'https://pskreporter.info',
        changeOrigin: true,
      },
      '/api': {
        target: 'https://pskreporter.info',
        changeOrigin: true,
      }
    }
  }
}
