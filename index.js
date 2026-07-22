// index.js
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags
} = require('discord.js');

const express = require('express');
const { Riffy } = require('riffy');
const config = require('./config.js');

// ============================================================
// CLIENT DISCORD
// ============================================================

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages
];

if (config.enablePrefix) {
  intents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({
  intents
});

// ============================================================
// VARIABLES
// ============================================================

let isLavalinkConnected = false;

const queue247 = new Set();
const nowPlayingMessages = new Map();

// ============================================================
// RIFFY / LAVALINK
// ============================================================

const riffy = new Riffy(
  client,
  config.lavalink.nodes,
  {
    send: (payload) => {
      const guild = client.guilds.cache.get(payload.d.guild_id);

      if (guild) {
        guild.shard.send(payload);
      }
    },

    defaultSearchPlatform: 'ytmsearch',
    restVersion: 'v4'
  }
);

// ============================================================
// EXPRESS
// ============================================================

function startExpressServer() {
  if (!config.express.enabled) {
    return;
  }

  const app = express();

  app.get('/', (req, res) => {
    res.json({
      status: 'online',
      bot: client.user ? client.user.tag : 'Starting...',
      servers: client.guilds.cache.size,
      uptime: process.uptime(),
      lavalink: isLavalinkConnected
        ? 'connected'
        : 'disconnected'
    });
  });

  app.get('/stats', (req, res) => {
    res.json({
      guilds: client.guilds.cache.size,

      users: client.guilds.cache.reduce(
        (total, guild) => total + guild.memberCount,
        0
      ),

      players: riffy.players.size,

      uptime: process.uptime(),

      memory:
        process.memoryUsage().heapUsed /
        1024 /
        1024,

      ping: client.ws.ping,

      lavalink: isLavalinkConnected
    });
  });

  app.listen(
    config.express.port,
    '0.0.0.0',
    () => {
      console.log(
        `🌐 Serveur Express actif sur le port ${config.express.port}`
      );
    }
  );
}

// ============================================================
// UTILITAIRES
// ============================================================

function formatTime(ms = 0) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(
    (ms / (1000 * 60 * 60)) % 24
  );

  if (hours > 0) {
    return `${hours}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }

  return `${minutes}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

function getThumbnail(info = {}) {
  let thumbnail =
    info.artworkUrl ||
    info.thumbnail ||
    null;

  if (
    !thumbnail &&
    info.uri &&
    info.uri.includes('youtube.com')
  ) {
    const videoId =
      info.uri
        .split('v=')[1]
        ?.split('&')[0];

    if (videoId) {
      thumbnail =
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
  }

  if (
    !thumbnail &&
    info.uri &&
    info.uri.includes('youtu.be')
  ) {
    const videoId =
      info.uri
        .split('youtu.be/')[1]
        ?.split('?')[0];

    if (videoId) {
      thumbnail =
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
  }

  return (
    thumbnail ||
    'https://i.imgur.com/QYJfXQv.png'
  );
}

function getUserAvatar() {
  if (!client.user) {
    return 'https://i.imgur.com/QYJfXQv.png';
  }

  return client.user.displayAvatarURL({
    size: 1024
  });
}

function sendComponentsV2(channel, container) {
  return channel.send({
    components: [container],
    flags:
      MessageFlags.IsPersistent |
      MessageFlags.IsComponentsV2
  });
}

// ============================================================
// CONTAINERS
// ============================================================

function createSimpleContainer(
  title,
  description,
  emoji = config.emojis.info
) {
  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(
              `## ${emoji} ${title}\n${description}`
            )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(getUserAvatar())
            .setDescription(title)
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(
          SeparatorSpacingSize.Small
        )
        .setDivider(true)
    );
}

function createSimpleContainerNoButtons(
  title,
  description,
  emoji = config.emojis.info
) {
  return createSimpleContainer(
    title,
    description,
    emoji
  );
}

// ============================================================
// NOW PLAYING
// ============================================================

function createNowPlayingContainer(
  player,
  track,
  disabled = false
) {
  const info = track?.info || {};
  const thumbnail = getThumbnail(info);

  const isPaused = player.paused;

  const container =
    new ContainerBuilder()
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder()
              .setContent(
                `## ${config.emojis.music} Lecture en cours\n**[${info.title || 'Titre inconnu'}](${info.uri || 'https://youtube.com'})**`
              )
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(thumbnail)
              .setDescription(
                info.title ||
                'Vignette de chanson'
              )
          )
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            `**Durée :** ${formatTime(
              info.length || 0
            )} • **Demandé par :** <@${
              info.requester || client.user.id
            }>`
          )
      )
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(
            SeparatorSpacingSize.Small
          )
          .setDivider(true)
      )
      .addActionRowComponents(
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                isPaused
                  ? 'resume'
                  : 'pause'
              )
              .setEmoji(
                isPaused
                  ? config.emojis.play
                  : config.emojis.pause
              )
              .setStyle(
                isPaused
                  ? ButtonStyle.Success
                  : ButtonStyle.Primary
              )
              .setDisabled(disabled),

            new ButtonBuilder()
              .setCustomId('skip')
              .setEmoji(config.emojis.skip)
              .setStyle(
                ButtonStyle.Primary
              )
              .setDisabled(disabled),

            new ButtonBuilder()
              .setCustomId('stop')
              .setEmoji(config.emojis.stop)
              .setStyle(
                ButtonStyle.Danger
              )
              .setDisabled(disabled),

            new ButtonBuilder()
              .setCustomId('shuffle')
              .setEmoji(
                config.emojis.shuffle
              )
              .setStyle(
                ButtonStyle.Secondary
              )
              .setDisabled(disabled),

            new ButtonBuilder()
              .setCustomId('queue')
              .setEmoji(
                config.emojis.queue
              )
              .setStyle(
                ButtonStyle.Secondary
              )
              .setDisabled(disabled)
          )
      )
      .addActionRowComponents(
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('loop')
              .setEmoji(config.emojis.loop)
              .setStyle(
                player.loop &&
                player.loop !== 'none'
                  ? ButtonStyle.Success
                  : ButtonStyle.Secondary
              )
              .setDisabled(disabled)
          )
      );

  return container;
}

