const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    AttachmentBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const archiverModule = require('archiver');

const archiver =
    typeof archiverModule === 'function'
        ? archiverModule
        : archiverModule.default;

const sharp = require('sharp');


// ============================================================
// CONFIGURACIÓN
// ============================================================

const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;

const TEMP_ROOT = path.join(__dirname, '..', 'temp');


// ============================================================
// COMANDO
// ============================================================

module.exports = {

    data: new SlashCommandBuilder()
        .setName('rblxavatarzip')
        .setDescription('Descarga el avatar 3D de un usuario de Roblox como ZIP.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),


    // ========================================================
    // ABRIR MODAL
    // ========================================================

    async execute(interaction) {

        const modal = new ModalBuilder()
            .setCustomId('rblxavatarzip_modal')
            .setTitle('Descargar Avatar 3D');

        const userInput = new TextInputBuilder()
            .setCustomId('roblox_user_zip')
            .setLabel('ID o nombre de usuario de Roblox')
            .setPlaceholder('Ejemplo: Builderman o 156')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

        const row = new ActionRowBuilder()
            .addComponents(userInput);

        modal.addComponents(row);

        await interaction.showModal(modal);
    },


    // ========================================================
    // PROCESAR MODAL
    // ========================================================

    async handleModal(interaction) {

        await interaction.deferReply();

        const input = interaction.fields
            .getTextInputValue('roblox_user_zip')
            .trim()
            .replace(/^@/, '');

        let userId = null;
        let username = null;
        let displayName = null;

        try {

            // ====================================================
            // COMPROBAR API KEY
            // ====================================================

            if (!ROBLOX_API_KEY) {
                throw new Error(
                    'No existe ROBLOX_API_KEY en el archivo .env'
                );
            }


            // ====================================================
            // 1. BUSCAR USUARIO
            // ====================================================

            console.log(
                `[INFO] Buscando usuario Roblox: ${input}`
            );

            if (/^\d+$/.test(input)) {

                userId = input;

                const userResponse = await axios.get(
                    `https://users.roblox.com/v1/users/${userId}`,
                    {
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'RobloxImageBot/1.0'
                        }
                    }
                );

                if (
                    !userResponse.data ||
                    !userResponse.data.id
                ) {
                    throw new Error(
                        'Usuario no encontrado.'
                    );
                }

                username = userResponse.data.name;
                displayName = userResponse.data.displayName;

            } else {

                const usernameResponse = await axios.post(
                    'https://users.roblox.com/v1/usernames/users',
                    {
                        usernames: [input],
                        excludeBannedUsers: false
                    },
                    {
                        timeout: 15000,
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'RobloxImageBot/1.0'
                        }
                    }
                );

                if (
                    !usernameResponse.data ||
                    !usernameResponse.data.data ||
                    usernameResponse.data.data.length === 0
                ) {
                    throw new Error(
                        'Usuario no encontrado.'
                    );
                }

                const user =
                    usernameResponse.data.data[0];

                userId = String(user.id);
                username = user.name;
                displayName =
                    user.displayName || user.name;
            }

            console.log(
                `[INFO] Usuario encontrado: ${username} (${userId})`
            );


            // ====================================================
            // 2. CREAR CARPETA TEMPORAL
            // ====================================================

            if (!fs.existsSync(TEMP_ROOT)) {

                fs.mkdirSync(
                    TEMP_ROOT,
                    {
                        recursive: true
                    }
                );
            }

            const jobId =
                `${Date.now()}_${Math.random()
                    .toString(36)
                    .slice(2, 8)}`;

            const jobDir =
                path.join(
                    TEMP_ROOT,
                    `avatar_${userId}_${jobId}`
                );

            fs.mkdirSync(
                jobDir,
                {
                    recursive: true
                }
            );

            const cleanup = () => {

                try {

                    if (fs.existsSync(jobDir)) {

                        fs.rmSync(
                            jobDir,
                            {
                                recursive: true,
                                force: true
                            }
                        );
                    }

                } catch (cleanupError) {

                    console.error(
                        '[WARN] No se pudo limpiar la carpeta temporal:',
                        cleanupError.message
                    );
                }
            };


            try {

                // ====================================================
                // 3. PEDIR AVATAR 3D
                // ====================================================

                console.log(
                    `[INFO] Pidiendo avatar 3D de ${username}...`
                );

                const avatarResponse =
                    await axios.get(
                        'https://thumbnails.roblox.com/v1/users/avatar-3d',
                        {
                            params: {
                                userId: userId
                            },

                            timeout: 20000,

                            headers: {
                                'x-api-key':
                                    ROBLOX_API_KEY,

                                'User-Agent':
                                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36',

                                'Accept':
                                    'application/json'
                            }
                        }
                    );

                const avatarData =
                    avatarResponse.data;

                if (!avatarData) {

                    throw new Error(
                        'Roblox no devolvió datos del avatar 3D.'
                    );
                }

                console.log(
                    '[INFO] Respuesta del avatar 3D recibida.'
                );


                // ====================================================
                // 4. OBTENER imageUrl
                // ====================================================

                if (!avatarData.imageUrl) {

                    console.log(
                        '[DEBUG] Respuesta completa:',
                        JSON.stringify(
                            avatarData,
                            null,
                            2
                        )
                    );

                    throw new Error(
                        'Roblox no devolvió imageUrl.'
                    );
                }

                console.log(
                    `[INFO] Descargando información 3D: ${avatarData.imageUrl}`
                );


                const modelResponse =
                    await axios.get(
                        avatarData.imageUrl,
                        {
                            timeout: 20000,
                            responseType: 'text',

                            headers: {
                                'User-Agent':
                                    'RobloxImageBot/1.0',

                                'Accept':
                                    'application/json'
                            }
                        }
                    );


                let modelData;

                try {

                    modelData =
                        typeof modelResponse.data === 'string'
                            ? JSON.parse(
                                modelResponse.data
                            )
                            : modelResponse.data;

                } catch (jsonError) {

                    console.error(
                        '[DEBUG] Respuesta recibida:',
                        String(
                            modelResponse.data
                        ).slice(0, 2000)
                    );

                    throw new Error(
                        'La respuesta 3D de Roblox no es un JSON válido.'
                    );
                }


                // ====================================================
                // 5. COMPROBAR OBJ / MTL / TEXTURAS
                // ====================================================

                if (!modelData.obj) {

                    throw new Error(
                        'Roblox no devolvió el archivo OBJ.'
                    );
                }

                if (!modelData.mtl) {

                    throw new Error(
                        'Roblox no devolvió el archivo MTL.'
                    );
                }

                const textures =
                    Array.isArray(
                        modelData.textures
                    )
                        ? modelData.textures
                        : [];


                console.log(
                    `[INFO] OBJ encontrado: ${modelData.obj}`
                );

                console.log(
                    `[INFO] MTL encontrado: ${modelData.mtl}`
                );

                console.log(
                    `[INFO] Texturas encontradas: ${textures.length}`
                );


                // ====================================================
                // FUNCIÓN CDN ROBLOX
                // ====================================================

                function getRobloxCDN(hash) {

                    if (
                        !hash ||
                        typeof hash !== 'string'
                    ) {

                        throw new Error(
                            'Hash de Roblox inválido.'
                        );
                    }

                    let i = 31;

                    const limit =
                        Math.min(
                            38,
                            hash.length
                        );

                    for (
                        let t = 0;
                        t < limit;
                        t++
                    ) {

                        i ^=
                            hash[t].charCodeAt(0);
                    }

                    const server =
                        ((i % 8) + 8) % 8;

                    return `https://t${server}.rbxcdn.com/${hash}`;
                }


                // ====================================================
                // 6. DESCARGAR OBJ
                // ====================================================

                console.log(
                    '[INFO] Descargando OBJ...'
                );

                const objUrl =
                    getRobloxCDN(
                        modelData.obj
                    );

                console.log(
                    `[INFO] OBJ URL: ${objUrl}`
                );

                const objResponse =
                    await axios.get(
                        objUrl,
                        {
                            timeout: 30000,
                            responseType: 'text',

                            headers: {
                                'User-Agent':
                                    'RobloxImageBot/1.0'
                            }
                        }
                    );

                const objPath =
                    path.join(
                        jobDir,
                        'avatar.obj'
                    );

                fs.writeFileSync(
                    objPath,
                    objResponse.data,
                    'utf8'
                );

                console.log(
                    '[OK] OBJ descargado.'
                );


                // ====================================================
                // 7. DESCARGAR MTL
                // ====================================================

                console.log(
                    '[INFO] Descargando MTL...'
                );

                const mtlUrl =
                    getRobloxCDN(
                        modelData.mtl
                    );

                console.log(
                    `[INFO] MTL URL: ${mtlUrl}`
                );

                const mtlResponse =
                    await axios.get(
                        mtlUrl,
                        {
                            timeout: 30000,
                            responseType: 'text',

                            headers: {
                                'User-Agent':
                                    'RobloxImageBot/1.0'
                            }
                        }
                    );

                let mtlText =
                    mtlResponse.data;


                // ====================================================
                // 8. DESCARGAR TEXTURAS
                // ====================================================

                console.log(
                    `[INFO] Descargando ${textures.length} texturas...`
                );

                const textureFiles = [];


                for (
                    let i = 0;
                    i < textures.length;
                    i++
                ) {

                    const textureHash =
                        textures[i];

                    console.log(
                        `[INFO] Textura ${i + 1}/${textures.length}: ${textureHash}`
                    );

                    try {

                        const textureUrl =
                            getRobloxCDN(
                                textureHash
                            );

                        const textureResponse =
                            await axios.get(
                                textureUrl,
                                {
                                    timeout: 30000,

                                    responseType:
                                        'arraybuffer',

                                    headers: {
                                        'User-Agent':
                                            'RobloxImageBot/1.0'
                                    }
                                }
                            );

                        const textureBuffer =
                            Buffer.from(
                                textureResponse.data
                            );


                        const pngBuffer =
                            await sharp(
                                textureBuffer
                            )
                                .png()
                                .toBuffer();


                        const textureName =
                            `texture_${String(
                                i + 1
                            ).padStart(
                                2,
                                '0'
                            )}.png`;


                        const texturePath =
                            path.join(
                                jobDir,
                                textureName
                            );


                        fs.writeFileSync(
                            texturePath,
                            pngBuffer
                        );


                        textureFiles.push({
                            hash: textureHash,
                            filename: textureName
                        });


                        console.log(
                            `[OK] ${textureName} descargada.`
                        );

                    } catch (textureError) {

                        console.error(
                            `[ERROR] Falló la textura ${i + 1}:`,
                            textureError.message
                        );

                        throw new Error(
                            `No se pudo descargar la textura ${i + 1}.`
                        );
                    }
                }


                // ====================================================
                // 9. CORREGIR MTL
                // ====================================================

                console.log(
                    '[INFO] Corrigiendo referencias del MTL...'
                );


                for (
                    const texture
                    of textureFiles
                ) {

                    mtlText =
                        mtlText
                            .split(
                                texture.hash
                            )
                            .join(
                                texture.filename
                            );
                }


                for (
                    const texture
                    of textureFiles
                ) {

                    const textureUrl =
                        getRobloxCDN(
                            texture.hash
                        );

                    mtlText =
                        mtlText
                            .split(
                                textureUrl
                            )
                            .join(
                                texture.filename
                            );
                }


                // ====================================================
                // 10. GUARDAR MTL
                // ====================================================

                const mtlPath =
                    path.join(
                        jobDir,
                        'avatar.mtl'
                    );


                fs.writeFileSync(
                    mtlPath,
                    mtlText,
                    'utf8'
                );


                console.log(
                    '[OK] MTL guardado.'
                );


                // ====================================================
                // 11. PREPARAR OBJ
                // ====================================================

                let objText =
                    objResponse.data;


                if (
                    !/^\s*mtllib\s+/im
                        .test(objText)
                ) {

                    objText =
                        `mtllib avatar.mtl\n${objText}`;

                } else {

                    objText =
                        objText.replace(
                            /^\s*mtllib\s+.+$/im,
                            'mtllib avatar.mtl'
                        );
                }


                fs.writeFileSync(
                    objPath,
                    objText,
                    'utf8'
                );


                console.log(
                    '[OK] OBJ y MTL preparados.'
                );


                // ====================================================
                // 12. NOMBRE SEGURO
                // ====================================================

                const safeUsername =
                    String(username)
                        .replace(
                            /[<>:"/\\|?*\x00-\x1F]/g,
                            '_'
                        )
                        .replace(
                            /\s+/g,
                            '_'
                        )
                        .slice(
                            0,
                            50
                        );


                const zipName =
                    `Avatar_${safeUsername}.zip`;


                const zipPath =
                    path.join(
                        jobDir,
                        zipName
                    );


                // ====================================================
                // 13. CREAR ZIP
                // ====================================================

                console.log(
                    '[INFO] Creando ZIP...'
                );

                await createZip(
                    jobDir,
                    zipPath
                );


                console.log(
                    `[OK] ZIP creado: ${zipPath}`
                );


                // ====================================================
                // 14. COMPROBAR ZIP
                // ====================================================

                if (
                    !fs.existsSync(zipPath)
                ) {

                    throw new Error(
                        'El ZIP no existe después de crearlo.'
                    );
                }


                const zipStats =
                    fs.statSync(
                        zipPath
                    );


                if (
                    zipStats.size <= 0
                ) {

                    throw new Error(
                        'El ZIP fue creado pero está vacío.'
                    );
                }


                const zipSizeMB =
                    zipStats.size /
                    (1024 * 1024);


                console.log(
                    `[INFO] Tamaño ZIP: ${zipSizeMB.toFixed(2)} MB`
                );


                // ====================================================
                // 15. LÍMITE DISCORD
                // ====================================================

                if (
                    zipStats.size >
                    25 * 1024 * 1024
                ) {

                    throw new Error(
                        `El ZIP pesa ${zipSizeMB.toFixed(2)} MB y supera el límite de subida disponible.`
                    );
                }


                // ====================================================
                // 16. EMBED
                // ====================================================

                const embed =
                    new EmbedBuilder()
                        .setColor(0x00A2FF)
                        .setTitle(
                            '✅ Avatar 3D listo'
                        )
                        .setDescription(
                            `Se generó correctamente el modelo 3D de **${username}**.`
                        )
                        .addFields(
                            {
                                name: '👤 Usuario',
                                value:
                                    `\`${username}\``,
                                inline: true
                            },
                            {
                                name: '🆔 ID',
                                value:
                                    `\`${userId}\``,
                                inline: true
                            },
                            {
                                name:
                                    '🧍 Display Name',
                                value:
                                    `\`${displayName}\``,
                                inline: true
                            },
                            {
                                name:
                                    '📦 Archivos',
                                value:
                                    `OBJ: ✅\nMTL: ✅\nTexturas PNG: **${textureFiles.length}**`,
                                inline: true
                            },
                            {
                                name:
                                    '💾 Tamaño',
                                value:
                                    `${zipSizeMB.toFixed(2)} MB`,
                                inline: true
                            }
                        )
                        .setFooter({
                            text:
                                'RobloxImageBot • Avatar 3D'
                        })
                        .setTimestamp();


                // ====================================================
                // 17. ENVIAR ZIP
                // ====================================================

                console.log(
                    '[INFO] Enviando ZIP a Discord...'
                );


                const attachment =
                    new AttachmentBuilder(
                        zipPath,
                        {
                            name: zipName
                        }
                    );


                await interaction.editReply({
                    embeds: [embed],
                    files: [attachment]
                });


                console.log(
                    '[EXITO] Avatar 3D enviado a Discord.'
                );


            } finally {

                // ====================================================
                // LIMPIEZA
                // ====================================================

                setTimeout(
                    () => {

                        cleanup();

                        console.log(
                            '[INFO] Archivos temporales eliminados.'
                        );

                    },
                    5000
                );
            }


        } catch (error) {

            console.error('');
            console.error(
                '============================================================'
            );
            console.error(
                '[ERROR] ERROR GENERANDO AVATAR 3D'
            );
            console.error(
                '============================================================'
            );


            console.error(
                '[ERROR] Mensaje:',
                error.message
            );


            if (error.name) {

                console.error(
                    '[ERROR] Nombre:',
                    error.name
                );
            }


            if (error.code) {

                console.error(
                    '[ERROR] Código:',
                    error.code
                );
            }


            if (error.stack) {

                console.error(
                    '[ERROR] Stack completo:'
                );

                console.error(
                    error.stack
                );
            }


            if (error.response) {

                console.error(
                    '[ERROR] HTTP:',
                    error.response.status
                );

                console.error(
                    '[ERROR] Respuesta:',
                    typeof error.response.data === 'string'
                        ? error.response.data.slice(
                            0,
                            3000
                        )
                        : JSON.stringify(
                            error.response.data,
                            null,
                            2
                        )
                );
            }


            console.error(
                '============================================================'
            );


            let message =
                '❌ No pude generar el avatar 3D.';


            if (
                error.message &&
                error.message.includes(
                    'ROBLOX_API_KEY'
                )
            ) {

                message =
                    '❌ Falta configurar `ROBLOX_API_KEY` en el archivo `.env`.';

            } else if (
                error.response &&
                error.response.status === 401
            ) {

                message =
                    '❌ La API Key de Roblox no es válida.';

            } else if (
                error.response &&
                error.response.status === 403
            ) {

                message =
                    '❌ Roblox rechazó la API Key. Revisa sus permisos.';

            } else if (
                error.response &&
                error.response.status === 429
            ) {

                message =
                    '❌ Roblox está limitando las solicitudes. Espera un momento y vuelve a intentarlo.';

            } else if (
                error.message
            ) {

                message +=
                    `\n\n\`${error.message}\``;
            }


            try {

                await interaction.editReply({
                    content: message
                });

            } catch (replyError) {

                console.error(
                    '[ERROR] No se pudo enviar el mensaje de error:',
                    replyError.message
                );
            }
        }
    }
};


