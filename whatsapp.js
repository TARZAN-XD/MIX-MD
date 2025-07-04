import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";
import P from "pino";
import fs from "fs-extra";
import qrcode from "qrcode";
import path from "path";
import axios from "axios";

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
      try {
        await qrcode.toFile(qrPath, qr);
        await bot.sendPhoto(chatId, qrPath, {
          caption: `🔑 امسح هذا الكود فورًا لتفعيل الرقم: ${number}`
        });
        setTimeout(() => fs.unlinkSync(qrPath), 10000);
      } catch (err) {
        await bot.sendMessage(chatId, "❌ حدث خطأ أثناء توليد رمز QR.");
      }
    }

    if (connection === "open") {
      await bot.sendMessage(chatId, `✅ تم الاتصال بالرقم (${number}) بنجاح!`);
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode || "غير معروف";
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        await bot.sendMessage(chatId, `⚠️ تم قطع الاتصال بالرقم (${number})، السبب: ${reason}. يتم إعادة الاتصال...`);
        setTimeout(() => startSession(number, chatId, bot), 5000);
      } else {
        await bot.sendMessage(chatId, `❌ تم تسجيل الخروج من الرقم (${number}) نهائيًا. الرجاء إعادة المصادقة.`);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // استقبال الأوامر من داخل واتساب
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!text) return;

    try {
      // أمر ping
      if (text.toLowerCase() === "ping") {
        await sock.sendMessage(sender, { text: "pong ✅" });
      }

      // أمر الوقت
      else if (text.toLowerCase() === "الوقت") {
        const now = new Date().toLocaleString("ar-EG");
        await sock.sendMessage(sender, { text: `🕓 الوقت الحالي: ${now}` });
      }

      // أمر من انت
      else if (text.toLowerCase() === "من انت") {
        await sock.sendMessage(sender, {
          text: "🤖 أنا بوت واتساب تم تطويري بواسطة طرزان الوقدي.\nاكتب (ping) أو (الوقت) أو (img قطة) مثلاً."
        });
      }

      // أمر استرجاع وسائط (vv)
      else if (text.toLowerCase() === "vv") {
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) {
          await sock.sendMessage(sender, {
            text: "❗️ الرجاء الرد على رسالة تحتوي على صورة أو فيديو أو صوت."
          }, { quoted: msg });
          return;
        }

        const quoted = contextInfo.quotedMessage;
        const messageKey = {
          remoteJid: sender,
          fromMe: false,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant
        };

        try {
          const buffer = await sock.downloadMediaMessage({ key: messageKey, message: quoted });

          let messageContent = {};
          const mtype = Object.keys(quoted)[0];

          if (mtype === "imageMessage") {
            messageContent = {
              image: buffer,
              caption: quoted.imageMessage?.caption || ''
            };
          } else if (mtype === "videoMessage") {
            messageContent = {
              video: buffer,
              caption: quoted.videoMessage?.caption || ''
            };
          } else if (mtype === "audioMessage") {
            messageContent = {
              audio: buffer,
              mimetype: "audio/mp4",
              ptt: quoted.audioMessage?.ptt || false
            };
          } else {
            await sock.sendMessage(sender, {
              text: "❌ هذا الأمر يدعم فقط الصور والفيديو والصوت."
            }, { quoted: msg });
            return;
          }

          await sock.sendMessage(sender, messageContent, { quoted: msg });

        } catch (err) {
          await sock.sendMessage(sender, {
            text: "❌ فشل في استرجاع الوسائط. تأكد من الرد على الوسائط مباشرة."
          }, { quoted: msg });
        }
      }

      // أمر البحث عن صورة
      else if (text.toLowerCase().startsWith("img ")) {
        const query = text.slice(4).trim();
        if (!query) {
          await sock.sendMessage(sender, { text: "❗️ اكتب كلمة بعد الأمر مثل: img قطة" });
          return;
        }

        await sock.sendMessage(sender, { text: `🔍 جاري البحث عن صورة لـ: ${query} ...` });

        try {
          const res = await axios.get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
            headers: {
              Authorization: '9vySYMFQtn9OjUO2jHt7CQ45Uwfw4fWyE3UcLouC4kb1oqc8Da8cNNHy'
            }
          });

          const photo = res.data.photos?.[0];
          if (photo?.src?.original) {
            await sock.sendMessage(sender, {
              image: { url: photo.src.original },
              caption: `📸 نتيجة البحث عن: ${query}`
            });
          } else {
            await sock.sendMessage(sender, { text: "❌ لم يتم العثور على صور." });
          }

        } catch (err) {
          console.error("خطأ في img:", err.message);
          await sock.sendMessage(sender, { text: "❌ حدث خطأ أثناء البحث عن الصورة." });
        }
      }

      // ✅ أمر تحميل فيديو من يوتيوب
      else if (text.toLowerCase().startsWith("video ")) {
        const query = text.slice(6).trim();
        if (!query) {
          await sock.sendMessage(sender, { text: "❗️ اكتب كلمة بعد الأمر مثل: video قطط مضحكة" });
          return;
        }

        await sock.sendMessage(sender, { text: `🔍 جاري البحث عن فيديو لـ: ${query} ...` });

        try {
          const ytSearch = await axios.get(`https://ytapi.p.rapidapi.com/search?query=${encodeURIComponent(query)}`, {
            headers: {
              "X-RapidAPI-Key": "8f770b32eamsh77f6cde7cef6374p15c016jsnf9edab9e6aed",
              "X-RapidAPI-Host": "ytapi.p.rapidapi.com"
            }
          });

          const result = ytSearch.data.results?.[0];
          if (!result || !result.url) {
            await sock.sendMessage(sender, { text: "❌ لم يتم العثور على نتائج." });
            return;
          }

          const videoUrl = encodeURIComponent(result.url);

          let data;
          try {
            const res1 = await axios.get(`https://apis-keith.vercel.app/download/dlmp4?url=${videoUrl}`);
            data = res1.data;
            if (!data?.status || !data?.result?.downloadUrl) throw new Error("API 1 فشل");
          } catch {
            const res2 = await axios.get(`https://apis.davidcyriltech.my.id/download/ytmp4?url=${videoUrl}`);
            data = res2.data;
            if (!data?.success || !data?.result?.download_url) throw new Error("كلا الـ API فشلا");
          }

          const downloadUrl = data.result.downloadUrl || data.result.download_url;

          await sock.sendMessage(sender, {
            image: { url: result.thumbnail },
            caption: `🎬 *تم العثور على الفيديو:*\n\n📌 *العنوان:* ${result.title}\n⏱️ *المدة:* ${result.timestamp || "غير محددة"}\n🔗 *الرابط:* ${result.url}`
          });

          await sock.sendMessage(sender, {
            video: { url: downloadUrl },
            mimetype: "video/mp4",
            caption: "✅ *تم تحميل الفيديو بنجاح!*"
          });

        } catch (err) {
          console.error("Video command error:", err.message);
          await sock.sendMessage(sender, { text: `❌ حدث خطأ أثناء تحميل الفيديو:\n${err.message}` });
        }
      }

    } catch (error) {
      console.error("خطأ في الأوامر:", error);
      await sock.sendMessage(sender, { text: "❌ حدث خطأ أثناء تنفيذ الأمر." }, { quoted: msg });
    }
  });
    }
