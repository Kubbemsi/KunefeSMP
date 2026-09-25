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
    ActivityType 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers // Yeni üyeleri algılamak için eklendi!
    ]
});

// ================= AYARLAR =================
const AYARLAR = {
    TOKEN: 'MTU0NzI3NDc3OTk5MDQzMzg0Mg.G0XpIu.ldLT3fa-49EEuHAkQUVczjHJnX6XpUpnuYM2uE', // Eski token (geçersiz; yeni TOKEN ortam değişkeni varsa o kullanılır)
    KURUCU_ROL_ID: "", // İstersen kurucu rolünün ID'sini buraya ekle
    YETKILI_ROL_ID: "1539629513753755760", // Yetkili Rolünün ID'si
    KATEGORI_ID: "1547551650464530462", // Biletlerin açılacağı kategori ID'si
    ONERI_KANAL_ID: "1550824276305776660", // Önerilerin atılacağı kanal ID'si
    KARSILAMA_KANAL_ID: "1547561101745459320", // <--- Karşılama kanalının ID'sini buraya yaz!
    SUNUCU_IP: "oyna.kunefesmp.com.tr" // Takip edilecek Minecraft IP'si
};

// --- FİLTRE LİSTELERİ VE KONTROLLERİ ---
const KUFUR_LISTESI = [
    'amk', 'aq', 'oç', 'oc', 'piç', 'pic', 'sik', 'sikerim', 
    'yarrak', 'orospu', 'ibne', 'yavşak', 'puşt', 'döl'
];

// Reklam ve Link Kontrolü
const REKLAM_REGEX = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li|com\/invite)|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?)/i;

// Öneri oylarını hafızada tutmak için kullanılan obje
const oneriOylari = {};
const etkinlikKatilimlari = {};

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

client.on('ready', () => {
    console.log(`[+] Bot başarıyla aktif edildi: ${client.user.tag}`);
    
    sunucuDurumGuncelle();
    setInterval(sunucuDurumGuncelle, 30000);
});

// ================= KARŞILAMA SİSTEMİ (GÖRSELDEKİNİN BİREBİR AYNISI) =================
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
        .setColor(0xFF0000); // Görseldeki kırmızı renk

    await kanal.send({ embeds: [embed] }).catch(err => console.error('Karşılama mesajı atılamadı:', err));
});

