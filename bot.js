const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ApplicationIntegrationType,
    InteractionContextType
} = require('discord.js');
const http = require('http');
const https = require('https');
const fs = require('fs');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
const WHITELIST_FILE = './whitelist.json';

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: Missing DISCORD_TOKEN or CLIENT_ID!");
    process.exit(1);
}

function getWhitelist() {
    if (!fs.existsSync(WHITELIST_FILE)) fs.writeFileSync(WHITELIST_FILE, '{}');
    try {
        return JSON.parse(fs.readFileSync(WHITELIST_FILE));
    } catch {
        return {};
    }
}

function saveWhitelist(data) {
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(data, null, 2));
}

const client = new Client({ intents: [ GatewayIntentBits.Guilds ] });

const userAppConfig = (builder) => {
    return builder
        .setDefaultMemberPermissions(null)
        .setIntegrationTypes([
            ApplicationIntegrationType.UserInstall, 
            ApplicationIntegrationType.GuildInstall
        ])
        .setContexts([
            InteractionContextType.Guild, 
            InteractionContextType.BotDM, 
            InteractionContextType.PrivateChannel
        ]);
};

const commands = [
    userAppConfig(
        new SlashCommandBuilder()
            .setName('verify')
            .setDescription('Get 24-hour script access for your Roblox account')
            .addStringOption(opt => 
                opt.setName('username')
                   .setDescription('Your exact Roblox username')
                   .setRequired(true))
    ),
    userAppConfig(
        new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check bot latency')
    )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commands synced!');
    } catch (error) {
        console.error('❌ Sync error:', error);
    }
})();

client.on('clientReady', () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    
    if (RENDER_EXTERNAL_URL) {
        setInterval(() => {
            const pingUrl = `${RENDER_EXTERNAL_URL}/ping`;
            const requester = pingUrl.startsWith('https') ? https : http;
            requester.get(pingUrl, (res) => {
                console.log(`⚡ Ping status: ${res.statusCode}`);
            }).on('error', (err) => console.error("Keep-alive error:", err.message));
        }, 10 * 60 * 1000);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'verify') {
        const inputUser = interaction.options.getString('username').trim().toLowerCase();
        const whitelist = getWhitelist();

        const expiresAt = Date.now() + (24 * 60 * 60 * 1000);

        whitelist[inputUser] = {
            discordId: interaction.user.id,
            discordTag: interaction.user.tag,
            expiresAt: expiresAt,
            verifiedAt: Date.now()
        };

        saveWhitelist(whitelist);

        const embed = new EmbedBuilder()
            .setTitle('✅ Access Granted!')
            .setDescription(`Roblox user **${inputUser}** whitelisted for **24 hours**.`)
            .addFields({ name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:R>` })
            .setColor('#2ECC71');

        return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'ping') {
        return interaction.reply({ content: `🏓 Pong! \`${Date.now() - interaction.createdTimestamp}ms\`` });
    }
});

client.login(TOKEN);

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end("PONG");
    }

    if (url.pathname === '/check') {
        const user = (url.searchParams.get('user') || '').trim().toLowerCase();
        const whitelist = getWhitelist();
        const entry = whitelist[user];

        if (entry && entry.expiresAt > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ allowed: true, expiresAt: entry.expiresAt }));
        } else {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ allowed: false, reason: "Expired or Not Whitelisted" }));
        }
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end("Milky Backend Active");
}).listen(PORT, () => console.log(`🌐 Server active on port ${PORT}`));
