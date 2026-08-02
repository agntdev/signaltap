import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getChoice, getSignal, recordChoice, signalChoiceStats } from "../domain.js";
import { sendAdmin } from "../admin.js";
import { inlineKeyboard } from "../toolkit/index.js";
import { now } from "../time.js";
import { storageMessage } from "../signal-view.js";

const composer = new Composer<Ctx>();

composer.callbackQuery(/^signal:ignore:([A-Za-z0-9-]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const signalId = ctx.match[1];
  try {
    const subscriberId = String(ctx.from.id);
    const [signal, choice] = await Promise.all([getSignal(ctx, signalId), getChoice(ctx, signalId, subscriberId)]);
    if (!signal) { await ctx.reply("That signal is no longer available."); return; }
    if (choice) { await ctx.reply("You've already responded to this signal."); return; }
    await recordChoice(ctx, signalId, false, now().toISOString());
    await ctx.editMessageText("You ignored this signal. Your choice is saved in History.", { reply_markup: inlineKeyboard([]) });
    const totals = await signalChoiceStats(ctx, signalId);
    await sendAdmin(ctx, `Signal activity: ${totals.optedIn} opted in, ${totals.ignored} ignored.`);
  } catch { await ctx.reply(storageMessage()); }
});

export default composer;
