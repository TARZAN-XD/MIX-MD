import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";
import fs from "fs-extra";
import path from "path";
import P from "pino";
import qrcode from "qrcode";

const commands = new Map();

const loadCommands = () => {
  const cmdPath = path.join(__dirname, "commands");
  fs.readdirSync(cmdPath).forEach(file => {
    if (file.endsWith(".js")) {
      const command = require(path.join(cmdPath, file));
      commands.set(command.name, command.run);
    }
  });
};

loadCommands();

export async function startSession(number, chatId, bot) {
  const sessionPath = `./session/${number}`;
  await fs.ensureDir(sessionPath);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: "silent" })
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;
    if (qr) {
      const qrPath = `./qr-${number}.png`;
      await qrcode.toFile(qrPath, qr);
      await bot.sendPhoto(chatId, qrPath, { caption: `🔑 امسح الكود لتسجيل الدخول` });
      setTimeout(() => fs.unlinkSync(qrPath), 10000);
    }

    if (connection === "open") {
      await bot.sendMessage(chatId, `✅ تم تسجيل الدخول.`);
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode || "غير معروف";
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        await bot.sendMessage(chatId, `⚠️ تم قطع الاتصال، إعادة المحاولة...`);
        setTimeout(() => startSession(number, chatId, bot), 5000);
      } else {
        await bot.sendMessage(chatId, `❌ تم تسجيل الخروج. أعد المصادقة.`);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!text) return;

    const [cmdName, ...args] = text.trim().split(" ");
    const cmd = commands.get(cmdName.toLowerCase());
    if (cmd) {
      try {
        await cmd(sock, msg, sender, args.join(" "));
      } catch (err) {
        console.error("❌ خطأ في الأمر:", err);
        await sock.sendMessage(sender, { text: "❌ حدث خطأ أثناء تنفيذ الأمر." });
      }
    }
  });
}
