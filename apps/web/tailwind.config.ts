import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        meta: {
          DEFAULT: "#1877F2",
          light: "#E7F0FD",
        },
        ghl: {
          DEFAULT: "#0E9F6E",
          light: "#DEF7EC",
        },
        instagram: {
          DEFAULT: "#E1306C",
          light: "#FDE8F0",
        },
        severity: {
          critical: "#EF4444",
          warning: "#F59E0B",
          opportunity: "#10B981",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
