import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        heading: ["Sora", "Manrope", "sans-serif"]
      },
      boxShadow: {
        soft: "0 10px 35px rgba(24, 24, 48, 0.08)",
        panel: "0 18px 45px rgba(58, 36, 173, 0.18)"
      },
      colors: {
        brand: {
          50: "#f1edff",
          100: "#e4ddff",
          500: "#5f3ee9",
          600: "#4e34c2",
          700: "#3d2898"
        },
        mint: {
          400: "#63d5b0",
          500: "#4bc79f"
        }
      }
    }
  },
  plugins: []
};

export default config;
