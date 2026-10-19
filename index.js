const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    EmbedBuilder, ChannelType, PermissionsBitField, ActivityType, REST, Routes,
    SlashCommandBuilder } = require('discord.js');

/* ================== SUNUCU (Render health check) ================== */
const app = express();
app.get('/', (_req, res) => res.send('Bot aktif!'));
app.listen(process.env.PORT || 10000);

if (!process.env.TOKEN) throw new Error('TOKEN ortam değişkeni ayarlanmamış.');

/* ================== AYARLAR ================== */
const AYARLAR = {
    TOKEN: "MTU0NzI3NDc3OTk5MDQzMzg0Mg.G0XpIu.ldLT3fa-49EEuHAkQUVczjHJnX6XpUpnuYM2uE", // Yer tutucu; Render'daki TOKEN ortam değişkeni önceliklidir
    KURUCU_ROL_ID: '1539629513753755760',
    YETKILI_ROL_ID: '1539629513753755760',
    KATEGORI_ID: '1547551650464530462',
    ONERI_KANAL_ID: '1550824276305776660',
    KARSILAMA_KANAL_ID: '1547561101745459320',
    YONETICI_BASVURU_KANAL_ID: '1554867967517261895',
    SUNUCU_IP: 'oyna.kunefesmp.com.tr',
    YOUTUBE_KANAL_ID: 'UCAnAOiwGXdOk-axlTTEHloA',
    YOUTUBE_DUYURU_KANAL_ID: '1547583746012610671'
};

const KUFUR_LISTESI = ['amk', 'aq', 'oç', 'oc', 'piç', 'pic', 'sik', 'sikerim', 'yarrak',
    'orospu', 'ibne', 'yavşak', 'puşt', 'döl'];

// Eski regex uzun mesajlarda takılıyordu (backtracking) — bu sürüm hızlı.
function reklamMi(metin) {
    if (/discord\.(gg|io|me|li)|discord\.com\/invite/i.test(metin)) return true;
    return /(https?:\/\/|www\.)[a-z0-9-]+\.[a-z]{2,}/i.test(metin);
}

/* ================== YARDIMCI: 3 saniye kuralı ==================
   Discord, bir interaksiyona 3 saniye içinde yanıt ister. Bu iki fonksiyon
   her işlemin EN BAŞINDA çağrılır, sonra içerik editReply ile güncellenir.
   Böylece "Uygulama zamanında yanıt vermedi" hatası biter.            */
async function yanitla(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
    }
}
async function bitir(interaction, icerik) {
    if (interaction.deferred) return interaction.editReply(icerik).catch(() => {});
    if (interaction.replied) return interaction.followUp(icerik).catch(() => {});
    return interaction.reply(icerik).catch(() => {});
}

/* ================== DURUM HARİTALARI ================== */
const oneriOylari = new Map();
const etkinlikKatilimlari = new Map();
const cekilisler = new Map();
const YOUTUBE_DURUM = path.join(__dirname, 'youtube-video-state.json');
let gorulenVideoIdleri = new Set();
let youtubeKontrolEdiliyor = false;

try { gorulenVideoIdleri = new Set(JSON.parse(fs.readFileSync(YOUTUBE_DURUM, 'utf8')).gorulenVideoIdleri || []); } catch {}

function youtubeDurumunuKaydet() {
    const liste = [...gorulenVideoIdleri].slice(-100);
    gorulenVideoIdleri = new Set(liste);
    fs.writeFileSync(YOUTUBE_DURUM, JSON.stringify({ gorulenVideoIdleri: liste }, null, 2));
}

