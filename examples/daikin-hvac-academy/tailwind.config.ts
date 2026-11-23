import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 50: "#eef3fa", 100: "#d5e0f0", 200: "#a9bfe0", 300: "#7799cc", 400: "#4a73b3", 500: "#2d5694", 600: "#1f4177", 700: "#173362", 800: "#0f2548", 900: "#0a1a35", 950: "#06101f" },
        steel: { 50: "#f5f7f9", 100: "#e8ecf0", 200: "#d3d9e0", 300: "#b4bec9", 400: "#8d9aa9", 500: "#6c7a8a", 600: "#546070", 700: "#414b58", 800: "#2c333c", 900: "#1b2026" },
        accent: { DEFAULT: "#00a0e4", dark: "#0079b0" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "Segoe UI", "Tahoma", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
