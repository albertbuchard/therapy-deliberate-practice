import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      colors: {
        ink: "#0b1220"
      },
      keyframes: {
        "versus-intro": {
          "0%": { opacity: "0", transform: "scale(0.9) translateY(20px)", filter: "blur(8px)" },
          "40%": { opacity: "1", transform: "scale(1.02) translateY(0)", filter: "blur(0px)" },
          "100%": { opacity: "0", transform: "scale(1.05) translateY(-10px)", filter: "blur(6px)" }
        }
      },
      animation: {
        "versus-intro": "versus-intro 1.6s ease-in-out forwards"
      }
    }
  },
  plugins: []
} satisfies Config;
