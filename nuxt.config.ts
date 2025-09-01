// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  future: { compatibilityVersion: 4 },
  nitro: {
      prerender: { crawlLinks: true, failOnError: false },
      preset: 'digital-ocean'
  },
})
