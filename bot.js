const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const KEYS_FILE = path.join(__dirname, 'keys.json');

app.use(express.json());

// ============================================
// 💾 PERSISTENT KEY STORAGE
// ============================================
let activeKeys = {};

function loadKeys() {
    if (fs.existsSync(KEYS_FILE)) {
        try {
            const data = fs.readFileSync(KEYS_FILE, 'utf8');
            activeKeys = JSON.parse(data);
            console.log('[MILKY HUB] Loaded existing keys from storage.');
        } catch (err) {
            console.error('[MILKY HUB] Failed to load keys.json:', err);
            activeKeys = {};
        }
    }
}

function saveKeys() {
    try {
        fs.writeFileSync(KEYS_FILE, JSON.stringify(activeKeys, null, 2));
    } catch (err) {
        console.error('[MILKY HUB] Failed to save keys.json:', err);
    }
}

loadKeys();

// Helper: Clean up expired keys periodically
function purgeExpiredKeys() {
    const now = Date.now();
    let changed = false;
    for (const key in activeKeys) {
        if (activeKeys[key].expireTime <= now) {
            delete activeKeys[key];
            changed = true;
        }
    }
    if (changed) saveKeys();
}
setInterval(purgeExpiredKeys, 5 * 60 * 1000); // Check every 5 minutes

// ============================================
// 🌐 SERVER ENDPOINTS
// ============================================

app.get('/', (req, res) => {
    res.send('🥛 Milky Hub Key & HWID Server is Active!');
});

// Ping endpoint for keep-alive
app.get('/ping', (req, res) => {
    res.status(200).send('PONG');
});

// Raw key list for Rayfield verification
app.get('/keys.txt', (req, res) => {
    purgeExpiredKeys();
    const validKeys = Object.keys(activeKeys);
    res.type('text/plain');
    res.send(validKeys.join('\n'));
});

// HWID Verification Endpoint
app.post('/verify-hwid', (req, res) => {
    purgeExpiredKeys();
    const { key, hwid } = req.body;
    const now = Date.now();

    if (!key || !hwid) {
        return res.status(400).json({ success: false, message: "Missing key or HWID." });
    }

    const keyData = activeKeys[key];

    if (!keyData || keyData.expireTime <= now) {
        return res.status(401).json({ success: false, message: "Invalid or expired key." });
    }

    // First time use: Bind HWID
    if (!keyData.boundHWID) {
        keyData.boundHWID = hwid;
        saveKeys();
        console.log(`[MILKY HUB] Key ${key} bound to HWID: ${hwid}`);
        return res.json({ success: true, message: "Key validated and bound to your device!" });
    }

    // Subsequent uses: Check HWID match
    if (keyData.boundHWID === hwid) {
        return res.json({ success: true, message: "Access granted!" });
    } else {
        return res.status(403).json({ success: false, message: "This key is bound to another device!" });
    }
});

app.listen(PORT, () => {
    console.log(`[MILKY HUB] Server running on port ${PORT}`);
    
    // Self-ping to keep Render instance awake (every 10 minutes)
    const SERVER_URL = process.env.RENDER_EXTERNAL_URL;
    if (SERVER_URL) {
        setInterval(() => {
            https.get(`${SERVER_URL}/ping`, (res) => {
                console.log(`[MILKY HUB] Self-ping status: ${res.statusCode}`);
            }).on('error', (err) => {
                console.error('[MILKY HUB] Self-ping failed:', err.message);
            });
        }, 10 * 60 * 1000);
    }
});

// ============================================
// 🤖 DISCORD BOT
// ============================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_DISCORD_ID = process.env.OWNER_ID || "";

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: Missing DISCORD_TOKEN or CLIENT_ID!");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('key')
        .setDescription('Generate a single key (Owner/Admin Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('hours').setDescription('Duration in hours').setRequired(true)),

    new SlashCommandBuilder()
        .setName('bulkkey')
        .setDescription('Generate multiple keys at once')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('hours').setDescription('Duration in hours').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Number of keys (1-25)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('deletekey')
        .setDescription('Revoke an existing key')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('key').setDescription('The key code to delete').setRequired(true)),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View active keys and server statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('[MILKY HUB] Registering Slash Commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('[MILKY HUB] Commands registered successfully!');
    } catch (error) {
        console.error('[MILKY HUB] Command registration failed:', error);
    }
})();

// Helper to generate key string
function generateKeyString() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `MILKY-${code}`;
}

// Interaction Handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const isOwner = OWNER_DISCORD_ID && interaction.user.id === OWNER_DISCORD_ID;
    const isAdmin = interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.Administrator);

    if (!isOwner && !isAdmin) {
        return interaction.reply({ content: "❌ Only administrators can use this command!", ephemeral: true });
    }

    const { commandName } = interaction;

    // Single Key Command
    if (commandName === 'key') {
        const hours = interaction.options.getInteger('hours');
        const key = generateKeyString();
        const expireTimestamp = Date.now() + (hours * 60 * 60 * 1000);

        activeKeys[key] = { expireTime: expireTimestamp, boundHWID: null };
        saveKeys();

        return interaction.reply({
            content: `🥛 **Key Generated:** \`${key}\`\n⏱️ **Duration:** ${hours} hour(s)\n🔒 **HWID Lock:** Single-device activation enabled.`,
            ephemeral: true
        });
    }

    // Bulk Key Command
    if (commandName === 'bulkkey') {
        const hours = interaction.options.getInteger('hours');
        const amount = Math.min(Math.max(interaction.options.getInteger('amount'), 1), 25);
        const expireTimestamp = Date.now() + (hours * 60 * 60 * 1000);
        const generatedList = [];

        for (let i = 0; i < amount; i++) {
            const key = generateKeyString();
            activeKeys[key] = { expireTime: expireTimestamp, boundHWID: null };
            generatedList.push(`\`${key}\``);
        }
        saveKeys();

        return interaction.reply({
            content: `🥛 **${amount} Keys Generated (${hours} hours each):**\n${generatedList.join('\n')}`,
            ephemeral: true
        });
    }

    // Delete Key Command
    if (commandName === 'deletekey') {
        const targetKey = interaction.options.getString('key').trim();
        if (activeKeys[targetKey]) {
            delete activeKeys[targetKey];
            saveKeys();
            return interaction.reply({ content: `✅ Key \`${targetKey}\` has been revoked and deleted.`, ephemeral: true });
        } else {
            return interaction.reply({ content: `❌ Key \`${targetKey}\` not found in database.`, ephemeral: true });
        }
    }

    // Stats Command
    if (commandName === 'stats') {
        purgeExpiredKeys();
        const totalKeys = Object.keys(activeKeys).length;
        const boundKeys = Object.values(activeKeys).filter(k => k.boundHWID !== null).length;

        const embed = new EmbedBuilder()
            .setTitle('🥛 Milky Hub Key Stats')
            .setColor('#4287f5')
            .addFields(
                { name: '🔑 Active Keys', value: `${totalKeys}`, inline: true },
                { name: '🔒 Bound Devices', value: `${boundKeys}`, inline: true },
                { name: '🟢 Server Status', value: 'Online & Active', inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

client.login(TOKEN);