/* ================== YOUTUBE TAKİBİ ================== */
const xmlCoz = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function youtubeKontrolEt() {
    if (youtubeKontrolEdiliyor) return;
    const { YOUTUBE_KANAL_ID: id, YOUTUBE_DUYURU_KANAL_ID: duyuruId } = AYARLAR;
    if (!id || id.startsWith('BURAYA_') || !duyuruId || duyuruId.startsWith('BURAYA_')) return;

    youtubeKontrolEdiliyor = true;
    try {
        const yanit = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
        if (!yanit.ok) throw new Error(`RSS ${yanit.status}`);
        const xml = await yanit.text();
        const videolar = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(e => {
            const b = e[1];
            return {
                videoId: b.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1],
                baslik: b.match(/<title>([\s\S]*?)<\/title>/)?.[1],
                yayin: Date.parse(b.match(/<published>([^<]+)<\/published>/)?.[1] || '') || 0
            };
        }).filter(v => v.videoId && v.baslik).sort((a, b) => a.yayin - b.yayin);
        if (!videolar.length) return;

        // İlk çalıştırmada sadece mevcut videoları kaydet, duyuru yapma
        if (gorulenVideoIdleri.size === 0) {
            videolar.forEach(v => gorulenVideoIdleri.add(v.videoId));
            youtubeDurumunuKaydet();
            return;
        }

        const kanal = await client.channels.fetch(duyuruId);
        if (!kanal?.isTextBased()) throw new Error('YouTube duyuru kanalı bulunamadı.');

        for (const v of videolar.filter(v => !gorulenVideoIdleri.has(v.videoId))) {
            const url = `https://www.youtube.com/watch?v=${v.videoId}`;
            // 100 mesaj yerine 20 mesaj çekiyo — büyük performans farkı
            const eski = await kanal.messages.fetch({ limit: 20 }).catch(() => null);
            const zatenVar = eski?.some(m => m.content.includes(url) || m.embeds.some(e => e.url === url));
            if (!zatenVar) {
                await kanal.send({ embeds: [new EmbedBuilder().setColor(0xFF0000)
                    .setAuthor({ name: 'Künefe Bey • Yeni Video', iconURL: client.user.displayAvatarURL() })
                    .setTitle(v.baslik.slice(0, 256)).setURL(url)
                    .setDescription(`🎬 **Künefe Bey yeni bir video paylaştı!**\n\n[Videoyu izlemek için tıkla](${url})`)
                    .setImage(`https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`)
                    .setFooter({ text: 'KünefeSMP • YouTube duyuruları' }).setTimestamp(v.yayin || Date.now()) ] });
            }
            gorulenVideoIdleri.add(v.videoId);
            youtubeDurumunuKaydet();
        }
    } catch (err) { console.error('YouTube kontrolü:', err); }
    finally { youtubeKontrolEdiliyor = false; }
}

/* ================== MİNECRAFT SUNUCU DURUMU ================== */
async function sunucuDurumGuncelle() {
    try {
        const veri = await (await fetch(`https://api.mcstatus.io/v2/status/java/${AYARLAR.SUNUCU_IP}`)).json();
        client.user.setPresence({ activities: [{ name: 'custom',
            state: veri.online
                ? `🟢 KünefeSMP Açık! | ${AYARLAR.SUNUCU_IP} | 1.21-26.2`
                : `🔴 Sunucu Kapalı/Bakımda | ${AYARLAR.SUNUCU_IP}`,
            type: ActivityType.Custom }], status: veri.online ? 'online' : 'dnd' });
    } catch (err) { console.error('Sunucu durumu:', err); }
}

/* ================== SLASH KOMUT KAYDI ================== */
const S = (ad, aciklama, ...opsiyonlar) => {
    const c = new SlashCommandBuilder().setName(ad).setDescription(aciklama);
    opsiyonlar.forEach(o => c.addStringOption(x =>
        x.setName(o.ad).setDescription(o.aciklama).setRequired(Boolean(o.zorunlu))));
    return c.toJSON();
};

async function slashKomutlariniKaydet() {
    const guild = client.guilds.cache.first();
    if (!guild) throw new Error('Discord sunucusu bulunamadı.');
    const komutlar = [
        S('öneri', 'KünefeSMP için öneri gönderir.', { ad: 'metin', aciklama: 'Önerini yaz', zorunlu: true }),
        S('oneri', 'KünefeSMP için öneri gönderir.', { ad: 'metin', aciklama: 'Önerini yaz', zorunlu: true }),
        S('sunucu', 'Minecraft sunucusunun durumunu gösterir.'),
        S('ip', 'Minecraft sunucusunun durumunu gösterir.'),
        S('etkinlik', 'Etkinlik duyurusu oluşturur.',
            { ad: 'zaman', aciklama: 'Etkinliğin zamanı', zorunlu: true },
            { ad: 'yer', aciklama: 'Buluşma yeri', zorunlu: true }),
        S('çekiliş', 'Süreli çekiliş başlatır.',
            { ad: 'sure', aciklama: 'Örnek: 30m, 2h veya 1d', zorunlu: true },
            { ad: 'odul', aciklama: 'Çekiliş ödülü', zorunlu: true }),
        S('cekilis', 'Süreli çekiliş başlatır.',
            { ad: 'sure', aciklama: 'Örnek: 30m, 2h veya 1d', zorunlu: true },
            { ad: 'odul', aciklama: 'Çekiliş ödülü', zorunlu: true }),
        S('destek-kur', 'Destek panelini bu kanala kurar.'),
        S('yonetici-alim-kur', 'Yönetici başvuru panelini bu kanala kurar.')
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: komutlar });
    console.log(`[+] ${komutlar.length} slash komutu ${guild.name} sunucusuna kaydedildi.`);
}

