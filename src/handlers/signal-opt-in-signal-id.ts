import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getChoice, getSignal, getSubscriber, recordChoice, signalChoiceStats } from "../domain.js";
import { sendAdmin } from "../admin.js";
import { inlineKeyboard } from "../toolkit/index.js";
import { now } from "../time.js";
import { signalText, storageMessage } from "../signal-view.js";

const composer = new Composer<Ctx>();

composer.callbackQuery(/^signal:opt_in:([A-Za-z0-9-]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const signalId = ctx.match[1];
  try {
    const subscriberId = String(ctx.from.id);
    const [signal, choice, subscriber] = await Promise.all([getSignal(ctx, signalId), getChoice(ctx, signalId, subscriberId), getSubscriber(ctx, subscriberId)]);
    if (!signal) { await ctx.reply("That signal is no longer available."); return; }
    if (choice) { await ctx.reply("You've already responded to this signal."); return; }
    await recordChoice(ctx, signalId, true, now().toISOString());
    await ctx.editMessageText("You're opted in. Here's the full signal.", { reply_markup: inlineKeyboard([]) });
    const text = signalText(signal, subscriber?.timezone ?? "UTC");
    const chatId = ctx.chat?.id;
    if (signal.imageUrl && chatId) {
      try { await ctx.api.sendPhoto(chatId, signal.imageUrl, { caption: text }); }
      catch { await ctx.reply(text); }
    } else await ctx.reply(text);
    const totals = await signalChoiceStats(ctx, signalId);
    await sendAdmin(ctx, `Signal activity: ${totals.optedIn} opted in, ${totals.ignored} ignored.`);
  } catch { await ctx.reply(storageMessage()); }
});

export default composer;
