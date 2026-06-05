import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#F5F0E8',
        parchment: '#EDE5D4',
        bark: '#C4B49A',
        clay: '#9C7B5E',
        earth: '#6B5240',
        charcoal: '#2C2420',
        sage: '#8A9E82',
        moss: '#5C7054',
        sand: '#D4C4A8',
        'warm-white': '#FAF7F2',
        urgent: '#A93226',
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'serif'],
        sans: ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
