import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { listSignals, upsertSubscriber } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { signalText, storageMessage } from "../signal-view.js";

registerMainMenuItem({ label: "Signals", data: "signals:show", order: 10 });
const composer = new Composer<Ctx>();

async function showSignals(ctx: Ctx, edit = false): Promise<void> {
  try {
    const [subscriber, signals] = await Promise.all([upsertSubscriber(ctx), listSignals(ctx)]);
    const text = signals.length === 0
      ? "No signals yet — new setups will arrive here when the admin publishes them."
      : signals.map((signal, index) => `${index + 1}. ${signalText(signal, subscriber.timezone, "Signal")}`).join("\n\n");
    const extra = { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) };
    if (edit) await ctx.editMessageText(text, extra); else await ctx.reply(text, extra);
  } catch { await ctx.reply(storageMessage()); }
}

composer.command("signals", (ctx) => showSignals(ctx));
composer.callbackQuery("signals:show", async (ctx) => { await ctx.answerCallbackQuery(); await showSignals(ctx, true); });

export default composer;
