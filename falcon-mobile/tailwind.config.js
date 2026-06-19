/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'sgvu-navy': '#08234a',
        'sgvu-gold': '#d6b65d',
        'sgvu-gold-hover': '#c5a64f',
        'sgvu-surface': '#f4f7fb',
      },
    },
  },
  plugins: [],
};
