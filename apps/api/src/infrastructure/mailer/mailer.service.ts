import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

/** Cuentas oficiales Lex Capital — el remitente se elige según el User autenticado */
export const LEX_SENDER_ACCOUNTS = [
  'contactolexcapital@lexcapital.com.co',
  'dankojimenez@lexcapital.com.co',
  'johanagomezl@lexcapital.com.co',
  'lauracastrog@lexcapital.com.co',
  'luisafmorales@lexcapital.com.co',
  'michellehenao@lexcapital.com.co',
  'victorjuliopedrozoarias@lexcapital.com.co',
] as const;

export const DEFAULT_SENDER = LEX_SENDER_ACCOUNTS[0];

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendMailInput = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

export type SendMailResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  simulated?: boolean;
};

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;
  private readonly simulated: boolean;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.simulated = false;
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: {
          user: this.config.get<string>('SMTP_USER') ?? '',
          pass: this.config.get<string>('SMTP_PASS') ?? '',
        },
      });
    } else {
      // Dev sin SMTP: transport JSON (no sale a internet) — se marca como simulado
      this.simulated = true;
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      this.logger.warn(
        'SMTP_HOST no configurado — correos en modo simulado (jsonTransport)',
      );
    }
  }

  /**
   * Resuelve el From oficial a partir del email del usuario autenticado.
   * Si no está en la lista corporativa → contactolexcapital@…
   */
  resolveSender(userEmail: string): string {
    const normalized = userEmail.trim().toLowerCase();
    const hit = LEX_SENDER_ACCOUNTS.find((a) => a === normalized);
    return hit ?? DEFAULT_SENDER;
  }

  listSenders(): string[] {
    return [...LEX_SENDER_ACCOUNTS];
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    if (!this.transporter) {
      return { ok: false, error: 'Mailer no inicializado' };
    }
    try {
      const info = await this.transporter.sendMail({
        from: `"LEX CAPITAL" <${input.from}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html ?? input.text.replace(/\n/g, '<br/>'),
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      if (this.simulated) {
        this.logger.log(
          `[SIMULADO] Correo a ${input.to} · ${input.subject} · adjuntos=${input.attachments?.length ?? 0}`,
        );
      }
      return {
        ok: true,
        messageId: info.messageId,
        simulated: this.simulated,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de envío';
      this.logger.error(`Fallo envío a ${input.to}: ${message}`);
      return { ok: false, error: message };
    }
  }
}
