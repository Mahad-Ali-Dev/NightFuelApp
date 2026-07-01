'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Client wrapper around next-themes' ThemeProvider so the root layout can stay a
 * server component. Toggles the `.dark` / (light) class on <html>, which flips
 * every runtime CSS variable defined in globals.css.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
