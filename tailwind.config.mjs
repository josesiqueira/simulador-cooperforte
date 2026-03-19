/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        cooperforte: {
          50: '#e6f9ee',
          100: '#b3efd0',
          200: '#80e5b2',
          300: '#4ddb94',
          400: '#26d37d',
          DEFAULT: '#00A651',
          500: '#00A651',
          600: '#009548',
          700: '#008C45',
          800: '#006b35',
          900: '#004a24',
        },
        'cooperforte-dark': '#008C45',
      },
    },
  },
  plugins: [],
};
