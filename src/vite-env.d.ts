/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_PROVIDER?: "disabled" | "groq" | "openrouter" | "gemini";
  readonly VITE_GROQ_API_KEY?: string;
  readonly VITE_GROQ_MODEL?: string;
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_OPENROUTER_MODEL?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GEMINI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
