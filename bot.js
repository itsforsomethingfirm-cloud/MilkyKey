const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

// Express App to serve keys to Rayfield
const app = express();
const PORT = process.env.PORT || 3000;

// Temporary in-memory key storage: { "KEY_STRING": expirationTimestamp }
let activeKeys = {};

// Root route check
app.get('/', (req, res) => {
    res.send('🥛 Milky Hub Key Server is active!');
});

// Endpoint that Rayfield checks for valid keys
app.get('/keys.txt', (req, res) => {
    const now = Date.now();
    
    // Filter out expired keys automatically
    const validKeys = Object.keys(activeKeys).filter(key => activeKeys[key] > now);
    
    // Return keys separated by newlines
    res.type('text/plain');
    res.send(validKeys.join('\n'));
});

app.listen(PORT, () => console.log(`[MILKY HUB] Server running on port ${PORT}`));

// Discord Bot Configuration (Uses environment variables set on Render/Koyeb)
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: DISCORD_TOKEN or CLIENT_ID environment variables are missing!");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Register Slash Command
const commands = [
    new SlashCommandBuilder()
        .setName('key')
        .setDescription('Generate a key for Milky Hub')
        .addIntegerOption(option => 
            option.setName('hours')
                .setDescription('Duration of the key in hours (e.g., 24)')
                .setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('[MILKY HUB] Registering slash commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('[MILKY HUB] Slash command /key registered successfully!');
    } catch (error) {
        console.error('[MILKY HUB] Error registering commands:', error);
    }
})();

// Command Listener
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'key') {
        const hours = interaction.options.getInteger('hours');
        
        // Generate random key (e.g. MILKY-8X92A1)
        const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const generatedKey = `MILKY-${randomCode}`;
        
        // Set expiration time
        const expireTimestamp = Date.now() + (hours * 60 * 60 * 1000);
        activeKeys[generatedKey] = expireTimestamp;

        await interaction.reply({
            content: `🥛 **Your Milky Hub Key:** \`${generatedKey}\`\n⏱️ **Expires in:** ${hours} hour(s)\n\nPaste this key into the Rayfield prompt when running the script!`,
            ephemeral: true // Only the command executor can see this
        });
    }
});

client.login(TOKEN);
