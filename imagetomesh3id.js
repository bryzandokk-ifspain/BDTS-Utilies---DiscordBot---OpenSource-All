const {
  SlashCommandBuilder,
  AttachmentBuilder,
  PermissionFlagsBits
} = require('discord.js');

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);


// ====================== CONFIGURACIÓN ======================

const VALID_SIZES = [
  16,
  32,
  64,
  128,
  256,
  512
];

const FINAL_SIZE = 512;

const BLENDER_PATH =
  `"C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe"`;

const UNIVERSE_ID =
  '10764746325';

const PLACE_ID =
  '113531224892646';


// ============================================================
// COMANDO
// ============================================================

module.exports = {

  data: new SlashCommandBuilder()
    .setName('imagetomesh3id')
    .setDescription(
      'Convierte una imagen cuadrada en un mesh 3D estilo Minecraft y sube MeshId + TextureId'
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    )
    .addAttachmentOption(option =>
      option
        .setName('imagen')
        .setDescription(
          'Imagen cuadrada (16x16 hasta 512x512)'
        )
        .setRequired(true)
    ),


  // ==========================================================
  // EJECUTAR COMANDO
  // ==========================================================

  async execute(interaction) {

    await interaction.deferReply();


    const attachment =
      interaction.options.getAttachment(
        'imagen'
      );


    if (
      !attachment.contentType?.startsWith(
        'image/'
      )
    ) {

      return interaction.editReply(
        '❌ Solo se aceptan imágenes.'
      );
    }


    const tempDir =
      path.join(
        __dirname,
        '..',
        'temp'
      );


    if (
      !fs.existsSync(
        tempDir
      )
    ) {

      fs.mkdirSync(
        tempDir,
        {
          recursive: true
        }
      );
    }


    const timestamp =
      Date.now();


    const originalPath =
      path.join(
        tempDir,
        `original_${timestamp}.png`
      );


    const texturePath =
      path.join(
        tempDir,
        `texture_${timestamp}.png`
      );


    const objPath =
      path.join(
        tempDir,
        `mesh_${timestamp}.obj`
      );


    const fbxPath =
      path.join(
        tempDir,
        `mesh_${timestamp}.fbx`
      );


    try {

      // ========================================================
      // DESCARGAR IMAGEN
      // ========================================================

      const response =
        await axios.get(
          attachment.url,
          {
            responseType:
              'arraybuffer'
          }
        );


      fs.writeFileSync(
        originalPath,
        Buffer.from(
          response.data
        )
      );


      // ========================================================
      // LEER TAMAÑO
      // ========================================================

      const metadata =
        await sharp(
          originalPath
        ).metadata();


      const {
        width,
        height
      } = metadata;


      if (
        width !== height ||
        !VALID_SIZES.includes(
          width
        )
      ) {

        return interaction.editReply(
          `❌ La imagen debe ser **cuadrada** y de uno de estos tamaños:\n` +
          `\`${VALID_SIZES.join('x, ')}x\`\n\n` +
          `Tu imagen es: **${width}x${height}**`
        );
      }


      // ========================================================
      // GENERAR OBJ
      // ========================================================

      await interaction.editReply(
        '⏳ Generando modelo 3D...'
      );


      await generateObjMesh(
        originalPath,
        objPath,
        width
      );


      // ========================================================
      // GENERAR TEXTURA
      // ========================================================

      await sharp(
        originalPath
      )
        .resize(
          FINAL_SIZE,
          FINAL_SIZE,
          {
            kernel:
              sharp.kernel.nearest
          }
        )
        .png()
        .toFile(
          texturePath
        );


      // ========================================================
      // SUBIR TEXTURA
      // ========================================================

      await interaction.editReply(
        '⏳ Subiendo textura...'
      );


      const textureId =
        await uploadAsset(
          texturePath,
          'Image',
          `Texture_${timestamp}`
        );


      // ========================================================
      // CONVERTIR OBJ → FBX
      // ========================================================

      await interaction.editReply(
        '⏳ Convirtiendo a FBX con Blender + Solidify...'
      );


      await convertObjToFbx(
        objPath,
        fbxPath
      );


      // ========================================================
      // SUBIR MODEL
      // ========================================================

      await interaction.editReply(
        '⏳ Subiendo Model a Roblox...'
      );


      const modelId =
        await uploadAsset(
          fbxPath,
          'Model',
          `MinecraftMesh_${timestamp}`
        );


      // ========================================================
      // OBTENER MESH ID
      // ========================================================

      await interaction.editReply(
        '⏳ Extrayendo MeshId + aplicando Open Use...'
      );


      const meshId =
        await extractMeshIdWithLuau(
          modelId
        );


      // ========================================================
      // RESULTADO
      // ========================================================

      await interaction.editReply({

        content:
          `✅ **¡Modelo generado y subido!**\n\n` +

          `**MeshId:** \`rbxassetid://${meshId}\`\n` +

          `**Texture ID:** \`rbxassetid://${textureId}\`\n` +

          `**Modelo:** ${width}x${width}\n\n` +

          `Ya puedes usarlo directamente en Studio:\n` +

          `1. Crea un MeshPart\n` +

          `2. Pega el MeshId\n` +

          `3. Pega el TextureId en TextureID`
      });


    } catch (error) {

      console.error(
        '[ERROR] /imagetomesh3id:',
        error
      );


      await interaction.editReply(
        `❌ Error: ${
          error.message ||
          'Ocurrió un error'
        }`
      );


    } finally {

      // ========================================================
      // LIMPIAR ARCHIVOS
      // ========================================================

      [
        originalPath,
        texturePath,
        objPath,
        fbxPath
      ].forEach(
        p => {

          try {

            if (
              fs.existsSync(
                p
              )
            ) {

              fs.unlinkSync(
                p
              );
            }

          } catch (e) {}
        }
      );
    }
  }
};


