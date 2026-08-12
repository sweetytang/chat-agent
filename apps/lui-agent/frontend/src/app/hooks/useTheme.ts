import { useEffect } from 'react';

import { resolveTheme } from '@/app/domain/theme';
import { useUiStore } from '@/app/store/ui';

export const THEME_STORAGE_KEY = 'lui-agent:theme';

export function useTheme() {
  const preference = useUiStore((state) => state.themePreference);
  const setPreference = useUiStore((state) => state.setThemePreference);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference, media.matches);
    };
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  return {
    preference,
    setPreference,
  };
}
