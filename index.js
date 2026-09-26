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
    TOKEN: "MTU0NzI3NDc3OTk5MDQzMzg0Mg.G0XpIu.ldLT3fa-49EEuHAkQUVczjHJnX6XpUpnuYM2uE", // Yer tutucu; Render'daki TOKEN ortam değişkeni önceliklidir
    KURUCU_ROL_ID: "1539629513753755760", // Kurucu rolünün ID'sini buraya ekleyebilirsin
    YETKILI_ROL_ID: "1539629513753755760",
    KATEGORI_ID: "1547551650464530462",
    ONERI_KANAL_ID: "1550824276305776660",
    KARSILAMA_KANAL_ID: "1547561101745459320",
    SUNUCU_IP: "oyna.kunefesmp.com.tr",
    YOUTUBE_KANAL_ID: "BURAYA_YOUTUBE_KANAL_ID", // UC ile başlayan YouTube kanal ID'si
    YOUTUBE_DUYURU_KANAL_ID: "BURAYA_DISCORD_KANAL_ID" // Video duyuru kanalının Discord ID'si
};

const KUFUR_LISTESI = [
    'amk', 'aq', 'oç', 'oc', 'piç', 'pic', 'sik', 'sikerim',
    'yarrak', 'orospu', 'ibne', 'yavşak', 'puşt', 'döl'
];

const REKLAM_REGEX = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li|com\/invite)|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?)/i;

const oneriOylari = {};
const etkinlikKatilimlari = {};
const cekilisler = new Map();
const YOUTUBE_DURUM_DOSYASI = path.join(__dirname, 'youtube-video-state.json');
let youtubeGorulenVideolar = new Set();
let youtubeKontrolEdiliyor = false;
try {
    const youtubeDurumu = JSON.parse(fs.readFileSync(YOUTUBE_DURUM_DOSYASI, 'utf8'));
    youtubeGorulenVideolar = new Set(youtubeDurumu.gorulenVideoIdleri || []);
} catch {
    // İlk çalıştırmada durum dosyası henüz olmayabilir.
}

