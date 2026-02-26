/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      colors: {
        // Neon palette — used throughout the aggressive dark theme
        "neon-green":   "#39FF14",
        "neon-purple":  "#BF00FF",
        "neon-fuchsia": "#FF00FF",
        "neon-cyan":    "#00F5FF",
        "neon-orange":  "#FF6A00",
      },
      boxShadow: {
        "neon-fuchsia": "0 0 20px rgba(232,121,249,0.45), 0 0 40px rgba(232,121,249,0.15)",
        "neon-purple":  "0 0 20px rgba(168,85,247,0.45), 0 0 40px rgba(168,85,247,0.15)",
        "neon-orange":  "0 0 20px rgba(249,115,22,0.45), 0 0 40px rgba(249,115,22,0.15)",
        "neon-cyan":    "0 0 20px rgba(34,211,238,0.45), 0 0 40px rgba(34,211,238,0.15)",
        "neon-green":   "0 0 20px rgba(57,255,20,0.45), 0 0 40px rgba(57,255,20,0.15)",
        "glass":        "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
    },
  },
  plugins: [],
};