// ============================================================
// QUEUE
// ============================================================

function createQueueContainer(player) {
  const queue = player.queue || [];
  const current = player.current;

  let description = '';

  if (current?.info) {
    description +=
      `**Lecture en cours :**\n` +
      `**[${current.info.title || 'Titre inconnu'}](${current.info.uri || 'https://youtube.com'})**\n` +
      `${current.info.author || 'Inconnu'} • ` +
      `${formatTime(current.info.length || 0)} • ` +
      `<@${current.info.requester || client.user.id}>\n\n`;
  }

  if (queue.length > 0) {
    description += '**À suivre :**\n';

    const upcoming = queue.slice(0, 10);

    upcoming.forEach((track, index) => {
      const info = track.info || {};

      description +=
        `\`${index + 1}.\` **[${info.title || 'Titre inconnu'}](${info.uri || 'https://youtube.com'})**\n` +
        `${info.author || 'Inconnu'} • ` +
        `${formatTime(info.length || 0)} • ` +
        `<@${info.requester || client.user.id}>\n`;
    });

    if (queue.length > 10) {
      description +=
        `\n*... et ${queue.length - 10} autre(s) piste(s)*`;
    }
  }

  if (
    queue.length === 0 &&
    !current
  ) {
    description =
      'La file d’attente est actuellement vide.';
  }

  const loop =
    !player.loop ||
    player.loop === 'none'
      ? 'Désactivée'
      : player.loop;

  description +=
    `\n\n**Boucle :** ${loop}` +
    ` | **Total :** ${queue.length + (current ? 1 : 0)}`;

  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(
              `## ${config.emojis.queue} File d'attente\n${description}`
            )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(getUserAvatar())
            .setDescription(
              'File d’attente'
            )
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(
          SeparatorSpacingSize.Small
        )
        .setDivider(true)
    );
}

// ============================================================
// STATS
// ============================================================

function createStatsContainer() {
  const uptime = formatTime(
    client.uptime || 0
  );

  const players =
    riffy.players.size;

  const totalUsers =
    client.guilds.cache.reduce(
      (total, guild) =>
        total + guild.memberCount,
      0
    );

  const memory =
    (
      process.memoryUsage()
        .heapUsed /
      1024 /
      1024
    ).toFixed(2);

  const description =
    `**Serveurs :** ${client.guilds.cache.size}\n` +
    `**Utilisateurs :** ${totalUsers}\n` +
    `**Lecteurs :** ${players}\n` +
    `**Uptime :** ${uptime}\n` +
    `**Ping :** ${client.ws.ping}ms\n` +
    `**Mémoire :** ${memory} MB\n` +
    `**Lavalink :** ${
      isLavalinkConnected
        ? '🟢 Connecté'
        : '🔴 Déconnecté'
    }`;

  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(
              `## ${config.emojis.info} Statistiques\n${description}`
            )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(getUserAvatar())
            .setDescription(
              'Statistiques du bot'
            )
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(
          SeparatorSpacingSize.Small
        )
        .setDivider(true)
    );
}

// ============================================================
// HELP
// ============================================================

function createHelpContainer() {
  const lavalinkStatus =
    isLavalinkConnected
      ? '🟢 Connecté'
      : '🔴 Déconnecté';

  const description =
    `Un bot de musique puissant avec un son de haute qualité.\n\n` +
    `**Commandes :** 17\n` +
    `**Préfixe :** \`${config.prefix}\`\n` +
    `**Lavalink :** ${lavalinkStatus}\n` +
    `**Créé par :** Tasix.226\n\n` +

    `**${config.emojis.music} Commandes musique**\n` +
    `**play** (p) — Lire une musique\n` +
    `**pause** (pa) — Mettre en pause\n` +
    `**resume** (r, res) — Reprendre\n` +
    `**skip** (s, next) — Passer la musique\n` +
    `**stop** (st, leave) — Arrêter\n` +
    `**nowplaying** (np) — Musique actuelle\n` +
    `**queue** (q) — Voir la file\n` +
    `**loop** (l, repeat) — Mode répétition\n` +
    `**shuffle** (sh, mix) — Mélanger\n` +
    `**volume** (v, vol) — Régler le volume\n` +
    `**clearqueue** (cq, clear) — Vider la file\n` +
    `**remove** (rm, delete) — Supprimer une piste\n` +
    `**move** (mv) — Déplacer une piste\n` +
    `**247** (24/7, stay) — Mode 24/7\n\n` +

    `**${config.emojis.info} Commandes utilitaires**\n` +
    `**stats** — Statistiques\n` +
    `**ping** — Latence\n` +
    `**invite** — Inviter le bot\n` +
    `**support** — Serveur support\n` +
    `**help** — Afficher cette aide`;

  const invite =
    `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}` +
    `&permissions=3165184&scope=bot%20applications.commands`;

  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(
              `## ${client.user.username} — Aide\n${description}`
            )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(getUserAvatar())
            .setDescription(
              'Avatar du bot'
            )
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(
          SeparatorSpacingSize.Small
        )
        .setDivider(true)
    )
    .addActionRowComponents(
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Inviter le bot')
            .setStyle(
              ButtonStyle.Link
            )
            .setURL(invite),

          new ButtonBuilder()
            .setLabel('Support')
            .setStyle(
              ButtonStyle.Link
            )
            .setURL(
              config.supportServer
            )
        )
    );
}

