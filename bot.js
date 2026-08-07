import { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    MessageFlags,
    Events 
} from 'discord.js';
import axios from 'axios';
import 'dotenv/config';

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const RENDER_URL = process.env.RENDER_URL || "https://milkykey.onrender.com";
const API_SECRET_KEY = process.env.API_SECRET_KEY || ""; 

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Fail-safe to prevent unexpected promise rejections from crashing the bot
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Safety Net] Unhandled Rejection at:', promise, 'reason:', reason);
});

// =========================================================================
// SELF-PINGING KEEPALIVE ENGINE (Keeps Render Server Awake 24/7)
// =========================================================================
function startKeepAlive() {
    const PING_INTERVAL = 5 * 60 * 1000; // 5 Minutes in milliseconds

    console.log(`[KeepAlive] Initialized self-pinging engine for: ${RENDER_URL}`);

    setInterval(async () => {
        try {
            const res = await axios.get(`${RENDER_URL}/`, {
                timeout: 10000,
                headers: { 'User-Agent': 'MilkyBot-KeepAlive/1.0' }
            });
            console.log(`[KeepAlive Ping] Server pinged successfully! Status: ${res.status} (${new Date().toLocaleTimeString()})`);
        } catch (err) {
            console.warn(`[KeepAlive Ping Warning] Server wake ping status: ${err.message}`);
        }
    }, PING_INTERVAL);
}

// Helper: Format milliseconds into readable duration (e.g., "12d 4h 30m")
function formatTimeRemaining(ms) {
    if (ms <= 0) return "Expired";
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 && days === 0) parts.push(`${seconds}s`);
    return parts.join(' ') || '0s';
}

// Slash Command Definitions
const commands = [
    new SlashCommandBuilder()
        .setName('v')
        .setDescription('Verify or check status for your Roblox username')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Your exact Roblox username')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('admin-stats')
        .setDescription('Dashboard to check active user counts and script usage statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Manually whitelist a user or add days')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Roblox Username')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('days')
                .setDescription('Number of days to grant access (Default: 30)')
                .setRequired(false)
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log('[Milky Bot] Registering application (/) commands...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log('[Milky Bot] Slash commands registered successfully!');
    } catch (error) {
        console.error('[Milky Bot] Error registering slash commands:', error);
    }
})();