// ============================================================
// GENERAR OBJ
// ============================================================

async function generateObjMesh(
  imagePath,
  outputPath,
  size
) {

  const {
    data
  } = await sharp(
    imagePath
  )
    .ensureAlpha()
    .raw()
    .toBuffer({
      resolveWithObject:
        true
    });


  const SCALE =
    0.13;


  let obj =
    `# Minecraft style mesh - RobloxImageBot\n`;

  obj +=
    `o MinecraftItem\n`;


  let vertexCount =
    0;


  for (
    let y = 0;
    y < size;
    y++
  ) {

    for (
      let x = 0;
      x < size;
      x++
    ) {

      const idx =
        (y * size + x) * 4;


      const alpha =
        data[idx + 3];


      if (
        alpha > 20
      ) {

        const px =
          (x - size / 2) *
          SCALE;


        const py =
          ((size - y - 1) -
            size / 2) *
          SCALE;


        const pz =
          0;


        obj +=
          `v ${px.toFixed(5)} ${py.toFixed(5)} ${pz.toFixed(5)}\n`;


        obj +=
          `v ${(px + SCALE).toFixed(5)} ${py.toFixed(5)} ${pz.toFixed(5)}\n`;


        obj +=
          `v ${(px + SCALE).toFixed(5)} ${(py + SCALE).toFixed(5)} ${pz.toFixed(5)}\n`;


        obj +=
          `v ${px.toFixed(5)} ${(py + SCALE).toFixed(5)} ${pz.toFixed(5)}\n`;


        const u1 =
          x / size;


        const u2 =
          (x + 1) / size;


        const v1 =
          1 - (y + 1) / size;


        const v2 =
          1 - y / size;


        obj +=
          `vt ${u1.toFixed(5)} ${v1.toFixed(5)}\n`;


        obj +=
          `vt ${u2.toFixed(5)} ${v1.toFixed(5)}\n`;


        obj +=
          `vt ${u2.toFixed(5)} ${v2.toFixed(5)}\n`;


        obj +=
          `vt ${u1.toFixed(5)} ${v2.toFixed(5)}\n`;


        vertexCount += 4;
      }
    }
  }


  if (
    vertexCount === 0
  ) {

    throw new Error(
      'La imagen no tiene píxeles visibles'
    );
  }


  let uvIndex =
    1;


  for (
    let i = 0;
    i < vertexCount;
    i += 4
  ) {

    const b =
      i + 1;


    obj +=
      `f ${b}/${uvIndex} ${b + 1}/${uvIndex + 1} ${b + 2}/${uvIndex + 2}\n`;


    obj +=
      `f ${b}/${uvIndex} ${b + 2}/${uvIndex + 2} ${b + 3}/${uvIndex + 3}\n`;


    uvIndex += 4;
  }


  fs.writeFileSync(
    outputPath,
    obj
  );
}


