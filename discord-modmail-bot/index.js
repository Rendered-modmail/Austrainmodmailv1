const {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
} = require("discord.js");
require("dotenv").config();

const requiredEnvVars = [
  "DISCORD_TOKEN",
  "GUILD_ID",
  "STAFF_ROLE_ID",
  "MODMAIL_CATEGORY_ID",
];

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const theme = {
  red: 0xc8102e,
  cream: 0xf7f1e8,
  gold: 0xc9a86a,
  dark: 0x3c1f1b,
};

const config = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  staffRoleId: process.env.STAFF_ROLE_ID,
  categoryId: process.env.MODMAIL_CATEGORY_ID,
  channelPrefix: process.env.TICKET_CHANNEL_PREFIX || "austrian-support",
  closeCommand: (process.env.STAFF_CLOSE_COMMAND || "!close").trim(),
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once("ready", () => {
  console.log(`Austrian Support Desk is online as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) {
      return;
    }

    if (message.channel.isDMBased()) {
      await handleGuestDm(message);
      return;
    }

    if (!message.inGuild() || message.guildId !== config.guildId) {
      return;
    }

    if (message.channel.parentId !== config.categoryId) {
      return;
    }

    if (!message.member?.roles?.cache?.has(config.staffRoleId)) {
      return;
    }

    if (message.content.trim().startsWith(config.closeCommand)) {
      await closeTicket(message);
      return;
    }

    await relayStaffReply(message);
  } catch (error) {
    console.error("Modmail failure:", error);

    if (message.channel.isDMBased()) {
      await message.reply(
        "We hit unexpected turbulence while opening your support request. Please try again in a moment."
      ).catch(() => null);
      return;
    }

    await message.reply("That message could not be processed. Check my permissions and try again.").catch(() => null);
  }
});

client.login(config.token);

async function handleGuestDm(message) {
  const content = message.content.trim();
  const hasAttachments = message.attachments.size > 0;

  if (!content && !hasAttachments) {
    await message.reply("Send a message or attachment and I'll open a support ticket for you.").catch(() => null);
    return;
  }

  const guild = await client.guilds.fetch(config.guildId);
  await guild.channels.fetch();

  const { channel: ticketChannel, created } = await getOrCreateTicketChannel(guild, message.author);

  await ticketChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(theme.red)
        .setAuthor({
          name: `${message.author.tag}`,
          iconURL: message.author.displayAvatarURL(),
        })
        .setTitle("Passenger Message")
        .setDescription(content || "*Attachment only*")
        .addFields(
          { name: "Passenger", value: `<@${message.author.id}>`, inline: true },
          { name: "Passenger ID", value: message.author.id, inline: true }
        )
        .setFooter({ text: "Austrian Support Desk inbound relay" })
        .setTimestamp(message.createdAt),
    ],
    files: toFiles(message),
  });

  const replyText = created
    ? "Welcome aboard Austrian Support Desk. Your support ticket is now open and our crew will reply here."
    : "Your message has been forwarded to the support crew.";

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(theme.gold)
        .setTitle("Ticket Opened")
        .setDescription(replyText)
        .setFooter({ text: "Please keep replying in this DM for the same ticket." }),
    ],
  }).catch(() => null);
}

async function getOrCreateTicketChannel(guild, user) {
  const existingChannel = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      channel.parentId === config.categoryId &&
      getUserIdFromTopic(channel.topic) === user.id
  );

  if (existingChannel) {
    return { channel: existingChannel, created: false };
  }

  const category = await guild.channels.fetch(config.categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error("MODMAIL_CATEGORY_ID must point to a Discord category channel.");
  }

  const safeUsername = user.username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18) || "guest";

  const channel = await guild.channels.create({
    name: `${config.channelPrefix}-${safeUsername}-${user.id.slice(-4)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `modmail:${user.id}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: config.staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
    ],
  });

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(theme.cream)
        .setTitle("Austrian Support Desk")
        .setDescription(
          [
            `Ticket opened for <@${user.id}>`,
            "",
            "Reply normally in this channel to answer the passenger.",
            `Use \`${config.closeCommand}\` to close the ticket.`,
          ].join("\n")
        )
        .addFields(
          { name: "Passenger Tag", value: user.tag, inline: true },
          { name: "Passenger ID", value: user.id, inline: true }
        )
        .setFooter({ text: "Vienna service lane" })
        .setTimestamp(),
    ],
  });

  return { channel, created: true };
}

async function relayStaffReply(message) {
  const userId = getUserIdFromTopic(message.channel.topic);
  if (!userId) {
    return;
  }

  const content = message.content.trim();
  const hasAttachments = message.attachments.size > 0;

  if (!content && !hasAttachments) {
    return;
  }

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    await message.reply("I could not find the passenger linked to this ticket anymore.").catch(() => null);
    return;
  }

  await user.send({
    embeds: [
      new EmbedBuilder()
        .setColor(theme.dark)
        .setAuthor({
          name: "Austrian Support Desk",
          iconURL: client.user.displayAvatarURL(),
        })
        .setTitle("Crew Reply")
        .setDescription(content || "*Attachment only*")
        .setFooter({ text: `Sent by ${message.member.displayName}` })
        .setTimestamp(message.createdAt),
    ],
    files: toFiles(message),
  });
}

async function closeTicket(message) {
  const userId = getUserIdFromTopic(message.channel.topic);
  if (!userId) {
    await message.reply("This channel is not linked to an active ticket.").catch(() => null);
    return;
  }

  const reason = message.content.trim().slice(config.closeCommand.length).trim();
  const user = await client.users.fetch(userId).catch(() => null);

  if (user) {
    const closeText = reason
      ? `Your Austrian Support Desk ticket has been closed.\nReason: ${reason}`
      : "Your Austrian Support Desk ticket has been closed.";

    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(theme.gold)
          .setTitle("Ticket Closed")
          .setDescription(closeText)
          .setFooter({ text: "Thank you for flying with Austrian Support Desk." })
          .setTimestamp(),
      ],
    }).catch(() => null);
  }

  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(theme.red)
        .setTitle("Closing Ticket")
        .setDescription("This support lane is now being closed.")
        .setTimestamp(),
    ],
  }).catch(() => null);

  await message.channel.delete(`Ticket closed by ${message.author.tag}`).catch(() => null);
}

function getUserIdFromTopic(topic) {
  if (!topic || !topic.startsWith("modmail:")) {
    return null;
  }

  const userId = topic.slice("modmail:".length).trim();
  return userId || null;
}

function toFiles(message) {
  return [...message.attachments.values()].map((attachment) => ({
    attachment: attachment.url,
    name: attachment.name || "attachment",
  }));
}
