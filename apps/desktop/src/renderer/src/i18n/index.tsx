import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import enUS from './locales/en-US.json'
import ptBR from './locales/pt-BR.json'

const dictionaries = {
  'pt-BR': ptBR,
  'en-US': enUS
}

type Locale = keyof typeof dictionaries

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string
  formatTime: (date: Date, options?: Intl.DateTimeFormatOptions) => string
  formatDateTime: (date: Date, options?: Intl.DateTimeFormatOptions) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

const DEFAULT_LOCALE: Locale = 'pt-BR'

const normalizeLocale = (value?: string | null): Locale => {
  if (!value) return DEFAULT_LOCALE
  if (value in dictionaries) return value as Locale
  if (value === 'en') return 'en-US'
  return DEFAULT_LOCALE
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('momai_locale')
    return normalizeLocale(saved)
  })

  useEffect(() => {
    localStorage.setItem('momai_locale', locale)
  }, [locale])

  const setLocale = useCallback((value: Locale) => {
    setLocaleState(value)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[locale] || dictionaries[DEFAULT_LOCALE]
      let text = dict[key as keyof typeof dict] || key
      if (vars) {
        for (const [varKey, varValue] of Object.entries(vars)) {
          text = text.replaceAll(`{${varKey}}`, String(varValue))
        }
      }
      return text
    },
    [locale]
  )

  const formatDate = useCallback(
    (date: Date, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, options).format(date),
    [locale]
  )

  const formatTime = useCallback(
    (date: Date, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, options).format(date),
    [locale]
  )

  const formatDateTime = useCallback(
    (date: Date, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, options).format(date),
    [locale]
  )

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      formatDate,
      formatTime,
      formatDateTime
    }),
    [locale, setLocale, t, formatDate, formatTime, formatDateTime]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}
