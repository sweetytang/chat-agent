import { useEffect } from 'react';

import { resolveTheme } from '@/app/domain/theme';
import { useUiStore } from '@/app/store/ui';

export const THEME_STORAGE_KEY = 'lui-agent:theme';

export function useTheme() {
  const preference = useUiStore((state) => state.themePreference);
  const setPreference = useUiStore((state) => state.setThemePreference);

  // 系统主题监听只建立一次，避免每次切换偏好都卸载再挂载监听器。
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const currentPreference = useUiStore.getState().themePreference;
      document.documentElement.dataset.theme = resolveTheme(currentPreference, media.matches);
    };
    apply();
    media.addEventListener('change', apply);

    return () => {
      media.removeEventListener('change', apply);
    };
  }, []);

  // 偏好变化只更新持久化值和当前 DOM，不重建系统主题监听器。
  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = resolveTheme(preference, systemDark);
  }, [preference]);

  return {
    preference,
    setPreference,
  };
}
