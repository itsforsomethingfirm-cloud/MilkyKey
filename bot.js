const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder,
    PermissionFlagsBits,
    ApplicationIntegrationType,
    InteractionContextType
} = require('discord.js');
const http = require('http');
const https = require('https');
const fs = require('fs');

// ============================================
// ⚙️ CONFIGURATION
// ============================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
const WHITELIST_FILE = './whitelist.json';

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: Missing DISCORD_TOKEN or CLIENT_ID!");
    process.exit(1);
}

// Helpers
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

// ============================================
// 📜 SLASH COMMAND REGISTRATION
// ============================================

const commands = [
    // Public Command: Everyone can use this
    new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Get 24-hour script access for your Roblox account')
        .addStringOption(opt => 
            opt.setName('username')
               .setDescription('Your exact Roblox username')
               .setRequired(true))
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .setContexts([InteractionContextType.Guild]),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .setContexts([InteractionContextType.Guild]),

    // ADMIN COMMAND 1: Give custom whitelist duration
    new SlashCommandBuilder()
        .setName('admin-add')
        .setDescription('[ADMIN] Add or update a whitelist entry manually')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
        .addIntegerOption(opt => opt.setName('days').setDescription('Number of days (default: 30)').setRequired(false)),

    // ADMIN COMMAND 2: Revoke/Blacklist a user
    new SlashCommandBuilder()
        .setName('admin-remove')
        .setDescription('[ADMIN] Remove a user from the whitelist')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true)),

    // ADMIN COMMAND 3: List all active keys
    new SlashCommandBuilder()
        .setName('admin-list')
        .setDescription('[ADMIN] View all whitelisted users')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 Syncing slash commands globally...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commands synced! /verify is now available for ALL members.');
    } catch (error) {
        console.error('❌ Command sync error:', error);
    }
})();

// ============================================
// ⚡ INTERACTION HANDLERS
// ============================================

client.on('clientReady', () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    
    // Render Keep-Alive
    if (RENDER_EXTERNAL_URL) {
        setInterval(() => {
            const pingUrl = `${RENDER_EXTERNAL_URL}/ping`;
            const requester = pingUrl.startsWith('https') ? https : http;
            requester.get(pingUrl, (res) => {}).on('error', () => {});
        }, 10 * 60 * 1000);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // PUBLIC: VERIFY
    if (commandName === 'verify') {
        const username = interaction.options.getString('username').trim().toLowerCase();
        const whitelist = getWhitelist();
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 Hours

        whitelist[username] = {
            discordId: interaction.user.id,
            discordTag: interaction.user.tag,
            expiresAt: expiresAt,
            verifiedAt: Date.now()
        };

        saveWhitelist(whitelist);

        const embed = new EmbedBuilder()
            .setTitle('✅ Access Granted!')
            .setDescription(`Roblox user **${username}** whitelisted for **24 hours**.`)
            .addFields({ name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:R>` })
            .setColor('#2ECC71');

        return interaction.reply({ embeds: [embed] });
    }

    // PUBLIC: PING
    if (commandName === 'ping') {
        return interaction.reply({ content: `🏓 Pong! \`${Date.now() - interaction.createdTimestamp}ms\`` });
    }

    // ADMIN: MANUAL ADD
    if (commandName === 'admin-add') {
        const username = interaction.options.getString('username').trim().toLowerCase();
        const days = interaction.options.getInteger('days') || 30;
        const whitelist = getWhitelist();

        const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);

        whitelist[username] = {
            discordId: interaction.user.id,
            discordTag: `ADMIN OVERRIDE (${interaction.user.tag})`,
            expiresAt: expiresAt,
            verifiedAt: Date.now()
        };

        saveWhitelist(whitelist);

        return interaction.reply({ content: `👑 **[ADMIN]** Whitelisted **${username}** for **${days} days**!` });
    }

    // ADMIN: REMOVE / BLACKLIST
    if (commandName === 'admin-remove') {
        const username = interaction.options.getString('username').trim().toLowerCase();
        const whitelist = getWhitelist();

        if (whitelist[username]) {
            delete whitelist[username];
            saveWhitelist(whitelist);
            return interaction.reply({ content: `🚫 **[ADMIN]** Revoked access for **${username}**.` });
        } else {
            return interaction.reply({ content: `⚠️ User **${username}** is not in the whitelist.` });
        }
    }

    // ADMIN: LIST USERS
    if (commandName === 'admin-list') {
        const whitelist = getWhitelist();
        const keys = Object.keys(whitelist);

        if (keys.length === 0) {
            return interaction.reply({ content: "📜 Whitelist is currently empty." });
        }

        let listText = keys.map(user => {
            const exp = Math.floor(whitelist[user].expiresAt / 1000);
            return `• **${user}** - Expires <t:${exp}:R>`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`📜 Whitelisted Users (${keys.length})`)
            .setDescription(listText.length > 4000 ? listText.substring(0, 4000) + '...' : listText)
            .setColor('#3498DB');

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

client.login(TOKEN);

// ============================================
// 🌐 HTTP API SERVER (ROBLOX & VERCEL DASHBOARD)
// ============================================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // CORS headers for Vercel Dashboard
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    if (url.pathname === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end("PONG");
    }

    if (url.pathname === '/check') {
        const user = (url.searchParams.get('user') || '').trim().toLowerCase();
        const whitelist = getWhitelist();
        const entry = whitelist[user];

        res.writeHead(200, { 'Content-Type': 'application/json' });

        if (entry && entry.expiresAt > Date.now()) {
            return res.end(JSON.stringify({ allowed: true, expiresAt: entry.expiresAt }));
        } else {
            return res.end(JSON.stringify({ allowed: false, reason: "Expired or Not Whitelisted" }));
        }
    }

    // Vercel Dashboard Endpoint
    if (url.pathname === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(getWhitelist()));
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end("Milky Backend Active");
}).listen(PORT, () => console.log(`🌐 API Active on port ${PORT}`));
