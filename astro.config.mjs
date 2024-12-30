import { defineConfig } from 'astro/config';

import icon from 'astro-icon';

export default defineConfig({
  site: 'https://dalctf.github.io/',
  integrations: [icon()],
  vite: {
    server: {
      watch: {
        ignored: ["**/_*/**/*"],
      },
    },
  },
});