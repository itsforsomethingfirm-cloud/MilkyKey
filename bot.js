const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// CONFIGURATION
const CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;
const WHITELIST_FILE = path.join(__dirname, 'whitelist.json');
let maintenanceMode = false;

// Safe Whitelist Loader
let whitelist = new Set();
if (fs.existsSync(WHITELIST_FILE)) {
    try {
        const rawData = fs.readFileSync(WHITELIST_FILE, 'utf8').trim();
        if (rawData.length > 0) {
            const parsed = JSON.parse(rawData);
            whitelist = new Set(parsed);
            console.log(`Loaded ${whitelist.size} whitelisted users from storage.`);
        }
    } catch (e) {
        console.error("Warning: Could not parse whitelist.json, starting with empty whitelist:", e.message);
    }
}

function saveWhitelist() {
    try {
        fs.writeFileSync(WHITELIST_FILE, JSON.stringify(Array.from(whitelist), null, 2));
    } catch (e) {
        console.error("Error saving whitelist.json:", e);
    }
}

// REGISTER SLASH COMMANDS FOR ADMINS
const commands = [
    new SlashCommandBuilder()
        .setName('users')
        .setDescription('Admin command to view user statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('total').setDescription('Total whitelisted users'))
        .addSubcommand(sub => sub.setName('list').setDescription('List all whitelisted usernames')),

    new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Admin management for the whitelist')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Manually add user')
                .addStringOption(opt => opt.setName('username').setDescription('Roblox Username').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove user')
                .addStringOption(opt => opt.setName('username').setDescription('Roblox Username').setRequired(true))
        ),

    new SlashCommandBuilder()
        .setName('maintenance')
        .setDescription('Toggle maintenance mode')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addBooleanOption(opt => opt.setName('status').setDescription('Set maintenance true/false').setRequired(true))
];

async function registerSlashCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Slash commands registered successfully!');
    } catch (err) {
        console.error('Failed to register commands:', err);
    }
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}! Milky Verify API active.`);
    await registerSlashCommands();
});

// CHAT VERIFICATION HANDLER
const userCooldowns = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot || message.channel.id !== CHANNEL_ID) return;

    // Cooldown check (3 seconds per user)
    const now = Date.now();
    if (userCooldowns.has(message.author.id)) {
        if (now - userCooldowns.get(message.author.id) < 3000) return;
    }
    userCooldowns.set(message.author.id, now);

    if (maintenanceMode) {
        await message.react('⚠️');
        await message.reply("🛠️ **Script under maintenance.** Try again later!");
        return;
    }

    const username = message.content.trim();
    const lowerUser = username.toLowerCase();

    const validFormat = /^[a-zA-Z0-9_]{3,20}$/.test(username);
    if (!validFormat) {
        await message.react('🚫');
        return;
    }

    // Already Whitelisted -> React silently with ☑️
    if (whitelist.has(lowerUser)) {
        await message.react('☑️');
        return;
    }

    try {
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username],
            excludeBannedUsers: true
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            whitelist.add(lowerUser);
            saveWhitelist();
            await message.react('☑️');
            await message.reply(`✅ **${username}** whitelisted! Launch the hub now.`);
        } else {
            await message.react('🚫');
            await message.reply(`❌ Account **"${username}"** not found.`);
        }
    } catch (error) {
        console.error("Roblox API error:", error.message);
        await message.react('🚫');
    }
});

// SLASH COMMAND HANDLER
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    const { commandName, options } = interaction;

    if (commandName === 'users') {
        const sub = options.getSubcommand();
        if (sub === 'total') {
            await interaction.editReply(`📊 **Total Users:** \`${whitelist.size}\``);
        } else if (sub === 'list') {
            const list = Array.from(whitelist).join(', ') || 'None';
            await interaction.editReply(`📋 **Users (${whitelist.size}):**\n\`\`\`\n${list}\n\`\`\``);
        }
    } else if (commandName === 'whitelist') {
        const sub = options.getSubcommand();
        const user = options.getString('username').toLowerCase();

        if (sub === 'add') {
            whitelist.add(user);
            saveWhitelist();
            await interaction.editReply(`✅ Added **${user}** to whitelist.`);
        } else if (sub === 'remove') {
            whitelist.delete(user);
            saveWhitelist();
            await interaction.editReply(`🗑️ Removed **${user}** from whitelist.`);
        }
    } else if (commandName === 'maintenance') {
        maintenanceMode = options.getBoolean('status');
        await interaction.editReply(`🔧 Maintenance: **${maintenanceMode ? 'ENABLED' : 'DISABLED'}**`);
    }
});

// WEB API FOR LUA SCRIPT POLLING
app.get('/check-verify', (req, res) => {
    const user = (req.query.username || "").toLowerCase();
    
    if (maintenanceMode) return res.json({ verified: false, maintenance: true });

    if (whitelist.has(user)) {
        return res.json({ verified: true, maintenance: false });
    }
    return res.json({ verified: false, maintenance: false });
});

app.get('/', (req, res) => res.send("Milky API Online"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