client.once('ready', () => {
    console.log(`[+] Bot aktif: ${client.user.tag}`);
    sunucuDurumGuncelle();
    setInterval(sunucuDurumGuncelle, 30000);
    youtubeKontrolEt();
    setInterval(youtubeKontrolEt, 120000);
    slashKomutlariniKaydet().catch(err => console.error('Slash komutları:', err));
});


/* ================== KARŞILAMA ================== */
client.on('guildMemberAdd', async member => {
    const kanal = member.guild.channels.cache.get(AYARLAR.KARSILAMA_KANAL_ID);
    if (!kanal?.isTextBased()) return;
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'KünefeSMP', iconURL: member.guild.iconURL({ forceStatic: false }) || client.user.displayAvatarURL() })
        .setTitle('Yeni Bir Dostumuz Var!')
        .setDescription(`Hoş geldin ${member} 👋\n\nAramıza yeni biri katıldı!\n**Sunucumuza hoş geldin, rahatına bak!**`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 })).setColor(0xFF0000);
    await kanal.send({ embeds: [embed] }).catch(err => console.error('Karşılama:', err));
});

/* ================== ÖNERİ OLUŞTUR ================== */
function oneriyiGonderiYap({ kanal, metin, kullanici }) {
    const embed = new EmbedBuilder().setTitle('💡 Yeni Sunucu Önerisi')
        .setDescription(metin.slice(0, 4000)).setColor(0xF1C40F)
        .setAuthor({ name: kullanici.tag || kullanici.username, iconURL: kullanici.displayAvatarURL() })
        .setFooter({ text: 'KünefeSMP • Öneri Sistemi' }).setTimestamp();
    const butonlar = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('oneri_evet').setLabel('Evet (0)').setEmoji('👍').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('oneri_hayir').setLabel('Hayır (0)').setEmoji('👎').setStyle(ButtonStyle.Danger));
    return kanal.send({ embeds: [embed], components: [butonlar] }).then(mesaj => {
        oneriOylari.set(mesaj.id, { evet: new Set(), hayir: new Set() });
        return mesaj;
    });
}

/* ================== MESAJ FİLTRESİ ================== */
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const isYetkili = message.member?.permissions.has(PermissionsBitField.Flags.Administrator) ||
        (AYARLAR.YETKILI_ROL_ID && message.member?.roles.cache.has(AYARLAR.YETKILI_ROL_ID));
    const kucuk = message.content.toLowerCase();

    if (!isYetkili) {
        const kendiAdresi = kucuk.includes(AYARLAR.SUNUCU_IP.toLowerCase());
        if (!kendiAdresi && reklamMi(message.content)) {
            await message.delete().catch(() => {});
            const uyari = await message.channel.send(`⚠️ ${message.author}, reklam veya dış bağlantı paylaşmak yasaktır!`).catch(() => null);
            if (uyari) setTimeout(() => uyari.delete().catch(() => {}), 4000);
            return;
        }
        if (KUFUR_LISTESI.some(kelime => kucuk.includes(kelime))) {
            await message.delete().catch(() => {});
            const uyari = await message.channel.send(`⚠️ ${message.author}, lütfen küfür ve hakaret içeren kelimeler kullanma!`).catch(() => null);
            if (uyari) setTimeout(() => uyari.delete().catch(() => {}), 4000);
            return;
        }
    }

    // Öneri kanalına yazılan mesajı otomatik öneriye dönüştür
    if (message.channelId === AYARLAR.ONERI_KANAL_ID) {
        const metin = message.content.trim();
        if (!metin) return;
        await message.delete().catch(() => {});
        await oneriyiGonderiYap({ kanal: message.channel, metin, kullanici: message.author })
            .catch(err => console.error('Otomatik öneri:', err));
        return;
    }

    const icerik = kucuk.trim();
    if (icerik === 'sa' || icerik === 'sa.') return message.reply('as');
    if (['selamunaleykum', 'selamünaleyküm', 'saleykum', 's.a.'].includes(icerik)) return message.reply('aleykumselam');
    if (icerik === 'sa chat' || icerik === 'sa chat.') return message.reply('as babomen');
    if (icerik === 'sa çet' || icerik === 'sa çet.') return message.reply('as');
});

function komutYetkilisiMi(interaction) {
    return Boolean(
        interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ||
        interaction.guild?.ownerId === interaction.user.id ||
        (AYARLAR.KURUCU_ROL_ID && interaction.member?.roles?.cache?.has(AYARLAR.KURUCU_ROL_ID)));
}

