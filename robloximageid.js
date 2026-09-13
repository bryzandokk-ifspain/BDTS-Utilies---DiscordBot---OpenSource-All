const { SlashCommandBuilder } = require('discord.js');
const FormData = require('form-data');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('robloximageid')
    .setDescription('Sube una imagen a Roblox como Uso Abierto y te da el ID que funciona')
    .addAttachmentOption(option =>
      option
        .setName('imagen')
        .setDescription('Arrastra o selecciona la imagen')
        .setRequired(true)
    ),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment('imagen');

    if (!attachment.contentType?.startsWith('image/')) {
      return interaction.reply({
        content: '❌ Solo se permiten imágenes (PNG, JPG, WEBP, etc.).',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      // 1. Descargar la imagen
      const imageResponse = await axios.get(attachment.url, {
        responseType: 'arraybuffer'
      });
      const imageBuffer = Buffer.from(imageResponse.data);

      // 2. Preparar FormData
      const form = new FormData();

      const requestData = {
        assetType: 'Image',
        displayName: attachment.name.replace(/\.[^/.]+$/, '') || 'UploadedImage',
        description: `Subido desde Discord por ${interaction.user.tag}`,
        creationContext: {
          creator: process.env.ROBLOX_IS_GROUP === 'true'
            ? { groupId: Number(process.env.ROBLOX_CREATOR_ID) }
            : { userId: Number(process.env.ROBLOX_CREATOR_ID) },
          expectedPrice: 0,
          assetPrivacy: 'openUse'   // ← Esto lo pone en Uso Abierto automáticamente
        }
      };

      form.append('request', JSON.stringify(requestData));
      form.append('fileContent', imageBuffer, {
        filename: attachment.name,
        contentType: attachment.contentType
      });

      // 3. Subir a Roblox
      const uploadResponse = await axios.post(
        'https://apis.roblox.com/assets/v1/assets',
        form,
        {
          headers: {
            'x-api-key': process.env.ROBLOX_API_KEY,
            ...form.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      const operationPath = uploadResponse.data.path;
      if (!operationPath) throw new Error('No se recibió operation path');

      // 4. Esperar a que termine
      let imageId = null;
      let attempts = 0;

      while (attempts < 30) {
        await new Promise(r => setTimeout(r, 2000));

        const opResponse = await axios.get(
          `https://apis.roblox.com/assets/v1/${operationPath}`,
          {
            headers: { 'x-api-key': process.env.ROBLOX_API_KEY }
          }
        );

        const opData = opResponse.data;

        if (opData.done) {
          if (opData.response?.assetId) {
            imageId = String(opData.response.assetId);
            break;
          }
          if (opData.error) {
            throw new Error(JSON.stringify(opData.error));
          }
        }
        attempts++;
      }

      if (!imageId) throw new Error('La subida tardó demasiado');

      // 5. Respuesta
      const embed = {
        color: 0x00FF88,
        title: '✅ Imagen subida como Uso Abierto',
        description: [
          `**Nombre:** \`${attachment.name}\``,
          '',
          `**Image ID (funcional):** \`${imageId}\``,
          '',
          '**Úsalo en Studio:**',
          `\`rbxassetid://${imageId}\``,
          '',
          'El asset se subió directamente en **Uso Abierto**.',
          'Ya debería funcionar sin tener que entrar al Dashboard.'
        ].join('\n'),
        image: { url: attachment.url },
        footer: { text: `Subido por ${interaction.user.tag}` },
        timestamp: new Date()
      };

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(error);
      const msg = error.response?.data
        ? JSON.stringify(error.response.data, null, 2)
        : error.message;

      await interaction.editReply({
        content: `❌ Error:\n\`\`\`${msg}\`\`\``
      });
    }
  }
};