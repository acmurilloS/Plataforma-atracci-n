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

// ─── Sistema de diseño "brand" (Apple-store light + glass) ────────────
// Convive con el sistema viejo (navy/gold/cream). Las páginas nuevas
// (Login en este sprint) usan tokens brand-*; las viejas siguen igual.
const brand = {
  50: '#FBE9E5',
  100: '#FBD7CF',
  200: '#F4B6A9',
  300: '#E89189',
  400: '#DC5C4D',
  500: '#D43825',
  600: '#BE1E0D', // CTA principal (mismo Equitel rojo, escala distinta)
  700: '#9C1B06',
  800: '#7A1605',
  900: '#5C0F03',
};

const success = {
  50: '#E5F4EA',
  500: '#1FA354',
  600: '#0F8F44',
  700: '#0A6F35',
};
const warning = {
  50: '#FCEEC9',
  500: '#D08C0F',
  600: '#C2740E',
  700: '#9B5C0D',
};
const danger = {
  50: '#FBE9E5',
  500: '#C3260F',
  600: '#A8190B',
  700: '#861309',
};
const info = {
  50: '#E3EFFC',
  500: '#1675D1',
  600: '#0066CC',
  700: '#054D9E',
};

// Apple-style grays — slate cálido (no usar gray-*).
const slate = {
  50: '#F9F9FB',
  100: '#F2F2F4',
  200: '#E5E5EA',
  300: '#D1D1D6',
  400: '#A1A1A6',
  500: '#8E8E93',
  600: '#6E6E73',
  700: '#48484A',
  800: '#3D3D40',
  900: '#1D1D1F',
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

        // ─── Sistema brand (nuevo) ──────────────────────────────
        brand,
        success,
        warning,
        danger,
        info,
        slate, // Apple slate — sobreescribe Tailwind default a propósito.

        // Surfaces brand
        'app-bg-from': '#FAFAFD',
        'app-bg-to': '#F0F0F5',
        'brand-surface': '#FFFFFF',
        'brand-surface-soft': '#F9F9FB',
        'brand-surface-sunken': '#F2F2F4',

        // Text tokens brand
        'text-strong': '#1D1D1F',
        'text-body': '#3D3D40',
        'text-muted': '#6E6E73',
        'text-subtle': '#8E8E93',
      },
      fontFamily: {
        display: ['"Open Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['"Open Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        // Inter para el sistema brand (Login + componentes nuevos).
        brand: [
          'Inter',
          '-apple-system',
          '"SF Pro Display"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
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

        // ─── Sombras del sistema brand (layered, no duras) ─────
        'brand-card': '0 1px 2px rgb(0 0 0 / 0.03), 0 4px 12px rgb(0 0 0 / 0.04)',
        'brand-card-hover':
          '0 4px 16px -4px rgb(0 0 0 / 0.08), 0 12px 32px -8px rgb(0 0 0 / 0.06)',
        'brand-modal':
          '0 24px 60px rgb(0 0 0 / 0.12), 0 4px 12px rgb(0 0 0 / 0.04)',
        'brand-cta':
          '0 6px 16px rgba(190, 30, 13, 0.28), inset 0 1px 0 rgba(255,255,255,0.18)',
      },
      backdropBlur: {
        xs: '4px',
        xl: '20px',
        '2xl': '30px',
        '3xl': '40px',
      },
      borderRadius: {
        // Radios editoriales — generosos.
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        // Radios del sistema brand
        'brand-input': '12px',
        'brand-card': '24px',
        'brand-modal': '28px',
      },
      transitionTimingFunction: {
        // Curvas del sistema brand — reutilizadas en todo el portal.
        cult: 'cubic-bezier(0.22, 1, 0.36, 1)', // out-cubic premium
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // overshoot suave
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fade-in 0.2s ease-out',
        bob: 'bob 3s ease-in-out infinite',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
      },
    },
  },
  plugins: [],
};
