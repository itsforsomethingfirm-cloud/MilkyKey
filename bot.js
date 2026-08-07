import express from 'express';
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

// -------------------------------------------------------------------------
// 1. EXPRESS PORT BINDING (Satisfies Render Web Service Port Requirement)
// -------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send('Milky Hub Discord Bot & Web Service is Active!');
});

app.listen(PORT, () => {
    console.log(`[Web Server] Express running on port ${PORT}`);
});

// Environment Variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const RENDER_URL = process.env.RENDER_URL || "https://milkykey.onrender.com";
const API_SECRET_KEY = process.env.API_SECRET_KEY || ""; 

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// -------------------------------------------------------------------------
// 2. CRASH PREVENTION HANDLERS (Prevents Node.js from exiting)
// -------------------------------------------------------------------------
// Catch client-level errors emitted by discord.js (Fixes Code 10062 crashes)
client.on('error', (error) => {
    console.warn('[Discord Client Handled Error]:', error?.message || error);
});

// Catch general process unhandled rejections
process.on('unhandledRejection', (reason) => {
    console.warn('[Process Handled Rejection]:', reason?.message || reason);
});

// Helper: Format milliseconds into readable duration
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

// Keep-Alive Loop
function startKeepAlive() {
    const PING_INTERVAL = 4 * 60 * 1000; // 4 minutes

    setInterval(async () => {
        try {
            await axios.get(`${RENDER_URL}/`, { timeout: 10000 });
            console.log(`[KeepAlive] Pinged backend server successfully.`);
        } catch (err) {
            console.warn(`[KeepAlive Warning] Could not ping backend: ${err.message}`);
        }
    }, PING_INTERVAL);
}

// Slash Commands
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
    startKeepAlive();
});

// -------------------------------------------------------------------------
// 3. SAFE INTERACTION EXECUTION
// -------------------------------------------------------------------------
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // Safely attempt to defer reply
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
    } catch (deferError) {
        // Unknown interaction (10062) means Discord dropped the request or timed out
        console.warn(`[Interaction Deferred Failed]: ${deferError.message}`);
        return; // Abort execution safely without throwing
    }

    // Command: /v {username}
    if (interaction.commandName === 'v') {
        const robloxUsername = interaction.options.getString('username').trim();

        let rbxUserId = null;
        let rbxDisplayName = null;

        // Step 1: Check Roblox Username
        try {
            const rbxCheck = await axios.post('https://users.roblox.com/v1/usernames/users', {
                usernames: [robloxUsername],
                excludeBannedUsers: true
            }, { timeout: 10000 });

            if (rbxCheck.data?.data?.length > 0) {
                rbxUserId = rbxCheck.data.data[0].id;
                rbxDisplayName = rbxCheck.data.data[0].displayName;
            } else {
                const invalidEmbed = new EmbedBuilder()
                    .setTitle(' Invalid Roblox Username')
                    .setColor(0xFF3333)
                    .setDescription(`The username **\`${robloxUsername}\`** does not exist on Roblox. Please check your spelling and try again!`)
                    .setFooter({ text: 'Milky Hub Verification' });

                return await interaction.editReply({ embeds: [invalidEmbed] }).catch(() => {});
            }
        } catch (err) {
            console.warn('Roblox API Check Warning:', err.message);
        }

        // Step 2: Request Backend Verification
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
                timeout: 45000
            });

            const data = response.data;

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

                return await interaction.editReply({ embeds: [alreadyEmbed] }).catch(() => {});
            }

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

                return await interaction.editReply({ embeds: [successEmbed] }).catch(() => {});
            }

            const failEmbed = new EmbedBuilder()
                .setTitle(' Verification Issue')
                .setColor(0xFFAA00)
                .setDescription(data.message || 'Could not verify your access right now.')
                .setFooter({ text: 'Milky Hub Verification' });

            return await interaction.editReply({ embeds: [failEmbed] }).catch(() => {});

        } catch (error) {
            console.error('Backend API Error:', error.message);
            const errorEmbed = new EmbedBuilder()
                .setTitle(' Backend Waking Up')
                .setColor(0xFF8800)
                .setDescription('The verification server was sleeping. Please run `/v` once more!')
                .setFooter({ text: 'Milky Hub Engine' });

            return await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
        }
    }

    // Command: /admin-stats
    if (interaction.commandName === 'admin-stats') {
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

            await interaction.editReply({ embeds: [dashEmbed] }).catch(() => {});
        } catch (err) {
            await interaction.editReply({ content: 'Could not fetch stats from backend server.' }).catch(() => {});
        }
    }

    // Command: /whitelist
    if (interaction.commandName === 'whitelist') {
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

            await interaction.editReply({ embeds: [wlEmbed] }).catch(() => {});
        } catch (err) {
            await interaction.editReply({ content: `Failed to whitelist user: ${err.message}` }).catch(() => {});
        }
    }
});

client.login(DISCORD_TOKEN);
