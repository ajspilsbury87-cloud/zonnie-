/**
 * Hook that returns the string dictionary for the user's current language.
 *
 * Usage — add to the top of any component that shows user-visible text:
 *
 *   const t = useStrings();
 *   // then: t.moreFilters, t.today, t.outdoorScreens(3) …
 *
 * Changing the language store automatically triggers a re-render of every
 * component that calls this hook, so the UI updates immediately.
 */

import { useLanguageStore } from '@/src/store/languageStore';
import { strings } from './strings';

export function useStrings() {
  const lang = useLanguageStore((s) => s.lang);
  return strings[lang];
}
