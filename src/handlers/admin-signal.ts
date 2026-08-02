import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminIsConfigured, isAdmin, sendAdmin } from "../admin.js";
import { listSubscribers, saveSignal, type Signal } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { now } from "../time.js";
import { signalText, storageMessage } from "../signal-view.js";

registerMainMenuItem({ label: "Create signal", data: "admin:create", order: 40 });
const composer = new Composer<Ctx>();

const FORMAT = "Send /create_signal followed by: provider | asset | CALL or PUT | expiry | suggested stake | confidence | details | image URL (optional).";

function parseSignal(text: string): Omit<Signal, "id" | "timestamp"> | undefined {
  const raw = text.replace(/^\/create_signal(?:\s+|$)/, "").trim();
  const fields = raw.split("|").map((field) => field.trim());
  if (fields.length < 7 || fields.length > 8 || fields.slice(0, 7).some((field) => !field)) return undefined;
  if (fields.some((field) => field.length > 600) || raw.length > 3000) return undefined;
  const direction = fields[2].toUpperCase();
  if (direction !== "CALL" && direction !== "PUT") return undefined;
  const imageUrl = fields[7];
  if (imageUrl && !/^https:\/\/.+/i.test(imageUrl)) return undefined;
  return { provider: fields[0], asset: fields[1], direction, expiry: fields[3], stakeSuggestion: fields[4], confidence: fields[5], details: fields[6], ...(imageUrl ? { imageUrl } : {}) };
}

async function promptSubscribers(ctx: Ctx, signal: Signal): Promise<{ prompted: number; errors: number }> {
  const subscribers = await listSubscribers(ctx);
  let prompted = 0;
  let errors = 0;
  // Batches avoid a single unbounded fan-out; individual failures (blocked bot,
  // rate limits) do not stop prompts for everyone else.
  for (let i = 0; i < subscribers.length; i += 20) {
    const batch = subscribers.slice(i, i + 20);
    const results = await Promise.all(batch.map(async (subscriber) => {
      if (!subscriber.notificationPreferences.signalPrompts) return false;
      try {
        await ctx.api.sendMessage(subscriber.telegramId, signalText(signal, subscriber.timezone, "New signal"), {
          reply_markup: inlineKeyboard([[inlineButton("Opt in", `signal:opt_in:${signal.id}`), inlineButton("Ignore", `signal:ignore:${signal.id}`)]]),
        });
        return true;
      } catch { return false; }
    }));
    prompted += results.filter(Boolean).length;
    errors += results.filter((result) => !result).length;
  }
  return { prompted, errors };
}

async function create(ctx: Ctx, input: string): Promise<void> {
  if (!adminIsConfigured(ctx)) { await ctx.reply("Admin controls aren't set up yet."); return; }
  if (!isAdmin(ctx)) { await ctx.reply("Only the configured admin can create signals."); return; }
  const parsed = parseSignal(input);
  if (!parsed) { await ctx.reply(`That signal format doesn't look right. ${FORMAT}`); return; }
  const signal: Signal = { ...parsed, id: crypto.randomUUID(), timestamp: now().toISOString() };
  try {
    await saveSignal(ctx, signal);
    const result = await promptSubscribers(ctx, signal);
    const summary = `Signal broadcast complete: ${result.prompted} prompt${result.prompted === 1 ? "" : "s"} sent, ${result.errors} delivery error${result.errors === 1 ? "" : "s"}.`;
    await ctx.reply(summary);
    await sendAdmin(ctx, summary);
  } catch { await ctx.reply(storageMessage()); }
}

composer.command("create_signal", (ctx) => create(ctx, ctx.message?.text ?? ""));
composer.callbackQuery("admin:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!adminIsConfigured(ctx)) { await ctx.reply("Admin controls aren't set up yet."); return; }
  if (!isAdmin(ctx)) { await ctx.reply("Only the configured admin can create signals."); return; }
  await ctx.editMessageText(FORMAT, { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
});

export default composer;
