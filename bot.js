import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import axios from 'axios';
import 'dotenv/config';

// Ensure required environment variables exist
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const RENDER_URL = process.env.RENDER_URL || "https://milkykey.onrender.com";
const API_SECRET_KEY = process.env.API_SECRET_KEY || ""; // Optional secret key header for API protection

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Register Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('v')
        .setDescription('Verify your Roblox username for Milky Hub access')
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
    console.log(`[Milky Hub Bot] Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'v') {
        const robloxUsername = interaction.options.getString('username').trim();

        await interaction.deferReply({ ephemeral: true });

        try {
            // Send verification request to your Render API endpoint
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
                    .setDescription(`Account **${robloxUsername}** has been successfully verified for **Milky Hub**.`)
                    .addFields({ name: 'Status', value: 'Return to Roblox. Your hub will auto-load momentarily!' })
                    .setFooter({ text: 'Milky Hub Verification System' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });
            } else {
                const failEmbed = new EmbedBuilder()
                    .setTitle(' Verification Failed')
                    .setColor(0xFF5050)
                    .setDescription(response.data.message || 'Could not process verification at this time.')
                    .setFooter({ text: 'Milky Hub Verification System' });

                await interaction.editReply({ embeds: [failEmbed] });
            }
        } catch (error) {
            console.error('API Error during verification:', error.message);

            const errorEmbed = new EmbedBuilder()
                .setTitle(' Server Error')
                .setColor(0xFF3300)
                .setDescription('Failed to reach the verification server. Please ensure the server is online and try again.')
                .setFooter({ text: 'Milky Hub Engine' });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
});

client.login(DISCORD_TOKEN);
