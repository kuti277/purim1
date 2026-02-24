/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Used by the top-collector card.
        // Add a @font-face rule in src/index.css pointing to the real
        // Artifont assets, then this class will resolve correctly.
        "artifont-special": ['"Artifont"', '"Segoe UI"', "serif"],
      },
    },
  },
  plugins: [],
};
