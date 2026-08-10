/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0a0a0a',
          card: '#111111',
          hover: '#1a1a1a',
          border: '#222222',
        },
        brand: {
          DEFAULT: '#D40000',
          hover: '#a80000',
          300: '#ff6b6b',
          400: '#ff4040',
          500: '#D40000',
          600: '#D40000',
          700: '#a80000',
          900: '#4d0000',
        },
      },
    },
  },
  plugins: [],
};
