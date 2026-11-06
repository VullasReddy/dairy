/** Brand design tokens – the same values as the CSS variables in src/styles/global.css. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // The bespoke brand stylesheet provides the base reset, so Tailwind's preflight is off
  // to keep the homepage pixel-matched to the reference design.
  // `container` is also disabled: the site defines its own .container width (matches the reference).
  corePlugins: { preflight: false, container: false },
  theme: {
    extend: {
      colors: {
        sky: { DEFAULT: '#BFE8FA', light: '#E7F6FC', deep: '#74D4FE' },
        biscuit: '#F5E6C9',
        cream: { DEFAULT: '#FFF7E9', band: '#FEF1DB' },
        navy: { DEFAULT: '#073B70', 2: '#0A4A8C', ink: '#0B2E55' },
        gold: { DEFAULT: '#E8B75C', 2: '#F6C343' },
        muted: '#5B6B7C',
      },
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        script: ['"Kaushan Script"', 'cursive'],
      },
      borderRadius: { card: '16px', 'card-lg': '22px' },
      boxShadow: {
        soft: '0 2px 8px rgba(7,59,112,.06)',
        card: '0 8px 24px rgba(7,59,112,.10), 0 2px 6px rgba(7,59,112,.05)',
        lift: '0 18px 40px rgba(7,59,112,.16)',
      },
    },
  },
  plugins: [],
}