// ================= YOUTUBE YENİ VİDEO TAKİBİ =================
function xmlMetniniCoz(metin) {
    return metin
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function youtubeDurumunuKaydet() {
    const gorulenVideoIdleri = [...youtubeGorulenVideolar].slice(-100);
    youtubeGorulenVideolar = new Set(gorulenVideoIdleri);
    fs.writeFileSync(YOUTUBE_DURUM_DOSYASI, JSON.stringify({ gorulenVideoIdleri }, null, 2));
}

async function youtubeSonVideoKontrolEt() {
    if (youtubeKontrolEdiliyor) return;
    const kanalId = AYARLAR.YOUTUBE_KANAL_ID;
    const discordKanalId = AYARLAR.YOUTUBE_DUYURU_KANAL_ID;
    if (!kanalId || kanalId.startsWith('BURAYA_') || !discordKanalId || discordKanalId.startsWith('BURAYA_')) return;

    youtubeKontrolEdiliyor = true;
    try {
        const yanit = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(kanalId)}`);
        if (!yanit.ok) throw new Error(`YouTube RSS yanıtı: ${yanit.status}`);
        const xml = await yanit.text();
        const videolar = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
            .map(eslesme => {
                const entry = eslesme[1];
                const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
                const baslik = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
                const yayinTarihi = entry.match(/<published>([^<]+)<\/published>/)?.[1];
                return videoId && baslik
                    ? { videoId, baslik: xmlMetniniCoz(baslik), yayinZamani: Date.parse(yayinTarihi || '') || 0 }
                    : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.yayinZamani - b.yayinZamani);

        if (!videolar.length) return;

        // İlk açılışta RSS'teki mevcut videoları başlangıç listesine al, geçmiş videoları paylaşma.
        if (youtubeGorulenVideolar.size === 0) {
            for (const video of videolar) youtubeGorulenVideolar.add(video.videoId);
            youtubeDurumunuKaydet();
            console.log('[YouTube] Başlangıç videoları kaydedildi; yeni yüklemeler beklenecek.');
            return;
        }

        const yeniVideolar = videolar.filter(video => !youtubeGorulenVideolar.has(video.videoId));
        if (!yeniVideolar.length) return;

        const duyuruKanali = await client.channels.fetch(discordKanalId);
        if (!duyuruKanali?.isTextBased()) {
            console.error('[YouTube] Discord duyuru kanalı bulunamadı veya yazı kanalı değil.');
            return;
        }

        for (const video of yeniVideolar) {
            const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
            // Bot yeniden başlatılsa veya ikinci kopyası çalışsa bile son mesajlarda aynı URL varsa tekrarlama.
            const sonMesajlar = await duyuruKanali.messages.fetch({ limit: 100 }).catch(() => null);
            const zatenDuyurulmus = sonMesajlar?.some(mesaj =>
                mesaj.content.includes(videoUrl) ||
                mesaj.embeds.some(embed => embed.url === videoUrl || embed.description?.includes(videoUrl))
            );

            if (!zatenDuyurulmus) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setAuthor({ name: 'UnplugMC • Yeni Video', iconURL: client.user.displayAvatarURL() })
                    .setTitle(video.baslik.slice(0, 256))
                    .setURL(videoUrl)
                    .setDescription(`🎬 **UnplugMC yeni bir video paylaştı!**\n\n[Videoyu izlemek için tıkla](${videoUrl})`)
                    .setImage(`https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`)
                    .setFooter({ text: 'KünefeSMP • YouTube duyuruları' })
                    .setTimestamp(video.yayinZamani || Date.now());
                await duyuruKanali.send({ embeds: [embed] });
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

// ================= CANLI DURUM GÜNCELLEME =================
async function sunucuDurumGuncelle() {
    try {
        const res = await fetch(`https://api.mcstatus.io/v2/status/java/${AYARLAR.SUNUCU_IP}`);
        const data = await res.json();

        if (data.online) {
            client.user.setPresence({
                activities: [{
                    name: 'custom',
                    state: `🔴 Sunucu Bakımda | ${AYARLAR.SUNUCU_IP} | 🛠️ Yakında Aktif!`,
                    type: ActivityType.Custom
                }],
                status: 'online'
            });
        } else {
            client.user.setPresence({
                activities: [{
                    name: 'custom',
                    state: `🔴 Sunucu Bakımda | ${AYARLAR.SUNUCU_IP} | 🛠️ Yakında Aktif!`,
                    type: ActivityType.Custom
                }],
                status: 'dnd'
            });
        }
    } catch (err) {
        console.error('Sunucu durumu çekilemedi:', err);
    }
}

async function slashKomutlariniKaydet() {
    const guild = client.guilds.cache.first();
    if (!guild) {
        console.error('Slash komutları kaydedilemedi: Botun bulunduğu sunucu bulunamadı.');
        return;
    }

    const komutlar = [
        new SlashCommandBuilder().setName('öneri').setDescription('KünefeSMP için öneri gönderir.')
            .addStringOption(o => o.setName('metin').setDescription('Önerini yaz').setRequired(true)),
        new SlashCommandBuilder().setName('oneri').setDescription('KünefeSMP için öneri gönderir.')
            .addStringOption(o => o.setName('metin').setDescription('Önerini yaz').setRequired(true)),
        new SlashCommandBuilder().setName('sunucu').setDescription('Minecraft sunucusunun durumunu gösterir.'),
        new SlashCommandBuilder().setName('ip').setDescription('Minecraft sunucusunun durumunu gösterir.'),
        new SlashCommandBuilder().setName('etkinlik').setDescription('KünefeSMP etkinlik duyurusu oluşturur.')
            .addStringOption(o => o.setName('zaman').setDescription('Etkinliğin zamanı').setRequired(true))
            .addStringOption(o => o.setName('yer').setDescription('Buluşma yeri').setRequired(true)),
        new SlashCommandBuilder().setName('çekiliş').setDescription('Süreli bir KünefeSMP çekilişi başlatır.')
            .addStringOption(o => o.setName('sure').setDescription('Örnek: 30m, 2h veya 1d').setRequired(true))
            .addStringOption(o => o.setName('odul').setDescription('Çekiliş ödülü').setRequired(true)),
        new SlashCommandBuilder().setName('cekilis').setDescription('Süreli bir KünefeSMP çekilişi başlatır.')
            .addStringOption(o => o.setName('sure').setDescription('Örnek: 30m, 2h veya 1d').setRequired(true))
            .addStringOption(o => o.setName('odul').setDescription('Çekiliş ödülü').setRequired(true)),
        new SlashCommandBuilder().setName('destek-kur').setDescription('Destek talebi panelini bu kanala kurar.')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN || AYARLAR.TOKEN);
    const route = Routes.applicationGuildCommands(client.user.id, guild.id);
    for (const komut of komutlar) {
        await rest.post(route, { body: komut.toJSON() });
    }
    console.log(`[+] ${komutlar.length} slash komutu ${guild.name} sunucusuna kaydedildi.`);
}

