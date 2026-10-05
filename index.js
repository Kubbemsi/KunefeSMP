const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('Bot aktif!'));
app.listen(port, () => console.log(`Port dinleniyor: ${port}`));

const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    ChannelType,
    PermissionsBitField,
    ActivityType,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

if (!process.env.TOKEN) {
    throw new Error('TOKEN ortam değişkeni ayarlanmamış. Render Environment bölümüne bot tokenını ekle.');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ================= AYARLAR =================
const AYARLAR = {
    KURUCU_ROL_ID: '1539629513753755760',
    TOKEN: "MTU0NzI3NDc3OTk5MDQzMzg0Mg.G0XpIu.ldLT3fa-49EEuHAkQUVczjHJnX6XpUpnuYM2uE", // Yer tutucu; Render'daki TOKEN ortam değişkeni önceliklidir
    YETKILI_ROL_ID: '1539629513753755760',
    KATEGORI_ID: '1547551650464530462',
    ONERI_KANAL_ID: '1550824276305776660',
    KARSILAMA_KANAL_ID: '1547561101745459320',
    // Yetkililerin görebildiği başvuru inceleme kanalının ID'sini buraya yaz.
    YONETICI_BASVURU_KANAL_ID: '1554867967517261895',
    SUNUCU_IP: 'oyna.kunefesmp.com.tr',
    YOUTUBE_KANAL_ID: 'UCAnAOiwGXdOk-axlTTEHloA',
    YOUTUBE_DUYURU_KANAL_ID: '1547583746012610671'
};

const KUFUR_LISTESI = [
    'amk', 'aq', 'oç', 'oc', 'piç', 'pic', 'sik', 'sikerim',
    'yarrak', 'orospu', 'ibne', 'yavşak', 'puşt', 'döl'
];
const REKLAM_REGEX = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li|com\/invite)|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?)/i;

const oneriOylari = new Map();
const etkinlikKatilimlari = new Map();
const cekilisler = new Map();
const YOUTUBE_DURUM_DOSYASI = path.join(__dirname, 'youtube-video-state.json');
let youtubeGorulenVideolar = new Set();
let youtubeKontrolEdiliyor = false;

try {
    const durum = JSON.parse(fs.readFileSync(YOUTUBE_DURUM_DOSYASI, 'utf8'));
    youtubeGorulenVideolar = new Set(durum.gorulenVideoIdleri || []);
} catch {
    // İlk çalıştırmada durum dosyası olmayabilir.
}

// ================= YOUTUBE YENİ VİDEO TAKİBİ =================
function xmlMetniniCoz(metin) {
    return metin.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function youtubeDurumunuKaydet() {
    const gorulenVideoIdleri = [...youtubeGorulenVideolar].slice(-100);
    youtubeGorulenVideolar = new Set(gorulenVideoIdleri);
    fs.writeFileSync(YOUTUBE_DURUM_DOSYASI, JSON.stringify({ gorulenVideoIdleri }, null, 2));
}

async function youtubeSonVideoKontrolEt() {
    if (youtubeKontrolEdiliyor) return;
    const kanalId = AYARLAR.YOUTUBE_KANAL_ID;
    const duyuruId = AYARLAR.YOUTUBE_DUYURU_KANAL_ID;
    if (!kanalId || kanalId.startsWith('BURAYA_') || !duyuruId || duyuruId.startsWith('BURAYA_')) return;

    youtubeKontrolEdiliyor = true;
    try {
        const yanit = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(kanalId)}`);
        if (!yanit.ok) throw new Error(`YouTube RSS yanıtı: ${yanit.status}`);
        const xml = await yanit.text();
        const videolar = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(eslesme => {
            const entry = eslesme[1];
            const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
            const baslik = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
            const yayin = entry.match(/<published>([^<]+)<\/published>/)?.[1];
            return videoId && baslik ? { videoId, baslik: xmlMetniniCoz(baslik), yayin: Date.parse(yayin || '') || 0 } : null;
        }).filter(Boolean).sort((a, b) => a.yayin - b.yayin);
        if (!videolar.length) return;

        if (youtubeGorulenVideolar.size === 0) {
            for (const video of videolar) youtubeGorulenVideolar.add(video.videoId);
            youtubeDurumunuKaydet();
            console.log('[YouTube] Mevcut videolar kaydedildi; yenileri beklenecek.');
            return;
        }

        const kanal = await client.channels.fetch(duyuruId);
        if (!kanal?.isTextBased()) throw new Error('YouTube duyuru kanalı bulunamadı.');
        for (const video of videolar.filter(v => !youtubeGorulenVideolar.has(v.videoId))) {
            const url = `https://www.youtube.com/watch?v=${video.videoId}`;
            const eskiMesajlar = await kanal.messages.fetch({ limit: 100 }).catch(() => null);
            const zatenVar = eskiMesajlar?.some(m => m.content.includes(url) || m.embeds.some(e => e.url === url));
            if (!zatenVar) {
                const embed = new EmbedBuilder().setColor(0xFF0000)
                    .setAuthor({ name: 'Künefe Bey • Yeni Video', iconURL: client.user.displayAvatarURL() })
                    .setTitle(video.baslik.slice(0, 256)).setURL(url)
                    .setDescription(`🎬 **Künefe Bey yeni bir video paylaştı!**\n\n[Videoyu izlemek için tıkla](${url})`)
                    .setImage(`https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`)
                    .setFooter({ text: 'KünefeSMP • YouTube duyuruları' }).setTimestamp(video.yayin || Date.now());
                await kanal.send({ embeds: [embed] });
            }
            youtubeGorulenVideolar.add(video.videoId);
            youtubeDurumunuKaydet();
        }
    } catch (err) {
        console.error('YouTube videosu kontrol edilemedi:', err);
    } finally {
        youtubeKontrolEdiliyor = false;
    }
}