// ============================================================
// COMMANDES SLASH
// ============================================================

const commands = [
  {
    name: 'play',
    description: 'Lire une musique',
    options: [
      {
        name: 'query',
        description:
          'Nom de la musique ou URL',
        type: 3,
        required: true
      }
    ]
  },

  {
    name: 'pause',
    description:
      'Mettre la musique en pause'
  },

  {
    name: 'resume',
    description:
      'Reprendre la musique'
  },

  {
    name: 'skip',
    description:
      'Passer à la musique suivante'
  },

  {
    name: 'stop',
    description:
      'Arrêter et vider la file'
  },

  {
    name: 'volume',
    description:
      'Régler le volume',
    options: [
      {
        name: 'level',
        description:
          'Volume entre 1 et 100',
        type: 4,
        required: true,
        min_value: 1,
        max_value: 100
      }
    ]
  },

  {
    name: 'queue',
    description:
      'Afficher la file d’attente'
  },

  {
    name: 'nowplaying',
    description:
      'Afficher la musique actuelle'
  },

  {
    name: 'shuffle',
    description:
      'Mélanger la file'
  },

  {
    name: 'loop',
    description:
      'Configurer la répétition',
    options: [
      {
        name: 'mode',
        description:
          'Mode de répétition',
        type: 3,
        required: true,
        choices: [
          {
            name: 'Désactivé',
            value: 'none'
          },
          {
            name: 'Musique',
            value: 'track'
          },
          {
            name: 'File d’attente',
            value: 'queue'
          }
        ]
      }
    ]
  },

  {
    name: 'remove',
    description:
      'Supprimer une piste',
    options: [
      {
        name: 'position',
        description:
          'Position dans la file',
        type: 4,
        required: true,
        min_value: 1
      }
    ]
  },

  {
    name: 'move',
    description:
      'Déplacer une piste',
    options: [
      {
        name: 'from',
        description:
          'Position actuelle',
        type: 4,
        required: true,
        min_value: 1
      },
      {
        name: 'to',
        description:
          'Nouvelle position',
        type: 4,
        required: true,
        min_value: 1
      }
    ]
  },

  {
    name: 'clearqueue',
    description:
      'Vider la file d’attente'
  },

  {
    name: '247',
    description:
      'Activer ou désactiver le mode 24/7'
  },

  {
    name: 'stats',
    description:
      'Afficher les statistiques'
  },

  {
    name: 'ping',
    description:
      'Afficher la latence'
  },

  {
    name: 'invite',
    description:
      'Obtenir le lien d’invitation'
  },

  {
    name: 'support',
    description:
      'Obtenir le lien du support'
  },

  {
    name: 'help',
    description:
      'Afficher toutes les commandes'
  }
];

// ============================================================
// READY
// ============================================================

client.once(
  'clientReady',
  async () => {
    console.log(
      `${config.emojis.success} Connecté en tant que ${client.user.tag}`
    );

    try {
      riffy.init(client.user.id);

      console.log(
        `${config.emojis.success} Riffy initialisé`
      );
    } catch (error) {
      console.error(
        `${config.emojis.error} Erreur Riffy :`,
        error
      );
    }

    const activityTypes = {
      PLAYING:
        ActivityType.Playing,

      LISTENING:
        ActivityType.Listening,

      WATCHING:
        ActivityType.Watching,

      STREAMING:
        ActivityType.Streaming,

      COMPETING:
        ActivityType.Competing
    };

    const activityType =
      activityTypes[
        config.activity.type
      ] ||
      ActivityType.Listening;

    client.user.setActivity(
      config.activity.name,
      {
        type: activityType
      }
    );

    console.log(
      `${config.emojis.success} Activité : ${config.activity.name}`
    );

    try {
      await client.application.commands.set(
        commands
      );

      console.log(
        `${config.emojis.success} Commandes slash enregistrées`
      );
    } catch (error) {
      console.error(
        `${config.emojis.error} Erreur commandes slash :`,
        error
      );
    }
  }
);

// ============================================================
// RIFFY VOICE STATE
// ============================================================

client.on(
  'raw',
  (data) => {
    riffy.updateVoiceState(data);
  }
);

// ============================================================
// LAVALINK EVENTS
// ============================================================

riffy.on(
  'nodeConnect',
  (node) => {
    isLavalinkConnected = true;

    console.log(
      `${config.emojis.success} Lavalink connecté : ${node.name}`
    );
  }
);

riffy.on(
  'nodeError',
  (node, error) => {
    isLavalinkConnected = false;

    console.error(
      `${config.emojis.error} Lavalink erreur (${node.name}) :`,
      error
    );
  }
);

riffy.on(
  'nodeDisconnect',
  (node) => {
    isLavalinkConnected = false;

    console.log(
      `${config.emojis.error} Lavalink déconnecté : ${node.name}`
    );
  }
);

// ============================================================
// TRACK START
// ============================================================

