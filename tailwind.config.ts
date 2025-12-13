import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  theme: {
    extend: {
      /* ===============================
       * Colors — Checky Brand
       * =============================== */
      colors: {
        /* Primary Brand */
        primary: "#10B981", // Emerald Green

        /* Text */
        text: {
          primary: "#0F172A",
          secondary: "#475569",
          muted: "#64748B",
        },

        /* Background */
        bg: {
          main: "#FFFFFF",
          sub: "#F8FAFC",
          card: "#FFFFFF",
        },

        /* Border */
        border: {
          DEFAULT: "#E2E8F0",
        },

        /* Status */
        danger: "#EF4444",
        warningBg: "#FEF2F2",
      },

      /* ===============================
       * Typography
       * =============================== */
      fontFamily: {
        sans: [
          "Inter",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },

      fontSize: {
        /* Page / Section */
        page: ["24px", { lineHeight: "1.4", fontWeight: "600" }],
        section: ["15px", { lineHeight: "1.5", fontWeight: "600" }],

        /* Body */
        body: ["14px", { lineHeight: "1.6" }],
        meta: ["12px", { lineHeight: "1.4" }],
      },

      /* ===============================
       * Radius / Shadow
       * =============================== */
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },

      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04)",
      },
    },
  },

  plugins: [],
};

export default config;