// ================= SUNUCU DURUMU =================
async function sunucuDurumGuncelle() {
    try {
        const yanit = await fetch(`https://api.mcstatus.io/v2/status/java/${AYARLAR.SUNUCU_IP}`);
        const veri = await yanit.json();
        client.user.setPresence({
            activities: [{ name: 'custom', state: veri.online
                ? `🟢 KünefeSMP Açık! | ${AYARLAR.SUNUCU_IP} | 1.21-26.2`
                : `🔴 Sunucu Kapalı/Bakımda | ${AYARLAR.SUNUCU_IP}`, type: ActivityType.Custom }],
            status: veri.online ? 'online' : 'dnd'
        });
    } catch (err) {
        console.error('Sunucu durumu çekilemedi:', err);
    }
}

async function slashKomutlariniKaydet() {
    const guild = client.guilds.cache.first();
    if (!guild) throw new Error('Botun bulunduğu Discord sunucusu bulunamadı.');
    const komutlar = [
        new SlashCommandBuilder().setName('öneri').setDescription('KünefeSMP için öneri gönderir.')
            .addStringOption(o => o.setName('metin').setDescription('Önerini yaz').setRequired(true)),
        new SlashCommandBuilder().setName('oneri').setDescription('KünefeSMP için öneri gönderir.')
            .addStringOption(o => o.setName('metin').setDescription('Önerini yaz').setRequired(true)),
        new SlashCommandBuilder().setName('sunucu').setDescription('Minecraft sunucusunun durumunu gösterir.'),
        new SlashCommandBuilder().setName('ip').setDescription('Minecraft sunucusunun durumunu gösterir.'),
        new SlashCommandBuilder().setName('etkinlik').setDescription('Etkinlik duyurusu oluşturur.')
            .addStringOption(o => o.setName('zaman').setDescription('Etkinliğin zamanı').setRequired(true))
            .addStringOption(o => o.setName('yer').setDescription('Buluşma yeri').setRequired(true)),
        new SlashCommandBuilder().setName('çekiliş').setDescription('Süreli çekiliş başlatır.')
            .addStringOption(o => o.setName('sure').setDescription('Örnek: 30m, 2h veya 1d').setRequired(true))
            .addStringOption(o => o.setName('odul').setDescription('Çekiliş ödülü').setRequired(true)),
        new SlashCommandBuilder().setName('cekilis').setDescription('Süreli çekiliş başlatır.')
            .addStringOption(o => o.setName('sure').setDescription('Örnek: 30m, 2h veya 1d').setRequired(true))
            .addStringOption(o => o.setName('odul').setDescription('Çekiliş ödülü').setRequired(true)),
        new SlashCommandBuilder().setName('destek-kur').setDescription('Destek panelini bu kanala kurar.'),
        new SlashCommandBuilder().setName('yonetici-alim-kur').setDescription('Yönetici başvuru panelini bu kanala kurar.')
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), {
        body: komutlar.map(k => k.toJSON())
    });
    console.log(`[+] ${komutlar.length} slash komutu ${guild.name} sunucusuna kaydedildi.`);
}

