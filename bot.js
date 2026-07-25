const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ApplicationIntegrationType,
    InteractionContextType
} = require('discord.js');

// ============================================
// ⚙️ ENVIRONMENT CONFIGURATION
// ============================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: Missing DISCORD_TOKEN or CLIENT_ID environment variables!");
    process.exit(1);
}

const client = new Client({ 
    intents: [ GatewayIntentBits.Guilds ] 
});

// Helper setting to enable User Profile + Server usage for every command
const userAppConfig = (builder) => {
    return builder
        .setIntegrationTypes([
            ApplicationIntegrationType.UserInstall, 
            ApplicationIntegrationType.GuildInstall
        ])
        .setContexts([
            InteractionContextType.Guild, 
            InteractionContextType.BotDM, 
            InteractionContextType.PrivateChannel
        ]);
};

// ============================================
// 📜 SLASH COMMAND REGISTRATION
// ============================================

const commands = [
    // 1. Repeater
    userAppConfig(
        new SlashCommandBuilder()
            .setName('msg')
            .setDescription('Repeats a message using interaction responses')
            .addStringOption(opt => 
                opt.setName('text')
                   .setDescription('The message to send')
                   .setRequired(true))
            .addIntegerOption(opt => 
                opt.setName('count')
                   .setDescription('Number of times to repeat (1-5)')
                   .setRequired(false))
    ),

    // 2. Embed Builder
    userAppConfig(
        new SlashCommandBuilder()
            .setName('embed')
            .setDescription('Send a clean styled embed message')
            .addStringOption(opt => 
                opt.setName('title')
                   .setDescription('Title of the embed')
                   .setRequired(true))
            .addStringOption(opt => 
                opt.setName('description')
                   .setDescription('Description body')
                   .setRequired(true))
    ),

    // 3. Poll Creator
    userAppConfig(
        new SlashCommandBuilder()
            .setName('poll')
            .setDescription('Start a quick yes/no poll')
            .addStringOption(opt => 
                opt.setName('question')
                   .setDescription('What do you want to ask?')
                   .setRequired(true))
    ),

    // 4. Coinflip
    userAppConfig(
        new SlashCommandBuilder()
            .setName('coinflip')
            .setDescription('Flip a coin anywhere in Discord')
    ),

    // 5. Dice Roll
    userAppConfig(
        new SlashCommandBuilder()
            .setName('roll')
            .setDescription('Roll a random number')
            .addIntegerOption(opt => 
                opt.setName('max')
                   .setDescription('Maximum number (Default: 100)')
                   .setRequired(false))
    ),

    // 6. User Avatar
    userAppConfig(
        new SlashCommandBuilder()
            .setName('avatar')
            .setDescription('Get a user\'s profile picture')
            .addUserOption(opt => 
                opt.setName('target')
                   .setDescription('Select a user')
                   .setRequired(false))
    ),

    // 7. Ping / Latency
    userAppConfig(
        new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check bot status and response time')
    ),

    // 8. 8Ball (NEW)
    userAppConfig(
        new SlashCommandBuilder()
            .setName('8ball')
            .setDescription('Ask the magic 8-ball a question')
            .addStringOption(opt => 
                opt.setName('question')
                   .setDescription('Your question')
                   .setRequired(true))
    ),

    // 9. Choice Picker (NEW)
    userAppConfig(
        new SlashCommandBuilder()
            .setName('choose')
            .setDescription('Pick randomly between options (separated by commas)')
            .addStringOption(opt => 
                opt.setName('options')
                   .setDescription('e.g. Pizza, Burgers, Tacos')
                   .setRequired(true))
    )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 Registering global user-app slash commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ All slash commands registered successfully!');
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
    }
})();

// ============================================
// ⚡ INTERACTION HANDLER
// ============================================

client.on('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    client.user.setActivity('User App Mode | /msg', { type: 0 });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- /msg ---
    if (commandName === 'msg') {
        const text = interaction.options.getString('text');
        const rawCount = interaction.options.getInteger('count') || 1;
        const count = Math.min(Math.max(rawCount, 1), 5);

        await interaction.reply({ content: text });

        for (let i = 1; i < count; i++) {
            await new Promise(r => setTimeout(r, 1000));
            await interaction.followUp({ content: text });
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
            .setTitle('📊 Quick Poll')
            .setDescription(`${question}\n\n👍 = Yes | 👎 = No`)
            .setColor('#FEE75C')
            .setFooter({ text: `Asked by ${interaction.user.tag}` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    // --- /coinflip ---
    if (commandName === 'coinflip') {
        const outcome = Math.random() < 0.5 ? '🪙 **Heads!**' : '🪙 **Tails!**';
        return interaction.reply({ content: outcome });
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

    // --- /8ball ---
    if (commandName === '8ball') {
        const question = interaction.options.getString('question');
        const responses = [
            '🎱 It is certain.', '🎱 Without a doubt.', '🎱 Yes - definitely.',
            '🎱 Reply hazy, try again.', '🎱 Ask again later.',
            '🎱 Don\'t count on it.', '🎱 My reply is no.', '🎱 Very doubtful.'
        ];
        const answer = responses[Math.floor(Math.random() * responses.length)];
        
        return interaction.reply({ content: `**Q:** ${question}\n**A:** ${answer}` });
    }

    // --- /choose ---
    if (commandName === 'choose') {
        const optionsRaw = interaction.options.getString('options');
        const choices = optionsRaw.split(',').map(c => c.trim()).filter(c => c.length > 0);

        if (choices.length < 2) {
            return interaction.reply({ content: '❌ Please provide at least 2 choices separated by commas!', ephemeral: true });
        }

        const pick = choices[Math.floor(Math.random() * choices.length)];
        return interaction.reply({ content: `🤔 I choose: **${pick}**` });
    }
});

client.login(TOKEN);