riffy.on(
  'trackStart',
  async (player, track) => {
    const channel =
      client.channels.cache.get(
        player.textChannel
      );

    if (!channel) {
      return;
    }

    const container =
      createNowPlayingContainer(
        player,
        track
      );

    try {
      const message =
        await sendComponentsV2(
          channel,
          container
        );

      nowPlayingMessages.set(
        player.guildId,
        message
      );
    } catch (error) {
      console.error(
        `${config.emojis.error} Impossible d'envoyer Now Playing :`,
        error
      );
    }
  }
);

// ============================================================
// QUEUE END
// ============================================================

riffy.on(
  'queueEnd',
  async (player) => {
    const channel =
      client.channels.cache.get(
        player.textChannel
      );

    const message =
      nowPlayingMessages.get(
        player.guildId
      );

    if (message) {
      try {
        if (player.current) {
          const container =
            createNowPlayingContainer(
              player,
              player.current,
              true
            );

          await message.edit({
            components: [container],
            flags:
              MessageFlags.IsPersistent |
              MessageFlags.IsComponentsV2
          });
        }
      } catch (error) {
        console.error(
          `${config.emojis.error} Impossible de désactiver les boutons :`,
          error
        );
      }

      nowPlayingMessages.delete(
        player.guildId
      );
    }

    if (
      queue247.has(player.guildId)
    ) {
      if (channel) {
        const container =
          createSimpleContainer(
            'Mode 24/7',
            'La file est terminée, mais je reste connecté au vocal.',
            config.emojis.info
          );

        await sendComponentsV2(
          channel,
          container
        );
      }

      return;
    }

    if (channel) {
      const container =
        createSimpleContainer(
          'File terminée',
          'La file est terminée. Je quitte le canal vocal.',
          config.emojis.success
        );

      await sendComponentsV2(
        channel,
        container
      );
    }

    player.destroy();
  }
);

// ============================================================
// INTERACTIONS
// ============================================================