client.on('ready', () => {
    console.log(`[+] Bot başarıyla aktif edildi: ${client.user.tag}`);
    sunucuDurumGuncelle();
    setInterval(sunucuDurumGuncelle, 30000);

    youtubeSonVideoKontrolEt();
    setInterval(youtubeSonVideoKontrolEt, 120000);

    slashKomutlariniKaydet().catch(err => console.error('Slash komutları kaydedilemedi:', err));
});

// ================= KARŞILAMA SİSTEMİ =================
client.on('guildMemberAdd', async (member) => {
    if (!AYARLAR.KARSILAMA_KANAL_ID) return;

    const kanal = member.guild.channels.cache.get(AYARLAR.KARSILAMA_KANAL_ID);
    if (!kanal) return;

    const embed = new EmbedBuilder()
        .setAuthor({
            name: 'KünefeSMP',
            iconURL: member.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL()
        })
        .setTitle('Yeni Bir Dostumuz Var!')
        .setDescription(
            `Hoşgeldin! ${member} 👋,\n\n` +
            `Aramıza yeni biri katıldı! ${member}\n` +
            `**Sunucumuza Hoşgeldin! Rahatına Bak!**`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setColor(0xFF0000);

    await kanal.send({ embeds: [embed] })
        .catch(err => console.error('Karşılama mesajı atılamadı:', err));
});

// ================= KOMUTLAR VE MESAJ KONTROLLERİ =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // --- KÜFÜR VE REKLAM FİLTRESİ ---
    const isYetkili =
        message.member?.permissions.has(PermissionsBitField.Flags.Administrator) ||
        (AYARLAR.YETKILI_ROL_ID && message.member?.roles.cache.has(AYARLAR.YETKILI_ROL_ID));

    if (!isYetkili) {
        const icerikKucuk = message.content.toLowerCase();
        const kendiIpSiMi = icerikKucuk.includes(AYARLAR.SUNUCU_IP.toLowerCase());

        if (!kendiIpSiMi && REKLAM_REGEX.test(message.content)) {
            await message.delete().catch(() => {});
            const uyari = await message.channel.send(
                `⚠️ ${message.author}, sunucuda reklam yapmak veya dış bağlantı/link paylaşmak yasaktır!`
            );
            setTimeout(() => uyari.delete().catch(() => {}), 4000);
            return;
        }

        const kufurVarMi = KUFUR_LISTESI.some(kelime => {
            const regex = new RegExp(`\\b${kelime}\\b`, 'i');
            return regex.test(icerikKucuk) || icerikKucuk.includes(kelime);
        });

        if (kufurVarMi) {
            await message.delete().catch(() => {});
            const uyari = await message.channel.send(
                `⚠️ ${message.author}, lütfen sunucu içerisinde küfür ve hakaret içerikli kelimeler kullanma!`
            );
            setTimeout(() => uyari.delete().catch(() => {}), 4000);
            return;
        }
    }

    // --- OTOMATİK SELAM KARŞILAMA ---
    const icerik = message.content.toLowerCase().trim();

    if (icerik === 'sa' || icerik === 'sa.') return message.reply('as');

    if (
        icerik === 'selamunaleykum' ||
        icerik === 'selamünaleyküm' ||
        icerik === 'saleykum' ||
        icerik === 's.a.'
    ) {
        return message.reply('aleykumselam');
    }

    if (icerik === 'sa chat' || icerik === 'sa chat.') {
        return message.reply('as babomen');
    }

    if (icerik === 'sa çet' || icerik === 'sa çet.') {
        return message.reply('as');
    }


});

