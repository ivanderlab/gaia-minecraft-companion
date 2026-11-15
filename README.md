# 🌸 Gaia — Autonomous Tsundere Agentic AI Companion for Minecraft SMP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![Minecraft](https://img.shields.io/badge/Minecraft-Fabric%2026.x%20%7C%201.21.2+-blue.svg)](https://minecraft.net)
[![LLM Brain](https://img.shields.io/badge/Brain-DeepSeek%20v4.1%20Flash-blue.svg)](https://deepseek.com)
[![Author](https://img.shields.io/badge/Creator-IvanderLab-blueviolet.svg)](https://github.com/ivanderlab)

> **"Hmph! B-Bukan karena aku pengen bantuin kamu ya, Nat! Dasar pemalas >///<"**

**Gaia** adalah bot pendamping Minecraft SMP otonom (*autonomous agentic companion*) berbasis **Mineflayer** dan model kecerdasan buatan **Qwen 3.8**. Dirancang khusus untuk mabar di server modern Minecraft (Fabric 26.x / Protocol 775 & 1.21.x), Gaia memiliki kepribadian **Tsundere**, kemampuan navigasi cerdas, *ballistic auto-aim*, proteksi kawan (anti-friendly fire), mode penjaga *AFK Mob Farm*, serta siklus **Heartbeat** untuk bergerak dan berinteraksi secara mandiri.

---

## ⚡ Arsitektur & Fitur Utama

```
                      ┌───────────────────────────────────────┐
                      │             GAIA CORE                 │
                      └──────────────────┬────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
  [PHYSICS & NAV]                  [COMBAT & AFK]                 [AGENTIC BRAIN]
- Modern Protocol 775            - Ballistic Trajectory          - Qwen 3.8 Dual-Fallback
- tick_end synchronization       - Raycast Line-of-Sight         - In-Memory Chat DB
- Auto-Swim & Anti-Drown         - Strict Enderman Agro Check    - Heartbeat Loop (5-15s)
- A* Pathfinder + Auto-Equip     - AFK Farm Sweep Sentry         - Proactive Roam & Greet
```

### 1. 🧠 Agentic Brain & Persona Tsundere (Qwen 3.8)
- **Natural Language Understanding**: Panggil nama `Gaia` di chat in-game (contoh: `"Gaia tolong tebang kayu"` atau `"Gaia temenin dong"`). Gaia memproses maksud obrolan dan mengeksekusi tag aksi otomatis (`[ACTION:FOLLOW]`, `[ACTION:CHOP]`, `[ACTION:FARM]`, dll).
- **Dual-Engine Upstream Fallback**: Prioritas utama `qwen3.8-flash` dengan failover otomatis ke `qwen3.8-27b` untuk memastikan latensi respon $<1.2$ detik tanpa gangguan kuota/spot marketplace.
- **Ring-Buffer Chat Memory**: Mengingat riwayat obrolan terkini pemain dari RAM tanpa memberatkan I/O disk.
- **Strict Role-Playing**: Berkarakter Tsundere gengsi tinggi, setia menemani Nat (`JawirHub` / `EpanGanteng`) dan Ijul (`SixManey`), serta menolak perintah fisik dari pemain asing di server.

### 2. 🏹 Predictive Ballistics & Tactical Guard Engine
- **Velocity Intercept Lead & Parabolic Arc**: Menghitung vektor kecepatan mob ($v_{\text{ticks}}$) dan waktu tempuh panah ($t_{\text{flight}} = \text{dist} / 2.60$) untuk menembak ke posisi masa depan target, dikombinasikan dengan kompensasi gravitasi ($0.025 \times t^2$).
- **Strict Line-of-Sight (Anti-Menerawang)**: Raycast presisi tinggi menyaring target sejak awal. Mob di dalam goa atau di balik dinding tebal tidak akan pernah ditarget.
- **Dead Mob Filter (Zero Corpse Firing)**: Secara instan membatalkan tarikan busur jika monster mati saat busur ditarik (akibat api matahari, lava, atau serangan kawan).
- **Tactical Standby Positioning**: Saat memegang busur, Gaia menembak dari posisi standby tanpa lari mendekati musuh; saat melee, Gaia hanya menyergap musuh yang mendekat $\le 5.0$ blok.
- **Off-hand Gear Priority & Active Shield Defense**: Prioritas otomatis slot tangan kiri: **#1 Totem of Undying**, **#2 Shield**. Dilengkapi refleks menaikkan shield saat dibidik skeleton/stray atau terkena serangan tiba-tiba.
- **Modern 26.x Physics Synchronization**: Injeksi paket `tick_end` pada setiap physics tick agar kebal dari kick `invalid_player_movement` di server Fabric modern.

### 3. 🛡️ Mode AFK Farm Sentry (`!farm` / `!afk`)
- **Anchor Position Lock**: Mengunci koordinat $X, Y, Z$ agar bot tidak terdorong mob ke dalam lubang farm atau jurang.
- **1.6 Attack Speed Cooldown**: Mengayunkan pedang setiap 625 ms untuk memicu **Sweep Attack** dan damage maksimal 100%.
- **The Strict Enderman Rule**: Enderman pasif **100% diabaikan** agar tidak mengamuk di dalam farm. Hanya menyerang jika Enderman sudah berada dalam status agresif (*screaming*).
- **Auto-Eat on Post**: Otomatis makan jika darah/lapar berkurang tanpa meninggalkan titik jaga.

### 4. 💓 Heartbeat & Autonomous Desires (Gerak Mandiri)
- **Heartbeat Tick (Interval Acak 5s, 10s, 15s)**: Siklus evaluasi otomatis untuk memeriksa kondisi lingkungan tanpa membebani server.
- **Natural Vanilla Entity Movement**: Dilengkapi navigasi pintu kayu/gerbang otomatis, anti-suffocation reflex, jarak follow 3 blok yang nyaman, dan pergerakan kepala natural (*smooth idle glance*) layaknya mob vanilla.
- **Curiosity Roaming**: Jika menganggur (*idle* $> 25$ detik), Gaia berjalan-jalan santai dalam radius aman base (tidak menjadi patung diam).
- **Proximity Greet**: Menyapa Nat atau Ijul secara mandiri saat mendekat setelah bepergian jauh.
- **Auto-Replant Farm**: Memanen tanaman matang di sekitar base dan menanam bibitnya kembali.

### 5. ⛏️ Utility Systems (Mining, Crafting, Chest, Bed & Inv)
- **Auto Drop Collection Engine (`pickupNearbyDrops`)**: Saat menambang (`!mine`), Gaia tidak hanya memecahkan blok dari jarak jauh, melainkan otomatis melangkah ke koordinat jatuhnya blok dan menyedot seluruh entitas drop (`item`) dalam radius 6 blok ke dalam inventory.
- **Chest Navigation & Aggregation (`!chest`)**: Membatalkan pergerakan follow, berjalan langsung ke peti terdekat (hingga 12 blok), dan melaporkan isi peti terkelompok rapi.
- **Autonomous Crafting Engine (`!craft`)**: Mampu merakit resep 2x2 dan otomatis berjalan mendekati Crafting Table untuk resep 3x3.
- **Bed & Sleep Cycle (`!sleep` / `!wake`)**: Mendeteksi kasur terdekat dan tidur bersama saat malam tiba atau terjadi badai petir (*thunderstorm*).
- **Full Grouped Inventory (`!inv`)**: Menampilkan seluruh isi tas tanpa terpotong dalam format stack ringkas seperti `Carrot (5 x 64 + 5)` atau `Diamond (12)`.
- **Master Job Terminator (`!stop` / `!stay` / `!cancel`)**: Menghentikan SEMUA pekerjaan aktif secara instan — baik loop penambangan, tebang kayu, panen kebun, AFK farm sentry, maupun guard mode — dan mengunci posisi standby di tempat.
- **Single-Reply AI Protocol**: Menghilangkan duplikasi respon chat; memprioritaskan respon dialog AI DeepSeek dan hanya menggunakan pesan prebuilt sebagai fallback.

---

## ⌨️ Daftar Perintah In-Game (Prefix `!`)

| Perintah | Deskripsi | Akses |
| :--- | :--- | :--- |
| `!help` | Menampilkan ringkasan bantuan di chat in-game | Semua Pemain |
| `!pos` | Menampilkan koordinat $X, Y, Z$ dan nama bioma aktif | Semua Pemain |
| `!day` | Menampilkan hari Minecraft dan waktu tick dunia | Semua Pemain |
| `!inv` | Melaporkan isi tas bot | Semua Pemain |
| `!eat` | Memakan makanan yang tersedia di tas | Semua Pemain |
| `!tp` / `!accept` | Menerima request teleportasi (TPA) | Nat & Ijul |
| `!follow` | Mengikuti langkah langkah pemain | Nat & Ijul |
| `!stop` / `!stay` / `!cancel` | Menghentikan & membatalkan SEMUA pekerjaan aktif (mining, harvest, chop, afk farm, guard) | Nat & Ijul |
| `!mine <ore> [jml]` | Menambang ore/blok dan otomatis melangkah menyedot item drop ke tas | Nat & Ijul |
| `!farm` / `!afk` | Mengaktifkan mode AFK Farm Sentry (kunci posisi & babat mob) | Nat & Ijul |
| `!guard` | Mengaktifkan mode pengawalan & memanah monster liar | Nat & Ijul |
| `!chop` / `!wood` | Mencari dan menebang pohon kayu terdekat | Nat & Ijul |
| `!harvest` | Memanen dan menanam kembali tanaman kebun | Nat & Ijul |
| `!scan [radius]` | Memindai kontur 3D tanah & menyimpan blueprint bangunan | Nat & Ijul |
| `!boat` / `!mount` | Menaiki perahu terdekat sebagai penumpang | Nat & Ijul |
| `!exit` | Turun dari perahu | Nat & Ijul |
| `!craft <item> [jml]` | Merakit item secara otomatis (mendukung 2x2 tas & 3x3 Crafting Table) | Nat & Ijul |
| `!chest [list/deposit/withdraw]` | Mengakses peti/barrel terdekat (cek isi, simpan hasil tambang, atau ambil barang) | Nat & Ijul |
| `!sleep` / `!bed` | Mencari kasur terdekat dan tidur saat malam / badai petir | Nat & Ijul |
| `!wake` | Bangun dari kasur | Nat & Ijul |
| `!drop [item] [jml]` | Memberikan barang/hasil panen ke pemain | Nat & Ijul |
| `!droparmor` | Melepaskan seluruh armor dan senjata | Nat & Ijul |

> 💡 *Catatan: Kamu juga bisa memerintah Gaia secara bebas menggunakan bahasa manusia cukup dengan menyertakan kata **Gaia** di chat (contoh: `"Gaia tolong jagain kebun ya"`).*

---

## 🚀 Panduan Instalasi & Penggunaan

### 1. Prasyarat
- [Node.js](https://nodejs.org) versi 20.x ke atas.
- Akun Minecraft Java Edition (Online/Offline sesuai server tujuan).

### 2. Kloning Repositori & Instalasi Dependensi
```bash
git clone https://github.com/ivanderlab/gaia-minecraft-companion.git
cd gaia-minecraft-companion
npm install
```

### 3. Konfigurasi
Salin template konfigurasi:
```bash
cp config.example.json config.json
```
Sesuaikan isi `config.json`:
```json
{
  "host": "your-minecraft-server.com",
  "port": 25565,
  "username": "Gaia",
  "owner": "YourMinecraftUsername",
  "commanders": [
    "YourMinecraftUsername",
    "FriendUsername"
  ],
  "autoTpa": true,
  "scanRadius": 10,
  "llmEndpoint": "https://api.nusagate.com/v1",
  "llmApiKey": "YOUR_API_KEY_HERE",
  "llmModel": "deepseek-v4.1-flash"
}
```

### 4. Menjalankan Bot
```bash
node ako_bot.js
```
Atau jalankan file `start_bot.bat` di Windows.

---

## 📜 Lisensi & Kontributor

- **Author**: Ivander ([@ivanderlab](https://github.com/ivanderlab))
- **Lisensi**: MIT License. Bebas digunakan, dimodifikasi, dan dikembangkan untuk komunitas Minecraft SMP.