/* ================== SLASH KOMUTLARI ================== */
async function slashKomutunuCalistir(interaction) {
    const ad = interaction.commandName;
    const isYetkili = komutYetkilisiMi(interaction);

    // ---- ÖNERİ ----
    if (ad === 'öneri' || ad === 'oneri') {
        if (AYARLAR.ONERI_KANAL_ID && interaction.channelId !== AYARLAR.ONERI_KANAL_ID) {
            return interaction.reply({ content: `❌ Önerini yalnızca <#${AYARLAR.ONERI_KANAL_ID}> kanalında gönderebilirsin.`, ephemeral: true });
        }
        const metin = interaction.options.getString('metin', true).trim();
        if (!metin) return interaction.reply({ content: '❌ Öneri metni boş olamaz.', ephemeral: true });
        await yanitla(interaction);
        await oneriyiGonderiYap({ kanal: interaction.channel, metin, kullanici: interaction.user });
        return bitir(interaction, { content: '✅ Önerin gönderildi!' });
    }

    // ---- SUNUCU DURUMU ----
    if (ad === 'sunucu' || ad === 'ip') {
        await yanitla(interaction);
        try {
            const veri = await (await fetch(`https://api.mcstatus.io/v2/status/java/${AYARLAR.SUNUCU_IP}`)).json();
            const embed = new EmbedBuilder().setColor(veri.online ? 0x2ECC71 : 0xE74C3C)
                .setTitle(veri.online ? '🟢 KünefeSMP Çevrimiçi!' : '🔴 KünefeSMP Kapalı / Bakımda')
                .setDescription(veri.online
                    ? 'Sunucumuz aktif ve oyunculara açık. Hemen katıl!'
                    : `Sunucuya şu anda ulaşılamıyor. Bakımda olabilir.\n\n📡 IP: \`${AYARLAR.SUNUCU_IP}\``)
                .addFields({ name: '📡 Sunucu adresi', value: `\`${AYARLAR.SUNUCU_IP}\``, inline: true });
            if (veri.online) embed.addFields(
                { name: '👥 Oyuncular', value: `**${veri.players.online}** / **${veri.players.max}**`, inline: true },
                { name: '🎮 Sürüm', value: '1.21+', inline: true });
            return bitir(interaction, { embeds: [embed] });
        } catch (err) {
            console.error('Sunucu durumu:', err);
            return bitir(interaction, { content: '❌ Sunucu durumuna ulaşılırken hata oluştu.' });
        }
    }

    // ---- ETKİNLİK ----
    if (ad === 'etkinlik') {
        if (!isYetkili) return interaction.reply({ content: '❌ Bu komutu yalnızca yöneticiler kullanabilir.', ephemeral: true });
        const zaman = interaction.options.getString('zaman', true).trim();
        const yer = interaction.options.getString('yer', true).trim();
        if (zaman.length > 100 || yer.length > 100) return interaction.reply({ content: '❌ Zaman ve yer en fazla 100 karakter olabilir.', ephemeral: true });
        await yanitla(interaction);
        const embed = new EmbedBuilder().setColor(0x8E44AD).setTitle('🎉 Yeni Bir Etkinlik Başlıyor!')
            .setDescription('Selam **KünefeSMP ailesi!** 🍯\n\nKatılmak için aşağıdaki düğmeye bas.')
            .addFields(
                { name: '🕒 Zaman', value: zaman, inline: true },
                { name: '📍 Buluşma yeri', value: yer, inline: true },
                { name: '🎮 Sunucu', value: AYARLAR.SUNUCU_IP, inline: true })
            .setFooter({ text: 'Katılımını düğmeye basarak bildir • KünefeSMP' }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('etkinlik_katil').setLabel('Katılacağım (0)').setEmoji('🙋').setStyle(ButtonStyle.Success));
        const sent = await interaction.channel.send({ embeds: [embed], components: [row] });
        etkinlikKatilimlari.set(sent.id, new Set());
        return bitir(interaction, { content: `✅ Etkinlik duyurusu oluşturuldu: ${sent}` });
    }

    // ---- ÇEKİLİŞ ----
    if (ad === 'çekiliş' || ad === 'cekilis') {
        if (!isYetkili) return interaction.reply({ content: '❌ Çekilişi yalnızca yöneticiler başlatabilir.', ephemeral: true });
        const sureMetni = interaction.options.getString('sure', true).trim();
        const odul = interaction.options.getString('odul', true).trim();
        const eslesme = sureMetni.match(/^(\d+)\s*([mhd])$/i);
        if (!eslesme) return interaction.reply({ content: '📝 Süreyi `30m`, `2h` veya `1d` biçiminde gir.', ephemeral: true });
        const carpan = { m: 60000, h: 3600000, d: 86400000 }[eslesme[2].toLowerCase()];
        const sureMs = Number(eslesme[1]) * carpan;
        if (!Number.isSafeInteger(sureMs) || sureMs < 60000 || sureMs > 100 * 86400000)
            return interaction.reply({ content: '⏱️ Süre 1 dakika ile 100 gün arasında olmalı.', ephemeral: true });
        if (!odul || odul.length > 200) return interaction.reply({ content: '❌ Ödül 1-200 karakter olmalı.', ephemeral: true });

        await yanitla(interaction);
        const bitis = Date.now() + sureMs;
        const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle('🎁 Şansını Dene, Ödülü Kazan!')
            .setDescription(`**Ödül:** ${odul}\n\nKatılmak için aşağıdaki düğmeye bas.`)
            .addFields(
                { name: '⏳ Bitiş', value: `<t:${Math.floor(bitis / 1000)}:R>`, inline: true },
                { name: '🙋 Katılımcılar', value: '0 kişi', inline: true })
            .setFooter({ text: 'Her oyuncu bir kez katılabilir • KünefeSMP' }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cekilis_katil').setLabel('Çekilişe Katıl (0)').setEmoji('🎉').setStyle(ButtonStyle.Success));
        const sent = await interaction.channel.send({ embeds: [embed], components: [row] });
        cekilisler.set(sent.id, { katilimcilar: new Set(), kanalId: interaction.channel.id, bitisZamani: bitis, zamanlayici: null });
        cekilisZamanlayicisiniKur(sent.id, bitis);
        return bitir(interaction, { content: `✅ Çekiliş oluşturuldu: ${sent}` });
    }

    // ---- DESTEK PANELİ (düzeltilen kısım) ----
    if (ad === 'destek-kur') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator))
            return interaction.reply({ content: '❌ Bu komutu yalnızca yöneticiler kullanabilir.', ephemeral: true });
        // ÖNCE yanıtla, sonra gönder — eskisi burada geç kalıyordu
        await yanitla(interaction);
        const embed = new EmbedBuilder().setTitle('🍯 KünefeSMP Yardım ve Destek Masası')
            .setDescription('Bir sorunla mı karşılaştın veya yardıma mı ihtiyacın var? Aşağıdaki düğmeyle sana özel destek talebi açabilirsin.')
            .setColor(0xE67E22).setFooter({ text: 'KünefeSMP • Destek' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bilet_olustur').setLabel('Destek Talebi Oluştur').setEmoji('🎫').setStyle(ButtonStyle.Primary));
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return bitir(interaction, { content: '✅ Destek paneli kuruldu.' });
    }

    // ---- YÖNETİCİ ALIM PANELİ (düzeltilen kısım) ----
    if (ad === 'yonetici-alim-kur') {
        if (!isYetkili) return interaction.reply({ content: '❌ Bu komutu yalnızca yöneticiler veya kurucular kullanabilir.', ephemeral: true });
        // ÖNCE yanıtla, sonra gönder — eskisi burada geç kalıyordu ve hata veriyordu
        await yanitla(interaction);
        const embed = new EmbedBuilder().setColor(0xE67E22).setTitle('🍯 KünefeSMP Yönetici Alımı')
            .setDescription('Ekibimize katılmak için **Başvuru Yap** düğmesine tıkla ve formu doldur. Başvurun yönetim ekibine iletilecek.')
            .setFooter({ text: 'KünefeSMP • Yönetici Başvurusu' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('yonetici_basvuru_baslat').setLabel('Başvuru Yap').setEmoji('📝').setStyle(ButtonStyle.Primary));
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return bitir(interaction, { content: '✅ Yönetici başvuru paneli bu kanala kuruldu.' });
    }
}

/* ================== ETKİLEŞİMLER ================== */
client.on('interactionCreate', async interaction => {
    try {
        // --- Slash komutlar ---
        if (interaction.isChatInputCommand()) return slashKomutunuCalistir(interaction);

        // --- Destek talebi butonu (hemen yanıt) ---
        if (interaction.isButton() && interaction.customId === 'bilet_olustur') {
            const menu = new StringSelectMenuBuilder().setCustomId('bilet_kategori_secimi').setPlaceholder('Destek konusunu seç')
                .addOptions(
                    { label: 'Teknik sorun', description: 'Sunucu veya oyun içi teknik sorunlar', value: 'teknik', emoji: '🛠️' },
                    { label: 'Oyuncu bildirimi', description: 'Oyuncu bildirimi veya şikâyet', value: 'oyuncu', emoji: '👤' },
                    { label: 'Mağaza / ödeme', description: 'Alışveriş ve ödeme sorunları', value: 'magaza', emoji: '🛒' },
                    { label: 'Öneri / diğer', description: 'Öneri veya diğer konular', value: 'diger', emoji: '💡' });
            return interaction.reply({ content: '🎫 Hangi konuda destek istiyorsun?', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }

        // --- Yönetici başvuru butonu (modal açar, defer YOK) ---
        if (interaction.isButton() && interaction.customId === 'yonetici_basvuru_baslat') {
            const modal = new ModalBuilder().setCustomId('yonetici_basvuru_formu').setTitle('Yönetici Başvurusu');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('minecraft_adi').setLabel('Minecraft kullanıcı adın').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('yas').setLabel('Yaş aralığın').setStyle(TextInputStyle.Short).setPlaceholder('Örnek: 16-18').setRequired(true).setMaxLength(20)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('deneyim').setLabel('Yetkili deneyimin').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(700)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('neden').setLabel('Neden ekibimize katılmak istiyorsun?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)));
            return interaction.showModal(modal);
        }

        // --- Destek kategori menüsü (modal açar, defer YOK) ---
        if (interaction.isStringSelectMenu() && interaction.customId === 'bilet_kategori_secimi') {
            const kategori = interaction.values[0];
            const basliklar = { teknik: 'Teknik Sorun', oyuncu: 'Oyuncu Bildirimi', magaza: 'Mağaza / Ödeme', diger: 'Öneri / Diğer' };
            const modal = new ModalBuilder().setCustomId(`bilet_form:${kategori}`).setTitle(`${basliklar[kategori]} Talebi`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('minecraft_adi').setLabel('Minecraft kullanıcı adın').setStyle(TextInputStyle.Short).setPlaceholder('Örnek: UnplugMC').setRequired(true).setMaxLength(32)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('talep_aciklamasi').setLabel('Sorununu veya önerini açıkla').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(5).setMaxLength(1000)));
            return interaction.showModal(modal);
        }

        // --- Yönetici başvuru formu ---
        if (interaction.isModalSubmit() && interaction.customId === 'yonetici_basvuru_formu') {
            await yanitla(interaction);
            const kanalId = AYARLAR.YONETICI_BASVURU_KANAL_ID;
            if (!kanalId || kanalId.startsWith('YETKILILERE_'))
                return bitir(interaction, '❌ Bot yöneticisi başvuru inceleme kanalının ID bilgisini ayarlamamış.');
            const kanal = await client.channels.fetch(kanalId).catch(() => null);
            if (!kanal?.isTextBased()) return bitir(interaction, '❌ Başvuru inceleme kanalı bulunamadı.');

            const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle('📝 Yeni Yönetici Başvurusu')
                .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                .addFields(
                    { name: 'Minecraft adı', value: interaction.fields.getTextInputValue('minecraft_adi') },
                    { name: 'Yaş aralığı', value: interaction.fields.getTextInputValue('yas') },
                    { name: 'Yetkili deneyimi', value: interaction.fields.getTextInputValue('deneyim') },
                    { name: 'Katılma nedeni', value: interaction.fields.getTextInputValue('neden') },
                    { name: 'Discord hesabı', value: `${interaction.user} (${interaction.user.id})` })
                .setFooter({ text: `Başvuru sahibi ID: ${interaction.user.id}` }).setTimestamp();
            const karar = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('yonetici_basvuru_onayla').setLabel('Onayla').setEmoji('✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('yonetici_basvuru_reddet').setLabel('Reddet').setEmoji('❌').setStyle(ButtonStyle.Danger));
            await kanal.send({
                content: AYARLAR.YETKILI_ROL_ID ? `<@&${AYARLAR.YETKILI_ROL_ID}>` : undefined,
                embeds: [embed], components: [karar],
                allowedMentions: { roles: AYARLAR.YETKILI_ROL_ID ? [AYARLAR.YETKILI_ROL_ID] : [] } });
            return bitir(interaction, '✅ Başvurun yönetim ekibine iletildi.');
        }

        // --- Destek talebi formu ---
        if (interaction.isModalSubmit() && interaction.customId.startsWith('bilet_form:')) {
            const kategori = interaction.customId.split(':')[1];
            const bilgi = { teknik: { ad: 'teknik', baslik: '🛠️ Teknik Sorun' },
                            oyuncu: { ad: 'oyuncu', baslik: '👤 Oyuncu Bildirimi' },
                            magaza: { ad: 'magaza', baslik: '🛒 Mağaza / Ödeme' },
                            diger:  { ad: 'diger',  baslik: '💡 Öneri / Diğer' } }[kategori];
            if (!bilgi) return interaction.reply({ content: '❌ Kategori geçerli değil.', ephemeral: true });

            await yanitla(interaction);
            const topic = `kunefesmp-ticket:${interaction.user.id}`;
            const mevcut = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === topic);
            if (mevcut) return bitir(interaction, { content: `❌ Zaten açık bir destek talebin var: ${mevcut}` });

            const guvenliAd = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 35) || 'oyuncu';
            const izinler = [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ReadMessageHistory] }];
            if (AYARLAR.YETKILI_ROL_ID && interaction.guild.roles.cache.has(AYARLAR.YETKILI_ROL_ID)) {
                izinler.push({ id: AYARLAR.YETKILI_ROL_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ReadMessageHistory] });
            }
            try {
                const kanal = await interaction.guild.channels.create({
                    name: `talep-${bilgi.ad}-${guvenliAd}`.slice(0, 90), type: ChannelType.GuildText,
                    parent: AYARLAR.KATEGORI_ID || null, topic, permissionOverwrites: izinler });
                const embed = new EmbedBuilder().setTitle(bilgi.baslik)
                    .setDescription(interaction.fields.getTextInputValue('talep_aciklamasi'))
                    .addFields(
                        { name: 'Oyuncu', value: `${interaction.user}`, inline: true },
                        { name: 'Minecraft adı', value: `\`${interaction.fields.getTextInputValue('minecraft_adi')}\``, inline: true })
                    .setColor(0xE67E22).setTimestamp();
                const kapat = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('bilet_kapat').setLabel('Talebi Kapat').setEmoji('🔒').setStyle(ButtonStyle.Danger));
                await kanal.send({ content: `${interaction.user} ${AYARLAR.YETKILI_ROL_ID ? `<@&${AYARLAR.YETKILI_ROL_ID}>` : ''}`, embeds: [embed], components: [kapat] });
                return bitir(interaction, { content: `✅ Talebin oluşturuldu: ${kanal}` });
            } catch (err) {
                console.error('Talep oluşturma:', err);
                return bitir(interaction, '❌ Talep oluşturulamadı. Botun kanal oluşturma izinlerini ve kategori ayarını kontrol edin.');
            }
        }

        if (!interaction.isButton()) return;

        // --- Başvuru onay / ret ---
        if (interaction.customId === 'yonetici_basvuru_onayla' || interaction.customId === 'yonetici_basvuru_reddet') {
            if (!komutYetkilisiMi(interaction)) return interaction.reply({ content: '❌ Bu başvuruyu sonuçlandırma yetkin yok.', ephemeral: true });
            const onay = interaction.customId === 'yonetici_basvuru_onayla';
            const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(onay ? 0x2ECC71 : 0xE74C3C)
                .addFields({ name: 'Başvuru durumu', value: `${onay ? '✅ Onaylandı' : '❌ Reddedildi'} — ${interaction.user}` });
            const kapali = new ActionRowBuilder().addComponents(
                ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true),
                ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true));
            return interaction.update({ embeds: [embed], components: [kapali] });
        }

        // --- Talep kapatma ---
        if (interaction.customId === 'bilet_kapat') {
            const yetkili = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels) ||
                interaction.member?.roles?.cache?.has(AYARLAR.YETKILI_ROL_ID);
            const sahibi = interaction.channel?.topic === `kunefesmp-ticket:${interaction.user.id}`;
            if (!yetkili && !sahibi) return interaction.reply({ content: '❌ Bu talebi kapatma yetkin yok.', ephemeral: true });
            await interaction.reply({ content: '🔒 Destek talebi kapatılıyor…', ephemeral: true });
            return interaction.channel.delete().catch(err => console.error('Talep silinemedi:', err));
        }

        // --- Etkinlik katılım ---
        if (interaction.customId === 'etkinlik_katil') {
            const katilimcilar = etkinlikKatilimlari.get(interaction.message.id) || new Set();
            const vardi = katilimcilar.has(interaction.user.id);
            vardi ? katilimcilar.delete(interaction.user.id) : katilimcilar.add(interaction.user.id);
            etkinlikKatilimlari.set(interaction.message.id, katilimcilar);
            const buton = ButtonBuilder.from(interaction.message.components[0].components[0]).setLabel(`Katılacağım (${katilimcilar.size})`);
            await interaction.update({ components: [new ActionRowBuilder().addComponents(buton)] });
            return interaction.followUp({ content: vardi ? 'Etkinlik katılımın kaldırıldı.' : 'Etkinliğe katıldın! 🎉', ephemeral: true });
        }

        // --- Çekiliş katılım ---
        if (interaction.customId === 'cekilis_katil') {
            const cekilis = cekilisler.get(interaction.message.id);
            if (!cekilis) return interaction.reply({ content: 'Bu çekiliş artık aktif değil. Yeni çekilişleri takip et!', ephemeral: true });
            const vardi = cekilis.katilimcilar.has(interaction.user.id);
            vardi ? cekilis.katilimcilar.delete(interaction.user.id) : cekilis.katilimcilar.add(interaction.user.id);
            const embed = EmbedBuilder.from(interaction.message.embeds[0]).setFields(
                { name: '⏳ Bitiş', value: `<t:${Math.floor(cekilis.bitisZamani / 1000)}:R>`, inline: true },
                { name: '🙋 Katılımcılar', value: `${cekilis.katilimcilar.size} kişi`, inline: true });
            const buton = ButtonBuilder.from(interaction.message.components[0].components[0]).setLabel(`Çekilişe Katıl (${cekilis.katilimcilar.size})`);
            await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(buton)] });
            return interaction.followUp({ content: vardi ? 'Çekiliş katılımın kaldırıldı.' : 'Çekilişe katıldın! Bol şans 🍀', ephemeral: true });
        }

        // --- Öneri oylama ---
        if (interaction.customId === 'oneri_evet' || interaction.customId === 'oneri_hayir') {
            const oylar = oneriOylari.get(interaction.message.id) || { evet: new Set(), hayir: new Set() };
            const olumlu = interaction.customId === 'oneri_evet';
            const kendi = olumlu ? oylar.evet : oylar.hayir;
            const diger = olumlu ? oylar.hayir : oylar.evet;
            if (kendi.has(interaction.user.id))
                return interaction.reply({ content: `❌ Zaten "${olumlu ? 'Evet' : 'Hayır'}" oyu kullanmışsın.`, ephemeral: true });
            diger.delete(interaction.user.id);
            kendi.add(interaction.user.id);
            oneriOylari.set(interaction.message.id, oylar);
            const row = interaction.message.components[0];
            const evet = ButtonBuilder.from(row.components[0]).setLabel(`Evet (${oylar.evet.size})`);
            const hayir = ButtonBuilder.from(row.components[1]).setLabel(`Hayır (${oylar.hayir.size})`);
            return interaction.update({ components: [new ActionRowBuilder().addComponents(evet, hayir)] });
        }
    } catch (err) {
        console.error('Etkileşim:', err);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ İşlem sırasında bir hata oluştu.', ephemeral: true }).catch(() => {});
        }
    }
});

