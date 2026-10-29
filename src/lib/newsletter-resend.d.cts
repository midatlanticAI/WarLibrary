/** Type declarations for newsletter-resend.cjs. */

export const STATE_FILE: string;
export function isConfigured(): boolean;
export function fromAddress(): string;
export function readState(): { segments: Record<string, string>; subscribers: Record<string, number>; updated_at: string | null };
export function writeState(state: { segments: Record<string, string>; subscribers: Record<string, number> }): void;
export function ensureSegment(lang: string): Promise<string>;
export function subscribeContact(email: string, lang: string): Promise<{ id: string | null; existed: boolean }>;
export function segmentHasContacts(lang: string): Promise<boolean | null>;
export function sendConfirmation(args: { to: string; subject: string; html: string; text: string }): Promise<string | null>;
export function sendBroadcast(args: { lang: string; subject: string; html: string; text: string; name: string }): Promise<string | null>;
