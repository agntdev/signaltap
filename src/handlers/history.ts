import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getSignal, listChoices, upsertSubscriber } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { storageMessage } from "../signal-view.js";

registerMainMenuItem({ label: "History", data: "history:show", order: 20 });
const composer = new Composer<Ctx>();

async function showHistory(ctx: Ctx, edit = false): Promise<void> {
  try {
    const subscriber = await upsertSubscriber(ctx);
    const choices = await listChoices(ctx, subscriber.telegramId);
    if (choices.length === 0) {
      const text = "No signal choices yet — you'll see them here after you respond to a signal.";
      if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
      else await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
      return;
    }
    const rows = await Promise.all(choices.slice(0, 10).map(async (choice) => {
      const signal = await getSignal(ctx, choice.signalId);
      return `${choice.optedIn ? "Opted in" : "Ignored"}: ${signal ? `${signal.asset} ${signal.direction}` : "signal no longer available"}`;
    }));
    const text = `Your recent choices:\n${rows.join("\n")}`;
    if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
    else await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
  } catch { await ctx.reply(storageMessage()); }
}

composer.command("history", (ctx) => showHistory(ctx));
composer.callbackQuery("history:show", async (ctx) => { await ctx.answerCallbackQuery(); await showHistory(ctx, true); });

export default composer;
