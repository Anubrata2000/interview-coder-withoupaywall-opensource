export interface LanguageOption {
  value: string;
  label: string;
  syntaxHighlighterLang?: string;
}

export const LANGUAGES: LanguageOption[] = [
  { value: "python", label: "Python", syntaxHighlighterLang: "python" },
  { value: "javascript", label: "JavaScript", syntaxHighlighterLang: "javascript" },
  { value: "typescript", label: "TypeScript", syntaxHighlighterLang: "typescript" },
  { value: "java", label: "Java", syntaxHighlighterLang: "java" },
  { value: "cpp", label: "C++", syntaxHighlighterLang: "cpp" },
  { value: "csharp", label: "C#", syntaxHighlighterLang: "csharp" },
  { value: "golang", label: "Go", syntaxHighlighterLang: "go" },
  { value: "rust", label: "Rust", syntaxHighlighterLang: "rust" },
  { value: "swift", label: "Swift", syntaxHighlighterLang: "swift" },
  { value: "kotlin", label: "Kotlin", syntaxHighlighterLang: "kotlin" },
  { value: "ruby", label: "Ruby", syntaxHighlighterLang: "ruby" },
  { value: "sql", label: "SQL", syntaxHighlighterLang: "sql" },
  { value: "r", label: "R", syntaxHighlighterLang: "r" }
];

export const DEFAULT_LANGUAGE = "python";

export function getNextLanguage(currentLanguage: string): string {
  const currentIndex = LANGUAGES.findIndex(l => l.value === currentLanguage);
  if (currentIndex === -1) return LANGUAGES[0].value;
  return LANGUAGES[(currentIndex + 1) % LANGUAGES.length].value;
}

export function getPreviousLanguage(currentLanguage: string): string {
  const currentIndex = LANGUAGES.findIndex(l => l.value === currentLanguage);
  if (currentIndex === -1) return LANGUAGES[0].value;
  return LANGUAGES[(currentIndex - 1 + LANGUAGES.length) % LANGUAGES.length].value;
}

export function getSyntaxHighlighterLanguage(language: string): string {
  const found = LANGUAGES.find(l => l.value === language);
  if (found?.syntaxHighlighterLang) return found.syntaxHighlighterLang;
  if (language === "go") return "go";
  return language;
}
