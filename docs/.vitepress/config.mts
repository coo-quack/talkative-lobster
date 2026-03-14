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
      { text: "Install", link: "/install" },
      { text: "Providers", link: "/providers" },
      { text: "Changelog", link: "/changelog" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/getting-started" },
          { text: "Download", link: "/download" },
          { text: "Installation", link: "/install" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Providers", link: "/providers" },
          { text: "Configuration", link: "/configuration" },
          { text: "Architecture", link: "/architecture" },
        ],
      },
      {
        text: "Support",
        items: [
          { text: "Troubleshooting", link: "/troubleshooting" },
          { text: "Contributing", link: "/contributing" },
          { text: "Changelog", link: "/changelog" },
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
