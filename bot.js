const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');

const app = express();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// HARDCODED CONFIGURATION
const CHANNEL_ID = "1531387861591523558"; // Channel restriction
let maintenanceMode = false;

// Whitelist Map to store username -> timestamp (when it expires)
// Memory store is perfect here since access is temporary (6 hours)!
const whitelist = new Map(); 
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// REGISTER SLASH COMMANDS
const commands = [
    // 6-Hour Public Verification Command
    new SlashCommandBuilder()
        .setName('v')
        .setDescription('Verify your Roblox username for 6 hours of access')
        .addStringOption(opt => 
            opt.setName('username')
               .setDescription('Your exact Roblox Username')
               .setRequired(true)
        ),

    // Admin Commands
    new SlashCommandBuilder()
        .setName('users')
        .setDescription('Admin command to view user statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('total').setDescription('Total active 6h whitelisted users'))
        .addSubcommand(sub => sub.setName('list').setDescription('List active whitelisted usernames')),

    new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Admin manual management')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Manually add user for 6 hours')
                .addStringOption(opt => opt.setName('username').setDescription('Roblox Username').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove user whitelist')
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
        console.log('Slash command /v registered successfully!');
    } catch (err) {
        console.error('Failed to register commands:', err);
    }
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}! Listening for /v commands.`);
    await registerSlashCommands();
});

// SLASH COMMAND HANDLER
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, channelId } = interaction;

    // PUBLIC /V COMMAND
    if (commandName === 'v') {
        await interaction.deferReply({ ephemeral: false });

        if (CHANNEL_ID && channelId !== CHANNEL_ID) {
            return await interaction.editReply(`⚠️ Please use the <#${CHANNEL_ID}> channel to verify!`);
        }

        if (maintenanceMode) {
            return await interaction.editReply("🛠️ **Script is under maintenance.** Try again later!");
        }

        const username = options.getString('username').trim();
        const lowerUser = username.toLowerCase();

        const validFormat = /^[a-zA-Z0-9_]{3,20}$/.test(username);
        if (!validFormat) {
            return await interaction.editReply(`🚫 **"${username}"** is not a valid Roblox username.`);
        }

        const now = Date.now();

        // Check if user has an active, unexpired whitelist
        if (whitelist.has(lowerUser)) {
            const expireTime = whitelist.get(lowerUser);
            if (now < expireTime) {
                const remainingMinutes = math.floor((expireTime - now) / (1000 * 60));
                return await interaction.editReply(`☑️ **${username}** is already verified! You have **${remainingMinutes}m** remaining of access.`);
            }
        }

        // Verify Username on Roblox API
        try {
            const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
                usernames: [username],
                excludeBannedUsers: true
            }, { timeout: 4000 });

            if (response.data && response.data.data && response.data.data.length > 0) {
                const expirationTimestamp = Date.now() + SIX_HOURS_MS;
                whitelist.set(lowerUser, expirationTimestamp);

                return await interaction.editReply(`✅ **${username}** verified for **6 Hours**! Launch your script now.`);
            } else {
                return await interaction.editReply(`❌ Roblox account **"${username}"** not found.`);
            }
        } catch (error) {
            // Fallback: Verify anyway for 6 hours if Roblox API fails
            const expirationTimestamp = Date.now() + SIX_HOURS_MS;
            whitelist.set(lowerUser, expirationTimestamp);

            return await interaction.editReply(`✅ **${username}** verified for **6 Hours**! Launch your script now.`);
        }
    }

    // ADMIN COMMANDS
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }

    if (commandName === 'users') {
        const sub = options.getSubcommand();
        const now = Date.now();
        
        // Clean active list
        const activeUsers = [];
        whitelist.forEach((exp, user) => {
            if (now < exp) activeUsers.push(user);
        });

        if (sub === 'total') {
            await interaction.editReply(`📊 **Active 6h Users:** \`${activeUsers.length}\``);
        } else if (sub === 'list') {
            const list = activeUsers.join(', ') || 'None';
            await interaction.editReply(`📋 **Active Users (${activeUsers.length}):**\n\`\`\`\n${list}\n\`\`\``);
        }
    } else if (commandName === 'whitelist') {
        const sub = options.getSubcommand();
        const user = options.getString('username').toLowerCase();

        if (sub === 'add') {
            whitelist.set(user, Date.now() + SIX_HOURS_MS);
            await interaction.editReply(`✅ Granted 6 hours to **${user}** manually.`);
        } else if (sub === 'remove') {
            whitelist.delete(user);
            await interaction.editReply(`🗑️ Removed **${user}** from whitelist.`);
        }
    } else if (commandName === 'maintenance') {
        maintenanceMode = options.getBoolean('status');
        await interaction.editReply(`🔧 Maintenance mode set to: **${maintenanceMode ? 'ENABLED' : 'DISABLED'}**`);
    }
});

// WEB API FOR ROBLOX POLLING
app.get('/check-verify', (req, res) => {
    const user = (req.query.username || "").toLowerCase();
    
    if (maintenanceMode) return res.json({ verified: false, maintenance: true });

    if (whitelist.has(user)) {
        const expireTime = whitelist.get(user);
        if (Date.now() < expireTime) {
            return res.json({ verified: true, maintenance: false });
        } else {
            // Expired -> Delete from Map
            whitelist.delete(user);
        }
    }
    
    return res.json({ verified: false, maintenance: false });
});

app.get('/', (req, res) => res.send("Milky API Online"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
