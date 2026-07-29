const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');

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
const whitelist = new Set(); // Stores whitelisted usernames
let maintenanceMode = false; // Maintenance mode flag

// ============================================
// 📜 DEFINE SLASH COMMANDS
// ============================================
const commands = [
    new SlashCommandBuilder()
        .setName('users')
        .setDescription('Admin command to view user statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('total')
                .setDescription('View the total number of whitelisted users')
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('View the list of all whitelisted usernames')
        ),

    new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Admin management for the whitelist')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Manually add a Roblox user to whitelist')
                .addStringOption(opt => opt.setName('username').setDescription('Roblox Username').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a user from the whitelist')
                .addStringOption(opt => opt.setName('username').setDescription('Roblox Username').setRequired(true))
        ),

    new SlashCommandBuilder()
        .setName('maintenance')
        .setDescription('Toggle maintenance mode for the script')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addBooleanOption(opt => opt.setName('status').setDescription('Set maintenance true or false').setRequired(true))
];

// Register Slash Commands with Discord REST API
async function registerSlashCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Successfully registered global slash commands!');
    } catch (err) {
        console.error('Failed to register slash commands:', err);
    }
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}! Milky Auto-Verify API active.`);
    await registerSlashCommands();
});

// ============================================
// 💬 CHAT VERIFICATION (TEXT CHANNEL)
// ============================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || message.channel.id !== CHANNEL_ID) return;

    if (maintenanceMode) {
        await message.react('⚠️');
        await message.reply("🛠️ **Script is currently under maintenance.** Please try again later!");
        return;
    }

    const username = message.content.trim();
    const lowerUser = username.toLowerCase();

    const validFormat = /^[a-zA-Z0-9_]{3,20}$/.test(username);
    if (!validFormat) {
        await message.react('🚫');
        await message.reply(`❌ **"${username}"** is not a valid Roblox username format.`);
        return;
    }

    if (whitelist.has(lowerUser)) {
        await message.react('☑️');
        await message.reply(`ℹ️ **${username}** is already whitelisted! Launch your hub.`);
        return;
    }

    try {
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username],
            excludeBannedUsers: true
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            whitelist.add(lowerUser);
            await message.react('☑️');
            await message.reply(`✅ **${username}** has been successfully whitelisted! Launch the hub now.`);
        } else {
            await message.react('🚫');
            await message.reply(`❌ Roblox account **"${username}"** could not be found.`);
        }
    } catch (error) {
        console.error("Roblox API Error:", error.message);
        await message.react('🚫');
    }
});

// ============================================
// ⚡ SLASH COMMAND INTERACTION HANDLER
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // IMMEDIATE DEFERRAL TO PREVENT "APPLICATION DID NOT RESPOND" TIMEOUT
    await interaction.deferReply({ ephemeral: true });

    const { commandName, options } = interaction;

    if (commandName === 'users') {
        const subcommand = options.getSubcommand();
        if (subcommand === 'total') {
            await interaction.editReply(`📊 **Total Whitelisted Users:** \`${whitelist.size}\``);
        } else if (subcommand === 'list') {
            const listArray = Array.from(whitelist);
            const userList = listArray.length > 0 ? listArray.join(', ') : 'None';
            await interaction.editReply(`📋 **Whitelisted Users (${whitelist.size}):**\n\`\`\`\n${userList}\n\`\`\``);
        }
    }

    else if (commandName === 'whitelist') {
        const subcommand = options.getSubcommand();
        const username = options.getString('username').toLowerCase();

        if (subcommand === 'add') {
            whitelist.add(username);
            await interaction.editReply(`✅ Successfully added **${username}** to the whitelist!`);
        } else if (subcommand === 'remove') {
            if (whitelist.has(username)) {
                whitelist.delete(username);
                await interaction.editReply(`🗑️ Removed **${username}** from the whitelist.`);
            } else {
                await interaction.editReply(`⚠️ User **${username}** was not in the whitelist.`);
            }
        }
    }

    else if (commandName === 'maintenance') {
        const status = options.getBoolean('status');
        maintenanceMode = status;
        const stateStr = maintenanceMode ? "ENABLED 🛠️" : "DISABLED ✅";
        await interaction.editReply(`🔧 Maintenance mode is now **${stateStr}**.`);
    }
});

// ============================================
// 🌐 WEB SERVER ENDPOINTS FOR ROBLOX
// ============================================
app.get('/check-verify', (req, res) => {
    const user = (req.query.username || "").toLowerCase();
    
    if (maintenanceMode) {
        return res.json({ verified: false, maintenance: true });
    }

    if (whitelist.has(user)) {
        return res.json({ verified: true, maintenance: false });
    }
    return res.json({ verified: false, maintenance: false });
});

app.get('/', (req, res) => {
    res.send("Milky Verification Service Online!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
