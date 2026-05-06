/**
 * Tailwind config for Liquid QV.
 *
 * Tokens copied from RadicalxChange/www so the embedded tool reads as
 * continuous with the rest of RxC's properties:
 *   - color palette (golden-fizz, light-gold, red, etc.)
 *   - font families (Messer for display, Suisse Intl for body)
 *   - fluid type scale (var(--step-N), defined in src/styles/type-scale.css)
 *   - the breakpoint set (md/lg/xl as raw min-width, plus touch / -tall)
 *
 * Tool-specific additions (the "water" palette) sit alongside, exposed both
 * as Tailwind utilities and as CSS custom properties for runtime theming
 * via the LiquidQV `theme` prop.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,html}'],
  theme: {
    screens: {
      md: { raw: '(min-width: 640px)' },
      lg: { raw: '(min-width: 768px)' },
      xl: { raw: '(min-width: 1024px)' },
      'base-landscape': { raw: '(max-width: 767px) and (orientation: landscape)' },
      'lg-tall': { raw: '(min-width: 768px) and (max-aspect-ratio: 2/1)' },
      touch: { raw: '(hover: none)' },
    },
    lineHeight: {
      none: '1',
      tight: '1.25',
      normal: '1.5',
    },
    fontSize: {
      'size--4': ['var(--step--4)', '1.34'],
      'size--3': ['var(--step--3)', '1.34'],
      'size--2': ['var(--step--2)', '1.34'],
      'size--1': ['var(--step--1)', '1.34'],
      'size-0': ['var(--step-0)', '1.34'],
      'size-1': ['var(--step-1)', '1.34'],
      'size-2': ['var(--step-2)', '1.34'],
      'size-3': ['var(--step-3)', '1.14'],
      'size-4': ['var(--step-4)', '1.14'],
      'size-5': ['var(--step-5)', '1.0'],
      'size-display': ['clamp(48px, 9vw, 120px)', '0.98'],
    },
    fontFamily: {
      display: ['Messer', 'sans-serif'],
      body: ['"Suisse Intl"', 'system-ui', 'sans-serif'],
    },
    colors: {
      // RxC tokens (verbatim from RadicalxChange/www)
      'golden-fizz': '#EDFF38',
      'light-gold': '#FAFFC3',
      red: '#C53030',
      black: '#000000',
      'light-black': '#010101',
      white: '#FFFFFF',
      gray: '#6C6C6C',
      transparent: 'transparent',
      current: 'currentColor',

      // Liquid QV-specific water palette. Saturated against RxC's
      // black/yellow base; tested for WCAG AA on white.
      water: {
        50: '#EAF4FB',
        100: '#CFE6F5',
        200: '#9DCEEB',
        300: '#5FB1DE',
        400: '#2E8FCC',
        500: '#1773B5', // primary
        600: '#125D94',
        700: '#0E4773',
        800: '#0A3252',
        900: '#061E33',
      },
      // Soft surfaces for funnel walls, pool background, dividers.
      surface: {
        50: '#FAFAF7',
        100: '#F2F1EA',
        200: '#E5E3D8',
        300: '#C9C6B6',
        400: '#9C9888',
        500: '#6C6C6C',
      },
    },
    extend: {
      borderRadius: {
        50: '50%',
        oval: '70px',
        twitch: '38px',
      },
      borderWidth: { 3: '3px' },
      transitionTimingFunction: {
        // gentle, water-like
        fluid: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        ripple: 'ripple 2.4s ease-in-out infinite',
      },
      keyframes: {
        ripple: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-1px)' },
        },
      },
    },
  },
  plugins: [],
};