// ============================================================
// CREAR ZIP
// ============================================================

function createZip(
    sourceDir,
    outputPath
) {

    return new Promise(
        (resolve, reject) => {

            let settled = false;


            const finishResolve = () => {

                if (settled) {
                    return;
                }

                settled = true;

                resolve();
            };


            const finishReject = (
                error
            ) => {

                if (settled) {
                    return;
                }

                settled = true;

                reject(error);
            };


            console.log(
                '[ZIP] Preparando archivo ZIP...'
            );


            const output =
                fs.createWriteStream(
                    outputPath
                );


            output.on(
                'open',
                () => {

                    console.log(
                        '[ZIP] Archivo de salida abierto.'
                    );
                }
            );


            output.on(
                'close',
                () => {

                    console.log(
                        '[ZIP] Stream cerrado correctamente.'
                    );

                    finishResolve();
                }
            );


            output.on(
                'error',
                (error) => {

                    console.error(
                        '[ZIP] Error del archivo de salida:',
                        error
                    );

                    finishReject(error);
                }
            );


            const archive =
                archiver(
                    'zip',
                    {
                        zlib: {
                            level: 9
                        }
                    }
                );


            archive.on(
                'warning',
                (error) => {

                    console.warn(
                        '[ZIP] Warning:',
                        error
                    );

                    if (
                        error.code ===
                        'ENOENT'
                    ) {

                        finishReject(error);
                    }
                }
            );


            archive.on(
                'error',
                (error) => {

                    console.error(
                        '[ZIP] Error de Archiver:',
                        error
                    );

                    finishReject(error);
                }
            );


            archive.on(
                'progress',
                (progress) => {

                    console.log(
                        `[ZIP] Procesando: ${progress.entries.processed}/${progress.entries.total}`
                    );
                }
            );


            archive.on(
                'finish',
                () => {

                    console.log(
                        '[ZIP] Archiver terminó de comprimir.'
                    );
                }
            );


            archive.pipe(
                output
            );


            const files =
                fs.readdirSync(
                    sourceDir
                );


            const filesToAdd =
                files.filter(
                    file =>
                        file !==
                        path.basename(
                            outputPath
                        )
                );


            console.log(
                `[ZIP] Archivos encontrados: ${filesToAdd.length}`
            );


            if (
                filesToAdd.length === 0
            ) {

                finishReject(
                    new Error(
                        'No hay archivos para introducir en el ZIP.'
                    )
                );

                return;
            }


            for (
                const file
                of filesToAdd
            ) {

                const filePath =
                    path.join(
                        sourceDir,
                        file
                    );


                const stats =
                    fs.statSync(
                        filePath
                    );


                if (
                    !stats.isFile()
                ) {

                    continue;
                }


                console.log(
                    `[ZIP] Añadiendo: ${file} (${stats.size} bytes)`
                );


                archive.file(
                    filePath,
                    {
                        name: file
                    }
                );
            }


            console.log(
                '[ZIP] Finalizando compresión...'
            );


            archive.finalize()
                .then(
                    () => {

                        console.log(
                            '[ZIP] finalize() completado.'
                        );

                    }
                )
                .catch(
                    (error) => {

                        console.error(
                            '[ZIP] Error en finalize():',
                            error
                        );

                        finishReject(error);
                    }
                );
        }
    );
}