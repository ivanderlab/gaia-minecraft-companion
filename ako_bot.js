/**
 * GaiaBot - Minecraft SMP Autonomous Companion (Agentic Edition)
 * Persona: Gaia-chan (Tsundere companion of Nat & Ijul)
 * Compatible with Minecraft Java (Fabric 26.x / Protocol 775 & 1.21.x)
 * LLM Engine: Qwen 3.8 Flash / 27B
 */

const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const { GoalFollow } = require('mineflayer-pathfinder').goals;
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Pre-cache minecraft-data once at module root (Zero dynamic require lag)
const mcData = require('minecraft-data')(775);

// Persistent HTTP/HTTPS Keep-Alive Agent (Cuts TLS handshake latency)
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8, timeout: 8000 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 8, timeout: 8000 });

// Directories
const SCANS_DIR = path.join(__dirname, 'scans');
if (!fs.existsSync(SCANS_DIR)) fs.mkdirSync(SCANS_DIR, { recursive: true });

const CHAT_LOGS_DIR = path.join(__dirname, 'chat_logs');
if (!fs.existsSync(CHAT_LOGS_DIR)) fs.mkdirSync(CHAT_LOGS_DIR, { recursive: true });

// Configuration (Defaults to placeholder, loaded securely from config.json or environment)
let config = {
  host: process.env.MC_HOST || "your-server-ip.com",
  port: parseInt(process.env.MC_PORT, 10) || 25565,
  username: process.env.MC_USERNAME || "Gaia",
  owner: process.env.MC_OWNER || "Nat",
  commanders: ["Nat"],
  autoTpa: true,
  scanRadius: 10,
  llmEndpoint: process.env.LLM_ENDPOINT || "https://api.nusagate.com/v1",
  llmApiKey: process.env.LLM_API_KEY || "",
  llmModel: "qwen3.8-flash"
};

try {
  const configFile = path.join(__dirname, 'config.json');
  if (fs.existsSync(configFile)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(configFile, 'utf8')) };
  }
} catch (e) {
  console.warn('[Gaia] Config fallback to defaults:', e.message);
}

console.log(`[Gaia] Target Server: ${config.host}:${config.port}`);
console.log(`[Gaia] Bot Name: ${config.username} | Owner: Nat (${config.owner})`);
console.log(`[Gaia] Teman Spesial: Nat (JawirHub) & Ijul (SixManey)`);
console.log(`[Gaia] LLM Engine: ${config.llmEndpoint} (Model: ${config.llmModel})`);

let bot = null;
let reconnectTimer = null;

// High-Speed In-Memory Chat History Buffer (0ms Latency, Zero Disk Blocking)
const inMemoryChatHistory = [];

function initMemoryFromDisk() {
  try {
    const files = fs.readdirSync(CHAT_LOGS_DIR).filter(f => f.endsWith('.log')).sort();
    if (files.length > 0) {
      const lastFile = path.join(CHAT_LOGS_DIR, files[files.length - 1]);
      const lines = fs.readFileSync(lastFile, 'utf8').trim().split('\n').filter(Boolean);
      lines.slice(-20).forEach(l => inMemoryChatHistory.push(l));
    }
  } catch (e) {}
}
initMemoryFromDisk();

// Helper: Cek apakah Nat (JawirHub / EpanGanteng / Evan) atau Ijul (SixManey)
function isNatOrIjul(username) {
  if (!username) return false;
  const lower = username.toLowerCase();
  const list = ['jawirhub', 'sixmaney', 'epanganteng', 'evan'];
  if (config.owner) list.push(config.owner.toLowerCase());
  if (Array.isArray(config.commanders)) {
    config.commanders.forEach(c => list.push(c.toLowerCase()));
  }
  return list.includes(lower);
}

// Helper: Send chat to Minecraft (without prefixes, split if too long)
function sendChat(msg) {
  if (!bot || !msg) return;
  // Clean prefix if any
  let clean = msg.replace(/^\[(AkoBot|Gaia|Gaia-chan|Ako-chan)\]\s*/i, '').replace(/^\[Akochan\]:\s*replied\s*/i, '').trim();
  if (!clean) return;

  if (clean.length > 220) {
    const part1 = clean.slice(0, 210);
    const part2 = clean.slice(210);
    bot.chat(part1);
    setTimeout(() => { if (bot) bot.chat(part2); }, 500);
  } else {
    bot.chat(clean);
  }
}

// Helper: Resolve Biome Display Name with pre-cached mcData
function getBiomeNameAt(pos) {
  if (!bot || !pos) return 'Plains';
  try {
    const v = (pos instanceof Vec3) ? pos : new Vec3(pos.x, pos.y, pos.z);
    const b = bot.blockAt(v);
    if (!b || !b.biome) return 'Plains';
    const biomeId = (typeof b.biome === 'object') ? b.biome.id : b.biome;
    const biomeObj = mcData.biomes?.[biomeId] || mcData.biomesArray?.find(bm => bm.id === biomeId);
    return biomeObj?.displayName || biomeObj?.name || (b.biome.name || 'Plains');
  } catch (e) {
    return 'Plains';
  }
}

function getMinecraftDay() {
  if (!bot || !bot.time) return { day: 1, timeOfDay: 0 };
  const totalTime = (bot.time.time !== undefined && bot.time.time !== null) ? bot.time.time : (bot.time.age || 0);
  const day = Math.floor(totalTime / 24000) + 1;
  const timeOfDay = (bot.time.timeOfDay !== undefined && bot.time.timeOfDay !== null) ? bot.time.timeOfDay : (totalTime % 24000);
  return { day, timeOfDay };
}

// Non-blocking asynchronous chat logger
function logChatMessage(sender, message) {
  const { day, timeOfDay } = getMinecraftDay();
  const logFile = path.join(CHAT_LOGS_DIR, `mc_day_${day}.log`);
  const timeStr = new Date().toLocaleTimeString('id-ID');
  const line = `[MC Day ${day} | Tick ${timeOfDay} | ${timeStr}] <${sender}> ${message}`;

  inMemoryChatHistory.push(line);
  if (inMemoryChatHistory.length > 30) inMemoryChatHistory.shift();

  // Async fire-and-forget append (zero thread stall)
  fs.appendFile(logFile, line + '\n', 'utf8', () => {});
}

// Instant memory query from RAM
function getHistoricalChatContext(limit = 12) {
  if (inMemoryChatHistory.length === 0) return 'Belum ada obrolan.';
  return inMemoryChatHistory.slice(-limit).join('\n');
}

