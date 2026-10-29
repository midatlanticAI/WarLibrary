/** Type declarations for newsletter-core.cjs (shared with scripts/newsletter.js). */

export const SITE_URL: string;
export const SITE_NAME: string;
export const LANGS: string[];
export const RTL: Set<string>;
export const TOKEN_TTL_MS: number;

export function makeT(lang: string): (key: string, params?: Record<string, string | number>) => string;
export function segmentName(lang: string): string;
export function normalizeEmail(value: unknown): string;
export function isValidEmail(value: unknown): boolean;
export function signToken(payload: { email: string; lang: string }, secret: string, now?: number): string;
export function verifyToken(token: unknown, secret: string | undefined, now?: number): { email: string; lang: string; expires: number } | null;
export function escapeHtml(s: unknown): string;
export function stripCitations(text: unknown): string;
export function formatDate(lang: string, iso: string): string;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderDispatchEmail(args: {
  dispatch: { kind: string; key: string; window?: { label?: string }; stats?: Record<string, unknown> };
  text: { title: string; lede: string; sections: { heading: string; body: string }[]; civilian_note: string | null };
  lang: string;
}): RenderedEmail;
export function renderConfirmEmail(args: { lang: string; confirmUrl: string }): RenderedEmail;