client.once(Events.ClientReady, () => {
    console.log(`[Milky Hub Bot] Online as ${client.user.tag}`);
    // Start the keepalive system as soon as the bot comes online
    startKeepAlive();
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // -------------------------------------------------------------
    // COMMAND: /v {username}
    // -------------------------------------------------------------
    if (interaction.commandName === 'v') {
        const robloxUsername = interaction.options.getString('username').trim();

        // Ephemeral flag so only the user who ran the command can see it
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error('Interaction deferral failed (timed out):', err.message);
            return;
        }

        let rbxUserId = null;
        let rbxDisplayName = null;

        // Step 1: Validate username against Roblox API
        try {
            const rbxCheck = await axios.post('https://users.roblox.com/v1/usernames/users', {
                usernames: [robloxUsername],
                excludeBannedUsers: true
            }, { timeout: 10000 });

            if (rbxCheck.data && rbxCheck.data.data && rbxCheck.data.data.length > 0) {
                rbxUserId = rbxCheck.data.data[0].id;
                rbxDisplayName = rbxCheck.data.data[0].displayName;
            } else {
                const invalidEmbed = new EmbedBuilder()
                    .setTitle(' Invalid Roblox Username')
                    .setColor(0xFF3333)
                    .setDescription(`The username **\`${robloxUsername}\`** does not exist on Roblox. Please check your spelling and try again!`)
                    .setFooter({ text: 'Milky Hub Verification' });

                return await interaction.editReply({ embeds: [invalidEmbed] });
            }
        } catch (err) {
            console.error('Roblox User API Error:', err.message);
        }

        // Step 2: Query Render Backend (45s timeout to allow cold wakeups)
        try {
            const response = await axios.post(`${RENDER_URL}/verify`, {
                username: robloxUsername,
                robloxId: rbxUserId,
                discordId: interaction.user.id,
                discordTag: interaction.user.tag
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': API_SECRET_KEY ? `Bearer ${API_SECRET_KEY}` : undefined
                },
                timeout: 45000 // Extended timeout to withstand cold boots
            });

            const data = response.data;

            // Scenario A: Already Verified
            if (data.alreadyVerified || data.status === "already_verified") {
                const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
                const msRemaining = expiresAt ? expiresAt.getTime() - Date.now() : null;
                const timeStr = msRemaining ? formatTimeRemaining(msRemaining) : "Lifetime / Unlimited";

                const alreadyEmbed = new EmbedBuilder()
                    .setTitle(' Already Verified')
                    .setColor(0x00D2FF)
                    .setDescription(`Account **\`${robloxUsername}\`** (${rbxDisplayName || robloxUsername}) is currently active!`)
                    .addFields(
                        { name: ' Remaining Time', value: `\`${timeStr}\``, inline: true },
                        { name: ' Expiration Date', value: expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` : "`Never`", inline: true }
                    )
                    .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${rbxUserId || 1}&width=150&height=150&format=png`)
                    .setFooter({ text: 'Milky Hub Access Control' })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [alreadyEmbed] });
            }

            // Scenario B: Newly Verified
            if (data.success || data.verified) {
                const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
                const msRemaining = expiresAt ? expiresAt.getTime() - Date.now() : null;
                const timeStr = msRemaining ? formatTimeRemaining(msRemaining) : "Lifetime";

                const successEmbed = new EmbedBuilder()
                    .setTitle(' Access Granted!')
                    .setColor(0x00FF96)
                    .setDescription(`Successfully verified **\`${robloxUsername}\`**!`)
                    .addFields(
                        { name: ' Time Granted', value: `\`${timeStr}\``, inline: true },
                        { name: ' Next Step', value: 'Return to Roblox. Your hub will auto-load in seconds!' }
                    )
                    .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${rbxUserId || 1}&width=150&height=150&format=png`)
                    .setFooter({ text: 'Milky Hub Verification' })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [successEmbed] });
            }

            // Scenario C: Verification Declined
            const failEmbed = new EmbedBuilder()
                .setTitle(' Verification Issue')
                .setColor(0xFFAA00)
                .setDescription(data.message || 'Could not verify your access right now.')
                .setFooter({ text: 'Milky Hub Verification' });

            return await interaction.editReply({ embeds: [failEmbed] });

        } catch (error) {
            console.error('Backend API Error:', error.message);
            const errorEmbed = new EmbedBuilder()
                .setTitle(' Backend Connection Timeout')
                .setColor(0xFF0000)
                .setDescription('Failed to connect to the backend server (`milkykey.onrender.com`). The server is waking up—please run the command again in 10 seconds!')
                .setFooter({ text: 'Milky Hub Engine' });

            return await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    // -------------------------------------------------------------
    // COMMAND: /admin-stats
    // -------------------------------------------------------------
    if (interaction.commandName === 'admin-stats') {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (err) {
            return;
        }

        try {
            const statsRes = await axios.get(`${RENDER_URL}/stats`, {
                headers: { 'Authorization': API_SECRET_KEY ? `Bearer ${API_SECRET_KEY}` : undefined },
                timeout: 15000
            });

            const s = statsRes.data;

            const dashEmbed = new EmbedBuilder()
                .setTitle(' Milky Hub Live Dashboard')
                .setColor(0x7289DA)
                .addFields(
                    { name: ' Total Whitelisted Users', value: `\`${s.totalUsers || 0}\``, inline: true },
                    { name: ' Active Sessions Now', value: `\`${s.activeNow || 0}\``, inline: true },
                    { name: ' Executions Today', value: `\`${s.todayExecutions || 0}\``, inline: true },
                    { name: ' System Status', value: s.maintenance ? ' Maintenance Mode' : ' Online & Operational', inline: false }
                )
                .setFooter({ text: 'Milky Hub Dashboard' })
                .setTimestamp();

            await interaction.editReply({ embeds: [dashEmbed] });
        } catch (err) {
            await interaction.editReply({ content: 'Could not fetch stats from backend server.' });
        }
    }

    // -------------------------------------------------------------
    // COMMAND: /whitelist
    // -------------------------------------------------------------
    if (interaction.commandName === 'whitelist') {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (err) {
            return;
        }

        const targetUser = interaction.options.getString('username').trim();
        const days = interaction.options.getInteger('days') || 30;

        try {
            await axios.post(`${RENDER_URL}/admin/whitelist`, {
                username: targetUser,
                days: days
            }, {
                headers: { 'Authorization': API_SECRET_KEY ? `Bearer ${API_SECRET_KEY}` : undefined },
                timeout: 15000
            });

            const wlEmbed = new EmbedBuilder()
                .setTitle(' User Whitelisted')
                .setColor(0x00FF96)
                .setDescription(`Granted **\`${days}\` days** of access to **\`${targetUser}\`**.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [wlEmbed] });
        } catch (err) {
            await interaction.editReply({ content: `Failed to whitelist user: ${err.message}` });
        }
    }
});

client.login(DISCORD_TOKEN);