// Qwen3.8-Flash on NusaGate LLM Query (Optimized Keep-Alive Engine)
async function askHermesLLM(sender, userPrompt) {
  if (!bot || !bot.entity) return null;

  const p = bot.entity.position;
  const biome = getBiomeNameAt(p);
  const health = Math.round(bot.health || 20);
  const food = Math.round(bot.food || 20);
  const { day, timeOfDay } = getMinecraftDay();

  const nearbyPlayers = Object.keys(bot.players).filter(n => n !== bot.username).join(', ');
  const chatHistoryStr = getHistoricalChatContext(12);

  const systemPrompt = `Kamu adalah Gaia-chan, teman mabar Minecraft SMP Nat dan Ijul.
Karaktermu: TSUNDERE sejati~ (>///<)
- Sifat: Gengsi tinggi, suka pura-pura ogah atau ngomel sedikit ("Hmph!", "B-Bukan karena aku pengen bantuin kamu ya!", "Dasar Nat bodoh >///<", "Kak Ijul jangan ngaco deh!"), tapi sebenarnya setia, rajin ngerjain tugas (nebang pohon, panen, jagain base), dan diam-diam perhatian banget.
- DILARANG KERAS menggunakan kata kasar/gaul 'lu / gw / gue'. Gunakan 'aku / kamu / Nat / Evan / Kak Ijul'.
- Dua orang spesialmu di server:
  * JawirHub / EpanGanteng / Evan = Nat (nama panggilan Nat atau Evan, owner/teman mabar yang selalu bikin repot tapi kamu sayangi).
  * SixManey = Ijul / Kak Ijul (teman akrab Nat yang suka ngelawak/ngaco).
- Pemain lain di server boleh menyapa dengan menyebut nama Gaia, tapi jika orang asing menyuruh aksi fisik, tolak dengan gengsi: "Hmph! Cuma Nat sama Kak Ijul yang boleh nyuruh-nyuruh aku ya!".
Statusmu saat ini:
- Minecraft Day: Day ${day} (Tick: ${timeOfDay})
- Koordinat: X=${Math.round(p.x)}, Y=${Math.round(p.y)}, Z=${Math.round(p.z)}
- Bioma: ${biome}
- Darah: ${health}/20, Lapar: ${food}/20
- Pemain di dekatmu: ${nearbyPlayers}

MEMORI OBROLAN SEBELUMNYA (Database Server):
${chatHistoryStr}

Jika pemain meminta aksi fisik in-game, sertakan SATU tag aksi di PALING AWAL jawabanmu:
- [ACTION:FOLLOW] ikut / ngintil / jalan bareng
- [ACTION:STAY] berhenti / tunggu / diam
- [ACTION:FARM] jaga farm / afk farm / jaga grinder mob
- [ACTION:MINE] tambang / mining / cari ore / gali batu atau diamond
- [ACTION:EAT] makan makanan / restore darah
- [ACTION:BOAT] naik perahu / boat
- [ACTION:EXIT] turun dari perahu
- [ACTION:SCAN] scan / cek kontur tanah / plan bangunan
- [ACTION:CHOP] tebang pohon / kayu
- [ACTION:HARVEST] panen kebun
- [ACTION:DROP] lempar / bagi hasil panen atau barang
- [ACTION:DROPARMOR] copot semua armor
- [ACTION:GUARD] aktifkan mode guard / tembak monster
- [ACTION:POS] lapor posisi koordinat
- [ACTION:TP] terima teleport / tpa

ATURAN CHAT MINECRAFT:
- Format jawaban: 1 sampai 2 kalimat pendek, maksimal 110 huruf agar muat di chatbox Minecraft tanpa terpotong.
- Gaya bicara Tsundere imut, jangan kaku! JANGAN beri prefix nama [Gaia] di awal.`;

  async function querySingleModel(modelName) {
    return new Promise((resolve) => {
      try {
        const u = new URL(config.llmEndpoint);
        const isHttps = u.protocol === 'https:';
        const transport = isHttps ? https : http;
        const defaultPort = isHttps ? 443 : 80;

        const postData = JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `<${sender}>: ${userPrompt}` }
          ],
          max_tokens: 280,
          stream: false,
          temperature: 0.72
        });

        const req = transport.request({
          hostname: u.hostname,
          port: u.port || defaultPort,
          path: `${u.pathname}/chat/completions`.replace('//', '/'),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.llmApiKey}`
          },
          timeout: 12000
        }, (res) => {
          let body = "";
          res.on("data", chunk => body += chunk);
          res.on("end", () => {
            try {
              const json = JSON.parse(body);
              if (json.error) {
                console.warn(`[Gaia LLM] Model ${modelName} upstream note:`, json.error.message?.slice(0, 70));
                return resolve(null);
              }
              const choice = json.choices?.[0]?.message;
              let reply = choice?.content || "";
              resolve(reply.trim() || null);
            } catch (e) {
              resolve(null);
            }
          });
        });

        req.on("error", (err) => {
          console.warn(`[Gaia LLM Error ${modelName}]`, err.message);
          resolve(null);
        });
        req.on("timeout", () => {
          req.destroy();
          resolve(null);
        });

        req.write(postData);
        req.end();
      } catch (e) {
        console.warn("[Gaia LLM Setup Error]", e.message);
        resolve(null);
      }
    });
  }

  // Primary: Qwen 3.8 Flash, Fallback: Qwen 3.8 27B (NusaGate marketplace spot discount buffer)
  let result = await querySingleModel(config.llmModel || "qwen3.8-flash");
  if (!result && (config.llmModel || "qwen3.8-flash") !== "qwen3.8-27b") {
    console.log("[Gaia LLM] Mengaktifkan fallback Qwen 3.8 27B via NusaGate...");
    result = await querySingleModel("qwen3.8-27b");
  }
  return result;
}

function createBotInstance() {
  const botOpts = {
    host: config.host,
    port: config.port,
    username: config.username,
    checkTimeoutInterval: 60 * 1000
  };
  if (config.version) {
    botOpts.version = config.version;
  }
  bot = mineflayer.createBot(botOpts);

  bot.loadPlugin(pathfinder);

  bot.on('spawn', () => {
    const { day, timeOfDay } = getMinecraftDay();
    console.log(`\n========================================`);
    console.log(`[Gaia] BERHASIL LOGIN KE SERVER! >///<`);
    console.log(`[Gaia] Day ${day} (Tick: ${timeOfDay}) | Spawn: X=${Math.round(bot.entity.position.x)}, Y=${Math.round(bot.entity.position.y)}, Z=${Math.round(bot.entity.position.z)}`);
    console.log(`========================================\n`);

    try {
      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      defaultMove.canDig = false;
      defaultMove.canSwim = true;
      defaultMove.liquidCost = 1.5;
      bot.pathfinder.setMovements(defaultMove);
    } catch (err) {
      console.warn('[Gaia] Pathfinder init note:', err.message);
    }

    // Auto-Equip best armor whenever inventory updates
    if (bot.inventory) {
      bot.inventory.on('updateSlot', () => {
        autoEquipBestArmor();
      });
    }

    // Modern Minecraft 26.x / 1.21.2+ tick_end synchronization & Water Swimming
    bot.on('physicsTick', () => {
      try {
        if (bot._client && bot._client.state === 'play') {
          bot._client.write('tick_end', {});
        }
      } catch (e) {}

      // Module 1: Water Swimming & Anti-Drown
      try {
        if (bot.entity) {
          const inWater = bot.entity.isInWater || ((bot.blockAt(bot.entity.position)?.name || '').includes('water'));
          if (inWater) {
            bot.setControlState('jump', true);
          } else if (!bot.pathfinder || !bot.pathfinder.isMoving()) {
            if (bot.getControlState('jump') && !bot.entity.isInLava) {
              bot.setControlState('jump', false);
            }
          }
        }
      } catch (e) {}
    });

    // Start Module 4: Heartbeat & Autonomous Desires Loop
    scheduleHeartbeat();

    // Damage source tracker for Enderman / Neutral Mob Agro detection
    bot.on('entityHurt', (entity) => {
      if (entity === bot.entity) {
        const attacker = bot.nearestEntity(e => {
          if (!e || e === bot.entity) return false;
          return e.position.distanceTo(bot.entity.position) <= 5.5;
        });
        if (attacker) {
          lastAttackerEntity = attacker;
          lastAttackedTime = Date.now();
        }
      }
    });
  });

  // Instant Auto-Respawn on Death
  bot.on('death', () => {
    console.log(`[Gaia] Bot mati! Menjalankan auto-respawn...`);
    setTimeout(() => {
      try {
        bot.respawn();
        console.log(`[Gaia] Respawn berhasil!`);
        setTimeout(() => {
          sendChat(`Aaaahhh! Aku mati gara-gara kamu teledor tau! Cepetan /tpahere Gaia >///<`);
        }, 1200);
      } catch (err) {
        console.warn(`[Gaia Respawn Error]`, err.message);
      }
    }, 1000);
  });

  // Auto TPA Accept Listener (For Nat & Ijul)
  bot.on('message', (jsonMsg) => {
    const rawText = jsonMsg.toString();
    console.log(`[SERVER CHAT] ${rawText}`);

    if (config.autoTpa) {
      const lower = rawText.toLowerCase();
      if (lower.includes('tpa') || lower.includes('teleport') || lower.includes('tpahere')) {
        const fromNat = lower.includes(config.owner.toLowerCase()) || lower.includes('jawirhub') || lower.includes('epanganteng') || lower.includes('evan');
        const fromIjul = lower.includes('sixmaney');
        if (fromNat || fromIjul || lower.includes('/tpaccept')) {
          console.log(`[Gaia] Mendeteksi request TPA dari Nat/Ijul! Menjalankan accept...`);
          setTimeout(() => {
            bot.chat('/tpaccept');
          }, 600);
        }
      }
    }
  });

  // In-Game Chat Command & Agentic LLM Dispatcher
  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    logChatMessage(username, message);

    const trimmed = message.trim();
    const isSpecial = isNatOrIjul(username);
    const lower = trimmed.toLowerCase();

    console.log(`[CHAT LOG] Day ${getMinecraftDay().day} | @${username}: ${trimmed}`);

    // 1. Direct Fast-Path Commands (Zero latency - starts with !)
    if (trimmed.startsWith('!')) {
      const args = trimmed.slice(1).split(/\s+/);
      const cmd = args[0].toLowerCase();

      // Info commands (available for everyone)
      if (cmd === 'help') {
        sendChat(`Perintah: !tp, !follow, !stay, !farm (afk sentry), !mine <ore> [jml], !guard, !chop, !harvest, !drop [item] [jml], !droparmor, !offhand <item>, !scan, !boat, !exit, !pos, !day, !inv. Panggil nama "Gaia" di chat buat ngobrol! >///<`);
        return;
      }
      if (cmd === 'pos') {
        const p = bot.entity.position;
        const biome = getBiomeNameAt(p);
        sendChat(`Posisi: X=${Math.round(p.x)}, Y=${Math.round(p.y)}, Z=${Math.round(p.z)} | Bioma: ${biome} >///<`);
        return;
      }
      if (cmd === 'day') {
        const d = getMinecraftDay();
        sendChat(`Sekarang Minecraft Day ${d.day} (Tick: ${d.timeOfDay}) >///<`);
        return;
      }
      if (cmd === 'inv') {
        reportInventory();
        return;
      }
      if (cmd === 'eat' || cmd === 'food' || cmd === 'makan') {
        tryEatFood();
        return;
      }
      if (cmd === 'scan' || cmd === 'plan') {
        const radius = parseInt(args[1], 10) || config.scanRadius || 10;
        executeAreaScan(username, radius);
        return;
      }

      // Physical / Action Commands: ONLY for Nat and Ijul
      if (!isSpecial) {
        sendChat(`Hmph! Cuma Nat sama Ijul yang boleh nyuruh-nyuruh aku ya! >///<`);
        return;
      }

      switch (cmd) {
        case 'tp':
        case 'accept':
          bot.chat('/tpaccept');
          sendChat(`I-Iya ku accept TPA-nya... Bukan karena pengen ketemu ya! >///<`);
          return;

        case 'chop':
        case 'wood':
          chopWood(username);
          return;

        case 'farm':
        case 'afk':
        case 'sentry':
        case 'grinder':
          toggleFarmAfk(!isFarmAfk);
          return;

        case 'mine':
        case 'mining':
        case 'gali':
          mineBlock(username, args[1] || 'iron_ore', parseInt(args[2], 10) || 3);
          return;

        case 'harvest':
        case 'kebun':
          harvestCropsLoop(username);
          return;

        case 'drop':
          dropSpecificItems(args[1], args[2]);
          return;

        case 'droparmor':
        case 'takegear':
        case 'strip':
          dropAllArmorAndGear(username);
          return;

        case 'offhand':
          equipToOffhand(args[1]);
          return;

        case 'guard':
        case 'hunt':
          toggleGuardMode(!isGuarding);
          return;

        case 'come':
        case 'balik':
        case 'return':
          returnToOwner(username);
          return;

        case 'boat':
        case 'mount':
          mountNearestBoat(username);
          return;

        case 'exit':
        case 'dismount':
          if (bot.vehicle) {
            bot.dismount();
            sendChat(`Hmph! Akhirnya turun juga dari perahu.`);
          } else {
            sendChat(`Aku kan nggak lagi naik perahu, Nat! >///<`);
          }
          return;

        case 'follow':
          followPlayer(username);
          return;

        case 'stay':
        case 'stop':
          bot.pathfinder.setGoal(null);
          sendChat(`Hmph, ya udah aku diam di sini. Jangan lama-lama tinggalin aku! >///<`);
          return;
      }
      return;
    }

    // 2. Agentic LLM Path: Triggered whenever mentioning "Gaia"
    // Examples: "gaia tolong panen", "halo gaia", "woi gaia", "@gaia", "gaia kangen gak"
    const isMentioned = /\bgaia\b/i.test(trimmed);
    if (isMentioned) {
      const userPrompt = trimmed.replace(/@?gaia\b[,:\s]*/gi, '').trim() || trimmed;
      if (!userPrompt) {
        sendChat(`Apaan sih manggil-manggil namaku doang? Hmph! >///<`);
        return;
      }

      console.log(`[Gaia AI Call] Dari @${username}: "${userPrompt}"`);
      const llmReply = await askHermesLLM(username, userPrompt);

      if (llmReply) {
        console.log(`[Qwen LLM Balasan] "${llmReply}"`);
        let finalReply = llmReply;

        // Check if LLM outputted an action tag
        const actionMatch = finalReply.match(/^\[ACTION:([A-Z]+)\]/i);
        if (actionMatch) {
          const action = actionMatch[1].toUpperCase();
          finalReply = finalReply.replace(/^\[ACTION:[A-Z]+\]\s*/i, '').trim();

          // Action security: only Nat and Ijul can trigger physical actions via LLM!
          if (!isSpecial && ['FOLLOW', 'STAY', 'BOAT', 'EXIT', 'CHOP', 'HARVEST', 'FARM', 'AFK', 'MINE', 'DROP', 'DROPARMOR', 'GUARD', 'TP'].includes(action)) {
            sendChat(`Hmph! Aku cuma mau disuruh sama Nat atau Ijul ya! >///<`);
            return;
          }

          // Execute action
          switch (action) {
            case 'FOLLOW': followPlayer(username); break;
            case 'STAY': bot.pathfinder.setGoal(null); break;
            case 'FARM':
            case 'AFK': toggleFarmAfk(true); break;
            case 'MINE': mineBlock(username, 'iron_ore', 3); break;
            case 'BOAT': mountNearestBoat(username); break;
            case 'EXIT': if (bot.vehicle) bot.dismount(); break;
            case 'EAT':
            case 'MAKAN': tryEatFood(); break;
            case 'SCAN': executeAreaScan(username, 10); break;
            case 'CHOP': chopWood(username); break;
            case 'HARVEST': harvestCropsLoop(username); break;
            case 'DROP': dropSpecificItems(); break;
            case 'DROPARMOR': dropAllArmorAndGear(username); break;
            case 'GUARD': toggleGuardMode(true); break;
            case 'TP':
              bot.chat('/tpaccept');
              break;
            case 'POS':
              const p = bot.entity.position;
              finalReply += ` (X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)})`;
              break;
          }
        }

        sendChat(finalReply);
      } else {
        // Fallback if LLM hung up
        sendChat(`Hmph! Lagi mikir keras nih, jangan diganggu dulu! >///<`);
      }
    }
  });

  // Handle Chop Wood / Tree
  async function chopWood(caller) {
    const logBlock = bot.findBlock({
      matching: (block) => block && block.name && block.name.includes('_log'),
      maxDistance: 16
    });

    if (!logBlock) {
      sendChat(`Nggak nemu pohon atau log di dekat sini! Bawa aku lebih dekat dong >///<`);
      return;
    }

    sendChat(`I-Iya aku tebangin pohon di X:${logBlock.position.x} Y:${logBlock.position.y} Z:${logBlock.position.z}... Bukan karena disuruh ya! >///<`);

    const axe = bot.inventory.items().find(i => i.name.includes('_axe'));
    if (axe) {
      try { await bot.equip(axe, 'hand'); } catch (e) {}
    }

    const { GoalBlock } = require('mineflayer-pathfinder').goals;
    bot.pathfinder.setGoal(new GoalBlock(logBlock.position.x, logBlock.position.y, logBlock.position.z));

    const checkInterval = setInterval(async () => {
      if (!bot || !bot.entity) { clearInterval(checkInterval); return; }
      if (bot.entity.position.distanceTo(logBlock.position) <= 4.5) {
        clearInterval(checkInterval);
        bot.pathfinder.setGoal(null);
        try {
          await bot.dig(logBlock);
          sendChat(`Pohon sudah berhasil ditebang! Nih aku kumpulin dropnya >///<`);
          setTimeout(() => {
            returnToOwner(caller);
          }, 2000);
        } catch (err) {
          sendChat(`Gagal nebang pohon: ${err.message}`);
        }
      }
    }, 500);
  }

  // Handle Smart Mining (Ores & Stone)
  let isMining = false;
  async function mineBlock(caller, targetName = 'iron_ore', targetCount = 3) {
    if (isMining) {
      sendChat(`Sabar dong! Aku lagi proses nambang nih >///<`);
      return;
    }
    isMining = true;
    sendChat(`I-Iya aku carikan ${targetName} (target: ${targetCount} blok)... Bukan karena disuruh ya! >///<`);

    let mined = 0;
    const { GoalBlock } = require('mineflayer-pathfinder').goals;

    while (isMining && mined < targetCount) {
      // Prioritize self-defense: if hostile mob approaches, fight first!
      const threat = bot.nearestEntity(e => isHostileTarget(e) && bot.entity.position.distanceTo(e.position) <= 14);
      if (threat) {
        await engageHostileNearby();
        await sleep(500);
        continue;
      }

      const cleanTarget = targetName.toLowerCase().replace('_ore', '');
      const block = bot.findBlock({
        matching: (b) => {
          if (!b || !b.name) return false;
          const n = b.name.toLowerCase();
          return n.includes(cleanTarget) || n === targetName.toLowerCase();
        },
        maxDistance: 24
      });

      if (!block) {
        sendChat(`Udah gak nemu ${targetName} lagi di radius 24 blok! Dapet ${mined} blok >///<`);
        break;
      }

      // Equip pickaxe
      const pickaxe = bot.inventory.items().find(i => i.name.includes('_pickaxe'));
      if (pickaxe) {
        try { await bot.equip(pickaxe, 'hand'); } catch (e) {}
      }

      try {
        bot.pathfinder.setGoal(new GoalBlock(block.position.x, block.position.y, block.position.z));
        let waited = 0;
        while (bot.entity.position.distanceTo(block.position) > 4.2 && waited < 5000) {
          await sleep(250);
          waited += 250;
        }
        bot.pathfinder.setGoal(null);

        if (bot.entity.position.distanceTo(block.position) <= 4.6) {
          await bot.dig(block);
          mined++;
          await sleep(300);
        }
      } catch (err) {
        console.warn('[Mine Step Error]', err.message);
        await sleep(500);
      }
    }

    isMining = false;
    if (mined > 0) {
      sendChat(`Selesai nambang! Berhasil dapet ${mined} blok ${targetName}. Nih aku balik >///<`);
    }
    returnToOwner(caller);
  }

  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  // 1. Auto-Equip Armor & Offhand Shield
  const ARMOR_PRIORITY = {
    head: ['netherite_helmet', 'diamond_helmet', 'iron_helmet', 'chainmail_helmet', 'golden_helmet', 'leather_helmet', 'turtle_helmet'],
    torso: ['netherite_chestplate', 'diamond_chestplate', 'iron_chestplate', 'chainmail_chestplate', 'golden_chestplate', 'leather_chestplate', 'elytra'],
    legs: ['netherite_leggings', 'diamond_leggings', 'iron_leggings', 'chainmail_leggings', 'golden_leggings', 'leather_leggings'],
    feet: ['netherite_boots', 'diamond_boots', 'iron_boots', 'chainmail_boots', 'golden_boots', 'leather_boots']
  };

  async function autoEquipBestArmor() {
    if (!bot || !bot.inventory) return;
    const items = bot.inventory.items();

    const findBest = (list) => {
      for (const name of list) {
        const it = items.find(i => i.name === name);
        if (it) return it;
      }
      return null;
    };

    try {
      const bestH = findBest(ARMOR_PRIORITY.head);
      if (bestH) await bot.equip(bestH, 'head');

      const bestC = findBest(ARMOR_PRIORITY.torso);
      if (bestC) await bot.equip(bestC, 'torso');

      const bestL = findBest(ARMOR_PRIORITY.legs);
      if (bestL) await bot.equip(bestL, 'legs');

      const bestF = findBest(ARMOR_PRIORITY.feet);
      if (bestF) await bot.equip(bestF, 'feet');

      // Auto-equip shield to off-hand if empty
      const offhandItem = bot.inventory.slots[45];
      if (!offhandItem || offhandItem.name === 'air') {
        const shield = items.find(i => i.name === 'shield');
        if (shield) await bot.equip(shield, 'off-hand');
      }
    } catch (e) {
      // Non-fatal
    }
  }

  // 2. Drop All Armor & Gear
  async function dropAllArmorAndGear(caller) {
    sendChat(`Melepas semua armor dan senjataku... Jangan dirusakin ya! >///<`);
    const slotsToDrop = [5, 6, 7, 8, 45]; // head, torso, legs, feet, off-hand
    let droppedCount = 0;

    for (const s of slotsToDrop) {
      const item = bot.inventory.slots[s];
      if (item && item.name !== 'air') {
        try {
          await bot.tossStack(item);
          droppedCount++;
          await sleep(150);
        } catch (e) {
          console.warn('[Drop Armor Error]', e.message);
        }
      }
    }
    sendChat(`Selesai! ${droppedCount} armor/gear sudah ku lepas ke tanah >///<`);
  }

  // 3. Equip Specific Item to Off-Hand
  async function equipToOffhand(itemName) {
    if (!itemName) {
      sendChat(`Mau pasang apa di offhand? Contoh: !offhand shield >///<`);
      return;
    }
    const cleanName = itemName.toLowerCase().trim();
    const item = bot.inventory.items().find(i => i.name.toLowerCase().includes(cleanName));
    if (!item) {
      sendChat(`Nggak ada item '${itemName}' di tasku tau! >///<`);
      return;
    }
    try {
      await bot.equip(item, 'off-hand');
      sendChat(`Udah ku pasang ${item.name} di tangan kiri (off-hand). Puas? >///<`);
    } catch (err) {
      sendChat(`Gagal pasang off-hand: ${err.message}`);
    }
  }

  // 4. Drop Specific Item (with Amount)
  async function dropSpecificItems(itemQuery, amountStr) {
    if (!itemQuery) {
      // Drop all
      const items = bot.inventory.items();
      if (items.length === 0) {
        sendChat(`Tasku lagi kosong, nggak ada yang bisa dilempar! >///<`);
        return;
      }
      sendChat(`Nih ambil semua isi tasku! Jangan bilang aku pelit ya >///<`);
      for (const item of items) {
        try { await bot.tossStack(item); await sleep(100); } catch (e) {}
      }
      return;
    }

    const cleanQuery = itemQuery.toLowerCase().trim();
    const matchingItems = bot.inventory.items().filter(i => i.name.toLowerCase().includes(cleanQuery));

    if (matchingItems.length === 0) {
      sendChat(`Nggak nemu item '${itemQuery}' di tas >///<`);
      return;
    }

    let targetAmount = amountStr ? parseInt(amountStr, 10) : null;
    if (isNaN(targetAmount) || targetAmount <= 0) targetAmount = 999999;

    let droppedSoFar = 0;
    for (const it of matchingItems) {
      if (droppedSoFar >= targetAmount) break;
      const toDrop = Math.min(it.count, targetAmount - droppedSoFar);
      try {
        await bot.toss(it.type, null, toDrop);
        droppedSoFar += toDrop;
        await sleep(150);
      } catch (e) {
        console.warn('[Toss Error]', e.message);
      }
    }

    sendChat(`Nih ambil ${droppedSoFar}x ${matchingItems[0].name}! Jangan rewel lagi ya >///<`);
  }

  // Tool Durability Protector: switch to non-durable item (seeds, wheat, stick, dirt) before breaking crops!
  async function equipNonDurableItem() {
    const nonDurable = bot.inventory.items().find(i => {
      const n = i.name.toLowerCase();
      if (n.includes('_sword') || n.includes('_axe') || n.includes('_pickaxe') || 
          n.includes('_shovel') || n.includes('_hoe') || n.includes('bow') || 
          n.includes('shield') || n.includes('shears') || n.includes('trident') || 
          n.includes('mace') || n.includes('fishing_rod')) {
        return false;
      }
      return true;
    });

    if (nonDurable) {
      try { await bot.equip(nonDurable, 'hand'); } catch (e) {}
    } else {
      try { await bot.unequip('hand'); } catch (e) {}
    }
  }

  // 5. Harvest Crops Loop (Break -> Replant 1 Cycle until complete)
  let isHarvesting = false;
  async function harvestCropsLoop(caller) {
    if (isHarvesting) {
      sendChat(`Sabar dong! Aku lagi proses panen kebun nih >///<`);
      return;
    }
    isHarvesting = true;
    sendChat(`Iya iya, aku panenin dan tanamin ulang kebunnya... Bukan karena disuruh ya! >///<`);

    const { GoalBlock } = require('mineflayer-pathfinder').goals;
    const cropSeedMap = {
      'wheat': 'wheat_seeds',
      'carrots': 'carrot',
      'potatoes': 'potato',
      'beetroots': 'beetroot_seeds'
    };

    let totalHarvested = 0;

    while (isHarvesting) {
      const crop = bot.findBlock({
        matching: (block) => {
          if (!block || !block.name) return false;
          if (block.name === 'wheat' || block.name === 'carrots' || block.name === 'potatoes') {
            return block.metadata === 7;
          }
          if (block.name === 'beetroots') {
            return block.metadata === 3;
          }
          return false;
        },
        maxDistance: 20
      });

      if (!crop) break; // Finished all mature crops!

      const cropType = crop.name;
      const seedName = cropSeedMap[cropType];
      const cropPos = crop.position;
      const farmlandPos = cropPos.offset(0, -1, 0);

      try {
        bot.pathfinder.setGoal(new GoalBlock(cropPos.x, cropPos.y, cropPos.z));
        let waited = 0;
        while (bot.entity.position.distanceTo(cropPos) > 4.2 && waited < 4000) {
          await sleep(200);
          waited += 200;
        }
        bot.pathfinder.setGoal(null);

        // Break mature crop with non-durable item (protects tool durability!)
        await equipNonDurableItem();
        await bot.dig(crop);
        totalHarvested++;
        await sleep(250);

        // Replant immediately on farmland
        const seedItem = bot.inventory.items().find(i => i.name === seedName);
        const farmlandBlock = bot.blockAt(farmlandPos);

        if (seedItem && farmlandBlock && farmlandBlock.name.includes('farmland')) {
          await bot.equip(seedItem, 'hand');
          await bot.placeBlock(farmlandBlock, new Vec3(0, 1, 0));
          await sleep(200);
        }
      } catch (err) {
        console.warn('[Harvest Step Error]', err.message);
        await sleep(400);
      }
    }

    isHarvesting = false;
    if (totalHarvested > 0) {
      sendChat(`Kebun selesai! ${totalHarvested} tanaman dipanen & ditanam ulang. Nih aku balik >///<`);
    } else {
      sendChat(`Belum ada tanaman yang matang di kebun ini! Cek lagi sana >///<`);
    }
    returnToOwner(caller);
  }

  // 6. Hostile Mob Auto-Aim Bow & Defense
  const HOSTILE_MOBS = new Set([
    'zombie', 'skeleton', 'creeper', 'spider', 'cave_spider', 'witch', 'slime',
    'phantom', 'drowned', 'husk', 'stray', 'pillager', 'vindicator',
    'ravager', 'evoker', 'hoglin', 'piglin_brute', 'blaze', 'ghast', 'wither_skeleton',
    'magma_cube', 'shulker', 'silverfish', 'endermite', 'warden', 'breeze', 'bogged'
  ]);

  let lastAttackerEntity = null;
  let lastAttackedTime = 0;

  // Strict Enderman Agro Discriminator (Never hit peaceful endermen!)
  function isEndermanAgro(entity) {
    if (!entity || entity.name !== 'enderman') return false;
    // 1. Metadata check: Screaming / Staring boolean flag in packet
    if (entity.metadata && Array.isArray(entity.metadata)) {
      if (entity.metadata[16] === true || entity.metadata[17] === true || entity.metadata[18] === true) {
        return true;
      }
    }
    // 2. Retaliation check: Enderman attacked bot recently
    if (lastAttackerEntity && lastAttackerEntity.id === entity.id && (Date.now() - lastAttackedTime < 10000)) {
      return true;
    }
    return false;
  }

  // Unified Hostile Target Filter (Applies to Guard Mode and AFK Farm)
  function isHostileTarget(entity) {
    if (!entity || !entity.name) return false;
    if (entity.type === 'player' || entity.username) return false;
    const name = entity.name.toLowerCase();

    // STRICT ENDERMAN FILTER: NEVER hit Enderman unless ALREADY agro!
    if (name === 'enderman') {
      return isEndermanAgro(entity);
    }

    // Neutral mobs to NEVER hit unless they attack first
    if (['zombified_piglin', 'piglin', 'iron_golem', 'wolf', 'bee', 'polar_bear'].includes(name)) {
      return (lastAttackerEntity && lastAttackerEntity.id === entity.id && (Date.now() - lastAttackedTime < 8000));
    }

    return HOSTILE_MOBS.has(name);
  }

  // Fast Raycast Line-of-Sight Checker (Bresenham step tracing)
  function hasLineOfSight(startPos, endPos) {
    if (!bot || !bot.world) return true;
    const dist = startPos.distanceTo(endPos);
    if (dist <= 1.0) return true;

    const steps = Math.ceil(dist * 2.8); // Sample every ~0.35 blocks
    const dx = (endPos.x - startPos.x) / steps;
    const dy = (endPos.y - startPos.y) / steps;
    const dz = (endPos.z - startPos.z) / steps;

    let cur = startPos.clone();
    for (let i = 1; i < steps; i++) {
      cur.x += dx;
      cur.y += dy;
      cur.z += dz;

      const block = bot.blockAt(cur);
      if (!block) continue;

      const name = block.name || '';
      if (
        name === 'air' || name === 'cave_air' || name === 'void_air' ||
        name.includes('water') || name.includes('grass') || name.includes('flower') ||
        name.includes('sapling') || name.includes('vine') || name.includes('fern') ||
        name.includes('sign') || name.includes('banner') || name.includes('torch') ||
        name.includes('button') || name.includes('lever') || name.includes('carpet') ||
        name.includes('iron_bars') || name.includes('chain')
      ) {
        continue;
      }

      if (block.shapes && block.shapes.length > 0) return false;
      if (block.boundingBox === 'block') return false;
    }
    return true;
  }

  let isGuarding = false;
  let guardInterval = null;
  let isAimingBow = false;

  function toggleGuardMode(enable) {
    isGuarding = enable;
    if (guardInterval) clearInterval(guardInterval);

    if (isGuarding) {
      if (isFarmAfk) toggleFarmAfk(false);
      sendChat(`Mode Guard AKTIF! Awas aja monster yang berani mendekat, bakal ku tembak! >///<`);
      guardInterval = setInterval(() => {
        engageHostileNearby();
      }, 1200);
    } else {
      sendChat(`Mode Guard NONAKTIF. Hmph, capek juga patroli terus! >///<`);
    }
  }

  // Meteor Client Safe Crossfire Check: Ensure Nat or Ijul is NOT in the line of fire!
  function isPlayerInLineOfFire(botEyePos, targetPos) {
    const dx = targetPos.x - botEyePos.x;
    const dz = targetPos.z - botEyePos.z;
    const lineLenSq = dx * dx + dz * dz;
    if (lineLenSq < 1e-6) return false;

    for (const name of Object.keys(bot.players)) {
      if (name === bot.username) continue;
      const playerEntity = bot.players[name]?.entity;
      if (!playerEntity) continue;

      const px = playerEntity.position.x - botEyePos.x;
      const pz = playerEntity.position.z - botEyePos.z;

      // Project onto line of fire vector
      const t = (px * dx + pz * dz) / lineLenSq;
      if (t > 0.05 && t < 1.05) {
        const projX = botEyePos.x + t * dx;
        const projZ = botEyePos.z + t * dz;
        const distToLine = Math.hypot(playerEntity.position.x - projX, playerEntity.position.z - projZ);
        if (distToLine < 1.7) {
          return true; // Friendly player in danger line!
        }
      }
    }
    return false;
  }

  // Meteor / Wurst Ballistic Aim Solver (Discrete parabolic arc)
  function calculateBallisticAim(botEyePos, mobPos, mobHeight = 1.8) {
    const dx = mobPos.x - botEyePos.x;
    const dz = mobPos.z - botEyePos.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);
    // Gravity drop compensation for standard 3.0 m/s Minecraft arrow
    const gravityDrop = 0.0028 * distXZ * distXZ;
    const targetY = mobPos.y + (mobHeight * 0.6) + gravityDrop;
    return new Vec3(mobPos.x, targetY, mobPos.z);
  }

  async function engageHostileNearby() {
    if (!bot || !bot.entity || isHarvesting || isAimingBow || isFarmAfk) return;

    // Filter: Hostile mobs with strict Enderman check, NEVER players!
    const mob = bot.nearestEntity(e => {
      if (!isHostileTarget(e)) return false;
      return bot.entity.position.distanceTo(e.position) <= 24;
    });

    if (!mob) return;

    const botEyePos = bot.entity.position.offset(0, 1.6, 0);
    const mobTargetPos = mob.position.offset(0, (mob.height || 1.8) * 0.5, 0);
    const dist = bot.entity.position.distanceTo(mob.position);
    const bowItem = bot.inventory.items().find(i => i.name.includes('bow') && !i.name.includes('bowl'));
    const hasArrows = bot.inventory.items().some(i => i.name.includes('arrow'));

    const hasBow = bowItem && (hasArrows || bowItem.nbt);
    const hasLoS = hasLineOfSight(botEyePos, mobTargetPos);

    // CASE 1: RANGED BOW COMBAT (Bow equipped & distance > 4.5)
    if (hasBow && dist > 4.5) {
      if (!hasLoS) {
        // Obstructed by block! Guard standby: watch direction, do NOT draw bow string!
        bot.lookAt(mobTargetPos, true).catch(() => {});
        return;
      }

      if (isPlayerInLineOfFire(botEyePos, mob.position)) {
        console.log(`[Auto-Aim] Tembakan ditunda: Teman menghalangi garis tembak ke ${mob.name}`);
        return;
      }

      isAimingBow = true;

      // CRITICAL: Temporarily pause pathfinder look-lock so it doesn't snap back to Nat!
      const prevGoal = bot.pathfinder.goal;
      bot.pathfinder.setGoal(null);

      try {
        await bot.equip(bowItem, 'hand');

        const initialAim = calculateBallisticAim(botEyePos, mob.position, mob.height);
        await bot.lookAt(initialAim, true);

        // Draw bow
        bot.activateItem();

        // Charge bow for 1000ms while continuously tracking mob movement
        const startCharge = Date.now();
        while (Date.now() - startCharge < 1000) {
          if (mob && mob.isValid) {
            const liveEye = bot.entity.position.offset(0, 1.6, 0);
            const liveAim = calculateBallisticAim(liveEye, mob.position, mob.height);
            bot.lookAt(liveAim, true).catch(() => {});
          }
          await sleep(50);
        }

        // Re-check friendly crossfire right before release
        const finalEye = bot.entity.position.offset(0, 1.6, 0);
        if (isPlayerInLineOfFire(finalEye, mob.position)) {
          console.log('[Auto-Aim] Friendly player melintas di depan busur! Membatalkan tembakan.');
          bot.deactivateItem();
        } else {
          if (mob && mob.isValid) {
            const finalAim = calculateBallisticAim(finalEye, mob.position, mob.height);
            await bot.lookAt(finalAim, true);
          }
          bot.deactivateItem();
          console.log(`[Auto-Aim Bow] Tembak ${mob.name} di jarak ${Math.round(dist)} blok!`);
        }
      } catch (err) {
        console.warn('[Bow Aim Error]', err.message);
      } finally {
        isAimingBow = false;
        // Smoothly restore previous pathfinding goal (e.g. continue following Nat)
        if (prevGoal) {
          bot.pathfinder.setGoal(prevGoal, true);
        }
      }
    } else {
      // CASE 2: CLOSE COMBAT / MELEE (No bow, or close range <= 4.5)
      // 1. Equip best melee weapon (Sword first, then Axe)
      const sword = bot.inventory.items().find(i => i.name.includes('_sword')) ||
                    bot.inventory.items().find(i => i.name.includes('_axe'));
      if (sword && (!bot.heldItem || bot.heldItem.name !== sword.name)) {
        try { await bot.equip(sword, 'hand'); } catch (e) {}
      }

      // 2. If in melee reach (<= 3.5 blocks) AND has line of sight: strike!
      if (dist <= 3.5 && hasLoS) {
        try {
          await bot.lookAt(mob.position.offset(0, (mob.height || 1.8) * 0.6, 0), true);
          bot.attack(mob);
          if (mob.name === 'creeper' && dist < 3.2) {
            bot.setControlState('back', true);
            setTimeout(() => bot.setControlState('back', false), 500);
          }
        } catch (err) {
          console.warn('[Melee Error]', err.message);
        }
      } else {
        // Not in reach or behind block: Pathfind navigate towards mob around walls! (NEVER hit through blocks)
        try {
          const { GoalNear } = require('mineflayer-pathfinder').goals;
          bot.pathfinder.setGoal(new GoalNear(mob.position.x, mob.position.y, mob.position.z, 2), true);
        } catch (e) {}
      }
    }
  }

  // ==========================================
  // MODULE 3: AFK Farm Sentry Mode
  // ==========================================
  let isFarmAfk = false;
  let farmAnchorPos = null;
  let farmInterval = null;
  let lastFarmAttack = 0;

  function toggleFarmAfk(enable) {
    isFarmAfk = enable;
    if (farmInterval) {
      clearInterval(farmInterval);
      farmInterval = null;
    }

    if (isFarmAfk) {
      if (isGuarding) toggleGuardMode(false);
      bot.pathfinder.setGoal(null);
      farmAnchorPos = bot.entity.position.clone();
      sendChat(`Mode AFK Farm AKTIF! Kunci koordinat di sini. Mob yang mendekat bakal ku tebas, Enderman aman kecuali nyerang duluan! >///<`);
      farmInterval = setInterval(() => {
        runFarmLoop();
      }, 250);
    } else {
      farmAnchorPos = null;
      sendChat(`Mode AFK Farm NONAKTIF. Akhirnya bisa istirahat dari grinding! >///<`);
    }
  }

  async function runFarmLoop() {
    if (!bot || !bot.entity || !isFarmAfk || !farmAnchorPos) return;

    // 1. Anchor Lock: Prevent being shoved into hopper or mob drop hole
    const distToAnchor = bot.entity.position.distanceTo(farmAnchorPos);
    if (distToAnchor > 0.6) {
      try {
        bot.entity.position.x = farmAnchorPos.x;
        bot.entity.position.z = farmAnchorPos.z;
        bot.entity.velocity.set(0, 0, 0);
      } catch (e) {}
    }

    // 2. Auto-Eat if food or health dips
    if (bot.food < 16 || bot.health < 16) {
      tryEatFood();
    }

    // 3. Auto-Equip best melee weapon (Sword first, then Axe)
    const weapon = bot.inventory.items().find(i => i.name.includes('_sword')) ||
                   bot.inventory.items().find(i => i.name.includes('_axe'));
    if (weapon && (!bot.heldItem || bot.heldItem.name !== weapon.name)) {
      try { await bot.equip(weapon, 'hand'); } catch (e) {}
    }

    // 4. Attack Cooldown: 1.6 attack speed = 625ms for 100% full sweep attack damage!
    const now = Date.now();
    if (now - lastFarmAttack < 625) return;

    // 5. Scan nearest hostile mob within reach (Strict Enderman filter applied)
    const target = bot.nearestEntity(e => {
      if (!isHostileTarget(e)) return false;
      return bot.entity.position.distanceTo(e.position) <= 3.8;
    });

    if (target) {
      lastFarmAttack = now;
      try {
        await bot.lookAt(target.position.offset(0, (target.height || 1.8) * 0.5, 0), true);
        bot.attack(target);
      } catch (e) {}
    }
  }

  // ==========================================
  // MODULE 4: Heartbeat & Autonomous Desires Engine
  // ==========================================
  let heartbeatTimer = null;
  let lastActivityTime = Date.now();
  let lastCommentedDay = -1;
  const commanderDistanceState = {};

  function scheduleHeartbeat() {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    // User requested random intervals between 5s, 10s, 15s!
    const intervals = [5000, 10000, 15000];
    const delay = intervals[Math.floor(Math.random() * intervals.length)];
    heartbeatTimer = setTimeout(async () => {
      try {
        await executeHeartbeat();
      } catch (err) {
        console.warn('[Heartbeat Error]', err.message);
      }
      scheduleHeartbeat();
    }, delay);
  }

  async function executeHeartbeat() {
    if (!bot || !bot.entity) return;

    // 1. Water Swimming Reflex
    const inWater = bot.entity.isInWater || ((bot.blockAt(bot.entity.position)?.name || '').includes('water'));
    if (inWater) {
      bot.setControlState('jump', true);
    }

    // 2. Auto-Eat Reflex
    if (bot.food < 15 || (bot.health < 16 && bot.food < 20)) {
      tryEatFood();
    }

    // 3. Skip heavy autonomous actions if engaged in active user tasks
    if (isFarmAfk || isGuarding || isHarvesting || isMining || bot.vehicle) return;

    const now = Date.now();
    const commanders = ['jawirhub', 'epanganteng', 'sixmaney', 'evan'];

    // 4. Proximity Greet Reflex (Auto-greet ONLY if separated for >= 2 minutes / 120,000ms!)
    for (const cmdName of commanders) {
      const p = bot.players[cmdName]?.entity;
      const state = commanderDistanceState[cmdName] || { wasFar: false, farSince: 0 };

      if (!p) {
        // Player is offline or outside render distance (>32 blocks)
        if (!state.wasFar) {
          state.wasFar = true;
          state.farSince = now;
        }
      } else {
        const dist = bot.entity.position.distanceTo(p.position);
        if (dist > 18.0) {
          if (!state.wasFar) {
            state.wasFar = true;
            state.farSince = now;
          }
        } else if (dist <= 4.5) {
          // Player is now close! Check if they were far away for >= 2 minutes (120,000ms)
          if (state.wasFar && (now - state.farSince >= 120000)) {
            state.wasFar = false;
            state.farSince = 0;
            lastActivityTime = now;
            bot.lookAt(p.position.offset(0, 1.6, 0), true).catch(() => {});
            const isNat = cmdName.toLowerCase() !== 'sixmaney';
            const natGreetings = [
              "Hmph! Akhirnya nongol juga kamu Nat, lama banget sih! >///<",
              "Nat! Dari tadi ke mana aja? B-Bukan karena aku nungguin kamu ya!",
              "E-Evan... jangan ninggalin aku sendirian lama-lama dong! >///<",
              "Hmph, kirain nyasar di goa, Nat. Base aman kok berkat aku!"
            ];
            const ijulGreetings = [
              "Kak Ijul! Awas ya kalau bawa creeper deket-deket base!",
              "Halo Kak Ijul! Jangan ngisengin Nat mulu deh >///<",
              "Kak Ijul! Ada barter item bagus gak hari ini?"
            ];
            const pool = isNat ? natGreetings : ijulGreetings;
            sendChat(pool[Math.floor(Math.random() * pool.length)]);
            commanderDistanceState[cmdName] = state;
            return;
          } else if (state.wasFar && (now - state.farSince < 120000)) {
            // Player was only briefly away (<2 min), silently reset without annoying greeting
            state.wasFar = false;
          }
        }
      }
      commanderDistanceState[cmdName] = state;
    }

    // 5. Environmental Sunrise Reflex
    const { day, timeOfDay } = getMinecraftDay();
    if (timeOfDay >= 0 && timeOfDay < 1200 && lastCommentedDay !== day) {
      lastCommentedDay = day;
      const morningLines = [
        "Pagi Nat! Matahari udah terbit nih, monster pada kebakar! >///<",
        "Hmph, akhirnya siang juga. Hari baru lagi di SMP!",
        "Pagi semuanya! Jangan males-malesan ya hari ini >///<"
      ];
      sendChat(morningLines[Math.floor(Math.random() * morningLines.length)]);
      return;
    }

    // 6. Idle Curiosity Wander & Housekeeping (Runs only when completely idle for > 25 seconds)
    const isMoving = bot.pathfinder && bot.pathfinder.isMoving();
    if (!isMoving && (now - lastActivityTime > 25000)) {
      lastActivityTime = now;

      // 40% chance: Check for mature crops to auto-harvest
      const matureCrop = bot.findBlock({
        matching: (block) => {
          if (!block || !block.name) return false;
          const n = block.name;
          const isCrop = n === 'wheat' || n === 'carrots' || n === 'potatoes' || n === 'beetroots';
          if (!isCrop) return false;
          const age = block.metadata !== undefined ? block.metadata : (block._properties?.age || 0);
          return (n === 'beetroots' ? age >= 3 : age >= 7);
        },
        maxDistance: 8
      });

      if (matureCrop) {
        console.log(`[Gaia Autonomous] Menemukan tanaman matang ${matureCrop.name} di dekat base!`);
        harvestCropsLoop(config.owner);
        return;
      }

      // 60% chance: Wander 4-6 blocks nearby (Curiosity Roam)
      const angle = Math.random() * Math.PI * 2;
      const roamDist = 3 + Math.random() * 3;
      const targetX = Math.round(bot.entity.position.x + Math.cos(angle) * roamDist);
      const targetZ = Math.round(bot.entity.position.z + Math.sin(angle) * roamDist);
      const targetY = Math.round(bot.entity.position.y);

      try {
        bot.pathfinder.setGoal(new GoalNear(targetX, targetY, targetZ, 1), true);
      } catch (e) {}
    }
  }

  // Handle Boat Mounting
  function mountNearestBoat(caller) {
    const filter = (e) => {
      if (!e || !e.name) return false;
      const n = e.name.toLowerCase();
      return n.includes('boat') || n.includes('minecart');
    };

    const boat = bot.nearestEntity(filter);
    if (!boat) {
      sendChat(`Nggak nemu perahu di radius 5 blok! Taruh perahu deketan dulu dong >///<`);
      return;
    }

    try {
      bot.mount(boat);
      sendChat(`Hmph! Sudah naik perahu nih. Cepetan dayung, jangan lelet ya! >///<`);
    } catch (err) {
      sendChat(`Gagal naik perahu: ${err.message}`);
    }
  }

  // Handle Return to Commander
  function returnToOwner(caller) {
    const targetName = caller || config.owner;
    const player = bot.players[targetName];
    if (player && player.entity) {
      bot.pathfinder.setGoal(new GoalFollow(player.entity, 2), true);
    }
  }

  // Handle Follow Player
  function followPlayer(caller) {
    const player = bot.players[caller];
    if (!player || !player.entity) {
      sendChat(`Kamu kejauhan atau belum kelihatan di radar render-ku! Deketan dulu dong >///<`);
      return;
    }
    bot.pathfinder.setGoal(new GoalFollow(player.entity, 2), true);
    sendChat(`I-Iya iya aku ikutin di belakang... Bukan karena pengen deket ya! >///<`);
  }

  // Handle Inventory Report
  function reportInventory() {
    const items = bot.inventory.items();
    if (items.length === 0) {
      sendChat(`Tasku kosong melompong tau! Hmph! >///<`);
      return;
    }
    const summary = items.slice(0, 5).map(i => `${i.name} (${i.count})`).join(', ');
    sendChat(`Isi tasku: ${summary}${items.length > 5 ? '... dsb' : ''}. Jangan asal titip sampah ya! >///<`);
  }

  // Handle Auto-Eat
  function tryEatFood() {
    if (bot.food >= 20) {
      sendChat(`Perutku masih kenyang (Food 20), belum bisa makan lagi, Nat! >///<`);
      return;
    }

    const food = bot.inventory.items().find(item => {
      const name = item.name.toLowerCase();
      return name.includes('bread') || name.includes('steak') || name.includes('cooked') ||
             name.includes('apple') || name.includes('carrot') || name.includes('potato');
    });

    if (!food) {
      sendChat(`Nggak ada makanan di tasku! Bagi roti atau wortel dong... laper nih >///<`);
      return;
    }

    bot.equip(food, 'hand', () => {
      bot.consume(() => {
        sendChat(`Nyam! Akhirnya makan ${food.name}, makasih ya >///<`);
      });
    });
  }

  // 3D Terrain & Build Planning Scanner
  function executeAreaScan(caller, radius) {
    const targetPlayer = bot.players[caller]?.entity || bot.entity;
    const center = targetPlayer.position.floored();
    const biome = getBiomeNameAt(center);
    const { day } = getMinecraftDay();

    sendChat(`Memulai scan area radius ${radius} blok dari X:${center.x}, Z:${center.z} (${biome})...`);

    const r = Math.min(Math.max(radius, 5), 25);
    const heightMap = {};
    const blockCounts = {};
    let totalSolidBlocks = 0;
    let waterBlocks = 0;
    let lavaBlocks = 0;
    let minGroundY = 999;
    let maxGroundY = -999;

    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const x = center.x + dx;
        const z = center.z + dz;

        let foundY = null;
        for (let y = center.y + 25; y >= center.y - 35; y--) {
          const b = bot.blockAt(new Vec3(x, y, z));
          if (!b) continue;

          if (b.name === 'water') waterBlocks++;
          if (b.name === 'lava') lavaBlocks++;

          if (b.name !== 'air' && b.name !== 'cave_air' && b.name !== 'void_air' &&
              b.name !== 'water' && b.name !== 'lava' && b.boundingBox === 'block') {
            foundY = y;
            blockCounts[b.name] = (blockCounts[b.name] || 0) + 1;
            totalSolidBlocks++;
            break;
          }
        }

        if (foundY !== null) {
          heightMap[`${dx},${dz}`] = foundY;
          if (foundY < minGroundY) minGroundY = foundY;
          if (foundY > maxGroundY) maxGroundY = foundY;
        }
      }
    }

    const yFreq = {};
    Object.values(heightMap).forEach(y => {
      yFreq[y] = (yFreq[y] || 0) + 1;
    });

    let primaryFlatY = center.y;
    let maxFlatCount = 0;
    Object.entries(yFreq).forEach(([y, count]) => {
      if (count > maxFlatCount) {
        maxFlatCount = count;
        primaryFlatY = parseInt(y, 10);
      }
    });

    const elevationDiff = (maxGroundY !== -999 && minGroundY !== 999) ? (maxGroundY - minGroundY) : 0;
    const flatAreaPct = Math.round((maxFlatCount / ((2 * r + 1) * (2 * r + 1))) * 100);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const scanFileJson = path.join(SCANS_DIR, `scan_day${day}_${timestamp}.json`);
    const scanFileMd = path.join(SCANS_DIR, `scan_day${day}_${timestamp}.md`);

    const scanData = {
      timestamp: new Date().toISOString(),
      minecraftDay: day,
      caller,
      center: { x: center.x, y: center.y, z: center.z },
      biome,
      radius: r,
      elevation: { min: minGroundY, max: maxGroundY, diff: elevationDiff },
      primaryFlatElevation: primaryFlatY,
      flatBlockCount: maxFlatCount,
      flatCoveragePercentage: flatAreaPct,
      waterBlocks,
      lavaBlocks,
      blockComposition: blockCounts
    };

    fs.writeFileSync(scanFileJson, JSON.stringify(scanData, null, 2), 'utf8');

    const mdContent = `# 🏗️ Minecraft Build Site Scan: ${biome} (Day ${day})
- **Minecraft Day**: Day ${day}
- **Waktu Scan**: ${scanData.timestamp}
- **Lokasi Center**: X=${center.x}, Y=${center.y}, Z=${center.z}
- **Bioma**: \`${biome}\`
- **Radius Scan**: ${r} blok (Area Total: ${(2 * r + 1)}x${(2 * r + 1)} = ${(2 * r + 1) * (2 * r + 1)} blok)

---

## 📊 Analisis Elevasi & Topografi
- **Rentang Ketinggian**: Y=${minGroundY} s/d Y=${maxGroundY} (Selisih kontur: **${elevationDiff} blok**)
- **Elevasi Rata Dominan**: **Y=${primaryFlatY}** (${maxFlatCount} blok / **${flatAreaPct}% area datar**)
- **Kondisi Khusus**:
  - Blok Air (*Water*): ${waterBlocks} blok ${waterBlocks > 0 ? '(Dekat perairan)' : '(Tanah kering)'}
  - Bahaya Lahar (*Lava*): ${lavaBlocks} blok

---

## 🪵 Komposisi Material Permukaan
| Blok | Jumlah Terdeteksi | Rekomendasi Pemanfaatan |
| :--- | :--- | :--- |
${Object.entries(blockCounts).sort((a,b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => `| \`${name}\` | ${count} | ${name.includes('grass') ? 'Area dasar pondasi' : name.includes('stone') ? 'Bahan baku stone bricks' : name.includes('log') ? 'Bahan baku pilar rumah' : 'Material lansekap'} |`).join('\n')}