// ================= BUTON İŞLEMLERİ =================
function komutYetkilisiMi(interaction) {
    const yonetici = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
    const sunucuSahibi = interaction.guild?.ownerId === interaction.user.id;
    const roller = interaction.member?.roles?.cache;
    const kurucuRol = AYARLAR.KURUCU_ROL_ID && roller?.has(AYARLAR.KURUCU_ROL_ID);
    return Boolean(yonetici || sunucuSahibi || kurucuRol);
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
        const embed = new EmbedBuilder()
            .setTitle('💡 Yeni Sunucu Önerisi')
            .setDescription(metin)
            .setColor(0xF1C40F)
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
            .setFooter({ text: 'KünefeSMP • Öneri Sistemi' })
            .setTimestamp();
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('oneri_evet').setLabel('Evet (0)').setEmoji('👍').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('oneri_hayir').setLabel('Hayır (0)').setEmoji('👎').setStyle(ButtonStyle.Danger)
        );
        const sent = await interaction.channel.send({ embeds: [embed], components: [buttons] });
        oneriOylari[sent.id] = { evet: [], hayir: [] };
        return interaction.editReply({ content: '✅ Önerin gönderildi!' });
    }

    if (ad === 'sunucu' || ad === 'ip') {
        await interaction.deferReply();
        try {
            const res = await fetch(`https://api.mcstatus.io/v2/status/java/${AYARLAR.SUNUCU_IP}`);
            const data = await res.json();
            if (data.online) {
                const embed = new EmbedBuilder()
                    .setTitle('🟢 KünefeSMP Çevrimiçi!')
                    .setDescription('Sunucumuz şu an aktif ve oyunculara açık. Hemen katıl!')
                    .setColor(0x2ECC71)
                    .addFields(
                        { name: '📡 Sunucu Adresi', value: `\`${AYARLAR.SUNUCU_IP}\``, inline: true },
                        { name: '👥 Aktif Oyuncular', value: `**${data.players.online}** / **${data.players.max}**`, inline: true },
                        { name: '🎮 Sürüm', value: '1.21+', inline: true }
                    )
                    .setFooter({ text: 'KünefeSMP • İyi Oyunlar Dileriz!' })
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }
            const embed = new EmbedBuilder()
                .setTitle('🔴 KünefeSMP Şu Anda Kapalı / Bakımda')
                .setDescription(`Sunucumuza şu anda ulaşılamıyor. Bakım veya güncelleme yapılıyor olabilir.\n\n📡 **IP:** \`${AYARLAR.SUNUCU_IP}\``)
                .setColor(0xE74C3C)
                .setFooter({ text: 'Gelişmeler için duyuruları takip edin.' })
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('Sunucu durumu alınamadı:', err);
            return interaction.editReply({ content: '❌ Sunucu durumuna ulaşılırken bir hata oluştu.' });
        }
    }

    if (ad === 'etkinlik') {
        if (!komutYetkilisiMi(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu yalnızca yöneticiler veya kurucular kullanabilir.', ephemeral: true });
        }
        const zaman = interaction.options.getString('zaman', true).trim();
        const yer = interaction.options.getString('yer', true).trim();
        if (zaman.length > 100 || yer.length > 100) {
            return interaction.reply({ content: '❌ Zaman ve yer bilgisi en fazla 100 karakter olabilir.', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        const embed = new EmbedBuilder()
            .setColor(0x8E44AD)
            .setAuthor({ name: 'KünefeSMP • Etkinlik Duyurusu', iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
            .setTitle('🎉 Yeni Bir Etkinlik Başlıyor!')
            .setDescription('Selam **KünefeSMP ailesi!** 🍯\n\nBirlikte eğlenmeye hazır mısınız? Sunucumuzda yeni bir etkinlik düzenleniyor! Katılmak istiyorsan aşağıdaki **Katılacağım** düğmesine bas. 💜')
            .addFields(
                { name: '🕒 Zaman', value: zaman, inline: true },
                { name: '📍 Buluşma yeri', value: yer, inline: true },
                { name: '🎮 Sunucu', value: AYARLAR.SUNUCU_IP, inline: true }
            )
            .setFooter({ text: 'Katılımını düğmeye basarak bildir • KünefeSMP' })
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('etkinlik_katil').setLabel('Katılacağım (0)').setEmoji('🙋').setStyle(ButtonStyle.Success)
        );
        const sent = await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: `✅ Etkinlik duyurusu oluşturuldu: ${sent}` });
        return;
    }

    if (ad === 'çekiliş' || ad === 'cekilis') {
        if (!komutYetkilisiMi(interaction)) {
            return interaction.reply({ content: '❌ Çekilişi yalnızca yöneticiler veya kurucular başlatabilir.', ephemeral: true });
        }
        const sureMetni = interaction.options.getString('sure', true).trim();
        const odul = interaction.options.getString('odul', true).trim();
        const eslesme = sureMetni.match(/^(\d+)\s*([mhd])$/i);
        if (!eslesme || !odul) {
            return interaction.reply({ content: '📝 Süreyi `30m`, `2h` veya `1d` biçiminde gir ve ödülü yaz.', ephemeral: true });
        }
        const carpan = { m: 60_000, h: 3_600_000, d: 86_400_000 }[eslesme[2].toLowerCase()];
        const sureMs = Number(eslesme[1]) * carpan;
        if (!Number.isSafeInteger(sureMs) || sureMs < 60_000 || sureMs > 100 * 86_400_000) {
            return interaction.reply({ content: '⏱️ Çekiliş süresi 1 dakika ile 100 gün arasında olmalı.', ephemeral: true });
        }
        if (odul.length > 200) return interaction.reply({ content: '❌ Ödül en fazla 200 karakter olabilir.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const bitis = Date.now() + sureMs;
        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setAuthor({ name: 'KünefeSMP • Büyük Çekiliş', iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
            .setTitle('🎁 Şansını Dene, Ödülü Kazan!')
            .setDescription(`KünefeSMP ailesine güzel bir sürprizimiz var! 🍯\n\n**Ödül:** ${odul}\n\nKatılmak için aşağıdaki düğmeye bas. Kazanan çekiliş bitince rastgele seçilecek!`)
            .addFields(
                { name: '⏳ Çekiliş bitişi', value: `<t:${Math.floor(bitis / 1000)}:R>`, inline: true },
                { name: '🙋 Katılımcılar', value: '0 kişi', inline: true }
            )
            .setFooter({ text: 'Her oyuncu bir kez katılabilir • KünefeSMP' })
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cekilis_katil').setLabel('Çekilişe Katıl (0)').setEmoji('🎉').setStyle(ButtonStyle.Success)
        );
        const sent = await interaction.channel.send({ embeds: [embed], components: [row] });
        cekilisler.set(sent.id, {
            katilimcilar: new Set(),
            kanalId: interaction.channel.id,
            bitisZamani: bitis,
            zamanlayici: setTimeout(() => cekilisiBitir(sent.id), sureMs)
        });
        await interaction.editReply({ content: `✅ Çekiliş oluşturuldu: ${sent}` });
        return;
    }

    if (ad === 'destek-kur') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Bu komutu yalnızca yöneticiler kullanabilir.', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        const embed = new EmbedBuilder()
            .setTitle('🍯 KünefeSMP Yardım & Destek Masası')
            .setDescription(
                'Merhaba değerli oyuncumuz! Sunucumuzda bir problemle mi karşılaştın, bir bug/hile mi bildirmek istiyorsun ya da bir konuda yardıma mı ihtiyacın var?\n\n' +
                'Yetkili ekibimiz sana en hızlı şekilde yardımcı olmak için hazır!\n\n' +
                '📋 **Destek Talebi Açarken Lütfen:**\n' +
                '• Sorununu kısa ve anlaşılır bir dille ifade et.\n' +
                '• Varsa oyun içi kanıt (fotoğraf veya video) hazırla.\n' +
                '• Yetkilileri gereksiz yere etiketlememeye özen göster, sırayla bakılacaktır.\n\n' +
                '⚡ **Hemen Başla:**\nAşağıdaki butona tıklayarak sadece sana özel bir destek odası açabilirsin.'
            )
            .setColor(0xE67E22)
            .setFooter({ text: 'KünefeSMP • Kaliteli ve Güvenli Oyun Deneyimi' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bilet_olustur').setLabel('Destek Talebi Oluştur').setEmoji('🎫').setStyle(ButtonStyle.Primary)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ Destek paneli bu kanala kuruldu.' });
    }
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        await slashKomutunuCalistir(interaction);
        return;
    }

    if (interaction.isButton() && interaction.customId === 'bilet_olustur') {
        const menu = new StringSelectMenuBuilder()
            .setCustomId('bilet_kategori_secimi')
            .setPlaceholder('Destek konusunu seç')
            .addOptions(
                {
                    label: 'Teknik sorun',
                    description: 'Sunucuya giriş veya oyun içi teknik sorunlar',
                    value: 'teknik',
                    emoji: '🛠️'
                },
                {
                    label: 'Oyuncu bildirimi',
                    description: 'Bir oyuncuyla ilgili bildirim veya şikâyet',
                    value: 'oyuncu',
                    emoji: '👤'
                },
                {
                    label: 'Mağaza / ödeme',
                    description: 'Mağaza alışverişi ve ödeme sorunları',
                    value: 'magaza',
                    emoji: '🛒'
                },
                {
                    label: 'Öneri / diğer',
                    description: 'Öneri veya diğer konular',
                    value: 'diger',
                    emoji: '💡'
                }
            );

        return interaction.reply({
            content: '🎫 Hangi konuda destek istiyorsun?',
            components: [new ActionRowBuilder().addComponents(menu)],
            ephemeral: true
        });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'bilet_kategori_secimi') {
        const kategori = interaction.values[0];
        const basliklar = {
            teknik: 'Teknik Sorun',
            oyuncu: 'Oyuncu Bildirimi',
            magaza: 'Mağaza / Ödeme',
            diger: 'Öneri / Diğer'
        };

        const modal = new ModalBuilder()
            .setCustomId(`bilet_form:${kategori}`)
            .setTitle(`${basliklar[kategori]} Talebi`);

        const oyuncuAdi = new TextInputBuilder()
            .setCustomId('minecraft_adi')
            .setLabel('Minecraft kullanıcı adın')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Örnek: UnplugMC')
            .setRequired(true)
            .setMaxLength(32);

        const aciklama = new TextInputBuilder()
            .setCustomId('talep_aciklamasi')
            .setLabel('Sorununu veya önerini açıkla')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ne olduğunu ve varsa ne zaman yaşandığını yaz. Kanıtı talep odasına ekleyebilirsin.')
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(1000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(oyuncuAdi),
            new ActionRowBuilder().addComponents(aciklama)
        );

        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('bilet_form:')) {
        const kategori = interaction.customId.split(':')[1];
        const bilgi = {
            teknik: { ad: 'teknik', baslik: '🛠️ Teknik Sorun' },
            oyuncu: { ad: 'oyuncu', baslik: '👤 Oyuncu Bildirimi' },
            magaza: { ad: 'magaza', baslik: '🛒 Mağaza / Ödeme' },
            diger: { ad: 'diger', baslik: '💡 Öneri / Diğer' }
        }[kategori];

        if (!bilgi) {
            return interaction.reply({
                content: '❌ Kategori geçerli değil. Lütfen yeniden dene.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const ticketTopic = `kunefesmp-ticket:${interaction.user.id}`;
        const mevcut = interaction.guild.channels.cache.find(
            c => c.type === ChannelType.GuildText && c.topic === ticketTopic
        );

        if (mevcut) {
            return interaction.editReply({
                content: `❌ Zaten açık bir destek talebin var: ${mevcut}`
            });
        }

        const guvenliAd =
            interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 35) ||
            'oyuncu';

        const izinler = [
            {
                id: interaction.guild.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: interaction.user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            }
        ];

        if (AYARLAR.YETKILI_ROL_ID &&
            interaction.guild.roles.cache.has(AYARLAR.YETKILI_ROL_ID)) {
            izinler.push({
                id: AYARLAR.YETKILI_ROL_ID,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            });
        }

        try {
            const kanal = await interaction.guild.channels.create({
                name: `talep-${bilgi.ad}-${guvenliAd}`.slice(0, 90),
                type: ChannelType.GuildText,
                parent: AYARLAR.KATEGORI_ID || null,
                topic: ticketTopic,
                permissionOverwrites: izinler
            });

            const minecraftAdi = interaction.fields.getTextInputValue('minecraft_adi');
            const aciklamaMetni = interaction.fields.getTextInputValue('talep_aciklamasi');

            const destekEmbed = new EmbedBuilder()
                .setTitle(bilgi.baslik)
                .setDescription(aciklamaMetni)
                .addFields(
                    { name: 'Oyuncu', value: `${interaction.user}`, inline: true },
                    { name: 'Minecraft adı', value: `\`${minecraftAdi}\``, inline: true }
                )
                .setColor(0xE67E22)
                .setTimestamp();

            const kapatButonu = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('bilet_kapat')
                    .setLabel('Talebi Kapat')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger)
            );

            await kanal.send({
                content: `${interaction.user} ${
                    AYARLAR.YETKILI_ROL_ID ? `<@&${AYARLAR.YETKILI_ROL_ID}>` : ''
                }`,
                embeds: [destekEmbed],
                components: [kapatButonu]
            });

            await interaction.editReply({
                content: `✅ ${bilgi.baslik} talebin oluşturuldu: ${kanal}`
            });
        } catch (err) {
            console.error('Destek talebi oluşturulamadı:', err);
            await interaction.editReply({
                content: '❌ Talep oluşturulamadı. Botun kanal oluşturma izinlerini ve kategori ayarını kontrol edin.'
            });
        }

        return;
    }

    if (!interaction.isButton()) return;

    if (interaction.customId === 'bilet_kapat') {
        const yetkili =
            interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels) ||
            interaction.member?.roles?.cache?.has(AYARLAR.YETKILI_ROL_ID);
        const talepSahibi =
            interaction.channel?.topic === `kunefesmp-ticket:${interaction.user.id}`;

        if (!yetkili && !talepSahibi) {
            return interaction.reply({
                content: '❌ Bu talebi kapatma yetkin yok.',
                ephemeral: true
            });
        }

        await interaction.reply({ content: '🔒 Destek talebi kapatılıyor…', ephemeral: true });
        await interaction.channel.delete().catch(err => console.error('Kanal silinemedi:', err));
        return;
    }

    if (interaction.customId === 'etkinlik_katil') {
        const mesajId = interaction.message.id;
        if (!etkinlikKatilimlari[mesajId]) etkinlikKatilimlari[mesajId] = new Set();

        const katilimcilar = etkinlikKatilimlari[mesajId];
        const zatenKatilmis = katilimcilar.has(interaction.user.id);

        if (zatenKatilmis) katilimcilar.delete(interaction.user.id);
        else katilimcilar.add(interaction.user.id);

        const yeniButon = ButtonBuilder
            .from(interaction.message.components[0].components[0])
            .setLabel(`Katılacağım (${katilimcilar.size})`);

        await interaction.update({
            components: [new ActionRowBuilder().addComponents(yeniButon)]
        });

        return interaction.followUp({
            content: zatenKatilmis
                ? 'Etkinlik katılımını kaldırdım.'
                : 'Etkinliğe katılımını ekledim! Görüşürüz 🎉',
            ephemeral: true
        });
    }

    if (interaction.customId === 'cekilis_katil') {
        const cekilis = cekilisler.get(interaction.message.id);

        if (!cekilis) {
            return interaction.reply({
                content: 'Bu çekiliş artık aktif değil veya bot yeniden başlatıldı. Yeni çekilişleri takip et!',
                ephemeral: true
            });
        }

        const id = interaction.user.id;
        const zatenKatilmis = cekilis.katilimcilar.has(id);

        if (zatenKatilmis) cekilis.katilimcilar.delete(id);
        else cekilis.katilimcilar.add(id);

        const katilimSayisi = cekilis.katilimcilar.size;
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);

        embed.setFields(
            {
                name: '⏳ Çekiliş bitişi',
                value: `<t:${Math.floor(cekilis.bitisZamani / 1000)}:R>`,
                inline: true
            },
            {
                name: '🙋 Katılımcılar',
                value: `${katilimSayisi} kişi`,
                inline: true
            }
        );

        const buton = ButtonBuilder
            .from(interaction.message.components[0].components[0])
            .setLabel(`Çekilişe Katıl (${katilimSayisi})`);

        await interaction.update({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(buton)]
        });

        return interaction.followUp({
            content: zatenKatilmis
                ? 'Çekiliş katılımını kaldırdım.'
                : 'Çekilişe katıldın! Bol şans 🍀',
            ephemeral: true
        });
    }

    if (interaction.customId === 'oneri_evet' ||
        interaction.customId === 'oneri_hayir') {
        try {
            const msgId = interaction.message.id;
            const userId = interaction.user.id;

            if (!oneriOylari[msgId]) {
                oneriOylari[msgId] = { evet: [], hayir: [] };
            }

            const oy = oneriOylari[msgId];

            if (interaction.customId === 'oneri_evet') {
                if (oy.evet.includes(userId)) {
                    return interaction.reply({
                        content: '❌ Zaten "Evet" oyu kullanmışsınız!',
                        ephemeral: true
                    });
                }

                oy.hayir = oy.hayir.filter(id => id !== userId);
                oy.evet.push(userId);
            } else {
                if (oy.hayir.includes(userId)) {
                    return interaction.reply({
                        content: '❌ Zaten "Hayır" oyu kullanmışsınız!',
                        ephemeral: true
                    });
                }

                oy.evet = oy.evet.filter(id => id !== userId);
                oy.hayir.push(userId);
            }

            const row = interaction.message.components[0];
            const evet = ButtonBuilder
                .from(row.components[0])
                .setLabel(`Evet (${oy.evet.length})`);
            const hayir = ButtonBuilder
                .from(row.components[1])
                .setLabel(`Hayır (${oy.hayir.length})`);

            await interaction.update({
                components: [new ActionRowBuilder().addComponents(evet, hayir)]
            });
        } catch (err) {
            console.error('Oylama hatası:', err);
        }
    }
});

