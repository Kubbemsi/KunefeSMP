const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    ChannelType, 
    PermissionsBitField,
    ActivityType 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= AYARLAR =================
const AYARLAR = {
    TOKEN: "MTU0NzI3NDc3OTk5MDQzMzg0Mg.G0XpIu.ldLT3fa-49EEuHAkQUVczjHJnX6XpUpnuYM2uE", // Bot Tokenin
    YETKILI_ROL_ID: "1539629513753755760", // Yetkili Rolünün ID'si
    KATEGORI_ID: "1547551650464530462", // Biletlerin açılacağı kategori ID'si (İsteğe bağlı)
    SUNUCU_IP: "oyna.kunefesmp.com.tr" // Takip edilecek Minecraft IP'si
};

// ================= CANLI DURUM GÜNCELLEME =================
async function sunucuDurumGuncelle() {
    try {
        const res = await fetch(`https://api.mcstatus.io/v2/status/java/${AYARLAR.SUNUCU_IP}`);
        const data = await res.json();

        if (data.online) {
            client.user.setPresence({
                activities: [{ 
                    name: `🟢 ${data.players.online}/${data.players.max} Oyuncu | ${AYARLAR.SUNUCU_IP}`, 
                    type: ActivityType.Custom 
                }],
                status: 'online'
            });
        } else {
            client.user.setPresence({
                activities: [{ 
                    name: `🔴 Sunucu Kapalı | ${AYARLAR.SUNUCU_IP}`, 
                    type: ActivityType.Custom 
                }],
                status: 'dnd' // Kırmızı rahatsız etmeyin ikonu
            });
        }
    } catch (err) {
        console.error('Sunucu durumu çekilemedi:', err);
    }
}

client.on('ready', () => {
    console.log(`[+] Bot başarıyla aktif edildi: ${client.user.tag}`);
    
    // Bot açılır açılmaz ve her 30 saniyede bir durumu güncelle
    sunucuDurumGuncelle();
    setInterval(sunucuDurumGuncelle, 30000);
});

// ================= KOMUTLAR =================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

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
                    .setColor(0x2ECC71) // Yeşil
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
                    .setColor(0xE74C3C) // Kırmızı
                    .setFooter({ text: 'Gelişmeler için duyuruları takip edin.' })
                    .setTimestamp();

                await yukleniyor.edit({ content: null, embeds: [kapaliEmbed] });
            }
        } catch (err) {
            message.reply('❌ Sunucu durumuna ulaşılırken bir hata oluştu.');
        }
    }

    // --- !destek-kur KOMUTU (Eski Destek Sistemi) ---
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

        await message.delete();
        await message.channel.send({ embeds: [embed], components: [buton] });
    }
});

// ================= BUTON İŞLEMLERİ =================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'bilet_olustur') {
        const kanalAdi = `talep-${interaction.user.username.toLowerCase()}`;
        const mevcutKanal = interaction.guild.channels.cache.find(c => c.name === kanalAdi);

        if (mevcutKanal) {
            return interaction.reply({
                content: `❌ Zaten açık bir destek talebin bulunuyor: ${mevcutKanal}`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const permissionOverwrites = [
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

        if (AYARLAR.YETKILI_ROL_ID && interaction.guild.roles.cache.has(AYARLAR.YETKILI_ROL_ID)) {
            permissionOverwrites.push({
                id: AYARLAR.YETKILI_ROL_ID,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            });
        }

        const kanal = await interaction.guild.channels.create({
            name: kanalAdi,
            type: ChannelType.GuildText,
            parent: AYARLAR.KATEGORI_ID || null,
            permissionOverwrites: permissionOverwrites
        });

        const icEmbed = new EmbedBuilder()
            .setTitle('🎫 Destek Talebi')
            .setDescription(`Merhaba ${interaction.user}, yetkili ekibimiz en kısa sürede seninle ilgilenecektir.\n\nLütfen sorununuzu detaylı bir şekilde açıklayın.`)
            .setColor(0x2ECC71);

        const kapatButon = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('bilet_kapat')
                .setLabel('Talebi Kapat')
                .setEmoji('🔒')
                .setStyle(ButtonStyle.Danger)
        );

        await kanal.send({ 
            content: `${interaction.user} ${AYARLAR.YETKILI_ROL_ID ? `<@&${AYARLAR.YETKILI_ROL_ID}>` : ''}`, 
            embeds: [icEmbed], 
            components: [kapatButon] 
        });

        await interaction.editReply({
            content: `✅ Destek talebiniz oluşturuldu: ${kanal}`
        });
    }

    if (interaction.customId === 'bilet_kapat') {
        await interaction.reply({
            content: '🔒 Bu talep **5 saniye** içinde siliniyor...'
        });

        setTimeout(async () => {
            try {
                await interaction.channel.delete();
            } catch (err) {
                console.error('Kanal silinirken hata:', err);
            }
        }, 5000);
    }
});

// Botu Başlat
client.login(process.env.TOKEN);