// ================= KOMUTLAR VE MESAJ KONTROLLERİ =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // --- KÜFÜR VE REKLAM FİLTRESİ ---
    const isYetkili = message.member?.permissions.has(PermissionsBitField.Flags.Administrator) ||
                      (AYARLAR.YETKILI_ROL_ID && message.member?.roles.cache.has(AYARLAR.YETKILI_ROL_ID));

    if (!isYetkili) {
        const icerikKucuk = message.content.toLowerCase();

        // 1. Reklam Kontrolü (Kendi sunucu IP'miz hariç tutulur)
        const kendiIpSiMi = icerikKucuk.includes(AYARLAR.SUNUCU_IP.toLowerCase());
        
        if (!kendiIpSiMi && REKLAM_REGEX.test(message.content)) {
            await message.delete().catch(() => {});
            const uyari = await message.channel.send(`⚠️ ${message.author}, sunucuda reklam yapmak veya dış bağlantı/link paylaşmak yasaktır!`);
            setTimeout(() => uyari.delete().catch(() => {}), 4000);
            return;
        }

        // 2. Küfür Kontrolü
        const kufurVarMi = KUFUR_LISTESI.some(kelime => {
            const regex = new RegExp(`\\b${kelime}\\b`, 'i');
            return regex.test(icerikKucuk) || icerikKucuk.includes(kelime);
        });

        if (kufurVarMi) {
            await message.delete().catch(() => {});
            const uyari = await message.channel.send(`⚠️ ${message.author}, lütfen sunucu içerisinde küfür ve hakaret içerikli kelimeler kullanma!`);
            setTimeout(() => uyari.delete().catch(() => {}), 4000);
            return;
        }
    }

    // --- ÖNERİ SİSTEMİ ---
    if (message.content.startsWith('!öneri ') || message.content.startsWith('!oneri ')) {
        if (AYARLAR.ONERI_KANAL_ID && message.channel.id !== AYARLAR.ONERI_KANAL_ID) {
            await message.delete().catch(() => {});
            const uyari = await message.channel.send(`❌ Öneri komutunu yalnızca <#${AYARLAR.ONERI_KANAL_ID}> kanalında kullanabilirsin!`);
            setTimeout(() => uyari.delete().catch(() => {}), 5000);
            return;
        }

        const oneriMetni = message.content.slice(message.content.indexOf(' ') + 1).trim();
        if (!oneriMetni) return message.reply('❌ Lütfen bir öneri metni girin! Örnek: `!öneri VIP üyelere özel kozmetik gelsin.`');

        const oneriEmbed = new EmbedBuilder()
            .setTitle('💡 Yeni Sunucu Önerisi')
            .setDescription(oneriMetni)
            .setColor(0xF1C40F)
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setFooter({ text: 'KünefeSMP • Öneri Sistemi' })
            .setTimestamp();

        const oyButonlari = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('oneri_evet')
                .setLabel('Evet (0)')
                .setEmoji('👍')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('oneri_hayir')
                .setLabel('Hayır (0)')
                .setEmoji('👎')
                .setStyle(ButtonStyle.Danger)
        );

        await message.delete().catch(() => {});
        const gonderilenMesaj = await message.channel.send({ embeds: [oneriEmbed], components: [oyButonlari] });

        oneriOylari[gonderilenMesaj.id] = { evet: [], hayir: [] };
        return;
    }

    // --- OTOMATİK SELAM KARŞILAMA ---
    const icerik = message.content.toLowerCase().trim();

    if (icerik === 'sa' || icerik === 'sa.') {
        return message.reply('as');
    }
    
    if (icerik === 'selamunaleykum' || icerik === 'selamünaleyküm' || icerik === 'saleykum' || icerik === 's.a.') {
        return message.reply('aleykumselam');
    }

    if (icerik === 'sa chat' || icerik === 'sa chat.') {
        return message.reply('as babomen');
    }

    if (icerik === 'sa çet' || icerik === 'sa çet.') {
        return message.reply('as');
    }

    // --- !sunucu ve !ip KOMUTU ---
    if (message.content === '!sunucu' || message.content === '!ip') {
        try {
            const yukleniyor = await message.reply('🔍 Sunucu bilgileri sorgulanıyor...');
            
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

                await yukleniyor.edit({ content: null, embeds: [embed] });
            } else {
                const kapaliEmbed = new EmbedBuilder()
                    .setTitle('🔴 KünefeSMP Şu Anda Kapalı / Bakımda')
                    .setDescription(`Sunucumuza şu anda ulaşılamıyor. Bakım veya güncelleme yapılıyor olabilir.\n\n📡 **IP:** \`${AYARLAR.SUNUCU_IP}\``)
                    .setColor(0xE74C3C)
                    .setFooter({ text: 'Gelişmeler için duyuruları takip edin.' })
                    .setTimestamp();

                await yukleniyor.edit({ content: null, embeds: [kapaliEmbed] });
            }
        } catch (err) {
            message.reply('❌ Sunucu durumuna ulaşılırken bir hata oluştu.');
        }
    }

    // --- !etkinlik KOMUTU ---
    if (message.content.toLowerCase().startsWith('!etkinlik')) {
        const yonetici = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);
        const sunucuSahibi = message.author.id === message.guild.ownerId;
        const kurucuRol = AYARLAR.KURUCU_ROL_ID && message.member?.roles.cache.has(AYARLAR.KURUCU_ROL_ID);
        if (!yonetici && !sunucuSahibi && !kurucuRol) {
            return message.reply('❌ Bu komutu yalnızca yöneticiler veya kurucular kullanabilir.');
        }

        const girdi = message.content.slice('!etkinlik'.length).trim();
        let zaman, yer;
        if (girdi.includes('|')) {
            [zaman, yer] = girdi.split('|', 2).map(parca => parca.trim());
        } else {
            const bolumler = girdi.split(/\s+/);
            zaman = bolumler.shift();
            yer = bolumler.join(' ').trim();
        }
        if (!zaman || !yer) {
            return message.reply('📝 Kullanım: `!etkinlik <zaman> | <yer>`\nÖrnek: `!etkinlik Yarın 20:00 | Spawn alanı`');
        }
        if (zaman.length > 100 || yer.length > 100) {
            return message.reply('❌ Zaman ve yer bilgisi en fazla 100 karakter olabilir.');
        }

        const etkinlikEmbed = new EmbedBuilder()
            .setColor(0x8E44AD)
            .setAuthor({
                name: 'KünefeSMP • Etkinlik Duyurusu',
                iconURL: message.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL()
            })
            .setTitle('🎉 Yeni Bir Etkinlik Başlıyor!')
            .setDescription(
                `Selam **KünefeSMP ailesi!** 🍯\n\n` +
                `Birlikte eğlenmeye hazır mısınız? Sunucumuzda yeni bir etkinlik düzenleniyor! ` +
                `Katılmak istiyorsan aşağıdaki **Katılacağım** düğmesine bas. 💜`
            )
            .addFields(
                { name: '🕒 Zaman', value: zaman, inline: true },
                { name: '📍 Buluşma yeri', value: yer, inline: true },
                { name: '🎮 Sunucu', value: AYARLAR.SUNUCU_IP, inline: true }
            )
            .setFooter({ text: 'Katılımını düğmeye basarak bildir • KünefeSMP' })
            .setTimestamp();

        const katilButonu = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('etkinlik_katil')
                .setLabel('Katılacağım (0)')
                .setEmoji('🙋')
                .setStyle(ButtonStyle.Success)
        );
        await message.channel.send({ embeds: [etkinlikEmbed], components: [katilButonu] });
        await message.delete().catch(() => {});
        return;
    }

    // --- !destek-kur KOMUTU ---
    if (message.content === '!destek-kur') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ Bu komutu sadece yöneticiler kullanabilir!');
        }

        const embed = new EmbedBuilder()
            .setTitle('🍯 KünefeSMP Yardım & Destek Masası')
            .setDescription(
                'Merhaba değerli oyuncumuz! Sunucumuzda bir problemle mi karşılaştın, bir bug/hile mi bildirmek istiyorsun ya da bir konuda yardıma mı ihtiyacın var?\n\n' +
                'Yetkili ekibimiz sana en hızlı şekilde yardımcı olmak için hazır!\n\n' +
                '📋 **Destek Talebi Açarken Lütfen:**\n' +
                '• Sorununu kısa ve anlaşılır bir dille ifade et.\n' +
                '• Varsa oyun içi kanıt (fotoğraf veya video) hazırla.\n' +
                '• Yetkilileri gereksiz yere etiketlememeye özen göster, sırayla bakılacaktır.\n\n' +
                '⚡ **Hemen Başla:**\n' +
                'Aşağıdaki butona tıklayarak sadece sana özel bir destek odası açabilirsin.'
            )
            .setColor(0xE67E22)
            .setFooter({ text: 'KünefeSMP • Kaliteli ve Güvenli Oyun Deneyimi' });

        const buton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('bilet_olustur')
                .setLabel('Destek Talebi Oluştur')
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary)
        );

        await message.delete().catch(() => {});
        await message.channel.send({ embeds: [embed], components: [buton] });
    }
});

