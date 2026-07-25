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

// Helper setting: Unlocks commands for EVERYONE and enables User Profile installation
const userAppConfig = (builder) => {
    return builder
        .setDefaultMemberPermissions(null) // 🔓 REMOVES ADMIN REQUIREMENT FOR EVERYONE
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
    // 1. Message Repeater
    userAppConfig(
        new SlashCommandBuilder()
            .setName('msg')
            .setDescription('Repeats a message multiple times')
            .addStringOption(opt => opt.setName('text').setDescription('The message to send').setRequired(true))
            .addIntegerOption(opt => opt.setName('count').setDescription('Repeats (1-5)').setRequired(false))
    ),

    // 2. Embed Builder
    userAppConfig(
        new SlashCommandBuilder()
            .setName('embed')
            .setDescription('Send a clean styled embed message')
            .addStringOption(opt => opt.setName('title').setDescription('Embed title').setRequired(true))
            .addStringOption(opt => opt.setName('description').setDescription('Embed text').setRequired(true))
    ),

    // 3. Poll
    userAppConfig(
        new SlashCommandBuilder()
            .setName('poll')
            .setDescription('Start a quick vote')
            .addStringOption(opt => opt.setName('question').setDescription('Poll topic').setRequired(true))
    ),

    // 4. Coinflip
    userAppConfig(
        new SlashCommandBuilder()
            .setName('coinflip')
            .setDescription('Flip a coin')
    ),

    // 5. Dice Roll
    userAppConfig(
        new SlashCommandBuilder()
            .setName('roll')
            .setDescription('Roll a random number')
            .addIntegerOption(opt => opt.setName('max').setDescription('Max number (Default 100)').setRequired(false))
    ),

    // 6. User Avatar
    userAppConfig(
        new SlashCommandBuilder()
            .setName('avatar')
            .setDescription('Get a user\'s profile picture')
            .addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(false))
    ),

    // 7. Ping
    userAppConfig(
        new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check latency')
    ),

    // 8. 8Ball
    userAppConfig(
        new SlashCommandBuilder()
            .setName('8ball')
            .setDescription('Ask a question to the magic 8-ball')
            .addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true))
    ),

    // 9. Choice Picker
    userAppConfig(
        new SlashCommandBuilder()
            .setName('choose')
            .setDescription('Pick between options (comma separated)')
            .addStringOption(opt => opt.setName('options').setDescription('e.g. Pizza, Burgers, Tacos').setRequired(true))
    ),

    // 10. NEW: Meme Fetcher
    userAppConfig(
        new SlashCommandBuilder()
            .setName('meme')
            .setDescription('Get a random meme from Reddit')
    ),

    // 11. NEW: Rock Paper Scissors
    userAppConfig(
        new SlashCommandBuilder()
            .setName('rps')
            .setDescription('Play Rock, Paper, Scissors')
            .addStringOption(opt => 
                opt.setName('choice')
                   .setDescription('Select your move')
                   .setRequired(true)
                   .addChoices(
                       { name: '🪨 Rock', value: 'rock' },
                       { name: '📄 Paper', value: 'paper' },
                       { name: '✂️ Scissors', value: 'scissors' }
                   ))
    ),

    // 12. NEW: User Info
    userAppConfig(
        new SlashCommandBuilder()
            .setName('userinfo')
            .setDescription('Get detailed info about a user profile')
            .addUserOption(opt => opt.setName('target').setDescription('Target user').setRequired(false))
    ),

    // 13. NEW: Server Info
    userAppConfig(
        new SlashCommandBuilder()
            .setName('serverinfo')
            .setDescription('Get details about the current server')
    ),

    // 14. NEW: Random Cat
    userAppConfig(
        new SlashCommandBuilder()
            .setName('cat')
            .setDescription('Get a random cute cat photo')
    ),

    // 15. NEW: Random Dog
    userAppConfig(
        new SlashCommandBuilder()
            .setName('dog')
            .setDescription('Get a random cute dog photo')
    )
].map(cmd => cmd.toJSON());

// Force overwrite slash commands on startup
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 Overwriting old commands & unlocking all admin restrictions...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ All commands updated and unlocked successfully!');
    } catch (error) {
        console.error('❌ Error updating slash commands:', error);
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
            return interaction.reply({ content: '❌ Please enter at least 2 options separated by commas!', ephemeral: true });
        }

        const pick = choices[Math.floor(Math.random() * choices.length)];
        return interaction.reply({ content: `🤔 I choose: **${pick}**` });
    }

    // --- /meme ---
    if (commandName === 'meme') {
        await interaction.deferReply();
        try {
            const res = await fetch('https://meme-api.com/gimme');
            const data = await res.json();

            const embed = new EmbedBuilder()
                .setTitle(data.title)
                .setURL(data.postLink)
                .setImage(data.url)
                .setColor('#FF4500')
                .setFooter({ text: `👍 ${data.ups} | r/${data.subreddit}` });

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            return interaction.editReply({ content: '❌ Failed to fetch meme from Reddit API.' });
        }
    }

    // --- /rps ---
    if (commandName === 'rps') {
        const userChoice = interaction.options.getString('choice');
        const moves = ['rock', 'paper', 'scissors'];
        const botChoice = moves[Math.floor(Math.random() * moves.length)];

        let result = "";
        if (userChoice === botChoice) {
            result = "🤝 It's a tie!";
        } else if (
            (userChoice === 'rock' && botChoice === 'scissors') ||
            (userChoice === 'paper' && botChoice === 'rock') ||
            (userChoice === 'scissors' && botChoice === 'paper')
        ) {
            result = "🎉 You win!";
        } else {
            result = "💻 Bot wins!";
        }

        return interaction.reply({ 
            content: `You chose **${userChoice}** | Bot chose **${botChoice}**\n${result}` 
        });
    }

    // --- /userinfo ---
    if (commandName === 'userinfo') {
        const user = interaction.options.getUser('target') || interaction.user;
        const embed = new EmbedBuilder()
            .setTitle(`👤 ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User ID', value: `\`${user.id}\``, inline: true },
                { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Bot Account', value: user.bot ? 'Yes' : 'No', inline: true }
            )
            .setColor('#5865F2');

        return interaction.reply({ embeds: [embed] });
    }

    // --- /serverinfo ---
    if (commandName === 'serverinfo') {
        if (!interaction.guild) {
            return interaction.reply({ content: '❌ This command can only be used inside a server context.', ephemeral: true });
        }

        const guild = interaction.guild;
        const embed = new EmbedBuilder()
            .setTitle(`🏰 ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
                { name: 'Total Members', value: `\`${guild.memberCount}\``, inline: true },
                { name: 'Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setColor('#2ECC71');

        return interaction.reply({ embeds: [embed] });
    }

    // --- /cat ---
    if (commandName === 'cat') {
        await interaction.deferReply();
        try {
            const res = await fetch('https://api.thecatapi.com/v1/images/search');
            const data = await res.json();
            return interaction.editReply({ content: data[0].url });
        } catch {
            return interaction.editReply({ content: '❌ Failed to fetch cat picture!' });
        }
    }

    // --- /dog ---
    if (commandName === 'dog') {
        await interaction.deferReply();
        try {
            const res = await fetch('https://dog.ceo/api/breeds/image/random');
            const data = await res.json();
            return interaction.editReply({ content: data.message });
        } catch {
            return interaction.editReply({ content: '❌ Failed to fetch dog picture!' });
        }
    }
});

client.login(TOKEN);
