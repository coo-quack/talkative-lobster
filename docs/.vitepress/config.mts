import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Talkative Lobster",
  description:
    "Desktop voice conversation app — speak to your AI and hear it respond",
  base: "/talkative-lobster/",

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "Home", link: "/" },
      { text: "Download", link: "/download" },
      { text: "Getting Started", link: "/getting-started" },
      { text: "Providers", link: "/providers" },
      { text: "GitHub", link: "https://github.com/coo-quack/talkative-lobster" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Overview", link: "/" },
          { text: "Download", link: "/download" },
          { text: "Getting Started", link: "/getting-started" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Architecture", link: "/architecture" },
          { text: "Providers", link: "/providers" },
          { text: "Configuration", link: "/configuration" },
        ],
      },
    ],

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/coo-quack/talkative-lobster",
      },
    ],

    footer: {
      message: "Talkative Lobster",
      copyright: "Copyright © 2026 coo-quack",
    },

    search: {
      provider: "local",
    },
  },

  head: [
    [
      "link",
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/talkative-lobster/logo.svg",
      },
    ],
  ],
});
