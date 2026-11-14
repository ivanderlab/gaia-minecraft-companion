# 🌸 Gaia — Autonomous Tsundere Agentic AI Companion for Minecraft SMP (v1.2)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![Minecraft](https://img.shields.io/badge/Minecraft-Fabric%2026.x%20%7C%201.21.2+-blue.svg)](https://minecraft.net)
[![LLM Brain](https://img.shields.io/badge/Brain-Qwen%203.8%20Flash%20%2F%2027B-purple.svg)](https://qwenlm.github.io)
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

### 2. 🏹 Ballistic Auto-Aim & Combat Engine
- **Parabolic Trajectory Solver**: Menghitung gravitasi panah ($Y_{aim} = Y_{target} + (H \times 0.6) + 0.0028 \times D^2$) terinspirasi dari arsitektur client PvP Wurst/Meteor.
- **Raycast Line-of-Sight (LoS)**: Hanya menarik busur jika pandangan ke monster bersih tanpa terhalang dinding/tanah. Jika terhalang, Gaia bertahan dalam posisi siaga (*Guard Standby*).
- **Crossfire Safety (Anti-Friendly Fire)**: Membatalkan tembakan secara instan jika kawan melintas di kerucut tembakan busur.
- **Modern 26.x Physics Synchronization**: Dilengkapi injeksi paket `tick_end` pada setiap physics tick agar kebal dari kick `invalid_player_movement` di server Fabric modern.

### 3. 🛡️ Mode AFK Farm Sentry (`!farm` / `!afk`)
- **Anchor Position Lock**: Mengunci koordinat $X, Y, Z$ agar bot tidak terdorong mob ke dalam lubang farm atau jurang.
- **1.6 Attack Speed Cooldown**: Mengayunkan pedang setiap 625 ms untuk memicu **Sweep Attack** dan damage maksimal 100%.
- **The Strict Enderman Rule**: Enderman pasif **100% diabaikan** agar tidak mengamuk di dalam farm. Hanya menyerang jika Enderman sudah berada dalam status agresif (*screaming*).
- **Auto-Eat on Post**: Otomatis makan jika darah/lapar berkurang tanpa meninggalkan titik jaga.

### 4. 💓 Heartbeat & Autonomous Desires (Gerak Mandiri)
- **Heartbeat Tick (Interval Acak 5s, 10s, 15s)**: Siklus evaluasi otomatis untuk memeriksa kondisi lingkungan tanpa membebani server.
- **Curiosity Roaming**: Jika menganggur (*idle* $> 25$ detik), Gaia berjalan-jalan santai dalam radius aman base (tidak menjadi patung diam).
- **Proximity Greet**: Menyapa Nat atau Ijul secara mandiri saat mendekat setelah bepergian jauh.
- **Auto-Replant Farm**: Memanen tanaman matang di sekitar base dan menanam bibitnya kembali.

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
  "llmModel": "qwen3.8-flash"
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
