import TelegramBot from "node-telegram-bot-api";
import { OWNER_ID, TELEGRAM_TOKEN } from "./config.js";
import { startSession } from "./whatsapp.js";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

bot.onText(/^\/add (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  const number = match[1];

  if (chatId !== OWNER_ID) {
    return bot.sendMessage(chatId, "🚫 غير مصرح لك باستخدام هذا الأمر.");
  }

  await bot.sendMessage(chatId, `🔁 جاري تجهيز QR للرقم: ${number} ...`);
  await startSession(number, chatId, bot);
});
