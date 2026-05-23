/**
 * Paleta Equitel + Editorial Precision.
 * - Paleta oficial del brand book: rojo #be1e0d, negro #000, gris #9f9f9f, blanco.
 * - Principios editoriales: tonal layering (surface.*), ambient shadows, glassmorphism.
 * - Aliases legacy `navy/gold/cream` se mantienen para código previo.
 */

const negro = {
  50: '#f5f5f5',
  100: '#e5e5e5',
  200: '#cfcfcf',
  300: '#9f9f9f',
  400: '#7a7a7a',
  500: '#5c5c5c',
  600: '#3f3f3f',
  700: '#262626',
  800: '#141414',
  900: '#000000',
};

const rojo = {
  50: '#fff1f0',
  100: '#ffdcd9',
  200: '#ffb5ad',
  300: '#ff8478',
  400: '#ff4e3f',
  500: '#ff0000',
  600: '#be1e0d',
  700: '#9c1b06',
  800: '#7a1504',
  900: '#530a02',
};

const goldAlias = {
  50: '#fff1f0',
  100: '#ffdcd9',
  200: '#ffb5ad',
  300: '#ff8478',
  400: '#ff4e3f',
  500: '#be1e0d',
  600: '#9c1b06',
  700: '#7a1504',
  800: '#530a02',
  900: '#3a0601',
};

const blanco = {
  50: '#ffffff',
  100: '#fafafa',
  200: '#f0f0f0',
  300: '#e5e5e5',
  400: '#cfcfcf',
  500: '#9f9f9f',
};

// Editorial Precision · tonal layering semántico.
// Los tiers reemplazan a las líneas 1px como definición estructural.
const surface = {
  DEFAULT: '#ffffff',
  lowest: '#fafafa',
  low: '#f5f5f5',
  DEFAULT_MID: '#efefef',
  high: '#e8e8e8',
  highest: '#e0e0e0',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tokens Equitel
        'equitel-negro': negro,
        'equitel-rojo': rojo,
        'equitel-blanco': blanco,
        equitel: { negro, rojo, blanco },

        // Tonal layering (Editorial Precision) — flat + nested para robustez.
        'surface': '#ffffff',
        'surface-lowest': '#fafafa',
        'surface-low': '#f5f5f5',
        'surface-mid': '#efefef',
        'surface-high': '#e8e8e8',
        'surface-highest': '#e0e0e0',
        'on-surface': '#000000',
        'on-surface-variant': '#4a4a4a',
        outline: '#9f9f9f',
        'outline-variant': '#cfcfcf',

        // Legacy aliases
        navy: negro,
        gold: goldAlias,
        cream: blanco,
      },
      fontFamily: {
        display: ['"Open Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['"Open Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        // Ambient depth — lighting de estudio (bajo, diffused).
        ambient:
          '0 10px 40px -10px rgba(0, 0, 0, 0.05), 0 4px 20px -5px rgba(0, 0, 0, 0.04)',
        'ambient-lg':
          '0 24px 60px -12px rgba(0, 0, 0, 0.08), 0 10px 30px -8px rgba(0, 0, 0, 0.05)',
        'ambient-xl':
          '0 40px 100px -20px rgba(0, 0, 0, 0.12), 0 16px 50px -15px rgba(0, 0, 0, 0.08)',
        pulse: '0 0 0 0 rgba(190, 30, 13, 0.35)',
      },
      backdropBlur: {
        xs: '4px',
        xl: '20px',
        '2xl': '30px',
      },
      borderRadius: {
        // Radios editoriales — generosos.
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
    },
  },
  plugins: [],
};
