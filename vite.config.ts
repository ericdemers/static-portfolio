import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    // Down-level the CSS for old Safari. Tailwind v4 emits oklch() colors and
    // color-mix() that an old iPad (iPad 6th gen tops out at iOS/Safari 15.6)
    // can't paint, so every background went white. Lightning CSS rewrites those
    // to rgb()/hex fallbacks at build time. No visual change for modern browsers
    // — the fallbacks are the in-gamut sRGB equivalents.
    transformer: 'lightningcss',
    lightningcss: {
      // Safari 15.6 encoded as major<<16 | minor<<8. Output stays valid for all
      // newer browsers too.
      targets: { safari: (15 << 16) | (6 << 8) },
    },
  },
  build: {
    cssMinify: 'lightningcss',
    // Transpile JS to the same baseline so the bundle runs on Safari 15 too.
    target: ['es2020', 'safari15'],
  },
})
