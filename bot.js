const { Client, GatewayIntentBits } = require('discord.js');
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
const whitelist = new Set(); // Store whitelisted usernames

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}! Milky Auto-Verify API is running.`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || message.channel.id !== CHANNEL_ID) return;

    const username = message.content.trim();
    const lowerUser = username.toLowerCase();

    // Roblox username format validation
    const validFormat = /^[a-zA-Z0-9_]{3,20}$/.test(username);

    if (!validFormat) {
        await message.react('🚫');
        await message.reply(`❌ **"${username}"** is not a valid Roblox username format.`);
        return;
    }

    if (whitelist.has(lowerUser)) {
        await message.react('☑️');
        await message.reply(`ℹ️ **${username}** is already whitelisted! Your script will auto-load now.`);
        return;
    }

    try {
        // Verify account exists via Roblox Web API
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username],
            excludeBannedUsers: true
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            whitelist.add(lowerUser);
            await message.react('☑️');
            await message.reply(`✅ **${username}** has been whitelisted! Welcome to Milky Hub!`);
        } else {
            await message.react('🚫');
            await message.reply(`❌ Roblox account **"${username}"** could not be found.`);
        }
    } catch (error) {
        console.error("Roblox API Error:", error.message);
        await message.react('🚫');
    }
});

// Web Endpoint for Roblox Lua Script to check whitelist status live
app.get('/check-verify', (req, res) => {
    const user = (req.query.username || "").toLowerCase();
    if (whitelist.has(user)) {
        return res.json({ verified: true });
    }
    return res.json({ verified: false });
});

app.get('/', (req, res) => {
    res.send("Milky Verification Service Online!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