client.on(
  'interactionCreate',
  async (interaction) => {

    // ========================================================
    // BOUTONS
    // ========================================================

    if (interaction.isButton()) {
      const player =
        riffy.players.get(
          interaction.guildId
        );

      if (!player) {
        return interaction.reply({
          content:
            `${config.emojis.error} Aucun lecteur trouvé.`,
          ephemeral: true
        });
      }

      const member =
        interaction.member;

      if (
        !member.voice?.channel
      ) {
        return interaction.reply({
          content:
            `${config.emojis.error} Tu dois être dans un canal vocal.`,
          ephemeral: true
        });
      }

      if (
        member.voice.channel.id !==
        player.voiceChannel
      ) {
        return interaction.reply({
          content:
            `${config.emojis.error} Tu dois être dans le même canal vocal.`,
          ephemeral: true
        });
      }

      try {
        switch (
          interaction.customId
        ) {

          case 'pause': {
            await player.pause(true);

            await interaction.reply({
              content:
                `${config.emojis.pause} Musique mise en pause.`,
              ephemeral: true
            });

            break;
          }

          case 'resume': {
            await player.pause(false);

            await interaction.reply({
              content:
                `${config.emojis.play} Lecture reprise.`,
              ephemeral: true
            });

            break;
          }

          case 'skip': {
            player.stop();

            await interaction.reply({
              content:
                `${config.emojis.skip} Musique suivante.`,
              ephemeral: true
            });

            break;
          }

          case 'stop': {
            player.destroy();

            await interaction.reply({
              content:
                `${config.emojis.stop} Lecture arrêtée.`,
              ephemeral: true
            });

            break;
          }

          case 'shuffle': {
            if (
              player.queue.length === 0
            ) {
              return interaction.reply({
                content:
                  `${config.emojis.error} La file est vide.`,
                ephemeral: true
              });
            }

            player.queue.shuffle();

            await interaction.reply({
              content:
                `${config.emojis.shuffle} File mélangée.`,
              ephemeral: true
            });

            break;
          }

          case 'loop': {
            const modes = [
              'none',
              'track',
              'queue'
            ];

            const current =
              player.loop || 'none';

            const index =
              modes.indexOf(current);

            const next =
              modes[
                (index + 1) %
                modes.length
              ];

            player.setLoop(next);

            await interaction.reply({
              content:
                `${config.emojis.loop} Boucle : ${next}`,
              ephemeral: true
            });

            break;
          }

          case 'queue': {
            const container =
              createQueueContainer(
                player
              );

            await interaction.reply({
              components: [container],
              flags:
                MessageFlags.IsComponentsV2,
              ephemeral: true
            });

            break;
          }
        }
      } catch (error) {
        console.error(
          'Erreur bouton :',
          error
        );

        if (
          !interaction.replied &&
          !interaction.deferred
        ) {
          await interaction.reply({
            content:
              `${config.emojis.error} Une erreur est survenue.`,
            ephemeral: true
          });
        }
      }

      return;
    }

    // ========================================================
    // SLASH COMMANDS
    // ========================================================

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const {
      commandName,
      options,
      member,
      guild,
      channel
    } = interaction;

    try {

      // ======================================================
      // PLAY
      // ======================================================

      if (
        commandName === 'play'
      ) {
        const query =
          options.getString(
            'query'
          );

        if (
          !member.voice?.channel
        ) {
          return interaction.reply({
            content:
              `${config.emojis.error} Tu dois être dans un canal vocal.`,
            ephemeral: true
          });
        }

        if (
          !isLavalinkConnected
        ) {
          return interaction.reply({
            content:
              `${config.emojis.error} Lavalink n'est pas connecté.`,
            ephemeral: true
          });
        }

        await interaction.deferReply();

        let player =
          riffy.players.get(
            guild.id
          );

        if (!player) {
          player =
            riffy.createConnection({
              guildId: guild.id,
              voiceChannel:
                member.voice.channel.id,
              textChannel:
                channel.id,
              deaf: true
            });
        }

        const result =
          await riffy.resolve({
            query,
            requester:
              interaction.user.id
          });

        if (
          !result ||
          !result.tracks ||
          result.tracks.length === 0
        ) {
          return interaction.editReply({
            content:
              `${config.emojis.error} Aucun résultat trouvé.`
          });
        }

        if (
          result.loadType ===
          'playlist'
        ) {
          for (
            const track of result.tracks
          ) {
            track.info.requester =
              interaction.user.id;

            player.queue.add(track);
          }

          const container =
            createSimpleContainer(
              'Playlist ajoutée',
              `**${result.playlistInfo?.name || 'Playlist'}** — ${result.tracks.length} piste(s) ajoutée(s).`,
              config.emojis.success
            );

          await interaction.editReply({
            components: [container],
            flags:
              MessageFlags.IsComponentsV2
          });
        } else {
          const track =
            result.tracks[0];

          track.info.requester =
            interaction.user.id;

          player.queue.add(track);

          const container =
            createSimpleContainer(
              'Musique ajoutée',
              `**[${track.info.title}](${track.info.uri})**`,
              config.emojis.success
            );

          await interaction.editReply({
            components: [container],
            flags:
              MessageFlags.IsComponentsV2
          });
        }

        if (
          !player.playing &&
          !player.paused
        ) {
          player.play();
        }

        return;
      }

      // ======================================================
      // COMMANDES LECTURE
      // ======================================================

      if (
        [
          'pause',
          'resume',
          'skip',
          'stop'
        ].includes(commandName)
      ) {
        const player =
          riffy.players.get(
            guild.id
          );

        if (!player) {
          return interaction.reply({
            content:
              `${config.emojis.error} Aucun lecteur trouvé.`,
            ephemeral: true
          });
        }

        if (
          !member.voice?.channel ||
          member.voice.channel.id !==
          player.voiceChannel
        ) {
          return interaction.reply({
            content:
              `${config.emojis.error} Tu dois être dans le même canal vocal.`,
            ephemeral: true
          });
        }

        if (
          commandName === 'pause'
        ) {
          player.pause(true);

          return interaction.reply({
            components: [
              createSimpleContainer(
                'Pause',
                'La musique est en pause.',
                config.emojis.pause
              )
            ],
            flags:
              MessageFlags.IsComponentsV2
          });
        }

        if (
          commandName === 'resume'
        ) {
          player.pause(false);

          return interaction.reply({
            components: [
              createSimpleContainer(
                'Lecture reprise',
                'La musique reprend.',
                config.emojis.play
              )
            ],
            flags:
              MessageFlags.IsComponentsV2
          });
        }

        if (
          commandName === 'skip'
        ) {
          player.stop();

          return interaction.reply({
            components: [
              createSimpleContainer(
                'Musique suivante',
                'Passage à la piste suivante.',
                config.emojis.skip
              )
            ],
            flags:
              MessageFlags.IsComponentsV2
          });
        }

        if (
          commandName === 'stop'
        ) {
          player.destroy();

          return interaction.reply({
            components: [
              createSimpleContainer(
                'Lecture arrêtée',
                'La lecture a été arrêtée et la file vidée.',
                config.emojis.stop
              )
            ],
            flags:
              MessageFlags.IsComponentsV2
          });
        }
      }

      // ======================================================
      // VOLUME
      // ======================================================

      if (
        commandName === 'volume'
      ) {
        const player =
          riffy.players.get(
            guild.id
          );

        if (!player) {
          return interaction.reply({
            content:
              `${config.emojis.error} Aucun lecteur trouvé.`,
            ephemeral: true
          });
        }

        const volume =
          options.getInteger(
            'level'
          );

        player.setVolume(volume);

        return interaction.reply({
          components: [
            createSimpleContainer(
              'Volume',
              `Volume réglé sur **${volume}%**.`,
              config.emojis.volume
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // QUEUE
      // ======================================================

      if (
        commandName === 'queue'
      ) {
        const player =
          riffy.players.get(
            guild.id
          );

        if (!player) {
          return interaction.reply({
            content:
              `${config.emojis.error} Aucun lecteur trouvé.`,
            ephemeral: true
          });
        }

        return interaction.reply({
          components: [
            createQueueContainer(
              player
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // NOW PLAYING
      // ======================================================

      if (
        commandName === 'nowplaying'
      ) {
        const player =
          riffy.players.get(
            guild.id
          );

        if (
          !player ||
          !player.current
        ) {
          return interaction.reply({
            content:
              `${config.emojis.error} Aucune musique en cours.`,
            ephemeral: true
          });
        }

        return interaction.reply({
          components: [
            createNowPlayingContainer(
              player,
              player.current
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // SHUFFLE
      // ======================================================

      if (
        commandName === 'shuffle'
      ) {
        const player =
          riffy.players.get(
            guild.id
          );

        if (!player) {
          return interaction.reply({
            content:
              `${config.emojis.error} Aucun lecteur trouvé.`,
            ephemeral: true
          });
        }

        if (
          player.queue.length === 0
        ) {
          return interaction.reply({
            content:
              `${config.emojis.error} La file est vide.`,
            ephemeral: true
          });
        }

        player.queue.shuffle();

        return interaction.reply({
          components: [
            createSimpleContainer(
              'File mélangée',
              'La file d’attente a été mélangée.',
              config.emojis.shuffle
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // LOOP
      // ======================================================

      if (
        commandName === 'loop'
      ) {
        const player =
          riffy.players.get(
            guild.id
          );

        if (!player) {
          return interaction.reply({
            content:
              `${config.emojis.error} Aucun lecteur trouvé.`,
            ephemeral: true
          });
        }

        const mode =
          options.getString(
            'mode'
          );

        player.setLoop(mode);

        return interaction.reply({
          components: [
            createSimpleContainer(
              'Boucle',
              `Mode de répétition : **${mode}**.`,
              config.emojis.loop
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // REMOVE
      // ======================================================

      if (
        commandName === 'remove'
      ) {
        const player =
          riffy.players.get(
            guild.id
          );

        if (!player) {
          return interaction.reply({
            content:
              `${config.emojis.error} Aucun lecteur trouvé.`,
            ephemeral: true
          });
        }

        const position =
          options.getInteger(
            'position'
          ) - 1;

        if (
          position < 0 ||
          position >=
          player.queue.length
        ) {
          return interaction.reply({
            content:
              `${config.emojis.error} Position invalide.`,
            ephemeral: true
          });
        }

        const removed =
          player.queue.remove(
            position
          );

        return interaction.reply({
          components: [
            createSimpleContainer(
              'Musique supprimée',
              `**${removed.info.title}** a été supprimée.`,
              config.emojis.success
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // MOVE
      // ======================================================

      if (
        commandName === 'move'
      ) {
        const player =
          riffy.players.get(
            guild.id
          );

        if (!player) {
          return interaction.reply({
            content:
              `${config.emojis.error} Aucun lecteur trouvé.`,
            ephemeral: true
          });
        }

        const from =
          options.getInteger(
            'from'
          ) - 1;

        const to =
          options.getInteger(
            'to'
          ) - 1;

        if (
          from < 0 ||
          from >= player.queue.length ||
          to < 0 ||
          to >= player.queue.length
        ) {
          return interaction.reply({
            content:
              `${config.emojis.error} Position invalide.`,
            ephemeral: true
          });
        }

        const track =
          player.queue.remove(
            from
          );

        player.queue.splice(
          to,
          0,
          track
        );

        return interaction.reply({
          components: [
            createSimpleContainer(
              'Musique déplacée',
              `**${track.info.title}** a été déplacée.`,
              config.emojis.success
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // CLEAR QUEUE
      // ======================================================

      if (
        commandName === 'clearqueue'
      ) {
        const player =
          riffy.players.get(
            guild.id
          );

        if (!player) {
          return interaction.reply({
            content:
              `${config.emojis.error} Aucun lecteur trouvé.`,
            ephemeral: true
          });
        }

        player.queue.clear();

        return interaction.reply({
          components: [
            createSimpleContainer(
              'File vidée',
              'La file d’attente a été vidée.',
              config.emojis.success
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // 24/7
      // ======================================================

      if (
        commandName === '247'
      ) {
        if (
          !member.voice?.channel
        ) {
          return interaction.reply({
            content:
              `${config.emojis.error} Tu dois être dans un canal vocal.`,
            ephemeral: true
          });
        }

        if (
          queue247.has(guild.id)
        ) {
          queue247.delete(
            guild.id
          );

          return interaction.reply({
            components: [
              createSimpleContainer(
                'Mode 24/7 désactivé',
                'Le bot ne restera plus connecté au vocal.',
                config.emojis.success
              )
            ],
            flags:
              MessageFlags.IsComponentsV2
          });
        }

        queue247.add(
          guild.id
        );

        let player =
          riffy.players.get(
            guild.id
          );

        if (!player) {
          riffy.createConnection({
            guildId: guild.id,
            voiceChannel:
              member.voice.channel.id,
            textChannel:
              channel.id,
            deaf: true
          });
        }

        return interaction.reply({
          components: [
            createSimpleContainer(
              'Mode 24/7 activé',
              'Le bot restera connecté au canal vocal.',
              config.emojis.success
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // STATS
      // ======================================================

      if (
        commandName === 'stats'
      ) {
        return interaction.reply({
          components: [
            createStatsContainer()
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // PING
      // ======================================================

      if (
        commandName === 'ping'
      ) {
        return interaction.reply({
          components: [
            createSimpleContainer(
              'Pong !',
              `Latence : **${client.ws.ping}ms**`,
              config.emojis.info
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // INVITE
      // ======================================================

      if (
        commandName === 'invite'
      ) {
        const invite =
          `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}` +
          `&permissions=3165184&scope=bot%20applications.commands`;

        const container =
          new ContainerBuilder()
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder()
                    .setContent(
                      `## ${config.emojis.success} Inviter le bot\n[Cliquer ici pour m'inviter](${invite})`
                    )
                )
                .setThumbnailAccessory(
                  new ThumbnailBuilder()
                    .setURL(
                      getUserAvatar()
                    )
                    .setDescription(
                      'Inviter le bot'
                    )
                )
            )
            .addSeparatorComponents(
              new SeparatorBuilder()
                .setSpacing(
                  SeparatorSpacingSize.Small
                )
                .setDivider(true)
            )
            .addActionRowComponents(
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setLabel(
                      'Inviter le bot'
                    )
                    .setStyle(
                      ButtonStyle.Link
                    )
                    .setURL(invite)
                )
            );

        return interaction.reply({
          components: [container],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // SUPPORT
      // ======================================================

      if (
        commandName === 'support'
      ) {
        const container =
          new ContainerBuilder()
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder()
                    .setContent(
                      `## ${config.emojis.info} Serveur d'assistance\n[Rejoindre le serveur support](${config.supportServer})`
                    )
                )
                .setThumbnailAccessory(
                  new ThumbnailBuilder()
                    .setURL(
                      getUserAvatar()
                    )
                    .setDescription(
                      'Support'
                    )
                )
            )
            .addSeparatorComponents(
              new SeparatorBuilder()
                .setSpacing(
                  SeparatorSpacingSize.Small
                )
                .setDivider(true)
            )
            .addActionRowComponents(
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setLabel(
                      'Support'
                    )
                    .setStyle(
                      ButtonStyle.Link
                    )
                    .setURL(
                      config.supportServer
                    )
                )
            );

        return interaction.reply({
          components: [container],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      // ======================================================
      // HELP
      // ======================================================

      if (
        commandName === 'help'
      ) {
        return interaction.reply({
          components: [
            createHelpContainer()
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

    } catch (error) {
      console.error(
        `${config.emojis.error} Erreur interaction :`,
        error
      );

      if (
        interaction.deferred
      ) {
        await interaction.editReply({
          content:
            `${config.emojis.error} Une erreur est survenue.`
        }).catch(() => {});
      } else if (
        !interaction.replied
      ) {
        await interaction.reply({
          content:
            `${config.emojis.error} Une erreur est survenue.`,
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
);

// ============================================================
// COMMANDES PREFIX
// ============================================================

if (config.enablePrefix) {
  client.on(
    'messageCreate',
    async (message) => {
      if (
        message.author.bot ||
        !message.guild
      ) {
        return;
      }

      if (
        !message.content.startsWith(
          config.prefix
        )
      ) {
        return;
      }

      const args =
        message.content
          .slice(config.prefix.length)
          .trim()
          .split(/\s+/);

      let command =
        args.shift()
          ?.toLowerCase();

      if (!command) {
        return;
      }

      for (
        const [
          cmd,
          aliases
        ] of Object.entries(
          config.aliases
        )
      ) {
        if (
          aliases.includes(
            command
          )
        ) {
          command = cmd;
          break;
        }
      }

      // ========================================================
      // PLAY PREFIX
      // ========================================================

      if (
        command === 'play'
      ) {
        const query =
          args.join(' ');

        if (!query) {
          return message.reply(
            `${config.emojis.error} Indique une musique ou une URL.`
          );
        }

        if (
          !message.member.voice?.channel
        ) {
          return message.reply(
            `${config.emojis.error} Tu dois être dans un canal vocal.`
          );
        }

        if (
          !isLavalinkConnected
        ) {
          return message.reply(
            `${config.emojis.error} Lavalink n'est pas connecté.`
          );
        }

        try {
          let player =
            riffy.players.get(
              message.guild.id
            );

          if (!player) {
            player =
              riffy.createConnection({
                guildId:
                  message.guild.id,
                voiceChannel:
                  message.member.voice
                    .channel.id,
                textChannel:
                  message.channel.id,
                deaf: true
              });
          }

          const result =
            await riffy.resolve({
              query,
              requester:
                message.author.id
            });

          if (
            !result ||
            !result.tracks ||
            result.tracks.length === 0
          ) {
            return message.reply(
              `${config.emojis.error} Aucun résultat trouvé.`
            );
          }

          if (
            result.loadType ===
            'playlist'
          ) {
            for (
              const track of result.tracks
            ) {
              track.info.requester =
                message.author.id;

              player.queue.add(
                track
              );
            }

            await message.reply({
              components: [
                createSimpleContainer(
                  'Playlist ajoutée',
                  `**${result.playlistInfo?.name || 'Playlist'}** — ${result.tracks.length} piste(s).`,
                  config.emojis.success
                )
              ],
              flags:
                MessageFlags.IsComponentsV2
            });
          } else {
            const track =
              result.tracks[0];

            track.info.requester =
              message.author.id;

            player.queue.add(
              track
            );

            await message.reply({
              components: [
                createSimpleContainer(
                  'Musique ajoutée',
                  `**[${track.info.title}](${track.info.uri})**`,
                  config.emojis.success
                )
              ],
              flags:
                MessageFlags.IsComponentsV2
            });
          }

          if (
            !player.playing &&
            !player.paused
          ) {
            player.play();
          }

        } catch (error) {
          console.error(
            'Erreur play prefix :',
            error
          );

          await message.reply(
            `${config.emojis.error} Une erreur est survenue pendant la lecture.`
          );
        }

        return;
      }

      // ========================================================
      // COMMANDES PREFIX SIMPLES
      // ========================================================

      const player =
        riffy.players.get(
          message.guild.id
        );

      if (
        command === 'pause'
      ) {
        if (!player) {
          return message.reply(
            `${config.emojis.error} Aucun lecteur trouvé.`
          );
        }

        player.pause(true);

        return message.reply({
          components: [
            createSimpleContainer(
              'Pause',
              'Musique mise en pause.',
              config.emojis.pause
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'resume'
      ) {
        if (!player) {
          return message.reply(
            `${config.emojis.error} Aucun lecteur trouvé.`
          );
        }

        player.pause(false);

        return message.reply({
          components: [
            createSimpleContainer(
              'Lecture reprise',
              'La musique reprend.',
              config.emojis.play
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'skip'
      ) {
        if (!player) {
          return message.reply(
            `${config.emojis.error} Aucun lecteur trouvé.`
          );
        }

        player.stop();

        return message.reply({
          components: [
            createSimpleContainer(
              'Musique suivante',
              'Passage à la piste suivante.',
              config.emojis.skip
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'stop'
      ) {
        if (!player) {
          return message.reply(
            `${config.emojis.error} Aucun lecteur trouvé.`
          );
        }

        player.destroy();

        return message.reply({
          components: [
            createSimpleContainer(
              'Lecture arrêtée',
              'La lecture a été arrêtée.',
              config.emojis.stop
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'volume'
      ) {
        if (!player) {
          return message.reply(
            `${config.emojis.error} Aucun lecteur trouvé.`
          );
        }

        const volume =
          parseInt(
            args[0],
            10
          );

        if (
          Number.isNaN(volume) ||
          volume < 1 ||
          volume > 100
        ) {
          return message.reply(
            `${config.emojis.error} Indique un volume entre 1 et 100.`
          );
        }

        player.setVolume(
          volume
        );

        return message.reply({
          components: [
            createSimpleContainer(
              'Volume',
              `Volume réglé sur **${volume}%**.`,
              config.emojis.volume
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'queue'
      ) {
        if (!player) {
          return message.reply(
            `${config.emojis.error} Aucun lecteur trouvé.`
          );
        }

        return message.reply({
          components: [
            createQueueContainer(
              player
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'nowplaying'
      ) {
        if (
          !player ||
          !player.current
        ) {
          return message.reply(
            `${config.emojis.error} Aucune musique en cours.`
          );
        }

        return message.reply({
          components: [
            createNowPlayingContainer(
              player,
              player.current
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'shuffle'
      ) {
        if (!player) {
          return message.reply(
            `${config.emojis.error} Aucun lecteur trouvé.`
          );
        }

        if (
          player.queue.length === 0
        ) {
          return message.reply(
            `${config.emojis.error} La file est vide.`
          );
        }

        player.queue.shuffle();

        return message.reply({
          components: [
            createSimpleContainer(
              'File mélangée',
              'La file a été mélangée.',
              config.emojis.shuffle
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'loop'
      ) {
        if (!player) {
          return message.reply(
            `${config.emojis.error} Aucun lecteur trouvé.`
          );
        }

        const mode =
          args[0]?.toLowerCase();

        if (
          ![
            'none',
            'track',
            'queue'
          ].includes(mode)
        ) {
          return message.reply(
            `${config.emojis.error} Utilise : \`!loop none\`, \`!loop track\` ou \`!loop queue\`.`
          );
        }

        player.setLoop(
          mode
        );

        return message.reply({
          components: [
            createSimpleContainer(
              'Boucle',
              `Mode : **${mode}**.`,
              config.emojis.loop
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'clearqueue'
      ) {
        if (!player) {
          return message.reply(
            `${config.emojis.error} Aucun lecteur trouvé.`
          );
        }

        player.queue.clear();

        return message.reply({
          components: [
            createSimpleContainer(
              'File vidée',
              'La file d’attente a été vidée.',
              config.emojis.success
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === '247'
      ) {
        if (
          !message.member.voice?.channel
        ) {
          return message.reply(
            `${config.emojis.error} Tu dois être dans un canal vocal.`
          );
        }

        if (
          queue247.has(
            message.guild.id
          )
        ) {
          queue247.delete(
            message.guild.id
          );

          return message.reply({
            components: [
              createSimpleContainer(
                '24/7 désactivé',
                'Le mode 24/7 est désactivé.',
                config.emojis.success
              )
            ],
            flags:
              MessageFlags.IsComponentsV2
          });
        }

        queue247.add(
          message.guild.id
        );

        if (!player) {
          riffy.createConnection({
            guildId:
              message.guild.id,
            voiceChannel:
              message.member.voice
                .channel.id,
            textChannel:
              message.channel.id,
            deaf: true
          });
        }

        return message.reply({
          components: [
            createSimpleContainer(
              '24/7 activé',
              'Le bot restera connecté au canal vocal.',
              config.emojis.success
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'stats'
      ) {
        return message.reply({
          components: [
            createStatsContainer()
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'ping'
      ) {
        return message.reply({
          components: [
            createSimpleContainer(
              'Pong !',
              `Latence : **${client.ws.ping}ms**`,
              config.emojis.info
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'invite'
      ) {
        const invite =
          `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}` +
          `&permissions=3165184&scope=bot%20applications.commands`;

        return message.reply({
          components: [
            createSimpleContainer(
              'Inviter le bot',
              `[Cliquer ici pour m'inviter](${invite})`,
              config.emojis.success
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'support'
      ) {
        return message.reply({
          components: [
            createSimpleContainer(
              'Serveur support',
              `[Rejoindre notre serveur d'assistance](${config.supportServer})`,
              config.emojis.info
            )
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }

      if (
        command === 'help'
      ) {
        return message.reply({
          components: [
            createHelpContainer()
          ],
          flags:
            MessageFlags.IsComponentsV2
        });
      }
    }
  );
}

// ============================================================
// DÉMARRAGE
// ============================================================

startExpressServer();

if (!config.token) {
  console.error(
    `${config.emojis.error} DISCORD_TOKEN est introuvable dans les variables d'environnement.`
  );

  process.exit(1);
}

client.login(
  config.token
).catch((error) => {
  console.error(
    `${config.emojis.error} Impossible de connecter le bot :`,
    error
  );

  process.exit(1);
});

// ============================================================
// ERREURS GLOBALES
// ============================================================

process.on(
  'unhandledRejection',
  (error) => {
    console.error(
      'Unhandled Promise Rejection:',
      error
    );
  }
);

process.on(
  'uncaughtException',
  (error) => {
    console.error(
      'Uncaught Exception:',
      error
    );
  }
);
