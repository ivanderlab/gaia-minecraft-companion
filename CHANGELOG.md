# 📋 Changelog

All notable changes to the **Gaia Minecraft SMP Companion** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.0] - 2026-11-15

### 🚀 Added
- **Predictive Intercept Ballistics**: Integrated target velocity prediction ($v_{\text{ticks}}$) and flight-time calculation ($t_{\text{flight}} = \text{dist} / 2.60$) into arrow trajectory aiming. Bow aim now automatically leads moving targets and factors in parabolic gravity drop ($0.025 \times t^2$).
- **Dead Mob Filter**: Strict health and death-pose packet validation (`!isValid`, `!isAlive`, `health <= 0`, metadata 6). Cancels active bow draw immediately if target dies during charging.
- **Strict Line-of-Sight Filtering**: Mobs hidden inside caves or behind walls are filtered out upfront via fast Bresenham raycasting. Zero "menerawang" through solid blocks.
- **Tactical Standby Positioning**: In ranged combat, Gaia holds her ground and snipes from current position instead of recklessly charging forward. Melee engagement is strictly bounded to $\le 5.0$ blocks.
- **Off-hand Dual Priority**: Auto-equips `totem_of_undying` as Priority #1 for lethal protection; falls back to `shield` as Priority #2.
- **Active Shield Defense**: Auto-raises shield against incoming projectile archers (skeletons, strays, bogged, pillagers) and close-range hostile advances, with passive damage-hurt reflex.
- **Natural Vanilla Entity Movement**: Smooth look interpolation (eliminated instant 0ms yaw snapping), 3-block follow buffer distance, humanoid wooden door/gate traversal, and gentle idle glances (`updateNaturalIdleLook`).
- **Grouped Inventory Aggregation**: Full inventory reporting formatted cleanly as stacks (`Carrot (5 x 64 + 5)`) or singles (`Diamond (12)`) without truncation.
- **Chest Navigation Fix**: Cancels player follow lock before pathfinding directly to chests/barrels within 12 blocks, looks at block, and lists contents neatly grouped.
- **Default Guard Mode**: Guard mode is now active by default on bot spawn.

### 🐛 Fixed
- **Dual-Response Chat Stacking**: Removed double confirmation messages when executing actions via AI prompts (e.g., "Gaia follow me"). Implemented `silent` mode flag across all core actions so only the DeepSeek AI tsundere reply is delivered.
- **Chest Follow Override Bug**: Fixed issue where `GoalFollow` overrode chest interaction, causing Gaia to chase players instead of approaching the container.
- **Bow Draw on Dead Target**: Fixed bug where Gaia continued firing arrows at dying mob corpses during the 20-tick Minecraft death animation.
- **Blind Cave Charging**: Fixed issue where mobs 12 blocks away underground triggered melee pathfinding through subterranean terrain.

### 🗑️ Removed
- Removed hardcoded version strings from `README.md` (versioning is managed strictly via GitHub Releases and tags).
- Removed static 0ms head snaps during aiming and pathfinding.
- Removed truncated 5-item inventory cap.
- Removed deprecated Qwen fallback model definitions in favor of unified `deepseek-v4.1-flash`.

---

## [1.3.0] - 2026-11-15

### 🚀 Added
- **Master Job Terminator (`!stop` / `!stay` / `!cancel`)**: Instantly aborts mining, harvesting, chopping, AFK sentry, and pathfinding goals.
- **Vacuum Drop Collection**: Auto-pathfinds to broken block positions to vacuum item drops within 6 blocks.
- **Humanoid Door Traversal & Anti-Suffocation**: Opens wooden doors/gates ahead and auto-steps back if head intersects solid blocks.
- **Autonomous Bed & Sleep Cycle**: Auto-detects beds and sleeps through night/thunderstorms.
- **Autonomous Crafting**: Recipes for 2x2 and 3x3 (via Crafting Table navigation).

### 🐛 Fixed
- **Eating Spam**: Enforced 5-second minimum interval between eating attempts and added 45-second chat cooldown.

---

## [1.2.0] - 2026-11-15

### 🚀 Added
- Switch default LLM brain to `deepseek-v4.1-flash` via NusaGate API for sub-3s response latency.

---

## [1.0.0] - 2026-11-14

### 🚀 Initial Release
- Mineflayer bot with tsundere persona for Minecraft SMP Fabric 26.x (Protocol 775).
