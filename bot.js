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

// HARDCODED CONFIGURATION
const CHANNEL_ID = "1531387861591523558"; // Directly linked to your #verify channel
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
        console.error("Warning: Could not parse whitelist.json:", e.message);
    }
}

function saveWhitelist() {
    try {
        fs.writeFileSync(WHITELIST_FILE, JSON.stringify(Array.from(whitelist), null, 2));
    } catch (e) {
        console.error("Error saving whitelist.json:", e);
    }
}

// ADMIN SLASH COMMANDS (For you & server staff)
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
        console.log('Admin slash commands registered successfully!');
    } catch (err) {
        console.error('Failed to register commands:', err);
    }
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}! Listening on channel ID: ${CHANNEL_ID}`);
    await registerSlashCommands();
});

// PURE CHAT VERIFICATION HANDLER
client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Strictly enforce channel check
    if (message.channel.id !== CHANNEL_ID) return;

    const username = message.content.trim();
    const lowerUser = username.toLowerCase();

    if (maintenanceMode) {
        await message.react('⚠️').catch(() => {});
        return;
    }

    // Ignore junk text (spaces, symbols, or invalid length)
    const validFormat = /^[a-zA-Z0-9_]{3,20}$/.test(username);
    if (!validFormat) return;

    // Fast-path: Already whitelisted
    if (whitelist.has(lowerUser)) {
        await message.react('☑️').catch(() => {});
        return;
    }

    try {
        // Instant visual feedback
        await message.react('⏳').catch(() => {});

        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username],
            excludeBannedUsers: true
        }, { timeout: 4000 });

        if (response.data && response.data.data && response.data.data.length > 0) {
            whitelist.add(lowerUser);
            saveWhitelist();
            
            await message.reactions.removeAll().catch(() => {});
            await message.react('☑️').catch(() => {});
            await message.reply(`✅ **${username}** whitelisted! Your script will load now.`).catch(() => {});
        } else {
            await message.reactions.removeAll().catch(() => {});
            await message.react('🚫').catch(() => {});
        }
    } catch (error) {
        // Fallback: Whitelist anyway if API times out so users are never stuck
        whitelist.add(lowerUser);
        saveWhitelist();
        await message.reactions.removeAll().catch(() => {});
        await message.react('☑️').catch(() => {});
        await message.reply(`✅ **${username}** whitelisted! Your script will load now.`).catch(() => {});
    }
});

// ADMIN SLASH INTERACTION HANDLER
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

// WEB API FOR ROBLOX POLLING
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
