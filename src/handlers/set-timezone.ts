import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { setTimezone } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { storageMessage, validTimezone } from "../signal-view.js";
import { now } from "../time.js";

registerMainMenuItem({ label: "Timezone", data: "timezone:show", order: 30 });
const composer = new Composer<Ctx>();

async function askTimezone(ctx: Ctx, edit = false): Promise<void> {
  ctx.session.awaitingTimezone = true;
  ctx.session.timezoneExpiresAt = now().getTime() + 5 * 60 * 1000;
  const text = "Send your IANA timezone, for example Europe/London. Signals use UTC until you set one.";
  const extra = { reply_markup: inlineKeyboard([[inlineButton("Use UTC", "timezone:utc")], [inlineButton("Back to menu", "menu:main")]]) };
  if (edit) await ctx.editMessageText(text, extra); else await ctx.reply(text, extra);
}

composer.command("set_timezone", (ctx) => askTimezone(ctx));
composer.callbackQuery("timezone:show", async (ctx) => { await ctx.answerCallbackQuery(); await askTimezone(ctx, true); });
composer.callbackQuery("timezone:utc", async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await setTimezone(ctx, "UTC");
    ctx.session.awaitingTimezone = false;
    ctx.session.timezoneExpiresAt = undefined;
    await ctx.editMessageText("Your timezone is set to UTC.", { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
  } catch { await ctx.reply(storageMessage()); }
});
composer.on("message:text", async (ctx, next) => {
  if (!ctx.session.awaitingTimezone || ctx.message.text.startsWith("/")) return next();
  if ((ctx.session.timezoneExpiresAt ?? 0) < now().getTime()) {
    ctx.session.awaitingTimezone = false;
    ctx.session.timezoneExpiresAt = undefined;
    await ctx.reply("That timezone setup timed out. Tap Timezone to start again.");
    return;
  }
  const timezone = ctx.message.text.trim();
  if (!validTimezone(timezone)) { await ctx.reply("That timezone isn't recognised. Try a name like Europe/London."); return; }
  try {
    await setTimezone(ctx, timezone);
    ctx.session.awaitingTimezone = false;
    ctx.session.timezoneExpiresAt = undefined;
    await ctx.reply(`Your timezone is set to ${timezone}.`);
  } catch { await ctx.reply(storageMessage()); }
});

export default composer;
