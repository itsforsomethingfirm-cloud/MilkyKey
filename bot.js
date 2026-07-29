const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
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
const CHANNEL_ID = "1531387861591523558";
let maintenanceMode = false;

// 6-Hour Expiration Store
const whitelist = new Map(); 
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// REGISTER SLASH COMMANDS (/v)
const commands = [
    new SlashCommandBuilder()
        .setName('v')
        .setDescription('Verify your Roblox username for 6 hours of access')
        .addStringOption(opt => 
            opt.setName('username')
               .setDescription('Your exact Roblox Username')
               .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('users')
        .setDescription('Admin command to view user statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('total').setDescription('Total active 6h users'))
        .addSubcommand(sub => sub.setName('list').setDescription('List active usernames')),

    new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Admin manual whitelist management')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Manually add user for 6 hours')
                .addStringOption(opt => opt.setName('username').setDescription('Roblox Username').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove user from whitelist')
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
        console.error('Failed to register slash commands:', err);
    }
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}! Listening in channel: ${CHANNEL_ID}`);
    await registerSlashCommands();
});

// DISCORD INTERACTION HANDLER
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, channelId } = interaction;

    if (commandName === 'v') {
        // ONLY THE USER CAN SEE THIS RESPONSE NOW (ephemeral: true)
        await interaction.deferReply({ ephemeral: true });

        if (CHANNEL_ID && channelId !== CHANNEL_ID) {
            const errEmbed = new EmbedBuilder()
                .setColor('#FF3333')
                .setTitle('⚠️ Channel Restricted')
                .setDescription(`Please use the <#${CHANNEL_ID}> channel to verify!`);
            return await interaction.editReply({ embeds: [errEmbed] });
        }

        if (maintenanceMode) {
            const maintEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🛠️ Maintenance Mode')
                .setDescription('Script is currently under maintenance. Please try again later!');
            return await interaction.editReply({ embeds: [maintEmbed] });
        }

        const username = options.getString('username').trim();
        const lowerUser = username.toLowerCase();

        const validFormat = /^[a-zA-Z0-9_]{3,20}$/.test(username);
        if (!validFormat) {
            const invalidEmbed = new EmbedBuilder()
                .setColor('#FF3333')
                .setTitle('❌ Invalid Username')
                .setDescription(`Roblox user **${username}** is not a valid Roblox username.`);
            return await interaction.editReply({ embeds: [invalidEmbed] });
        }

        const now = Date.now();

        // Check active whitelist
        if (whitelist.has(lowerUser)) {
            const expireTime = whitelist.get(lowerUser);
            if (now < expireTime) {
                const unixSeconds = Math.floor(expireTime / 1000);
                const alreadyEmbed = new EmbedBuilder()
                    .setColor('#00E676')
                    .setTitle('✅ Access Already Granted!')
                    .setDescription(`Roblox user **${username}** is already whitelisted.`)
                    .addFields({ name: 'Expires', value: `<t:${unixSeconds}:R>` });
                return await interaction.editReply({ embeds: [alreadyEmbed] });
            }
        }

        // Verify with Roblox API
        try {
            const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
                usernames: [username],
                excludeBannedUsers: true
            }, { timeout: 4000 });

            if (response.data && response.data.data && response.data.data.length > 0) {
                const expireTimestamp = Date.now() + SIX_HOURS_MS;
                const unixSeconds = Math.floor(expireTimestamp / 1000);
                whitelist.set(lowerUser, expireTimestamp);

                const grantedEmbed = new EmbedBuilder()
                    .setColor('#00E676')
                    .setTitle('✅ Access Granted!')
                    .setDescription(`Roblox user **${username}** whitelisted for **6 hours**.`)
                    .addFields({ name: 'Expires', value: `<t:${unixSeconds}:R>` });

                return await interaction.editReply({ embeds: [grantedEmbed] });
            } else {
                const notFoundEmbed = new EmbedBuilder()
                    .setColor('#FF3333')
                    .setTitle('❌ Account Not Found')
                    .setDescription(`Roblox user **${username}** does not exist.`);
                return await interaction.editReply({ embeds: [notFoundEmbed] });
            }
        } catch (error) {
            // Fallback whitelist
            const expireTimestamp = Date.now() + SIX_HOURS_MS;
            const unixSeconds = Math.floor(expireTimestamp / 1000);
            whitelist.set(lowerUser, expireTimestamp);

            const grantedEmbed = new EmbedBuilder()
                .setColor('#00E676')
                .setTitle('✅ Access Granted!')
                .setDescription(`Roblox user **${username}** whitelisted for **6 hours**.`)
                .addFields({ name: 'Expires', value: `<t:${unixSeconds}:R>` });

            return await interaction.editReply({ embeds: [grantedEmbed] });
        }
    }

    // ADMIN COMMANDS
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }

    if (commandName === 'users') {
        const sub = options.getSubcommand();
        const now = Date.now();
        const activeUsers = [];
        whitelist.forEach((exp, user) => {
            if (now < exp) activeUsers.push(user);
        });

        if (sub === 'total') {
            await interaction.editReply(`📊 **Active 6h Users:** \`${activeUsers.length}\``);
        } else if (sub === 'list') {
            const list = activeUsers.join(', ') || 'None';
            await interaction.editReply(`📋 **Active Whitelisted Users (${activeUsers.length}):**\n\`\`\`\n${list}\n\`\`\``);
        }
    } else if (commandName === 'whitelist') {
        const sub = options.getSubcommand();
        const user = options.getString('username').toLowerCase();

        if (sub === 'add') {
            whitelist.set(user, Date.now() + SIX_HOURS_MS);
            await interaction.editReply(`✅ Granted 6 hours access to **${user}**.`);
        } else if (sub === 'remove') {
            whitelist.delete(user);
            await interaction.editReply(`🗑️ Removed **${user}** from whitelist.`);
        }
    } else if (commandName === 'maintenance') {
        maintenanceMode = options.getBoolean('status');
        await interaction.editReply(`🔧 Maintenance mode set to: **${maintenanceMode ? 'ENABLED' : 'DISABLED'}**`);
    }
});

// WEB API FOR ROBLOX SCRIPT POLLING
function handleCheck(req, res) {
    const rawUser = req.query.user || req.query.username || "";
    const user = rawUser.trim().toLowerCase();
    
    if (maintenanceMode) {
        return res.json({ allowed: false, verified: false, maintenance: true });
    }

    if (user && whitelist.has(user)) {
        const expireTime = whitelist.get(user);
        if (Date.now() < expireTime) {
            return res.json({ allowed: true, verified: true, maintenance: false });
        } else {
            whitelist.delete(user);
        }
    }
    
    return res.json({ allowed: false, verified: false, maintenance: false });
}

app.get('/check', handleCheck);
app.get('/check-verify', handleCheck);
app.get('/', (req, res) => res.send("Milky Hub API Online"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
