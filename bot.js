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

// ============================================
// ⚙️ ENVIRONMENT & DATABASE CONFIGURATION
// ============================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; // e.g. https://your-bot-name.onrender.com
const WHITELIST_FILE = './whitelist.json';

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: Missing DISCORD_TOKEN or CLIENT_ID in environment variables!");
    process.exit(1);
}

// Database Helpers
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

// User-Installable Command Config
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

// ============================================
// 📜 SLASH COMMAND REGISTRATION
// ============================================

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
        console.log('✅ Commands updated globally!');
    } catch (error) {
        console.error('❌ Error updating commands:', error);
    }
})();

// ============================================
// ⚡ INTERACTION HANDLER & KEEP-ALIVE
// ============================================

client.on('clientReady', () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    
    // Discord Status Rotator
    const activities = [
        { name: '🥛 Milky Hub | /verify', type: 0 },
        { name: '24-Hour Access Gate', type: 3 },
        { name: 'Volleyball Automations', type: 2 }
    ];
    let index = 0;
    setInterval(() => {
        const act = activities[index];
        client.user.setActivity(act.name, { type: act.type });
        index = (index + 1) % activities.length;
    }, 15000);

    // 🔄 Render Auto-Ping (Self-Pings every 10 mins)
    if (RENDER_EXTERNAL_URL) {
        setInterval(() => {
            const pingUrl = `${RENDER_EXTERNAL_URL}/ping`;
            const requester = pingUrl.startsWith('https') ? https : http;
            
            requester.get(pingUrl, (res) => {
                console.log(`⚡ Keep-alive ping sent to Render. Status: ${res.statusCode}`);
            }).on('error', (err) => {
                console.error("⚠️ Keep-alive error:", err.message);
            });
        }, 10 * 60 * 1000);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    // --- /verify ---
    if (commandName === 'verify') {
        const username = interaction.options.getString('username').toLowerCase();
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
            .setTitle('✅ Whitelist Activated!')
            .setDescription(`Roblox user **${username}** is granted access for **24 hours**.`)
            .addFields({ name: 'Pass Expires', value: `<t:${Math.floor(expiresAt / 1000)}:R>` })
            .setColor('#2ECC71')
            .setFooter({ text: 'Run /verify again in 24 hours to keep access.' });

        return interaction.reply({ embeds: [embed] });
    }

    // --- /ping ---
    if (commandName === 'ping') {
        return interaction.reply({ content: `🏓 Pong! Latency: \`${Date.now() - interaction.createdTimestamp}ms\`` });
    }
});

client.login(TOKEN);

// ============================================
// 🌐 HTTP API SERVER (ROBLOX & VERCEL DASHBOARD)
// ============================================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Endpoint 1: Ping endpoint
    if (url.pathname === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end("PONG");
    }

    // Endpoint 2: Roblox Verification Check (/check?user=username)
    if (url.pathname === '/check') {
        const user = (url.searchParams.get('user') || '').toLowerCase();
        const whitelist = getWhitelist();
        const entry = whitelist[user];

        if (entry && entry.expiresAt > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ allowed: true, expiresAt: entry.expiresAt }));
        } else {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ allowed: false, reason: "Verification Expired or Not Found" }));
        }
    }

    // Endpoint 3: Vercel Stats API Endpoint (/api/stats)
    if (url.pathname === '/api/stats') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify(getWhitelist()));
    }

    // Default Fallback
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Milky Backend Active");
    res.end();
}).listen(PORT, () => {
    console.log(`🌐 Server & Whitelist API listening on port ${PORT}`);
});
