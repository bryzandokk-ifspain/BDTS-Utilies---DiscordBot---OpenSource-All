const { 
  SlashCommandBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('robloxavatar3d')
    .setDescription('Muestra el avatar full body de un usuario de Roblox (por nombre o ID)'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('roblox_avatar3d_modal')
      .setTitle('Roblox Avatar');

    const input = new TextInputBuilder()
      .setCustomId('roblox_user')
      .setLabel('Nombre de usuario o ID de Roblox')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ejemplo: Builderman o 156')
      .setRequired(true)
      .setMaxLength(50);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  },
};