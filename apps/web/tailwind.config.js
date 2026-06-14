const { heroui } = require("@heroui/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  plugins: [
    heroui({
      defaultTheme: "dark",
      themes: {
        dark: {
          colors: {
            background: "#0a0a0a",
            foreground: "#ededed",
            divider: "rgba(255,255,255,0.1)",
            focus: "#4d9970",
            content1: "#141414",
            content2: "#1e1e1e",
            content3: "#262626",
            content4: "#2e2e2e",
            primary: {
              "50": "#0f2d1e",
              "100": "#15402b",
              "200": "#1f5f3e",
              "300": "#2a7d53",
              "400": "#3a9468",
              "500": "#4aab7c",
              "600": "#5fbc8e",
              "700": "#7fcaa5",
              "800": "#a3d9bf",
              "900": "#ccebd8",
              DEFAULT: "#3d7a52",
              foreground: "#ffffff",
            },
            secondary: {
              DEFAULT: "#484848",
              foreground: "#ededed",
            },
          },
        },
      },
    }),
  ],
};
