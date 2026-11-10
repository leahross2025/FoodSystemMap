// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "https://lacofsfoodsystemmap.lross.workers.dev",
  integrations: [mdx(), sitemap({ filter: (page) => !/\/(data-check|failed)\/?$/.test(page) })],
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