/* ================== ÇEKİLİŞ SÜRESİ DOLUMU ================== */
function cekilisZamanlayicisiniKur(duyuruId, bitisZamani) {
    const cekilis = cekilisler.get(duyuruId);
    if (!cekilis) return;
    const kalan = bitisZamani - Date.now();
    if (kalan <= 0) return cekilisiBitir(duyuruId);
    cekilis.zamanlayici = setTimeout(() => cekilisZamanlayicisiniKur(duyuruId, bitisZamani), Math.min(kalan, 2_000_000_000));
}

async function cekilisiBitir(duyuruId) {
    const cekilis = cekilisler.get(duyuruId);
    if (!cekilis) return;
    clearTimeout(cekilis.zamanlayici);
    cekilisler.delete(duyuruId);
    try {
        const kanal = await client.channels.fetch(cekilis.kanalId);
        if (!kanal?.isTextBased()) return;
        const mesaj = await kanal.messages.fetch(duyuruId);
        const katilimcilar = [...cekilis.katilimcilar];
        const kazanan = katilimcilar.length ? katilimcilar[Math.floor(Math.random() * katilimcilar.length)] : null;
        const embed = EmbedBuilder.from(mesaj.embeds[0]).setColor(kazanan ? 0x2ECC71 : 0x95A5A6).setFields(
            { name: '🏁 Durum', value: 'Çekiliş sona erdi', inline: true },
            { name: '🙋 Katılımcılar', value: `${katilimcilar.length} kişi`, inline: true },
            { name: '🏆 Kazanan', value: kazanan ? `<@${kazanan}>` : 'Katılan olmadığı için kazanan seçilemedi.' });
        const buton = ButtonBuilder.from(mesaj.components[0].components[0]).setLabel('Çekiliş Sona Erdi').setDisabled(true).setStyle(ButtonStyle.Secondary);
        await mesaj.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(buton)] });
        if (kazanan) await kanal.send({ content: `🎉 Tebrikler <@${kazanan}>! Çekilişi kazandın!`, allowedMentions: { users: [kazanan] } });
        else await kanal.send('Çekiliş sona erdi ama katılan olmadığı için kazanan çıkmadı.');
    } catch (err) { console.error('Çekiliş bitirme:', err); }
}

client.login(process.env.TOKEN);
