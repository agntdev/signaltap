import type { Context } from "grammy";

function adminId(ctx: Context): string | undefined {
  const workerEnv = (ctx as Context & { env?: { ADMIN_CHAT_ID?: string } }).env;
  return workerEnv?.ADMIN_CHAT_ID ?? (typeof process === "undefined" ? undefined : process.env.ADMIN_CHAT_ID);
}

export function isAdmin(ctx: Context): boolean {
  const configured = adminId(ctx);
  return Boolean(configured && String(ctx.from?.id) === configured);
}

export function adminIsConfigured(ctx: Context): boolean {
  return Boolean(adminId(ctx));
}

export async function sendAdmin(ctx: Context, text: string): Promise<void> {
  const chatId = adminId(ctx);
  if (!chatId) return;
  try { await ctx.api.sendMessage(chatId, text); } catch { /* an alert must never abort a user action */ }
}