// ============================================================
// CONVERTIR OBJ → FBX
// ============================================================

async function convertObjToFbx(
  objPath,
  fbxPath
) {

  const scriptPath =
    path.join(
      __dirname,
      '..',
      'convert_obj_to_fbx.py'
    );


  const command =
    `${BLENDER_PATH} --background --python "${scriptPath}" -- "${objPath}" "${fbxPath}"`;


  try {

    const {
      stdout,
      stderr
    } =
      await execPromise(
        command,
        {
          timeout:
            60000
        }
      );


    console.log(
      'Blender output:',
      stdout
    );


    if (
      stderr
    ) {

      console.warn(
        'Blender stderr:',
        stderr
      );
    }


  } catch (err) {

    throw new Error(
      `Error al convertir con Blender: ${err.message}`
    );
  }


  if (
    !fs.existsSync(
      fbxPath
    )
  ) {

    throw new Error(
      'No se generó el archivo FBX'
    );
  }
}


// ============================================================
// SUBIR ASSET
// ============================================================

async function uploadAsset(
  filePath,
  assetType,
  name
) {

  const apiKey =
    process.env.ROBLOX_API_KEY;


  const creatorId =
    process.env.ROBLOX_CREATOR_ID;


  const isGroup =
    process.env.ROBLOX_IS_GROUP === 'true';


  if (
    !apiKey ||
    !creatorId
  ) {

    throw new Error(
      'Faltan ROBLOX_API_KEY o ROBLOX_CREATOR_ID en el .env'
    );
  }


  const form =
    new FormData();


  form.append(
    'request',
    JSON.stringify({

      assetType:
        assetType,

      displayName:
        name,

      description:
        'Generado por RobloxImageBot',

      creationContext: {

        creator:
          isGroup

            ? {
                groupId:
                  Number(
                    creatorId
                  )
              }

            : {
                userId:
                  Number(
                    creatorId
                  )
              }
      }
    })
  );


  const contentType =
    assetType === 'Model'
      ? 'model/fbx'
      : 'image/png';


  form.append(
    'fileContent',
    fs.createReadStream(
      filePath
    ),
    {
      contentType:
        contentType
    }
  );


  const createRes =
    await axios.post(
      'https://apis.roblox.com/assets/v1/assets',
      form,
      {
        headers: {

          ...form.getHeaders(),

          'x-api-key':
            apiKey
        },

        maxContentLength:
          Infinity,

        maxBodyLength:
          Infinity
      }
    );


  const operationPath =
    createRes.data.path;


  let assetId =
    null;


  for (
    let i = 0;
    i < 40;
    i++
  ) {

    await new Promise(
      r =>
        setTimeout(
          r,
          2500
        )
    );


    const statusRes =
      await axios.get(
        `https://apis.roblox.com/assets/v1/${operationPath}`,
        {
          headers: {
            'x-api-key':
              apiKey
          }
        }
      );


    if (
      statusRes.data.done
    ) {

      if (
        statusRes.data.response?.assetId
      ) {

        assetId =
          statusRes.data.response.assetId;

        break;

      } else if (
        statusRes.data.error
      ) {

        throw new Error(
          statusRes.data.error.message ||
          'Error al subir'
        );
      }
    }
  }


  if (
    !assetId
  ) {

    throw new Error(
      'Tiempo de espera agotado al subir a Roblox'
    );
  }


  // ==========================================================
  // OPEN USE
  // ==========================================================

  try {

    await axios.patch(
      'https://apis.roblox.com/asset-permissions-api/v1/assets/permissions',
      {
        subjectType:
          'All',

        subjectId:
          null,

        action:
          'Use',

        requests: [
          {
            assetId:
              Number(
                assetId
              )
          }
        ]
      },
      {
        headers: {

          'x-api-key':
            apiKey,

          'Content-Type':
            'application/json'
        }
      }
    );


  } catch (err) {

    console.warn(
      'No se pudo aplicar Open Use al asset principal:',
      err.response?.data ||
      err.message
    );
  }


  return assetId;
}


