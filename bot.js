import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import axios from 'axios';
import express from 'express';
import 'dotenv/config';

// Environment Variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const RENDER_URL = process.env.RENDER_URL || "https://milkykey.onrender.com";
const PORT = process.env.PORT || 3000;

// Expiration Duration: 6 Hours in milliseconds
const VERIFICATION_DURATION_MS = 6 * 60 * 60 * 1000;

// In-memory store for verified users
// Key: username (lowercase) -> Value: { discordId, verifiedAt, expiresAt }
const verifiedUsers = new Map();

// ============================================
// ðŸŒ HELPER FUNCTIONS
// ============================================

/**
 * Checks if a Roblox username exists using Roblox's public API.
 * Returns the user object if valid, or null if invalid.
 */
async function getRobloxUserInfo(username) {
    try {
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username],
            excludeBannedUsers: false
        }, { timeout: 5000 });

        if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0]; // Returns { id, name, displayName }
        }
    } catch (err) {
        console.error('Roblox API Lookup Error:', err.message);
    }
    return null;
}

/**
 * Formats milliseconds into human-readable hours and minutes.
 */
function formatTimeRemaining(ms) {
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

// ============================================
// ðŸŒ EXPRESS WEB SERVER & API ENDPOINTS
// ============================================
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Milky Hub Verification Server Online');
});

// Endpoint used by client scripts to check whitelist status
app.get('/check', (req, res) => {
    const username = req.query.user;
    if (!username) {
        return res.json({ allowed: false, verified: false });
    }

    const record = verifiedUsers.get(username.toLowerCase());
    const now = Date.now();

    if (record && now < record.expiresAt) {
        return res.json({
            allowed: true,
            verified: true,
            expiresInMs: record.expiresAt - now
        });
    }

    // Clean up expired record if present
    if (record && now >= record.expiresAt) {
        verifiedUsers.delete(username.toLowerCase());
    }

    return res.json({ allowed: false, verified: false });
});

// Verification Endpoint called by Discord Bot
app.post('/verify', async (req, res) => {
    const { username, discordId } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, code: 'MISSING_USERNAME', message: 'Username is required.' });
    }

    const cleanUsername = username.trim();
    const userKey = cleanUsername.toLowerCase();
    const now = Date.now();

    // 1. Check if user is already verified and key is still active
    const existingRecord = verifiedUsers.get(userKey);
    if (existingRecord && now < existingRecord.expiresAt) {
        const remainingMs = existingRecord.expiresAt - now;
        return res.json({
            success: false,
            code: 'ALREADY_VERIFIED',
            message: `Account is already verified!`,
            timeRemaining: formatTimeRemaining(remainingMs),
            expiresAt: existingRecord.expiresAt
        });
    }

    // 2. Validate Roblox Username via Roblox API
    const robloxUser = await getRobloxUserInfo(cleanUsername);
    if (!robloxUser) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_ROBLOX_USER',
            message: `The Roblox username **"${cleanUsername}"** does not exist.`
        });
    }

    // 3. Register standard 6-hour verification
    const expiresAt = now + VERIFICATION_DURATION_MS;
    verifiedUsers.set(userKey, {
        discordId,
        robloxId: robloxUser.id,
        exactName: robloxUser.name,
        verifiedAt: now,
        expiresAt
    });

    console.log(`[Verified] ${robloxUser.name} (ID: ${robloxUser.id}) by Discord User ${discordId} for 6 hours.`);

    return res.json({
        success: true,
        code: 'VERIFIED',
        exactName: robloxUser.name,
        timeRemaining: '6h 0m',
        expiresAt
    });
});

app.listen(PORT, () => {
    console.log(`[Web Server] Express running on port ${PORT}`);
});

// Self-ping loop to prevent free-tier inactivity sleeping
if (RENDER_URL) {
    setInterval(async () => {
        try {
            await axios.get(RENDER_URL);
        } catch (err) {
            // Silence network ping errors
        }
    }, 4 * 60 * 1000);
}

// ============================================
// ðŸ¤– DISCORD BOT INITIALIZATION
// ============================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const commands = [
    new SlashCommandBuilder()
        .setName('v')
        .setDescription('Verify your Roblox username for 6 hours of access')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Your exact Roblox username')
                .setRequired(true)
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log('Slash commands registered successfully.');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
})();

client.once('clientReady', () => {
    console.log(`[Bot Engine] Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'v') {
        const robloxUsername = interaction.options.getString('username').trim();

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const response = await axios.post(`${RENDER_URL}/verify`, {
                username: robloxUsername,
                discordId: interaction.user.id
            }, {
                timeout: 10000
            });

            const data = response.data;

            if (data.success) {
                const successEmbed = new EmbedBuilder()
                    .setTitle('âœ… Verification Successful!')
                    .setColor(0x00FF96)
                    .setDescription(`Account **${data.exactName}** is now verified.`)
                    .addFields(
                        { name: 'Duration', value: '6 Hours', inline: true },
                        { name: 'Time Remaining', value: data.timeRemaining, inline: true }
                    )
                    .setFooter({ text: 'Milky Hub Access Control' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });
            }
        } catch (error) {
            if (error.response && error.response.data) {
                const errData = error.response.data;

                if (errData.code === 'ALREADY_VERIFIED') {
                    const alreadyEmbed = new EmbedBuilder()
                        .setTitle('â„¹ï¸ Already Verified')
                        .setColor(0x00BFFF)
                        .setDescription(`Account **${robloxUsername}** is currently active.`)
                        .addFields(
                            { name: 'Time Remaining', value: errData.timeRemaining || 'Active', inline: true }
                        )
                        .setFooter({ text: 'Milky Hub Access Control' });

                    return await interaction.editReply({ embeds: [alreadyEmbed] });
                }

                if (errData.code === 'INVALID_ROBLOX_USER') {
                    const invalidEmbed = new EmbedBuilder()
                        .setTitle('âŒ Invalid Username')
                        .setColor(0xFF3300)
                        .setDescription(`The Roblox user **"${robloxUsername}"** could not be found. Please check spelling and try again.`)
                        .setFooter({ text: 'Milky Hub Access Control' });

                    return await interaction.editReply({ embeds: [invalidEmbed] });
                }
            }

            console.error('Verification Error:', error.message);
            const serverErrEmbed = new EmbedBuilder()
                .setTitle('âš ï¸ Verification Error')
                .setColor(0xFF9900)
                .setDescription('Failed to complete verification request. Please try again in a few moments.')
                .setFooter({ text: 'Milky Hub System' });

            await interaction.editReply({ embeds: [serverErrEmbed] });
        }
    }
});

client.login(DISCORD_TOKEN);
