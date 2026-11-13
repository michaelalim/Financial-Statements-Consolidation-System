export type ThemeMode = 'light' | 'dark' | 'system';

export type ColorThemeId =
  | 'midnight-magenta'
  | 'oxford-coral'
  | 'forest-violet'
  | 'espresso-sky'
  | 'charcoal-gold'
  | 'sage-linen'
  | 'slate-breeze'
  | 'plum-parchment'
  | 'soft-stone'
  | 'muted-social'
  | 'x-twitter'
  | 'instagram'
  | 'reddit'
  | 'youtube'
  | 'telegram';

export interface ColorThemeDefinition {
  id: ColorThemeId;
  name: string;
  description: string;
  recommended?: boolean;
  colors: {
    primary: string;
    light: string;
    accent: string;
  };
  tonalAccent: {
    light: string;
    dark: string;
  };
}

export const COLOR_THEMES: ColorThemeDefinition[] = [
  {
    id: 'midnight-magenta',
    name: 'Midnight Magenta',
    description: 'Deep midnight navy, crisp white, and vibrant magenta-pink.',
    colors: {
      primary: '#0f1b3d',
      light: '#ffffff',
      accent: '#ff3d8b',
    },
    tonalAccent: {
      light: '#1e3575',
      dark: '#5c7ee6',
    },
  },
  {
    id: 'oxford-coral',
    name: 'Oxford Coral',
    description: 'Oxford navy, warm alabaster cream, and coral vermilion.',
    colors: {
      primary: '#14213D',
      light: '#F4EDE0',
      accent: '#FF6B5B',
    },
    tonalAccent: {
      light: '#243966',
      dark: '#6b88c7',
    },
  },
  {
    id: 'forest-violet',
    name: 'Forest Violet',
    description: 'Deep forest pine, warm sand parchment, and electric violet.',
    colors: {
      primary: '#1F3D2B',
      light: '#E8DCC4',
      accent: '#8B5CF6',
    },
    tonalAccent: {
      light: '#2e593f',
      dark: '#67a880',
    },
  },
  {
    id: 'espresso-sky',
    name: 'Espresso Sky',
    description: 'Rich espresso roast, warm ivory linen, and clear sky blue.',
    colors: {
      primary: '#3B2418',
      light: '#F2E8DA',
      accent: '#8EC5FF',
    },
    tonalAccent: {
      light: '#5c3927',
      dark: '#c79274',
    },
  },
  {
    id: 'charcoal-gold',
    name: 'Charcoal Gold',
    description: 'Graphite charcoal, cool silver mist, and amber gold.',
    colors: {
      primary: '#2B2D31',
      light: '#D9DADC',
      accent: '#FFC93C',
    },
    tonalAccent: {
      light: '#43464d',
      dark: '#a6abb5',
    },
  },
  {
    id: 'sage-linen',
    name: 'Sage Linen',
    description: 'Soft botanical sage, warm linen paper, and gentle clay terracotta.',
    colors: {
      primary: '#3F5E52',
      light: '#F6F4EE',
      accent: '#C97A63',
    },
    tonalAccent: {
      light: '#4D7364',
      dark: '#88B3A1',
    },
  },
  {
    id: 'slate-breeze',
    name: 'Slate Breeze',
    description: 'Calm harbor slate, morning mist white, and warm honey ochre.',
    colors: {
      primary: '#334E68',
      light: '#F4F7F9',
      accent: '#D99B43',
    },
    tonalAccent: {
      light: '#486888',
      dark: '#87A8C9',
    },
  },
  {
    id: 'plum-parchment',
    name: 'Plum Parchment',
    description: 'Dusty plum, soft parchment cream, and peaceful seafoam teal.',
    colors: {
      primary: '#4A3548',
      light: '#F7F3F5',
      accent: '#4F7D79',
    },
    tonalAccent: {
      light: '#654962',
      dark: '#B896B5',
    },
  },
  {
    id: 'soft-stone',
    name: 'Soft Stone',
    description: 'Gentle monochromatic warm stone, soft paper white, and muted pebble.',
    colors: {
      primary: '#4A4742',
      light: '#F5F4F0',
      accent: '#736E66',
    },
    tonalAccent: {
      light: '#5C5851',
      dark: '#9D978E',
    },
  },
  {
    id: 'muted-social',
    name: 'Muted Social (Facebook)',
    description: 'Muted Facebook-inspired steel blue, soft feed gray-white, and gentle cobalt.',
    recommended: true,
    colors: {
      primary: '#344E7A',
      light: '#F0F2F5',
      accent: '#446FA8',
    },
    tonalAccent: {
      light: '#3F5E91',
      dark: '#7694C7',
    },
  },
  {
    id: 'x-twitter',
    name: 'X / Twitter',
    description: 'Obsidian ink, crisp timeline white, and classic X / Twitter blue.',
    recommended: true,
    colors: {
      primary: '#0F1419',
      light: '#F7F9F9',
      accent: '#1D9BF0',
    },
    tonalAccent: {
      light: '#27303A',
      dark: '#9AA4AE',
    },
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Royal plum purple, clean gallery white, and signature rose-magenta.',
    recommended: true,
    colors: {
      primary: '#5D2E7A',
      light: '#FAFAFA',
      accent: '#C7246D',
    },
    tonalAccent: {
      light: '#723B94',
      dark: '#B68CD4',
    },
  },
  {
    id: 'reddit',
    name: 'Reddit',
    description: 'Deep charcoal-slate, light community gray, and classic Reddit orangered.',
    recommended: true,
    colors: {
      primary: '#1F2C33',
      light: '#F2F4F5',
      accent: '#D93A00',
    },
    tonalAccent: {
      light: '#314550',
      dark: '#8EA5B3',
    },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Studio dark charcoal, crisp paper white, and classic YouTube crimson red.',
    recommended: true,
    colors: {
      primary: '#212121',
      light: '#F9F9F9',
      accent: '#CC0000',
    },
    tonalAccent: {
      light: '#3B3B3B',
      dark: '#A3A3A3',
    },
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Deep azure-navy, airy cloud white, and signature Telegram sky blue.',
    recommended: true,
    colors: {
      primary: '#1F4568',
      light: '#EFF5F9',
      accent: '#229ED9',
    },
    tonalAccent: {
      light: '#2C5D8A',
      dark: '#78A7D6',
    },
  },
];

export interface ThemeConfig {
  mode: ThemeMode;
  themeId: ColorThemeId;
  useContrastAccent: boolean;
}