// ================= BUTON İŞLEMLERİ =================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'bilet_olustur') {
        const menu = new StringSelectMenuBuilder()
            .setCustomId('bilet_kategori_secimi')
            .setPlaceholder('Destek konusunu seç')
            .addOptions(
                { label: 'Teknik sorun', description: 'Sunucuya giriş veya oyun içi teknik sorunlar', value: 'teknik', emoji: '🛠️' },
                { label: 'Oyuncu bildirimi', description: 'Bir oyuncuyla ilgili bildirim veya şikâyet', value: 'oyuncu', emoji: '👤' },
                { label: 'Mağaza / ödeme', description: 'Mağaza alışverişi ve ödeme sorunları', value: 'magaza', emoji: '🛒' },
                { label: 'Öneri / diğer', description: 'Öneri veya diğer konular', value: 'diger', emoji: '💡' }
            );
        return interaction.reply({ content: '🎫 Hangi konuda destek istiyorsun?', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'bilet_kategori_secimi') {
        const kategori = interaction.values[0];
        const basliklar = { teknik: 'Teknik Sorun', oyuncu: 'Oyuncu Bildirimi', magaza: 'Mağaza / Ödeme', diger: 'Öneri / Diğer' };
        const modal = new ModalBuilder().setCustomId(`bilet_form:${kategori}`).setTitle(`${basliklar[kategori]} Talebi`);
        const oyuncuAdi = new TextInputBuilder().setCustomId('minecraft_adi').setLabel('Minecraft kullanıcı adın').setStyle(TextInputStyle.Short).setPlaceholder('Örnek: UnplugMC').setRequired(true).setMaxLength(32);
        const aciklama = new TextInputBuilder().setCustomId('talep_aciklamasi').setLabel('Sorununu veya önerini açıkla').setStyle(TextInputStyle.Paragraph).setPlaceholder('Ne olduğunu ve varsa ne zaman yaşandığını yaz. Kanıtı talep odasına ekleyebilirsin.').setRequired(true).setMinLength(5).setMaxLength(1000);
        modal.addComponents(new ActionRowBuilder().addComponents(oyuncuAdi), new ActionRowBuilder().addComponents(aciklama));
        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('bilet_form:')) {
        const kategori = interaction.customId.split(':')[1];
        const bilgi = { teknik: { ad: 'teknik', baslik: '🛠️ Teknik Sorun' }, oyuncu: { ad: 'oyuncu', baslik: '👤 Oyuncu Bildirimi' }, magaza: { ad: 'magaza', baslik: '🛒 Mağaza / Ödeme' }, diger: { ad: 'diger', baslik: '💡 Öneri / Diğer' } }[kategori];
        if (!bilgi) return interaction.reply({ content: '❌ Kategori geçerli değil. Lütfen yeniden dene.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const ticketTopic = `kunefesmp-ticket:${interaction.user.id}`;
        const mevcut = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === ticketTopic);
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
            const kanal = await interaction.guild.channels.create({ name: `talep-${bilgi.ad}-${guvenliAd}`.slice(0, 90), type: ChannelType.GuildText, parent: AYARLAR.KATEGORI_ID || null, topic: ticketTopic, permissionOverwrites: izinler });
            const minecraftAdi = interaction.fields.getTextInputValue('minecraft_adi');
            const aciklamaMetni = interaction.fields.getTextInputValue('talep_aciklamasi');
            const embed = new EmbedBuilder().setTitle(bilgi.baslik).setDescription(aciklamaMetni).addFields(
                { name: 'Oyuncu', value: `${interaction.user}`, inline: true },
                { name: 'Minecraft adı', value: `\`${minecraftAdi}\``, inline: true }
            ).setColor(0xE67E22).setTimestamp();
            const kapat = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('bilet_kapat').setLabel('Talebi Kapat').setEmoji('🔒').setStyle(ButtonStyle.Danger));
            await kanal.send({ content: `${interaction.user} ${AYARLAR.YETKILI_ROL_ID ? `<@&${AYARLAR.YETKILI_ROL_ID}>` : ''}`, embeds: [embed], components: [kapat] });
            await interaction.editReply({ content: `✅ ${bilgi.baslik} talebin oluşturuldu: ${kanal}` });
        } catch (err) {
            console.error('Destek talebi oluşturulamadı:', err);
            await interaction.editReply({ content: '❌ Talep oluşturulamadı. Botun kanal oluşturma izinlerini ve kategori ayarını kontrol edin.' });
        }
        return;
    }

    if (!interaction.isButton()) return;
    if (interaction.customId === 'bilet_kapat') {
        const yetkili = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels) || interaction.member?.roles?.cache?.has(AYARLAR.YETKILI_ROL_ID);
        const talepSahibi = interaction.channel?.topic === `kunefesmp-ticket:${interaction.user.id}`;
        if (!yetkili && !talepSahibi) return interaction.reply({ content: '❌ Bu talebi kapatma yetkin yok.', ephemeral: true });
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
        const yeniButon = ButtonBuilder.from(interaction.message.components[0].components[0])
            .setLabel(`Katılacağım (${katilimcilar.size})`);
        await interaction.update({
            components: [new ActionRowBuilder().addComponents(yeniButon)]
        });
        return interaction.followUp({
            content: zatenKatilmis ? 'Etkinlik katılımını kaldırdım.' : 'Etkinliğe katılımını ekledim! Görüşürüz 🎉',
            ephemeral: true
        });
    }

    if (interaction.customId === 'oneri_evet' || interaction.customId === 'oneri_hayir') {
        try {
            const msgId = interaction.message.id;
            const userId = interaction.user.id;
            if (!oneriOylari[msgId]) oneriOylari[msgId] = { evet: [], hayir: [] };
            const oy = oneriOylari[msgId];
            if (interaction.customId === 'oneri_evet') {
                if (oy.evet.includes(userId)) return interaction.reply({ content: '❌ Zaten "Evet" oyu kullanmışsınız!', ephemeral: true });
                oy.hayir = oy.hayir.filter(id => id !== userId); oy.evet.push(userId);
            } else {
                if (oy.hayir.includes(userId)) return interaction.reply({ content: '❌ Zaten "Hayır" oyu kullanmışsınız!', ephemeral: true });
                oy.evet = oy.evet.filter(id => id !== userId); oy.hayir.push(userId);
            }
            const row = interaction.message.components[0];
            const evet = ButtonBuilder.from(row.components[0]).setLabel(`Evet (${oy.evet.length})`);
            const hayir = ButtonBuilder.from(row.components[1]).setLabel(`Hayır (${oy.hayir.length})`);
            await interaction.update({ components: [new ActionRowBuilder().addComponents(evet, hayir)] });
        } catch (err) { console.error('Oylama hatası:', err); }
    }
});

// Botu Başlat
client.login(process.env.TOKEN || AYARLAR.TOKEN);
