'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { en } from '@/i18n/en';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'mcpgen-theme';
const CHANGE_EVENT = 'mcpgen-theme-change';

/**
 * `globals.css` has carried a complete `.dark` token block and the `dark` variant since the
 * design system landed, and nothing ever added the class — roughly forty lines of dead
 * tokens and a theme nobody could reach. This is the control that makes them real.
 *
 * Three states rather than two, because "system" is the honest default: the app follows the
 * OS until someone says otherwise, and `light`/`dark` mean "override that". The preference
 * lives in `localStorage`; there are no accounts here to attach it to.
 *
 * State comes from `useSyncExternalStore` rather than `useState` + `useEffect`. The stored
 * preference is genuinely external state — the inline script in `layout.tsx` reads it before
 * React exists, and another tab can change it — so subscribing to it is both more correct
 * and avoids a synchronous setState in an effect.
 */
function currentTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function apply(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onMedia = () => {
    // Keep following the OS while the choice is still "system".
    if (currentTheme() === 'system') apply('system');
    onChange();
  };
  media.addEventListener('change', onMedia);
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener('change', onMedia);
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function ThemeToggle() {
  // The server cannot know the OS preference, so it renders the neutral "system" state and
  // the client corrects it on hydration — by which point the inline script has already set
  // the class, so nothing visibly changes.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'system' as Theme);

  const choose = useCallback((next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    apply(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: 'light', label: en.themeLight, Icon: Sun },
    { value: 'dark', label: en.themeDark, Icon: Moon },
    { value: 'system', label: en.themeSystem, Icon: Monitor },
  ];

  return (
    <fieldset className="flex items-center rounded-md border p-0.5" aria-label={en.themeLabel}>
      <legend className="sr-only">{en.themeLabel}</legend>
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => choose(value)}
          title={label}
          className={cn(
            'rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            theme === value && 'bg-muted text-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </fieldset>
  );
}
