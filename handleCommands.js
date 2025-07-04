import { commands } from "./commands.js";

export async function handleCommand(sock, msg) {
  const sender = msg.key.remoteJid;
  const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

  if (!body || !body.startsWith("!")) return;

  const commandName = body.slice(1).split(" ")[0].toLowerCase();
  const command = commands[commandName];

  if (command) {
    try {
      await command(sock, sender);
    } catch (err) {
      console.error("❌ خطأ في تنفيذ الأمر:", err);
      await sock.sendMessage(sender, { text: "❗ حدث خطأ أثناء تنفيذ الأمر." });
    }
  }
}
