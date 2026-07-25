const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder 
} = require('discord.js');

// ============================================
// 🤖 BOT INITIALIZATION
// ============================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: Missing DISCORD_TOKEN or CLIENT_ID environment variables!");
    process.exit(1);
}

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ] 
});

// ============================================
// 📜 SLASH COMMAND REGISTRATION (PUBLIC USE)
// ============================================

const commands = [
    // 1. Repeat Message Command
    new SlashCommandBuilder()
        .setName('msg')
        .setDescription('Repeats a specified message')
        .addStringOption(opt => 
            opt.setName('text')
               .setDescription('The message to send')
               .setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('count')
               .setDescription('Number of times to send (1-5)')
               .setRequired(false)),

    // 2. Embed Builder
    new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Send a custom styled embed message')
        .addStringOption(opt => 
            opt.setName('title')
               .setDescription('Title of the embed')
               .setRequired(true))
        .addStringOption(opt => 
            opt.setName('description')
               .setDescription('Description body of the embed')
               .setRequired(true)),

    // 3. Poll Creator
    new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Start a quick community poll')
        .addStringOption(opt => 
            opt.setName('question')
               .setDescription('What do you want to ask?')
               .setRequired(true)),

    // 4. Coinflip
    new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin'),

    // 5. Dice / Random Number Roll
    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll a random number')
        .addIntegerOption(opt => 
            opt.setName('max')
               .setDescription('Maximum number (Default: 100)')
               .setRequired(false)),

    // 6. User Avatar
    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get a user\'s profile picture')
        .addUserOption(opt => 
            opt.setName('target')
               .setDescription('Select a user')
               .setRequired(false)),

    // 7. Ping / Latency
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot status and response time')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 Registering global slash commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ All slash commands registered successfully!');
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
    }
})();

// ============================================
// ⚡ INTERACTION HANDLERS
// ============================================

client.on('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    client.user.setActivity('with utility commands | /msg', { type: 0 });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- /msg ---
    if (commandName === 'msg') {
        const text = interaction.options.getString('text');
        const rawCount = interaction.options.getInteger('count') || 1;
        // Cap count between 1 and 5 to prevent API rate-limit issues
        const count = Math.min(Math.max(rawCount, 1), 5);

        await interaction.reply({ content: `Sending message ${count} time(s)...`, ephemeral: true });

        for (let i = 0; i < count; i++) {
            await interaction.channel.send(text);
            if (i < count - 1) await new Promise(r => setTimeout(r, 1000)); // 1 sec delay
        }
    }

    // --- /embed ---
    if (commandName === 'embed') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor('#5865F2')
            .setFooter({ text: `Sent by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    // --- /poll ---
    if (commandName === 'poll') {
        const question = interaction.options.getString('question');

        const embed = new EmbedBuilder()
            .setTitle('📊 Community Poll')
            .setDescription(question)
            .setColor('#FEE75C')
            .setFooter({ text: `Asked by ${interaction.user.tag}` })
            .setTimestamp();

        const message = await interaction.reply({ embeds: [embed], fetchReply: true });
        await message.react('👍');
        await message.react('👎');
    }

    // --- /coinflip ---
    if (commandName === 'coinflip') {
        const result = Math.random() < 0.5 ? '🪙 **Heads!**' : '🪙 **Tails!**';
        return interaction.reply({ content: result });
    }

    // --- /roll ---
    if (commandName === 'roll') {
        const max = interaction.options.getInteger('max') || 100;
        const rolled = Math.floor(Math.random() * max) + 1;
        return interaction.reply({ content: `🎲 You rolled a **${rolled}** (1-${max})!` });
    }

    // --- /avatar ---
    if (commandName === 'avatar') {
        const user = interaction.options.getUser('target') || interaction.user;
        const avatarUrl = user.displayAvatarURL({ dynamic: true, size: 1024 });

        const embed = new EmbedBuilder()
            .setTitle(`${user.username}'s Avatar`)
            .setImage(avatarUrl)
            .setColor('#5865F2');

        return interaction.reply({ embeds: [embed] });
    }

    // --- /ping ---
    if (commandName === 'ping') {
        const ping = Date.now() - interaction.createdTimestamp;
        return interaction.reply({ content: `🏓 Pong! Latency: \`${ping}ms\` | API Latency: \`${Math.round(client.ws.ping)}ms\`` });
    }
});

client.login(TOKEN);
