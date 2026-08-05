import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import axios from 'axios';
import express from 'express';
import 'dotenv/config';

// Ensure required environment variables exist
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const RENDER_URL = process.env.RENDER_URL || "https://milkykey.onrender.com";
const API_SECRET_KEY = process.env.API_SECRET_KEY || "";
const PORT = process.env.PORT || 3000;

// ============================================
// 🌐 EXPRESS WEB SERVER & SELF-PING (KEEP-ALIVE)
// ============================================
const app = express();

app.get('/', (req, res) => {
    res.send('Server is active and online.');
});

app.listen(PORT, () => {
    console.log(`[Web Server] Express listening on port ${PORT}`);
});

// Periodically ping the endpoint every 4 minutes to prevent Render free-tier sleep
if (RENDER_URL) {
    setInterval(async () => {
        try {
            await axios.get(RENDER_URL);
            console.log('[Keep-Alive] Self-ping successful.');
        } catch (err) {
            console.error('[Keep-Alive] Self-ping failed:', err.message);
        }
    }, 4 * 60 * 1000);
}

// ============================================
// 🤖 DISCORD BOT INITIALIZATION
// ============================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Register Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('v')
        .setDescription('Verify your Roblox username for access')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Your exact Roblox username')
                .setRequired(true)
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log('Registering application (/) commands...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
})();

client.once('ready', () => {
    console.log(`[Bot Engine] Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'v') {
        const robloxUsername = interaction.options.getString('username').trim();

        // Use MessageFlags.Ephemeral instead of deprecated ephemeral property
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Optional ping check to wake endpoint if needed before verification call
        pcallPing(RENDER_URL);

        try {
            const response = await axios.post(`${RENDER_URL}/verify`, {
                username: robloxUsername,
                discordId: interaction.user.id,
                discordTag: interaction.user.tag
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': API_SECRET_KEY ? `Bearer ${API_SECRET_KEY}` : undefined
                },
                timeout: 10000
            });

            if (response.data && (response.data.success || response.data.verified)) {
                const successEmbed = new EmbedBuilder()
                    .setTitle(' Verification Successful!')
                    .setColor(0x00FF96)
                    .setDescription(`Account **${robloxUsername}** has been successfully verified.`)
                    .addFields({ name: 'Status', value: 'Return to application. Verification confirmed!' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });
            } else {
                const failEmbed = new EmbedBuilder()
                    .setTitle(' Verification Failed')
                    .setColor(0xFF5050)
                    .setDescription(response.data.message || 'Could not process verification at this time.');

                await interaction.editReply({ embeds: [failEmbed] });
            }
        } catch (error) {
            console.error('API Error during verification:', error.message);

            const errorEmbed = new EmbedBuilder()
                .setTitle(' Server Error')
                .setColor(0xFF3300)
                .setDescription('Failed to reach the verification server. Please ensure the backend is active.');

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
});

function pcallPing(url) {
    axios.get(url).catch(() => {});
}

client.login(DISCORD_TOKEN);
