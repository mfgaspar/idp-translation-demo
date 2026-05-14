export type LanguageOptionDTO = {
  code: string
  label: string
}

export type TranslationLanguagesResponse = {
  sources: LanguageOptionDTO[]
  targets: LanguageOptionDTO[]
}

export async function fetchTranslationLanguages(): Promise<TranslationLanguagesResponse> {
  const r = await fetch('/config/translation-languages')
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<TranslationLanguagesResponse>
}