client.once('ready', () => {
    console.log(`[+] Bot aktif: ${client.user.tag}`);
    sunucuDurumGuncelle();
    setInterval(sunucuDurumGuncelle, 30000);
    youtubeSonVideoKontrolEt();
    setInterval(youtubeSonVideoKontrolEt, 120000);
    slashKomutlariniKaydet().catch(err => console.error('Slash komutları kaydedilemedi:', err));
});

// ================= KARŞILAMA =================
client.on('guildMemberAdd', async member => {
    const kanal = member.guild.channels.cache.get(AYARLAR.KARSILAMA_KANAL_ID);
    if (!kanal?.isTextBased()) return;
    const embed = new EmbedBuilder().setAuthor({
        name: 'KünefeSMP', iconURL: member.guild.iconURL({ forceStatic: false }) || client.user.displayAvatarURL()
    }).setTitle('Yeni Bir Dostumuz Var!')
        .setDescription(`Hoş geldin ${member} 👋\n\nAramıza yeni biri katıldı!\n**Sunucumuza hoş geldin, rahatına bak!**`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 })).setColor(0xFF0000);
    await kanal.send({ embeds: [embed] }).catch(err => console.error('Karşılama mesajı gönderilemedi:', err));
});

function oneriyiGonderiYap({ kanal, metin, kullanici }) {
    const embed = new EmbedBuilder().setTitle('💡 Yeni Sunucu Önerisi')
        .setDescription(metin.slice(0, 4000)).setColor(0xF1C40F)
        .setAuthor({ name: kullanici.tag || kullanici.username, iconURL: kullanici.displayAvatarURL() })
        .setFooter({ text: 'KünefeSMP • Öneri Sistemi' }).setTimestamp();
    const butonlar = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('oneri_evet').setLabel('Evet (0)').setEmoji('👍').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('oneri_hayir').setLabel('Hayır (0)').setEmoji('👎').setStyle(ButtonStyle.Danger)
    );
    return kanal.send({ embeds: [embed], components: [butonlar] }).then(mesaj => {
        oneriOylari.set(mesaj.id, { evet: new Set(), hayir: new Set() });
        return mesaj;
    });
}

// ================= MESAJLAR: FİLTRE, ÖNERİ VE SELAM =================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const isYetkili = message.member?.permissions.has(PermissionsBitField.Flags.Administrator) ||
        (AYARLAR.YETKILI_ROL_ID && message.member?.roles.cache.has(AYARLAR.YETKILI_ROL_ID));
    const kucuk = message.content.toLowerCase();

    if (!isYetkili) {
        const kendiAdresi = kucuk.includes(AYARLAR.SUNUCU_IP.toLowerCase());
        if (!kendiAdresi && REKLAM_REGEX.test(message.content)) {
            await message.delete().catch(() => {});
            const uyari = await message.channel.send(`⚠️ ${message.author}, reklam veya dış bağlantı paylaşmak yasaktır!`).catch(() => null);
            if (uyari) setTimeout(() => uyari.delete().catch(() => {}), 4000);
            return;
        }
        const kufurVar = KUFUR_LISTESI.some(kelime => kucuk.includes(kelime));
        if (kufurVar) {
            await message.delete().catch(() => {});
            const uyari = await message.channel.send(`⚠️ ${message.author}, lütfen küfür ve hakaret içeren kelimeler kullanma!`).catch(() => null);
            if (uyari) setTimeout(() => uyari.delete().catch(() => {}), 4000);
            return;
        }
    }

    // Öneri kanalına yazılan normal mesajı otomatik olarak öneri gönderisine dönüştür.
    if (message.channelId === AYARLAR.ONERI_KANAL_ID) {
        const metin = message.content.trim();
        if (!metin) return;
        await message.delete().catch(() => {});
        await oneriyiGonderiYap({ kanal: message.channel, metin, kullanici: message.author })
            .catch(err => console.error('Otomatik öneri oluşturulamadı:', err));
        return;
    }

    const icerik = message.content.toLowerCase().trim();
    if (icerik === 'sa' || icerik === 'sa.') return message.reply('as');
    if (['selamunaleykum', 'selamünaleyküm', 'saleykum', 's.a.'].includes(icerik)) return message.reply('aleykumselam');
    if (icerik === 'sa chat' || icerik === 'sa chat.') return message.reply('as babomen');
    if (icerik === 'sa çet' || icerik === 'sa çet.') return message.reply('as');
});