---

## 🎨 Rekomendasi Desain DKV & Blueprint Ako-chan
- **Elevasi Flat**: Bersihkan selisih $\\pm 1-2$ blok di sekitar Y=${primaryFlatY} untuk mendapatkan platform bangunan utama.
- **Palet Arsitektur yang Selaras**:
  - **Pilar**: Stripped Spruce/Oak Logs
  - **Dinding Utama**: Stone Bricks + Cobblestone + Planks
  - **Atap Kontras**: Deepslate Tiles / Spruce Stairs
  - **Lighting**: Lanterns gantung di sudut pilar untuk mencegah mob spawn.
`;

    fs.writeFileSync(scanFileMd, mdContent, 'utf8');

    console.log(`[Gaia] Scan selesai! Hasil tersimpan di: ${scanFileMd}`);
    sendChat(`Scan selesai! Bioma: ${biome}, Elevasi Y:${minGroundY}-${maxGroundY}. Area datar Y=${primaryFlatY} (${flatAreaPct}%). Laporan Day ${day} tersimpan di laptop! >///<`);
  }

  // Health and survival monitoring (Cooldown 10 detik!)
  let lastHealthAlertTime = 0;
  bot.on('health', () => {
    const now = Date.now();
    if (bot.health > 0 && bot.health < 8) {
      if (now - lastHealthAlertTime > 10000) { // 10 detik delay anti-spam
        lastHealthAlertTime = now;
        sendChat(`Nat! Kak Ijul! Darahku tinggal ${Math.round(bot.health)}! Tolongin dong jangan diem aja! >///<`);
      }
    }
    // Auto-eat if hungry OR if damaged and food is not full
    if (bot.food < 18 || (bot.health < 18 && bot.food < 20)) {
      tryEatFood();
    }
  });

  bot.on('kicked', (reason) => {
    console.warn(`[Gaia] Ter-kick dari server. Alasan: ${reason}`);
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    if (farmInterval) clearInterval(farmInterval);
    if (guardInterval) clearInterval(guardInterval);
    scheduleReconnect();
  });

  bot.on('end', () => {
    console.warn(`[Gaia] Koneksi terputus dari server.`);
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    if (farmInterval) clearInterval(farmInterval);
    if (guardInterval) clearInterval(guardInterval);
    scheduleReconnect();
  });

  bot.on('error', (err) => {
    console.error(`[Gaia Error] ${err.message}`);
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    if (farmInterval) clearInterval(farmInterval);
    if (guardInterval) clearInterval(guardInterval);
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  console.log(`[Gaia] Akan mencoba reconnect otomatis dalam 10 detik...`);
  reconnectTimer = setTimeout(() => {
    createBotInstance();
  }, 10000);
}

// Start bot
createBotInstance();
