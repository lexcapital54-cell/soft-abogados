import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Person } from './kinship.types';

type RawRow = Record<string, unknown>;

/**
 * Normalización opcional con OpenAI (gpt-4o-mini).
 * Si no hay API key, el caller usa heurística local.
 */
@Injectable()
export class OpenAiNormalizerService {
  private readonly logger = new Logger(OpenAiNormalizerService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return !!this.config.get<string>('OPENAI_API_KEY')?.trim();
  }

  async normalizeRows(
    rows: RawRow[],
    source: Person['source'],
  ): Promise<Person[] | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey || !rows.length) return null;

    const model =
      this.config.get<string>('OPENAI_MODEL')?.trim() || 'gpt-4o-mini';
    const batchSize = 40;
    const out: Person[] = [];

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      try {
        const people = await this.callOpenAi(apiKey, model, batch, source, i);
        out.push(...people);
      } catch (err) {
        this.logger.warn(
          `OpenAI falló en lote ${i}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    }
    return out;
  }

  private async callOpenAi(
    apiKey: string,
    model: string,
    rows: RawRow[],
    source: Person['source'],
    offset: number,
  ): Promise<Person[]> {
    const system = `Eres un extractor de datos civiles colombianos para LEX CAPITAL.
Devuelve SOLO JSON con forma {"people":[{...}]}.
Cada persona debe tener:
cedula (string|null), nombres, primerApellido, segundoApellido,
ciudadNacimiento (string|null), ciudadExpedicion (string|null),
anioNacimiento (number|null), nombresPadres (string|null).
Separa primer y segundo apellido. Si solo hay nombre completo, divídelo.
No inventes cédulas ni años.`;

    const body = {
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: JSON.stringify({ source, rows }),
        },
      ],
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as {
      people?: Array<Partial<Person> & { fullName?: string }>;
    };

    return (parsed.people ?? []).map((p, idx) => {
      const nombres = String(p.nombres ?? '').trim();
      const primerApellido = String(p.primerApellido ?? '').trim();
      const segundoApellido = String(p.segundoApellido ?? '').trim();
      const fullName =
        p.fullName?.trim() ||
        [nombres, primerApellido, segundoApellido].filter(Boolean).join(' ');
      const cedula = p.cedula ? String(p.cedula) : null;
      const id = createHash('sha1')
        .update(`${source}|${cedula ?? ''}|${fullName}|${offset + idx}`)
        .digest('hex')
        .slice(0, 12);
      return {
        id,
        source,
        cedula,
        nombres,
        primerApellido,
        segundoApellido,
        fullName,
        ciudadNacimiento: p.ciudadNacimiento
          ? String(p.ciudadNacimiento)
          : null,
        ciudadExpedicion: p.ciudadExpedicion
          ? String(p.ciudadExpedicion)
          : null,
        anioNacimiento:
          typeof p.anioNacimiento === 'number' ? p.anioNacimiento : null,
        nombresPadres: p.nombresPadres ? String(p.nombresPadres) : null,
      } satisfies Person;
    });
  }
}
