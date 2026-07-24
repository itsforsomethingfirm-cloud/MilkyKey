const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const KEYS_FILE = path.join(__dirname, 'keys.json');

// Enable JSON body parsing for HWID validation requests
app.use(express.json());

// ============================================
// 💾 PERSISTENT KEY STORAGE SYSTEM
// ============================================
let activeKeys = {};

// Load saved keys from keys.json if file exists
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

// Save active keys to keys.json
function saveKeys() {
    try {
        fs.writeFileSync(KEYS_FILE, JSON.stringify(activeKeys, null, 2));
    } catch (err) {
        console.error('[MILKY HUB] Failed to save keys.json:', err);
    }
}

// Initialize key storage
loadKeys();

// ============================================
// 🌐 SERVER API ENDPOINTS
// ============================================

// Root status check
app.get('/', (req, res) => {
    res.send('🥛 Milky Hub Key & HWID Server is Active!');
});

// Rayfield raw text key list (For base verification)
app.get('/keys.txt', (req, res) => {
    const now = Date.now();
    const validKeys = Object.keys(activeKeys).filter(key => activeKeys[key].expireTime > now);
    res.type('text/plain');
    res.send(validKeys.join('\n'));
});

// Endpoint for HWID Binding & Verification from Roblox
app.post('/verify-hwid', (req, res) => {
    const { key, hwid } = req.body;
    const now = Date.now();

    if (!key || !hwid) {
        return res.status(400).json({ success: false, message: "Missing key or HWID." });
    }

    const keyData = activeKeys[key];

    // Check if key exists and is valid
    if (!keyData || keyData.expireTime <= now) {
        return res.status(401).json({ success: false, message: "Invalid or expired key." });
    }

    // First time use: Bind HWID to Key
    if (!keyData.boundHWID) {
        keyData.boundHWID = hwid;
        saveKeys(); // Save binding to storage
        console.log(`[MILKY HUB] Key ${key} bound to HWID: ${hwid}`);
        return res.json({ success: true, message: "Key validated and bound to your device!" });
    }

    // Subsequent uses: Verify matching HWID
    if (keyData.boundHWID === hwid) {
        return res.json({ success: true, message: "Access granted!" });
    } else {
        return res.status(403).json({ success: false, message: "This key is bound to another device!" });
    }
});

app.listen(PORT, () => console.log(`[MILKY HUB] Server running on port ${PORT}`));

// ============================================
// 🤖 DISCORD BOT CONFIGURATION
// ============================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_DISCORD_ID = process.env.OWNER_ID || "";

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: Missing DISCORD_TOKEN or CLIENT_ID environment variables!");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Register Slash Command (Restricted to Administrators by default)
const commands = [
    new SlashCommandBuilder()
        .setName('key')
        .setDescription('Generate a key (Owner/Admin Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(option => 
            option.setName('hours')
                .setDescription('Duration in hours (e.g. 24)')
                .setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('[MILKY HUB] Registering Slash Commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('[MILKY HUB] Slash command /key registered!');
    } catch (error) {
        console.error('[MILKY HUB] Command registration failed:', error);
    }
})();

// Command Handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'key') {
        // OWNER / ADMIN PERMISSION CHECK
        const isOwner = OWNER_DISCORD_ID && interaction.user.id === OWNER_DISCORD_ID;
        const isAdmin = interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.Administrator);

        if (!isOwner && !isAdmin) {
            return interaction.reply({
                content: "❌ **Access Denied:** Only the owner or server administrators can generate keys!",
                ephemeral: true
            });
        }

        const hours = interaction.options.getInteger('hours');
        const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const generatedKey = `MILKY-${randomCode}`;
        
        const expireTimestamp = Date.now() + (hours * 60 * 60 * 1000);
        
        // Store key with null boundHWID
        activeKeys[generatedKey] = {
            expireTime: expireTimestamp,
            boundHWID: null
        };

        // Save new key to file
        saveKeys();

        await interaction.reply({
            content: `🥛 **Key Generated:** \`${generatedKey}\`\n⏱️ **Expires in:** ${hours} hour(s)\n🔒 **HWID Lock:** Single-device activation enabled.`,
            ephemeral: true
        });
    }
});

client.login(TOKEN);
