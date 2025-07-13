function getTranslationKey(language: string, strId: string): string {
  return `${language}_${strId}`;
}

export function getTranslation(language: string, strId: string): string | null {
  return localStorage.getItem(getTranslationKey(language, strId));
}

export function setTranslation(language: string, strId: string, translation: string): void {
  localStorage.setItem(getTranslationKey(language, strId), translation);
}

export function removeTranslation(language: string, strId: string): void {
  localStorage.removeItem(getTranslationKey(language, strId));
}