import { resolve } from "node:path";

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    [resolve(process.cwd(), "postcss.legacy-browser.cjs")]: {},
  },
};

export default config;