function komutYetkilisiMi(interaction) {
    return Boolean(
        interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ||
        interaction.guild?.ownerId === interaction.user.id ||
        (AYARLAR.KURUCU_ROL_ID && interaction.member?.roles?.cache?.has(AYARLAR.KURUCU_ROL_ID))
    );
}

async function slashKomutunuCalistir(interaction) {
    const ad = interaction.commandName;

    if (ad === 'öneri' || ad === 'oneri') {
        if (AYARLAR.ONERI_KANAL_ID && interaction.channelId !== AYARLAR.ONERI_KANAL_ID) {
            return interaction.reply({ content: `❌ Önerini yalnızca <#${AYARLAR.ONERI_KANAL_ID}> kanalında gönderebilirsin.`, ephemeral: true });
        }
        const metin = interaction.options.getString('metin', true).trim();
        if (!metin) return interaction.reply({ content: '❌ Öneri metni boş olamaz.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        await oneriyiGonderiYap({ kanal: interaction.channel, metin, kullanici: interaction.user });
        return interaction.editReply({ content: '✅ Önerin gönderildi!' });
    }

    if (ad === 'sunucu' || ad === 'ip') {
        await interaction.deferReply();
        try {
            const yanit = await fetch(`https://api.mcstatus.io/v2/status/java/${AYARLAR.SUNUCU_IP}`);
            const veri = await yanit.json();
            const embed = new EmbedBuilder().setColor(veri.online ? 0x2ECC71 : 0xE74C3C)
                .setTitle(veri.online ? '🟢 KünefeSMP Çevrimiçi!' : '🔴 KünefeSMP Kapalı / Bakımda')
                .setDescription(veri.online ? 'Sunucumuz aktif ve oyunculara açık. Hemen katıl!' : `Sunucuya şu anda ulaşılamıyor. Bakımda olabilir.\n\n📡 IP: \`${AYARLAR.SUNUCU_IP}\``)
                .addFields({ name: '📡 Sunucu adresi', value: `\`${AYARLAR.SUNUCU_IP}\``, inline: true });
            if (veri.online) embed.addFields(
                { name: '👥 Oyuncular', value: `**${veri.players.online}** / **${veri.players.max}**`, inline: true },
                { name: '🎮 Sürüm', value: '1.21+', inline: true }
            );
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('Sunucu durumu alınamadı:', err);
            return interaction.editReply({ content: '❌ Sunucu durumuna ulaşılırken hata oluştu.' });
        }
    }

    if (ad === 'etkinlik') {
        if (!komutYetkilisiMi(interaction)) return interaction.reply({ content: '❌ Bu komutu yalnızca yöneticiler kullanabilir.', ephemeral: true });
        const zaman = interaction.options.getString('zaman', true).trim();
        const yer = interaction.options.getString('yer', true).trim();
        if (zaman.length > 100 || yer.length > 100) return interaction.reply({ content: '❌ Zaman ve yer en fazla 100 karakter olabilir.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const embed = new EmbedBuilder().setColor(0x8E44AD).setTitle('🎉 Yeni Bir Etkinlik Başlıyor!')
            .setDescription('Selam **KünefeSMP ailesi!** 🍯\n\nKatılmak için aşağıdaki düğmeye bas.')
            .addFields({ name: '🕒 Zaman', value: zaman, inline: true }, { name: '📍 Buluşma yeri', value: yer, inline: true }, { name: '🎮 Sunucu', value: AYARLAR.SUNUCU_IP, inline: true })
            .setFooter({ text: 'Katılımını düğmeye basarak bildir • KünefeSMP' }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('etkinlik_katil').setLabel('Katılacağım (0)').setEmoji('🙋').setStyle(ButtonStyle.Success));
        const sent = await interaction.channel.send({ embeds: [embed], components: [row] });
        etkinlikKatilimlari.set(sent.id, new Set());
        return interaction.editReply({ content: `✅ Etkinlik duyurusu oluşturuldu: ${sent}` });
    }

    if (ad === 'çekiliş' || ad === 'cekilis') {
        if (!komutYetkilisiMi(interaction)) return interaction.reply({ content: '❌ Çekilişi yalnızca yöneticiler başlatabilir.', ephemeral: true });
        const sureMetni = interaction.options.getString('sure', true).trim();
        const odul = interaction.options.getString('odul', true).trim();
        const eslesme = sureMetni.match(/^(\d+)\s*([mhd])$/i);
        if (!eslesme) return interaction.reply({ content: '📝 Süreyi `30m`, `2h` veya `1d` biçiminde gir.', ephemeral: true });
        const carpan = { m: 60000, h: 3600000, d: 86400000 }[eslesme[2].toLowerCase()];
        const sureMs = Number(eslesme[1]) * carpan;
        if (!Number.isSafeInteger(sureMs) || sureMs < 60000 || sureMs > 100 * 86400000) return interaction.reply({ content: '⏱️ Süre 1 dakika ile 100 gün arasında olmalı.', ephemeral: true });
        if (!odul || odul.length > 200) return interaction.reply({ content: '❌ Ödül 1-200 karakter olmalı.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const bitis = Date.now() + sureMs;
        const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle('🎁 Şansını Dene, Ödülü Kazan!')
            .setDescription(`**Ödül:** ${odul}\n\nKatılmak için aşağıdaki düğmeye bas.`)
            .addFields({ name: '⏳ Bitiş', value: `<t:${Math.floor(bitis / 1000)}:R>`, inline: true }, { name: '🙋 Katılımcılar', value: '0 kişi', inline: true })
            .setFooter({ text: 'Her oyuncu bir kez katılabilir • KünefeSMP' }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cekilis_katil').setLabel('Çekilişe Katıl (0)').setEmoji('🎉').setStyle(ButtonStyle.Success));
        const sent = await interaction.channel.send({ embeds: [embed], components: [row] });
        cekilisler.set(sent.id, { katilimcilar: new Set(), kanalId: interaction.channel.id, bitisZamani: bitis, zamanlayici: null });
        cekilisZamanlayicisiniKur(sent.id, bitis);
        return interaction.editReply({ content: `✅ Çekiliş oluşturuldu: ${sent}` });
    }

    if (ad === 'destek-kur') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Bu komutu yalnızca yöneticiler kullanabilir.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const embed = new EmbedBuilder().setTitle('🍯 KünefeSMP Yardım ve Destek Masası')
            .setDescription('Bir sorunla mı karşılaştın veya yardıma mı ihtiyacın var? Aşağıdaki düğmeyle sana özel destek talebi açabilirsin.')
            .setColor(0xE67E22).setFooter({ text: 'KünefeSMP • Destek' });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('bilet_olustur').setLabel('Destek Talebi Oluştur').setEmoji('🎫').setStyle(ButtonStyle.Primary));
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.editReply({ content: '✅ Destek paneli kuruldu.' });
    }

    if (ad === 'yonetici-alim-kur') {
        if (!komutYetkilisiMi(interaction)) return interaction.reply({ content: '❌ Bu komutu yalnızca yöneticiler veya kurucular kullanabilir.', ephemeral: true });
        const embed = new EmbedBuilder().setColor(0xE67E22).setTitle('🍯 KünefeSMP Yönetici Alımı')
            .setDescription('Ekibimize katılmak için **Başvuru Yap** düğmesine tıkla ve formu doldur. Başvurun yönetim ekibine iletilecek.')
            .setFooter({ text: 'KünefeSMP • Yönetici Başvurusu' });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('yonetici_basvuru_baslat').setLabel('Başvuru Yap').setEmoji('📝').setStyle(ButtonStyle.Primary));
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Yönetici başvuru paneli bu kanala kuruldu.', ephemeral: true });
    }
}

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            await slashKomutunuCalistir(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId === 'bilet_olustur') {
            const menu = new StringSelectMenuBuilder().setCustomId('bilet_kategori_secimi').setPlaceholder('Destek konusunu seç')
                .addOptions(
                    { label: 'Teknik sorun', description: 'Sunucu veya oyun içi teknik sorunlar', value: 'teknik', emoji: '🛠️' },
                    { label: 'Oyuncu bildirimi', description: 'Oyuncu bildirimi veya şikâyet', value: 'oyuncu', emoji: '👤' },
                    { label: 'Mağaza / ödeme', description: 'Alışveriş ve ödeme sorunları', value: 'magaza', emoji: '🛒' },
                    { label: 'Öneri / diğer', description: 'Öneri veya diğer konular', value: 'diger', emoji: '💡' }
                );
            return interaction.reply({ content: '🎫 Hangi konuda destek istiyorsun?', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId === 'yonetici_basvuru_baslat') {
            const modal = new ModalBuilder().setCustomId('yonetici_basvuru_formu').setTitle('Yönetici Başvurusu');
            const alanlar = [
                new TextInputBuilder().setCustomId('minecraft_adi').setLabel('Minecraft kullanıcı adın').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32),
                new TextInputBuilder().setCustomId('yas').setLabel('Yaş aralığın').setStyle(TextInputStyle.Short).setPlaceholder('Örnek: 16-18').setRequired(true).setMaxLength(20),
                new TextInputBuilder().setCustomId('deneyim').setLabel('Yetkili deneyimin').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(700),
                new TextInputBuilder().setCustomId('neden').setLabel('Neden ekibimize katılmak istiyorsun?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)
            ];
            modal.addComponents(...alanlar.map(a => new ActionRowBuilder().addComponents(a)));
            return interaction.showModal(modal);
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'bilet_kategori_secimi') {
            const kategori = interaction.values[0];
            const basliklar = { teknik: 'Teknik Sorun', oyuncu: 'Oyuncu Bildirimi', magaza: 'Mağaza / Ödeme', diger: 'Öneri / Diğer' };
            const modal = new ModalBuilder().setCustomId(`bilet_form:${kategori}`).setTitle(`${basliklar[kategori]} Talebi`);
            const oyuncuAdi = new TextInputBuilder().setCustomId('minecraft_adi').setLabel('Minecraft kullanıcı adın').setStyle(TextInputStyle.Short).setPlaceholder('Örnek: UnplugMC').setRequired(true).setMaxLength(32);
            const aciklama = new TextInputBuilder().setCustomId('talep_aciklamasi').setLabel('Sorununu veya önerini açıkla').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(5).setMaxLength(1000);
            modal.addComponents(new ActionRowBuilder().addComponents(oyuncuAdi), new ActionRowBuilder().addComponents(aciklama));
            return interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'yonetici_basvuru_formu') {
            await interaction.deferReply({ ephemeral: true });
            const incelemeKanalId = AYARLAR.YONETICI_BASVURU_KANAL_ID;
            if (!incelemeKanalId || incelemeKanalId.startsWith('YETKILILERE_')) {
                return interaction.editReply('❌ Bot yöneticisi başvuru inceleme kanalının ID bilgisini ayarlamamış.');
            }
            const kanal = await client.channels.fetch(incelemeKanalId);
            if (!kanal?.isTextBased()) return interaction.editReply('❌ Başvuru inceleme kanalı bulunamadı.');
            const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle('📝 Yeni Yönetici Başvurusu')
                .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                .addFields(
                    { name: 'Minecraft adı', value: interaction.fields.getTextInputValue('minecraft_adi') },
                    { name: 'Yaş aralığı', value: interaction.fields.getTextInputValue('yas') },
                    { name: 'Yetkili deneyimi', value: interaction.fields.getTextInputValue('deneyim') },
                    { name: 'Katılma nedeni', value: interaction.fields.getTextInputValue('neden') },
                    { name: 'Discord hesabı', value: `${interaction.user} (${interaction.user.id})` }
                ).setFooter({ text: `Başvuru sahibi ID: ${interaction.user.id}` }).setTimestamp();
            const karar = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('yonetici_basvuru_onayla').setLabel('Onayla').setEmoji('✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('yonetici_basvuru_reddet').setLabel('Reddet').setEmoji('❌').setStyle(ButtonStyle.Danger)
            );
            await kanal.send({
                content: AYARLAR.YETKILI_ROL_ID ? `<@&${AYARLAR.YETKILI_ROL_ID}>` : undefined,
                embeds: [embed], components: [karar],
                allowedMentions: { roles: AYARLAR.YETKILI_ROL_ID ? [AYARLAR.YETKILI_ROL_ID] : [] }
            });
            return interaction.editReply('✅ Başvurun yönetim ekibine iletildi.');
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('bilet_form:')) {
            const kategori = interaction.customId.split(':')[1];
            const bilgi = {
                teknik: { ad: 'teknik', baslik: '🛠️ Teknik Sorun' },
                oyuncu: { ad: 'oyuncu', baslik: '👤 Oyuncu Bildirimi' },
                magaza: { ad: 'magaza', baslik: '🛒 Mağaza / Ödeme' },
                diger: { ad: 'diger', baslik: '💡 Öneri / Diğer' }
            }[kategori];
            if (!bilgi) return interaction.reply({ content: '❌ Kategori geçerli değil.', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            const topic = `kunefesmp-ticket:${interaction.user.id}`;
            const mevcut = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === topic);
            if (mevcut) return interaction.editReply({ content: `❌ Zaten açık bir destek talebin var: ${mevcut}` });
            const guvenliAd = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 35) || 'oyuncu';
            const izinler = [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ReadMessageHistory] }
            ];
            if (AYARLAR.YETKILI_ROL_ID && interaction.guild.roles.cache.has(AYARLAR.YETKILI_ROL_ID)) {
                izinler.push({ id: AYARLAR.YETKILI_ROL_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ReadMessageHistory] });
            }
            try {
                const kanal = await interaction.guild.channels.create({
                    name: `talep-${bilgi.ad}-${guvenliAd}`.slice(0, 90), type: ChannelType.GuildText,
                    parent: AYARLAR.KATEGORI_ID || null, topic, permissionOverwrites: izinler
                });
                const embed = new EmbedBuilder().setTitle(bilgi.baslik)
                    .setDescription(interaction.fields.getTextInputValue('talep_aciklamasi'))
                    .addFields(
                        { name: 'Oyuncu', value: `${interaction.user}`, inline: true },
                        { name: 'Minecraft adı', value: `\`${interaction.fields.getTextInputValue('minecraft_adi')}\``, inline: true }
                    ).setColor(0xE67E22).setTimestamp();
                const kapat = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('bilet_kapat').setLabel('Talebi Kapat').setEmoji('🔒').setStyle(ButtonStyle.Danger));
                await kanal.send({ content: `${interaction.user} ${AYARLAR.YETKILI_ROL_ID ? `<@&${AYARLAR.YETKILI_ROL_ID}>` : ''}`, embeds: [embed], components: [kapat] });
                return interaction.editReply({ content: `✅ Talebin oluşturuldu: ${kanal}` });
            } catch (err) {
                console.error('Destek talebi oluşturulamadı:', err);
                return interaction.editReply('❌ Talep oluşturulamadı. Botun kanal oluşturma izinlerini ve kategori ayarını kontrol edin.');
            }
        }

        if (!interaction.isButton()) return;

        if (interaction.customId === 'yonetici_basvuru_onayla' || interaction.customId === 'yonetici_basvuru_reddet') {
            if (!komutYetkilisiMi(interaction)) return interaction.reply({ content: '❌ Bu başvuruyu sonuçlandırma yetkin yok.', ephemeral: true });
            const onay = interaction.customId === 'yonetici_basvuru_onayla';
            const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(onay ? 0x2ECC71 : 0xE74C3C)
                .addFields({ name: 'Başvuru durumu', value: `${onay ? '✅ Onaylandı' : '❌ Reddedildi'} — ${interaction.user}` });
            const kapali = new ActionRowBuilder().addComponents(
                ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true),
                ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true)
            );
            return interaction.update({ embeds: [embed], components: [kapali] });
        }

        if (interaction.customId === 'bilet_kapat') {
            const yetkili = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels) || interaction.member?.roles?.cache?.has(AYARLAR.YETKILI_ROL_ID);
            const sahibi = interaction.channel?.topic === `kunefesmp-ticket:${interaction.user.id}`;
            if (!yetkili && !sahibi) return interaction.reply({ content: '❌ Bu talebi kapatma yetkin yok.', ephemeral: true });
            await interaction.reply({ content: '🔒 Destek talebi kapatılıyor…', ephemeral: true });
            return interaction.channel.delete().catch(err => console.error('Talep kanalı silinemedi:', err));
        }

        if (interaction.customId === 'etkinlik_katil') {
            const katilimcilar = etkinlikKatilimlari.get(interaction.message.id) || new Set();
            const vardi = katilimcilar.has(interaction.user.id);
            if (vardi) katilimcilar.delete(interaction.user.id); else katilimcilar.add(interaction.user.id);
            etkinlikKatilimlari.set(interaction.message.id, katilimcilar);
            const buton = ButtonBuilder.from(interaction.message.components[0].components[0]).setLabel(`Katılacağım (${katilimcilar.size})`);
            await interaction.update({ components: [new ActionRowBuilder().addComponents(buton)] });
            return interaction.followUp({ content: vardi ? 'Etkinlik katılımın kaldırıldı.' : 'Etkinliğe katıldın! 🎉', ephemeral: true });
        }

        if (interaction.customId === 'cekilis_katil') {
            const cekilis = cekilisler.get(interaction.message.id);
            if (!cekilis) return interaction.reply({ content: 'Bu çekiliş artık aktif değil. Yeni çekilişleri takip et!', ephemeral: true });
            const vardi = cekilis.katilimcilar.has(interaction.user.id);
            if (vardi) cekilis.katilimcilar.delete(interaction.user.id); else cekilis.katilimcilar.add(interaction.user.id);
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.setFields(
                { name: '⏳ Bitiş', value: `<t:${Math.floor(cekilis.bitisZamani / 1000)}:R>`, inline: true },
                { name: '🙋 Katılımcılar', value: `${cekilis.katilimcilar.size} kişi`, inline: true }
            );
            const buton = ButtonBuilder.from(interaction.message.components[0].components[0]).setLabel(`Çekilişe Katıl (${cekilis.katilimcilar.size})`);
            await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(buton)] });
            return interaction.followUp({ content: vardi ? 'Çekiliş katılımın kaldırıldı.' : 'Çekilişe katıldın! Bol şans 🍀', ephemeral: true });
        }

        if (interaction.customId === 'oneri_evet' || interaction.customId === 'oneri_hayir') {
            const oylar = oneriOylari.get(interaction.message.id) || { evet: new Set(), hayir: new Set() };
            const olumlu = interaction.customId === 'oneri_evet';
            const kendi = olumlu ? oylar.evet : oylar.hayir;
            const diger = olumlu ? oylar.hayir : oylar.evet;
            if (kendi.has(interaction.user.id)) return interaction.reply({ content: `❌ Zaten "${olumlu ? 'Evet' : 'Hayır'}" oyu kullanmışsın.`, ephemeral: true });
            diger.delete(interaction.user.id);
            kendi.add(interaction.user.id);
            oneriOylari.set(interaction.message.id, oylar);
            const row = interaction.message.components[0];
            const evet = ButtonBuilder.from(row.components[0]).setLabel(`Evet (${oylar.evet.size})`);
            const hayir = ButtonBuilder.from(row.components[1]).setLabel(`Hayır (${oylar.hayir.size})`);
            return interaction.update({ components: [new ActionRowBuilder().addComponents(evet, hayir)] });
        }
    } catch (err) {
        console.error('Etkileşim işlenemedi:', err);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ İşlem sırasında bir hata oluştu.', ephemeral: true }).catch(() => {});
        }
    }
});

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
        const embed = EmbedBuilder.from(mesaj.embeds[0]).setColor(kazanan ? 0x2ECC71 : 0x95A5A6)
            .setFields(
                { name: '🏁 Durum', value: 'Çekiliş sona erdi', inline: true },
                { name: '🙋 Katılımcılar', value: `${katilimcilar.length} kişi`, inline: true },
                { name: '🏆 Kazanan', value: kazanan ? `<@${kazanan}>` : 'Katılan olmadığı için kazanan seçilemedi.' }
            );
        const buton = ButtonBuilder.from(mesaj.components[0].components[0]).setLabel('Çekiliş Sona Erdi').setDisabled(true).setStyle(ButtonStyle.Secondary);
        await mesaj.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(buton)] });
        if (kazanan) await kanal.send({ content: `🎉 Tebrikler <@${kazanan}>! Çekilişi kazandın!`, allowedMentions: { users: [kazanan] } });
        else await kanal.send('Çekiliş sona erdi ama katılan olmadığı için kazanan çıkmadı.');
    } catch (err) {
        console.error('Çekiliş sonuçlandırılamadı:', err);
    }
}

client.login(process.env.TOKEN);