// ============================================================
// LUAU + OPEN USE AL MESHID
// ============================================================

async function extractMeshIdWithLuau(
  modelId
) {

  const apiKey =
    process.env.ROBLOX_API_KEY;


  const luauScript = `

local InsertService = game:GetService("InsertService")

local success, result = pcall(function()

  local model =
    InsertService:LoadAsset(${modelId})

  local meshPart =
    model:FindFirstChildWhichIsA("MeshPart", true)

  if not meshPart then

    for _, desc in ipairs(model:GetDescendants()) do

      if desc:IsA("MeshPart") then

        meshPart = desc

        break

      end

    end

  end

  if not meshPart then

    error("No se encontró ningún MeshPart en el Model")

  end

  local meshId =
    meshPart.MeshId

  print(
    "MeshId completo:",
    meshId
  )

  local id =
    string.match(
      tostring(meshId),
      "%d+"
    )

  if not id then

    error(
      "No se pudo extraer el ID numérico del MeshId: " ..
      tostring(meshId)
    )

  end

  return id

end)

if success then

  return result

else

  error(
    tostring(result)
  )

end
`;


  const createRes =
    await axios.post(
      `https://apis.roblox.com/cloud/v2/universes/${UNIVERSE_ID}/places/${PLACE_ID}/luau-execution-session-tasks`,
      {
        script:
          luauScript
      },
      {
        headers: {

          'x-api-key':
            apiKey,

          'Content-Type':
            'application/json'
        }
      }
    );


  const taskPath =
    createRes.data.path;


  let meshId =
    null;


  for (
    let i = 0;
    i < 30;
    i++
  ) {

    await new Promise(
      r =>
        setTimeout(
          r,
          3000
        )
    );


    const statusRes =
      await axios.get(
        `https://apis.roblox.com/cloud/v2/${taskPath}`,
        {
          headers: {
            'x-api-key':
              apiKey
          }
        }
      );


    const state =
      statusRes.data.state;


    if (
      state === 'COMPLETE'
    ) {

      const results =
        statusRes.data.output?.results;


      if (
        results &&
        results[0]
      ) {

        meshId =
          results[0];

        break;
      }


      throw new Error(
        'Luau no devolvió MeshId'
      );
    }


    if (
      state === 'FAILED' ||
      state === 'CANCELLED'
    ) {

      const errorMsg =
        statusRes.data.error?.message ||
        'Error desconocido en Luau';


      throw new Error(
        `Luau falló: ${errorMsg}`
      );
    }
  }


  if (
    !meshId
  ) {

    throw new Error(
      'Tiempo de espera agotado en Luau Execution'
    );
  }


  // ==========================================================
  // OPEN USE DEL MESHID
  // ==========================================================

  console.log(
    'Aplicando Open Use al MeshId:',
    meshId
  );


  try {

    await axios.patch(
      'https://apis.roblox.com/asset-permissions-api/v1/assets/permissions',
      {
        subjectType:
          'All',

        subjectId:
          null,

        action:
          'Use',

        requests: [
          {
            assetId:
              Number(
                meshId
              )
          }
        ]
      },
      {
        headers: {

          'x-api-key':
            apiKey,

          'Content-Type':
            'application/json'
        }
      }
    );


    console.log(
      '✅ Open Use aplicado correctamente al MeshId'
    );


  } catch (err) {

    console.warn(
      '❌ No se pudo aplicar Open Use al MeshId:',
      err.response?.data ||
      err.message
    );
  }


  return meshId;
}