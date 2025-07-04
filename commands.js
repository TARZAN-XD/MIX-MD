export const commands = {
  ping: async (sock, sender) => {
    await sock.sendMessage(sender, { text: "🏓 البوت شغال تمام!" });
  },

  time: async (sock, sender) => {
    const now = new Date().toLocaleString("ar-YE", { timeZone: "Asia/Riyadh" });
    await sock.sendMessage(sender, { text: `🕒 الوقت الحالي: ${now}` });
  },

  help: async (sock, sender) => {
    await sock.sendMessage(sender, {
      text: `📌 قائمة الأوامر المتاحة:\n\n!ping - اختبار البوت\n!time - عرض الوقت\n!help - عرض هذه القائمة`
    });
  }
};
