/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        wiki: {
          primary: "#1e3a5f",
          secondary: "#2d5a87",
          accent: "#4a90d9",
          light: "#f0f4f8",
          dark: "#0f172a",
        }
      }
    },
  },
  plugins: [],
}
