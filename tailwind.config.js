/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        recepita: { DEFAULT: "#16A34A", dark: "#15803D", 50: "#ECFDF5" },
      },
      borderRadius: { xl: "12px" },
      boxShadow: { card: "0 4px 12px rgba(0,0,0,.08)" },
    },
  },
  plugins: [],
};
