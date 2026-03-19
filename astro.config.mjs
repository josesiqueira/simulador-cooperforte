// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://josesiqueira.github.io',
  base: '/simulador-cooperforte',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
