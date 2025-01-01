module.exports = {
  plugins: {
    'postcss-import': {},
    'tailwindcss/nesting': {},
    'preline': {},
    tailwindcss: {},
    autoprefixer: {
      flexbox: true,
      grid: true,
      overrideBrowserslist: ['last 2 versions', '> 1%'],
      features: {
        appearance: true,
        'custom-properties': true,
        'nesting-rules': true
      }
    },
  }
}