async function cekilisiBitir(duyuruId) {
    const cekilis = cekilisler.get(duyuruId);
    if (!cekilis) return;

    clearTimeout(cekilis.zamanlayici);
    cekilisler.delete(duyuruId);

    try {
        const kanal = await client.channels.fetch(cekilis.kanalId);
        if (!kanal?.isTextBased()) return;

        const duyuru = await kanal.messages.fetch(duyuruId);
        const liste = [...cekilis.katilimcilar];
        const kazananId = liste.length
            ? liste[Math.floor(Math.random() * liste.length)]
            : null;

        const eskiEmbed = duyuru.embeds[0]
            ? EmbedBuilder.from(duyuru.embeds[0])
            : new EmbedBuilder();

        eskiEmbed
            .setColor(kazananId ? 0x2ECC71 : 0x95A5A6)
            .setFields(
                { name: '🏁 Durum', value: 'Çekiliş sona erdi', inline: true },
                { name: '🙋 Katılımcılar', value: `${liste.length} kişi`, inline: true },
                {
                    name: '🏆 Kazanan',
                    value: kazananId
                        ? `<@${kazananId}>`
                        : 'Katılan olmadığı için kazanan seçilemedi.',
                    inline: false
                }
            );

        const eskiButon = ButtonBuilder
            .from(duyuru.components[0].components[0])
            .setLabel('Çekiliş Sona Erdi')
            .setDisabled(true)
            .setStyle(ButtonStyle.Secondary);

        await duyuru.edit({
            embeds: [eskiEmbed],
            components: [new ActionRowBuilder().addComponents(eskiButon)]
        });

        if (kazananId) {
            await kanal.send({
                content: `🎉 Tebrikler <@${kazananId}>! Çekilişi kazandın! Destek talebinden bize ulaşabilirsin!`,
                allowedMentions: { users: [kazananId] }
            });
        } else {
            await kanal.send('Çekiliş sona erdi ama katılan olmadığı için kazanan çıkmadı.');
        }
    } catch (err) {
        console.error('Çekiliş sonuçlandırılamadı:', err);
    }
}

// Botu Başlat
client.login(process.env.TOKEN || AYARLAR.TOKEN);
