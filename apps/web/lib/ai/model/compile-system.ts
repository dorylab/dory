// ai/compile-system.ts

import { translate } from '@/lib/i18n/i18n';
import { routing } from '@/lib/i18n/routing';
import { SystemSpec } from './types/system-spec';

function lines(...chunks: Array<string | undefined | null | false>) {
  return chunks.filter(Boolean).join('\n');
}

export function compileSystemPrompt(spec?: SystemSpec): string | undefined {
  if (!spec) return undefined;

  const languageKey =
    spec.language === 'auto'
      ? 'Ai.SystemLanguage.Auto'
      : spec.language === 'en'
      ? 'Ai.SystemLanguage.En'
      : spec.language === 'zh'
      ? 'Ai.SystemLanguage.Zh'
      : undefined;
  const langLine = languageKey ? translate(routing.defaultLocale, languageKey) : undefined;

  const outputLine =
    spec.output.kind === 'json'
      ? lines(
          'Output format: JSON string only (no Markdown, no code fences, no extra text).',
          spec.output.strict ? 'Must be strict JSON parseable by JSON.parse.' : undefined,
          spec.output.schemaHint ? `JSON schema hint: ${spec.output.schemaHint}` : undefined,
        )
      : 'Output format: plain text only (no explanations, no prefixes/suffixes).';

  const personaLine = spec.persona ? `You are: ${spec.persona}` : undefined;

  const rulesBlock =
    spec.rules && spec.rules.length
      ? ['Rules:', ...spec.rules.map(r => `- ${r}`)].join('\n')
      : undefined;

  const notesBlock =
    spec.notes && spec.notes.length
      ? ['Notes:', ...spec.notes.map(r => `- ${r}`)].join('\n')
      : undefined;

  return lines(
    personaLine,
    langLine,
    outputLine,
    rulesBlock,
    notesBlock,
  );
}
