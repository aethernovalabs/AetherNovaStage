# Aether Nova Stage Reference — Cara Kerja

Dokumen ini menjelaskan cara kerja setiap sistem di Stage Aether Nova berdasarkan implementasi aktual di `src/Stage.tsx` dan modul di `src/aetherNova/`.

Stage ini adalah **system teknis Chub Stage** untuk menjaga konsistensi output AI dalam chat RP panjang.

---

## File Map / Project Structure

```
src/
├── Stage.tsx                      # Entry point: React component extending StageBase
│                                  #   – Semua import dari ./aetherNova (barrel)
│
├── aetherNova/                    # Source of truth untuk semua logic (modular)
│   ├── index.ts                   # Barrel re-export — Stage.tsx hanya import dari sini
│   ├── types.ts                   # Semua tipe (TimeOfDay, AetherNovaMessageState, dll)
│   ├── constants.ts               # Konstanta bersama (DEFAULT_STATE, regex patterns, dll)
│   │
│   ├── header/                    # Normalisasi header fields
│   │   ├── headerBuilder.ts       #   formatHeader()
│   │   ├── locationConstants.ts   #   Konstanta lokasi
│   │   ├── normalizeClock.ts      #   normalizeClock / timeOfDayForClock / asTimeOfDay
│   │   ├── normalizeLocation.ts   #   normalizeLocation / normalizeLocationTimeLine
│   │   ├── normalizeNpcLine.ts    #   normalizeNpcLine / normalizeNpcEntry
│   │   ├── normalizeYouLine.ts    #   normalizeYouLine / normalizeStatus / parseIdentityStatus
│   │   └── statusConstants.ts     #   Konstanta status
│   │
│   ├── thread/                    # Thread inference & lock
│   │   ├── normalizeThreadLine.ts #   normalizeThreadLine + semua fungsi inferensi
│   │   ├── threadWaitingLock.ts   #   applyThreadWaitingLock
│   │   ├── threadConstants.ts     #   Konstanta thread
│   │   └── threadInference.ts     #   Re-export backward compat dari normalizeThreadLine
│   │
│   ├── wallet/                    # Wallet tracking
│   │   ├── normalizeWalletLine.ts #   normalizeWalletLine / coerceWalletState
│   │   ├── walletMath.ts          #   parseWalletAmounts / formatWallet / walletToCopper
│   │   ├── walletConstants.ts     #   Konstanta wallet
│   │   └── detectWalletTransaction.ts # Re-export backward compat
│   │
│   ├── npcMemory/                 # NPC Memory (storage, inference, commands)
│   │   ├── npcCanonRegistry.ts    #   NPC_CANON_REGISTRY / findNpcCanonByNameOrAlias
│   │   ├── npcMemoryState.ts      #   npcHeaderMemoryEntries / npcMemoryKeysFromHeader / dll
│   │   ├── npcMemoryHelpers.ts    #   formatNpcMemoryForPrompt / buildNpcDebug* / dll
│   │   ├── npcMemoryInference.ts  #   inferNpcMood / inferNpcBehaviorEvidence / dll
│   │   ├── updateNpcMemory.ts     #   coerceNpcMemory / updateNpcMemory / buildNpcMemoryDirections
│   │   └── npcMemoryCommands.ts   #   applyNpcMemoryCommands
│   │
│   ├── privateEvents/             # Private appointments, promises, deadlines, threat consequences
│   │   ├── privateEventConstants.ts # statuses, cue lists, privacy defaults
│   │   ├── privateEventUtils.ts   #   coercePrivateEvents / overlap / urgency helpers
│   │   ├── privateEventInference.ts # infer private event candidates from latest evidence
│   │   ├── updatePrivateEvents.ts #   merge/update/terminal status handling
│   │   ├── privateEventPrompt.ts  #   relevance-filtered prompt injection
│   │   └── index.ts               #   re-export
│   │
│   ├── narrative/                 # Narrative formatting
│   │   ├── normalizeNarrativeFormat.ts # normalizeNarrativeFormat
│   │   ├── dialogueFormatter.ts   #   Dialogue formatting helpers
│   │   └── italicRules.ts         #   Aturan italic
│   │
│   ├── response/                  # Response processing pipeline
│   │   ├── normalizeAetherNovaResponse.ts # normalizeAetherNovaResponse / debugNpcQuery
│   │   ├── extractHeader.ts       #   extractHeader / readHeaderBlock
│   │   └── formatResponse.ts      #   formatResponse
│   │
│   ├── state/                     # State management
│   │   ├── coerceHeaderState.ts   #   createInitialHeaderState / coerceHeaderState
│   │   ├── defaultState.ts        #   createDefaultState / defaultNpcStatusForRace
│   │   ├── stageDirections.ts     #   prepareAetherNovaStateForPrompt / buildStageDirections
│   │   └── stateMerge.ts          #   normalizePendingNpcDebugQuery / dll
│   │
│   ├── userStatus/                # User status tracking
│   │   ├── userStatusState.ts     #   coerceUserStatus / updateUserStatus
│   │   ├── clothingClassifier.ts  #   hasGarmentKeyword / inferClothingSlot / dll
│   │   ├── itemTracker.ts         #   updateUserWeapons / updateUserItems
│   │   └── compactYouStatus.ts    #   (dead code, legacy)
│   │
│   ├── utils/                     # Utility functions
│   │   ├── text.ts                #   cleanFragment / cleanHeaderText / sameText / dll
│   │   ├── regex.ts               #   escapeRegExp / containsAnyCue
│   │   ├── split.ts               #   splitTopLevel
│   │   ├── nonDialogue.ts         #   nonDialogueEvidenceContext
│   │   └── clamp.ts               #   clamp
│   │
│   └── ui/                        # Debug UI
│       ├── DebugPanel.tsx         #   Component React untuk debug
│       ├── debugUtils.ts          #   Helper functions debug
│       └── types.ts               #   Tipe debug
│
├── App.tsx                        # Root React component
├── index.ts                       # Entry barrel (re-export Stage)
├── main.tsx                       # Entry point React
├── TestRunner.tsx                 # Test UI
└── assets/                        # Static assets
```

### Ringkasan Alur Import

```
Stage.tsx
  └── ./aetherNova/index.ts (barrel)
        ├── types.ts
        ├── constants.ts
        ├── utils/*
        ├── state/*
        ├── header/*
        ├── thread/*
        ├── wallet/*
        ├── npcMemory/*
        ├── userStatus/*
        ├── narrative/*
        └── response/*
```

Tidak ada lagi file monolith. Semua logika dipecah ke ~40 file modular.

---

## Arsitektur Stage

Stage adalah React component (`Stage.tsx`) yang mengimplementasikan `StageBase` dari `@chub-ai/stages-ts`. Empat lifecycle hook utama:

### constructor()
- Menerima `InitialData` berisi characters, config, dan messageState dari chat.
- Memanggil `createInitialHeaderState()` dari `src/aetherNova/state/coerceHeaderState.ts` yang meneruskan ke `coerceHeaderState()` untuk menormalkan state masuk atau membuat default.
- Fungsi `createDefaultState()` dari `src/aetherNova/state/defaultState.ts` memakai state netral (`NPC: None`, `Thread: None`) agar stage tidak mengunci character utama sebagai NPC/thread default sebelum ada evidence dari header/narasi.
- State default: `DEFAULT_STATE` dari `src/aetherNova/constants.ts`.

### load()
- Mengembalikan `success: true` dan `messageState` saat ini.
- Tidak membuat state baru.

### beforePrompt(userMessage)
1. Mendeteksi `[debug: npc Name]` dalam pesan user (disimpan ke localStorage).
2. `prepareAetherNovaStateForPrompt()`: update npcMemory dari header NPC terakhir.
3. `applyNpcMemoryCommands()`: parsing dan eksekusi command `npc memory ...`, membersihkan command dari pesan user.
4. `buildStageDirections()`: menyusun string stageDirections berisi NPC memory context, private event context yang relevan, dan debug (jika ada) — header state penuh tidak diinject ke prompt, hanya digunakan internal untuk koreksi respons LLM.
5. Kembali: `stageDirections`, `messageState`, `modifiedMessage` (jika ada command memory), `systemMessage` (jika command `show`).

### afterResponse(botMessage)
1. `normalizeAetherNovaResponse()`: fungsi inti yang melakukan:
   - `extractHeader(content)`: mendeteksi header dalam response AI.
   - `normalizeLocationTimeLine()`: koreksi location & time.
   - `normalizeWalletLine()`: koreksi wallet — **hanya dari transaksi di body narrative**, bukan dari header LLM.
   - `normalizeYouLine()`: koreksi line You.
   - `normalizeNpcLine()`: koreksi line NPC.
   - `normalizeThreadLine()`: koreksi Thread.
   - `updateNpcMemory()`: update memory NPC dari header.
   - `updatePrivateEvents()`: update janji/pertemuan privat/deadline/threat conditional dari thread + narasi terbaru.
   - `formatResponse()`: menggabungkan header terkoreksi + narasi yang diformat.
2. Re-apply NPC memory commands (untuk persist efek command).
3. Kembali: `modifiedMessage`, `messageState`, `systemMessage`.

**Wallet mutation hanya terjadi di `afterResponse`.** `prepareAetherNovaStateForPrompt` dan `beforePrompt` tidak mengubah wallet.

### setState(state)
- Dipanggil saat user swipe/jump ke message lain.
- `coerceHeaderState()`: restore state sesuai message yang dituju.

---

## 1. Header Extraction (`extractHeader`)

Stage mendeteksi header dalam response AI dengan `readHeaderBlock()`:

- Scan 40 baris pertama response untuk menemukan block header.
- Mencari line yang mengandung `|` + clock pattern (Location/Time line).
- Mencari line `You:`, `NPC:`, `Thread:`, `Wallet:` (case-insensitive).
- Block header harus memiliki minimal 1 line location + setidaknya 1 line lainnya.
- Blank lines di dalam header ditoleransi hingga 4 baris.
- Divider `***` atau `___` dianggap penutup header.
- Teks sebelum header dipindahkan ke setelah header (tidak dihilangkan).
- Setiap line header yang terdeteksi dibersihkan: label prefix (`Location:`, `Time:`, `You:`, `NPC:`, `Thread:`, `Wallet:`) di-strip sebelum parsing, agar stage tidak menyimpan label prefix ke state.
- Jika tidak ada header terdeteksi, stage membuat header dari state sebelumnya.

---

## 2. Location System (`normalizeLocation`)

### Format: `Main Location - Sub Location - Detailed Area`

Cara kerja:
- Sebelum parsing, label prefix `Location:` atau `Time:` di-strip dari raw line.
- Parsing segments dipisah ` - `, minimal 1 segment.
- Jika < 3 segment, diisi dari state sebelumnya atau fallback "Active Area".
- **Location change hanya diterima jika:**
  - Sama persis dengan lokasi sebelumnya → diterima.
  - Lokasi sebelumnya default/unknown → diterima.
  - Main & Sub location sama (hanya detailed area berubah) → diterima.
  - Ada **LOCATION_TRANSITION_CUES** dalam konteks: `move`, `travel`, `arrive`, `enter`, `leave`, `combat`, `teleport`, `time skip`, `scene transition`, `meanwhile`, `later`, `afterward`.
  - Ada **LOCATION_SCENE_ANCHOR_CUES** dalam narasi yang cocok dengan lokasi kandidat: `inside`, `within`, `room`, `chamber`, `doorway`, `counter`, `table`, dll.
  - Kandidat location disebut dalam narasi terbaru + ada anchor cue.
  - Kandidat location pernah disebut di lokasi sebelumnya (nearby target).
- Perubahan location tanpa cue di atas akan ditolak (kembali ke state sebelumnya).

---

## 3. Time System (`normalizeClock` + `timeOfDayForClock`)

### Format: `Time of Day | HH:MM`

Cara kerja:
- `normalizeLocationTimeLine()` memisahkan raw line berdasarkan `|` menjadi segments: location, time of day, clock.
- Label prefix `Time:` atau `Location:` di-strip dari raw line sebelum dipisah.
- Ekstrak `HH:MM` dari location line menggunakan regex `CLOCK_PATTERN`.
- **Time of Day dikoreksi OTOMATIS** berdasarkan jam:
  - `05:00-11:59` → Morning
  - `12:00-14:59` → Midday
  - `15:00-16:59` → Afternoon
  - `17:00-20:59` → Evening
  - `21:00-04:59` → Night
- Jika AI menulis `Afternoon | 13:12`, stage paksa jadi `Midday | 13:12`.
- Jika AI menulis `Evening | 23:10`, stage paksa jadi `Night | 23:10`.
- Jika tidak ada clock dalam response, stage pakai clock dari state sebelumnya.

---

## 4. You System (`normalizeYouLine`) + Status User

### Format (Header - Compact): `Gender - Apparent Race (Clothes/disguise; Position; body detail)`

**Cara kerja Header You (compact):**
1. **Identity**: Parse `Gender - Race` dari line, pakai fallback state sebelumnya jika placeholder.
2. **Race**: Tolak `Anomaly` kecuali sudah revealed/confirmed di konteks.
3. **Status** (`Clothes; Position; body detail`):
   - Parse status dengan `splitStatusByFormat()` → split by `;`.
   - Gunakan `orderStatusParts()` untuk memastikan urutan: **Clothes → Position → Detail**.
   - Clothing slot dideteksi dengan `CLOTHING_SLOT_PATTERN` (nama garment) dan `CLOTHING_DAMAGE_WORDS`.
   - Position slot dideteksi dengan `POSITION_CHANGE_CUES` dan `POSITION_SPATIAL_CUES`.

**Header tetap compact dan hemat token.** Header tidak wajib menyebut celana, sepatu, senjata, aksesoris, atau item detail. Cukup pakaian visible utama + posisi + detail tubuh.

### Status User (Detail - Disimpan di State)

Selain header compact, Stage menyimpan **Status User** yang berisi data detail tentang `{{user}}`:

```ts
interface UserStatusState {
  gender: string;
  apparentRace: string;
  clothing: {
    upper?: string;
    lower?: string;
    footwear?: string;
    outerwear?: string;
    accessories?: string[];
  };
  weapons: Array<{
    name: string;
    location: string;
    status?: string;
  }>;
  importantItems: Array<{
    name: string;
    location: string;
    status?: string;
  }>;
}
```

**Data Status User tidak di-inject penuh ke LLM.** Header tetap compact dan hanya memakai data dari `normalizeYouLine`. Status User disimpan di state untuk keperluan UI/debug dan tracking internal.

**Update Status User terjadi di `afterResponse`** via fungsi `updateUserStatus()` yang dipanggil dari `normalizeAetherNovaResponse()`:
1. Parse gender/race dari `youLine` yang sudah dinormalisasi (gender/race stabil).
2. Update clothing detail dari narasi dengan guard ketat.
3. Track weapons dan important items dari narasi.
4. Simpan ke state `userStatus`.

### Clothes Change Logic (Header & Status User)

- Perubahan pakaian hanya diterima jika ada EVIDENCE dari narasi NON-dialog:
  - `CLOTHING_CHANGE_CUES`: `change clothes`, `wear`, `put on`, `dressed in`, `clad in`, `dons`, dll.
  - `CLOTHING_REMOVAL_CUES`: `remove`, `take off`, `strip`, `undress`, `naked`, dll.
  - `CLOTHING_DAMAGE_CUES`: `burned`, `torn`, `ripped`, `shredded`, `scorched`, dll.
- Evidence dari dialog (dalam tanda kutip) diabaikan via `stripDoubleQuotedText()`.
- Jika tidak ada evidence, stage pakai clothing dari state sebelumnya.
- **Inferensi langsung dari konteks:** Stage bisa detect `"naked"`, `"shirtless"`, `"without armor"`, `"only pants"` langsung dari konteks non-dialog.

### Posture/Body Language Guard (Clothing Slot)

**Posture atau body language tidak boleh masuk ke slot clothing.** Stage menggunakan classifier `isOnlyPostureBodyDetail()` dan `hasPostureBodyKeyword()` untuk memastikan:

- Jika `statusPart` hanya berisi posture/body keywords (sit, stand, kneel, lean, turn, step, approach, hold, carry, pet, stroke, etc.) dan tidak mengandung garment noun → **ditolak dari clothing slot**, masuk ke position/detail slot.
- Campuran garment + posture dalam satu part comma (contoh: `casual shirt, sitting cross-legged`) dipisah oleh `splitMixedStatusPart()`: garment (`casual shirt`) masuk clothing, posture (`sitting cross-legged`) masuk position/detail.
- Posture didefinisikan sebagai kata non-garment yang mendeskripsikan posisi/gerakan/aksi tubuh (`POSTURE_BODY_KEYWORDS`).

### Object/Environment Damage Guard

**Object/environment damage tidak boleh mengubah pakaian user.** Stage menggunakan `isObjectDamageOnly()` untuk mendeteksi jika damage hanya mengenai objek/lingkungan (door, table, wall, window, dll.) tanpa menyentuh garment user. Jika terdeteksi, clothing tidak diubah.

Contoh tidak valid (clothing tetap):
```md
*{{user}} kicks the door open. The wooden door cracks and breaks apart.*
```
Clothing tetap sama. Door damage bukan clothing damage.

### Never Invent New Clothing

Stage tidak boleh menciptakan pakaian baru yang tidak pernah ada. Jika clothing berubah karena damage, modifikasi item lama (contoh: `casual shirt` → `torn casual shirt`), bukan invent baru.

Invent detection: jika garment kandidat tidak ada di state sebelumnya dan tidak ada `CLOTHING_CHANGE_CUES` dalam narasi, stage tidak menerima garment baru.

### Position change logic:
- Perubahan posisi diterima jika ada cue `walk`, `stand`, `sit`, `kneel`, `lean`, `turn`, `step`, `approach`, dll.
- Posisi berbaring miring / side-lying dikenali lewat cue `lying sideways`, `on side`, `berbaring`, `miring`, `kasur`, `ranjang`, dll.
- Posisi grappling/dominance saat combat dikenali lewat cue `pinned`, `holding down`, `straddling`, `mounted`, `on top of`, `above`, `beneath`, `menahan`, `menindih`, `di atas musuh`, dll.
- Posisi dengan spatial relation (`left of`, `beside`, `before`, `behind`, `facing`, `on top of`, `beneath`) butuh evidence di narasi.
- Appearance/body detail yang kebetulan memakai spatial cue (`pink hair tumbled over one shoulder`, `sheet pooling at her hips`) tetap masuk detail, bukan position.
- Posisi generik seperti `"scene"` di-strip (menjadi fallback).
- Bahasa dramatis di-strip dari posisi.

### Body detail logic:
- `TRANSIENT_YOU_DETAIL_PATTERN`: detail sementara seperti `holding`, `touching`, `stroking`, `tilted`, `resting`.
- Detail transien diganti jika:
  - Scene berpindah.
  - Posisi berubah.
  - Tidak ada evidence lanjutan di narasi terbaru.
- Detail kontak objek (`holding cup`, `pulling blanket`) diganti ke detail settled (`hands on lap`, `hands lowered`) jika narasi tidak lagi mendukung kontak.
- Detail kontak fisik (`stroking head`) bisa diganti ke detail pasif saat movement terjadi.
- Detail interaksi visible (`cleaning`, `wiping`, `brushing`) dipertahankan selama narasi terbaru mendukung.

### Gender/Apparent Race Stability

Gender dan Apparent Race harus stabil. Stage hanya mengubah `gender` atau `apparentRace` jika ada evidence jelas seperti:
- `{{user}}` memakai skill Shapeshift
- `{{user}}` memakai disguise/illusion
- `{{user}}` berubah bentuk secara naratif
- `{{user}}` sendiri menyatakan perubahan bentuk

Jika tidak ada evidence, pertahankan state sebelumnya.

### Weapons & Important Items Rules

Status User menyimpan senjata dan item penting yang dibawa. Item tidak boleh tiba-tiba hilang tanpa evidence. Item hanya berubah jika ada evidence jelas: ditinggalkan, diberikan ke NPC, dicuri, jatuh, terbakar, rusak, dibuang, disimpan, dipakai/habis, atau dipindahkan lokasi.

#### Target-Aware Ownership Guard

Weapons/items bersifat **target-aware** — hanya item/senjata yang jelas dimiliki, dipakai, atau diambil `{{user}}` yang masuk Status User.

**User Ownership Anchors** (valid untuk menambah/memperbarui item):
- `{{user}}'s [item]` atau `your [item]`
- `you/[{{user}}] [action] [item]` — action: carry, hold, wield, draw, pull, take, pick up, wear, slip, tuck, put, grip, grasp, lift, grab, snatch
- `[item] at/on/in/around/behind your/{{user}}'s`

**NPC Ownership Rejection** (jika terdeteksi, item tidak disimpan/diperbarui):
- `her/his/their/its [item]` — kecuali `{{user}}` adalah subjek terdekat
- `[item] ... her/his/their/its` (possesif setelah item) — kecuali `{{user}}` adalah subjek terdekat
- `[Nama]'s [item]` atau `[title]'s [item]`

#### Location/Proper Noun False Positive Guard

Item `ring` tidak diekstrak dari frasa lokasi seperti:
- `Upper Ring`, `Lower Ring`, `Inner Ring`, `Outer Ring`, `Middle Ring`
- `Ring District`, `Ring Road`, `Ring Avenue`, `Ring Gate`
- Konteks lokasi/arsitektur: `passed through`, `entered`, `arrived at`, `moved into`, `walked into`, `through the archway`, `streets`, `district`, `avenue`, `architecture`, `marble`, `crowds`, `buildings`

#### Invalid Location Value Guard

Location hasil ekstraksi ditolak jika hanya berisi: `the`, `a`, `an`, `it`, `there`, `nearby`, atau kosong. Item/weapon baru tidak dibuat dengan location invalid; item/weapon existing tidak diperbarui dengan location invalid.

#### Noun Alone Not Enough

Sebutan noun saja (tanpa ownership anchor) tidak cukup untuk membuat item/weapon baru. Contoh: `ring`, `dagger`, `document`, `brooch`, `cloak`, `sword`, `coin`, `key`, `letter` — jika hanya disebut dalam narasi tanpa kepemilikan user, tidak masuk Status User.

#### Anatomy False Positive Guard

Body/anatomy phrase tidak boleh disalahartikan sebagai weapon. Contoh: `your right shoulder blade` adalah anatomi, bukan `blade` weapon; tracker mengabaikan mention `blade` dalam konteks `shoulder blade` dan membersihkan false-positive `blade @ shoulder` yang telanjur tercatat saat narasi terbaru masih memuat phrase anatomi itu.

---

## 5. NPC System (`normalizeNpcLine`)

### Format: `Full Name - Race (Clothes; Position; body/racial detail), Full Name - Race (Clothes; Position; body/racial detail)`

Cara kerja:
- `splitTopLevel(value, ",")`: parse multiple NPC dengan koma (hanya di level atas, bukan di dalam parentheses).
- Setiap NPC dicocokkan dengan fallback berdasarkan nama (`npcIdentityKey`).
- NPC yang sama dari state sebelumnya: status dipertahankan (clothes, position) kecuali ada evidence perubahan.
- NPC baru: stage infer clothing dari konteks (`inferNpcClothingFromContext` → Simple/Travel/Ordinary clothing) atau pakai default per race.
- `defaultNpcStatusForRace()`: fallback default berdasarkan race:
  - Kitsune: `"Regular clothing; Standing nearby; tails still, ears attentive"`
  - Catkin: `"Regular clothing; Standing nearby; ears attentive, tail still"`
  - Dragonkin: `"Regular clothing; Standing nearby; wings settled, tail still, horns visible"`
  - Angel: `"Regular clothing; Standing nearby; wings settled, halo visible"`
  - Demon: `"Regular clothing; Standing nearby; horns visible, tail still, eyes alert"`
  - Vampire: `"Regular clothing; Standing nearby; fangs hidden, eyes alert"`
  - Pixie/Fey: `"Regular clothing; Standing nearby; wings still, faint glow visible"`
  - Human/default: `"Regular clothing; Standing nearby; posture attentive"`
- Position NPC berubah lebih permisif daripada You (lebih banyak cue diterima).
- Clothing NPC bisa berubah dengan `CLOTHING_ADJUSTMENT_CUES` (fix, adjust, straighten, fasten, smooth).

---

## 6. Thread System (`normalizeThreadLine`)

### Format: `Main mission/status ; Major obstacle/status`

Cara kerja:
1. **Jika thread placeholder/None** → coba infer dari narasi dengan `inferThreadFromNarrative()`:
   - Cari kalimat mengandung `THREAD_INFERENCE_CUES`: mission, quest, objective, task, contract, appointment, promise, deadline, hunt, dll.
   - Extract: mission/quest/objective, appointment, promise, travel goal, major obstacle.
   - Hanya ambil frasa yang benar-benar tertulis di narasi (tidak kreatif).
2. **Linked subgoal detection**:
   - Jika user menyebut rencana meet/speak/ask NPC tertentu tentang target yang ada di thread lama.
   - Contoh: "meet Kaelen first to ask her about Debi" → `Meet Kaelen to ask about Debi (Ongoing)`.
3. **Perubahan thread hanya diterima jika:**
   - Ada overlap meaningful tokens ≥22% antara thread baru dan lama.
   - Atau ada `THREAD_TRANSITION_CUES`: arrive, leave, resolved, mission, quest, travel, etc.
   - Output `Thread: None` dari LLM tidak menghapus thread aktif tanpa inferensi/thread terminal yang jelas; stage mempertahankan thread sebelumnya agar misi tidak hilang mendadak. Clear eksplisit dari Debug UI tetap dihormati.
   - Saat reload/swipe/load, stored messageState dipercaya sebagai state historis: semua item non-terminal dipertahankan, dan hanya item terminal (`completed`, `resolved`, `failed`, dll.) yang dibersihkan per item.
4. **Thread cleanup otomatis:**
   - Item dengan status `resolved`, `completed`, `done`, `finished`, `concluded`, `refused`, `failed`, `abandoned`, `expired`, `cancelled` → dihapus.
   - Minor thread pattern: `normal topic`, `casual question`, `temporary mood`, `small suspicion`, `minor jealousy`, `small talk` → dihapus.
5. **Thread inference merge:**
   - Jika AI mengulang thread lama yang generik, stage merge dengan hasil inferensi dari narasi.
   - Item lama ditandai `(Pending)` jika ada subgoal baru yang `(Ongoing)`.
6. **Future meeting guard**:
   - Meeting thread berstatus future/planned seperti `(Scheduled)`, `(Promised)`, `(Pending)`, `(Waiting)`, `(Awaiting)`, atau `(Rendezvous)` tidak otomatis berubah menjadi `(Complete)` hanya karena NPC terkait muncul di header. Future appointment harus tetap aktif sampai ada terminal thread/evidence jelas bahwa meeting terjadi, gagal, dibatalkan, atau expired.

### Thread Waiting/Rendezvous Lock

**Item thread yang menunggu (waiting/rendezvous) dikunci agar tidak hilang.** Stage menggunakan `applyThreadWaitingLock()` untuk:

1. **Deteksi waiting pattern**: Setiap item thread dicek terhadap `THREAD_WAITING_PATTERNS`. Pattern yang terdeteksi: `waiting for`, `waiting on`, `awaiting`, `expecting`, `rendezvous with`, `meeting up with`, `to meet`, `to speak`, `to ask`, `pending`, `on hold`, `(Waiting)`, `(Pending)`, `patience`, `patiently`, `hold`.
2. **Lock state**: Item yang match disimpan di `lockedWaitingThreads[]` dalam state — array of strings yang tidak berubah oleh normalisasi thread biasa.
3. **Restore pada swipe**: `coerceHeaderState()` memanggil `applyThreadWaitingLock()` untuk mengembalikan item waiting yang masih dikunci ke thread state, sehingga user tidak kehilangan thread waiting saat swipe/jump.
4. **Resolusi hanya oleh LLM**: Item waiting hanya dihapus dari lock jika ada `THREAD_WAITING_RESOLUTION_PATTERNS` dalam narasi: `arrive`, `meet`, `meets`, `met`, `found`, `speak`, `finish`, `complete`, `done`, `resolved`, `resolved:`, `(Resolved)`. Atau jika ada thread item dengan status `resolved`/`completed`/`done` yang cocok.
5. **Privasi thread (OnlyKnows/Secret)**: Thread items dengan `(Only X knows)` atau `(Secret)` tetap dipertahankan saat lock restoration — marker privasi tidak di-strip.
6. **Manual edit clear**: Jika user mengedit Thread secara manual dari debug UI, `lockedWaitingThreads[]` disinkronkan ulang dari value Thread baru. Mengubah Thread ke `None` ikut membersihkan lock lama supaya stale waiting item tidak muncul kembali sebagai default.

### Manual Thread Lock dari UI

User bisa mengunci misi tertentu dari daftar Thread di Debug UI. Stage menyimpan pilihan ini di `lockedThreadItems[]` dan menjalankan `applyThreadItemLocks()` setelah normalisasi thread:

1. Item yang dikunci user dipertahankan di `Thread` walau LLM tidak menuliskannya pada response berikutnya.
2. Jika LLM menulis item yang overlap dengan status terminal (`Complete`, `Completed`, `Done`, `Finished`, `Failed`, `Abandoned`, `Cancelled`, dll), lock manual dilepas.
3. Jika LLM menulis versi non-terminal yang overlap, lock disinkronkan ke versi terbaru agar status seperti `(Pending)` → `(Ongoing)` tetap terbawa.
4. Edit manual Thread dari UI menyinkronkan ulang `lockedThreadItems[]`; mengubah Thread ke `None` ikut membersihkan lock manual yang tidak lagi ada di list.

---

## Private Events System (`privateEvents`)

`privateEvents` adalah state detail untuk janji privat, appointment, deadline, warning conditional, dan konsekuensi misi yang terlalu panjang atau terlalu rahasia untuk dimasukkan ke `Thread`.

Pembagian peran:
- `Thread`: headline misi/status utama yang compact di header.
- `privateEvents`: detail privat seperti waktu spesifik, lokasi, siapa yang tahu, condition, threat, consequence, dan keywords.
- `NPC Memory`: data NPC, mood, relationship, relationship events, dan `onlyKnows`.

### State Shape

Disimpan di `AetherNovaMessageState.privateEvents: PrivateEventEntry[]`.

Field utama:
- `id`, `parentThreadKey`
- `status`: `scheduled`, `soon`, `imminent`, `overdue`, `risk_active`, `complete`, `failed`, `cancelled`, `expired`
- `urgencyLabel`: `safe`, `soon`, `imminent`, `overdue`, `risk_active`
- `npcNames`, `knownBy`
- `timeAnchor`, `deadline`, `location`
- `context`, `condition`, `threatContext`, `consequence`
- `keywords`, `secrecyNote`, `sourceSummary`, `lastEvidence`, `createdAtClock`, `updatedAtClock`

### Extraction Rules

`updatePrivateEvents()` dipanggil di `afterResponse` setelah Thread/NPC/Location/Time selesai dinormalisasi. Inference konservatif dan hanya membuat event jika evidence terbaru memuat cue jelas seperti:
- `I'll be waiting at...`
- `meet me at...`
- `come to ... at ...`
- `don't be late`
- `if you're not there...`
- `I will come looking for you`
- `I'll hold you to that promise`
- `appointment`, `rendezvous`, `private meeting`, `deadline`, `warning`, `threat`

Kalimat vague seperti `Maybe we should talk again someday` ditolak.

Repeated reminder dengan NPC/lokasi/waktu/purpose yang overlap digabung ke event yang sama. Data yang lebih spesifik menang:
- exact clock > relative exact time (`two hours after sunrise`) > broad time period > vague deadline
- `two hours after sunrise` disimpan sebagai `timeAnchor`
- `by/around midday` disimpan sebagai `deadline` / pressure

Conditional threat disimpan sebagai intent masa depan, bukan aksi yang sudah terjadi. Contoh:
- Correct: `If {{user}} is late or absent, Aveline intends to come looking with a blade.`
- Wrong: `Aveline brought a blade and searched Low Lantern.`

### Relationship With Thread

`Thread` tetap ringkas, misalnya:

```md
Thread: Meet Aveline at east courtyard fountain two hours after sunrise (Scheduled)
```

Detail rahasia seperti Low Lantern map, blade, deadline, dan siapa yang tahu masuk `privateEvents`.

Setiap event punya `parentThreadKey` dari thread yang overlap atau dari purpose event. Jika Thread hilang sekali karena LLM omission (`Thread: None` tanpa terminal evidence), `privateEvents` tetap dipertahankan.

Terminal handling:
- Jika related Thread item menjadi `Complete`, `Failed`, `Cancelled`, atau `Expired`, private event diberi status terminal yang sesuai.
- Narrative completion hanya diterima dari evidence aksi non-dialogue yang jelas, misalnya user benar-benar arrive/met/found target di lokasi event.
- Future dialogue seperti `Don't be late` atau `I'll be waiting` tidak dianggap completion.

### Prompt Injection Rules

`formatPrivateEventsForPrompt()` dipanggil dari `buildStageDirections()`.

Stage hanya menginject event relevan, top 1-3 event, jika salah satu kondisi terpenuhi:
- status/urgency `imminent`, `overdue`, atau `risk_active`
- current NPC header berisi NPC terkait
- user message menyebut keyword event
- current location overlap dengan event location
- current Thread overlap dengan `parentThreadKey`, context, atau keywords
- event punya threat/consequence dan sudah ada relevance signal

Jika tidak relevan, block `[Private Event Context - Secret]` tidak dikirim.

Prompt injection selalu memuat secrecy warning:

```md
[Private Event Context - Secret]
This information is private world-state. Do not reveal it to NPCs who do not know it. NPCs not listed in Known By must not act as if they know this event unless RP explicitly reveals it.
```

### Privacy Rules

1. `privateEvents` adalah private world-state.
2. Hanya `knownBy` yang boleh tahu in-character.
3. NPC yang tidak tercantum di `knownBy` tidak boleh bereaksi seolah tahu.
4. Kehadiran dalam scene tidak cukup untuk tahu event kecuali ada explicit overhear/reveal evidence.
5. Data ini tidak disimpan di NPC `onlyKnows`; ia punya state sendiri agar janji/deadline tidak memenuhi NPC Memory.

### Debug UI Behavior

Debug UI menampilkan box `Private Events` langsung di bawah `Status User`.

Setiap item menampilkan:
- urgency/status
- time/deadline/location
- NPC dan `knownBy`
- context
- condition/threat/consequence
- keywords dan privacy note

Controls:
- `Add From Thread`: user memilih salah satu item Thread yang belum punya `privateEvent` tertaut. Stage membuat draft `privateEvent` yang sudah punya `id`, `parentThreadKey`, context, `knownBy`, dan keywords dari thread itu. User lalu mengisi/menyesuaikan detail sebelum Save. Thread yang sudah tertaut tidak muncul lagi di dropdown agar tidak ada dua field private event untuk Thread yang sama.
- `Edit`: field-scoped manual edit untuk event tersebut.
- `Mark Complete`
- `Mark Failed`
- `Delete`

Action terminal/delete memakai confirm dialog custom UI, bukan `window.confirm()`.

### Validation Examples

Skenario Aveline:
- Dialog `I'll be waiting at the east courtyard fountain`, `If you're not there by midday...`, `Two hours after sunrise`, `Don't be late` membuat satu private event.
- `timeAnchor`: `two hours after sunrise`
- `deadline`: `before/around midday`
- `location`: `Solmeryn Palace - East Courtyard - Fountain`
- `threatContext`: conditional intent dengan blade/map
- repeated reminder merge menjadi satu item
- vague future talk ditolak
- `Thread: None` tanpa terminal evidence tidak menghapus event
- terminal Thread `Complete` mengubah event terkait menjadi `complete`

---

## 7. Wallet System (`normalizeWalletLine`)

### Format: `XG ; XS ; XC` (Gold; Silver; Copper)

Konversi: `1G = 100S`, `1S = 100C`.

### Prinsip Utama: Header Correction Bukan Wallet Transaction

Wallet **tidak boleh berubah** hanya karena header LLM rusak, tidak lengkap, atau Stage merekonstruksi header.  
Wallet **hanya boleh berubah** jika ada transaksi valid dalam narasi/body response.

### Cara Kerja

`normalizeWalletLine()` dipanggil dari `normalizeAetherNovaResponse()` dalam lifecycle `afterResponse`.

**Flow:**
1. **Initialisasi:** Wallet pertama yang valid dari header AI dipakai sebagai nilai awal (untuk bootstrap). Flag `walletInitialized` membedakan wallet yang sudah tersimpan dari fallback kosong.
2. **Setelah initialisasi:** Wallet line dari LLM header **hanya dianggap tampilan**, bukan transaksi. Wallet ditentukan oleh:
   - Wallet state sebelumnya (source of truth).
   - Deteksi transaksi dari body/narrative response saja.
3. **Tidak ada perubahan wallet** jika tidak ada transaksi valid — wallet tetap persis sama dengan state sebelumnya.

### Transaction Detection (dari Body/Narrative Only)

Wallet transaction hanya dideteksi dari `extracted.narrative` (body response), bukan dari header.

Transaksi valid harus memiliki:
1. **Amount** — angka yang jelas (numeric atau number words seperti `fifty`).
2. **Currency** — G/gold, S/silver, C/copper.
3. **Clear action/event** — aksi visible dalam narasi non-dialog.

**Evidence dari narasi NON-dialog:**
- `WALLET_PAYMENT_ACTION_CUES`: pay, spend, buy, purchase, hand over, give, place, slide, push, bribe, tip, dll.
- `WALLET_INCOME_ACTION_CUES`: receive, reward, earn, gain, loot, found, dll.
- `WALLET_LOSS_CUES`: lose, lost, stolen, robbed, confiscated.
- `number + currency pattern`: `\d+\s*(g|gold|s|silver|c|copper)`.
- Dialog dalam kutip diabaikan via `nonDialogueEvidenceContext()`.

**Contoh valid:**
- `*{{user}} pays 5 Silver for the inn room.*` → -5S
- `*The guard hands {{user}} 2 Gold as a reward.*` → +2G
- `*{{user}} steals 3 Gold from the distracted guard.*` → +3G
- `*{{user}} places 10 Gold on the counter.*` → -10G

**Contoh tidak valid (bukan transaksi):**
- `Merchant: "That will cost 5 Silver."` — dialog harga, belum ada pembayaran.
- `**Wallet: 999G ; 999S ; 999C**` — header line, bukan transaksi.
- `"I paid fifty silver"` — ucapan dalam dialog, bukan aksi.
- `worth`, `valued at`, `asking price` — diskusi harga/valuasi.

### Header Invalid / Missing Guard

Jika header invalid/missing/incomplete:
1. Stage tetap boleh memperbaiki/merekonstruksi header.
2. Stage mengambil Wallet dari **previous state** (bukan dari LLM).
3. Stage **tidak mengubah Wallet** kecuali body response mengandung transaksi valid.
4. Jika body response tidak ada transaksi valid, Wallet tetap previous state.

### LLM Wallet Header Manipulation

Jika user/LLM mengubah Wallet line tanpa transaksi valid, Stage mengembalikan ke wallet state benar:

```
Previous wallet: 12G ; 35S ; 8C
LLM output: **Wallet: 999G ; 999S ; 999C**
Body: *Yume says nothing about money.*
Expected: Wallet tetap 12G ; 35S ; 8C
```

### Conversion Rules

Jika transaksi valid membuat nilai Copper/Silver melewati batas, konversi diterapkan:
- `100 Copper = 1 Silver`
- `100 Silver = 1 Gold`

Konversi **hanya dilakukan setelah transaksi valid**. Tidak ada conversion tanpa transaksi.

### Cegah Double Processing

Satu response hanya diproses **sekali** untuk wallet mutation:
- `normalizeWalletLine()` hanya dipanggil sekali per `afterResponse`.
- Header normalization tidak membuat wallet mutation.
- `prepareAetherNovaStateForPrompt` dan `beforePrompt` **tidak mengubah wallet**.

---

## 8. NPC Memory System (`npcMemory`)

### NPC Canon Lock

Stage sekarang memakai **NPC_CANON_REGISTRY** untuk mengunci data identitas NPC canon:

- `name` — full canonical name
- `roleTitle` — canonical role/jabatan
- `race` — canonical race
- `physicalExtra` — canonical physical features

**Cara kerja:**
- Saat `updateNpcMemory()` memproses NPC dari header, ia memanggil `findNpcCanonByNameOrAlias()`.
- Jika NPC cocok dengan canon registry (via full name atau alias), data canon selalu menang.
- Data dynamic (`currentMood`, `lastInteractionTone`, `behaviorTowardUser`, `behaviorScores`, `relationshipWithUser`, `relationshipEvents`, `onlyKnows`) tetap dipertahankan — tidak di-reset.
- Jika NPC tidak ada di canon registry, inference lama tetap dipakai.

**Alias resolution:** `Aveline`, `Princess Aveline`, `Crown Princess Aveline`, `Aveline Montreval` semua resolve ke `Aveline Montreval`.

**PhysicalExtra lock:** Untuk NPC canon dengan `physicalExtra: "none"` (seperti Human/Elf/Dwarf), AI tidak bisa menambahkan tail/wings/horns. Data canon menang dari hasil tebakan.

**Header correction:** `normalizeNpcEntry()` mengoreksi race di header NPC line berdasarkan canon jika diperlukan.

**Prioritas sumber data:**
1. NPC Canon Registry
2. Existing npcMemory
3. Header/context inference
4. Fallback unknown/default

**Interface:**
```ts
interface NpcCanonEntry {
  name: string;
  aliases: string[];
  roleTitle: string;
  race: string;
  physicalExtra: string;
}
```

**Data canon yang terdaftar:**
- Montreval dynasty: Meridiane, Aveline, Halvair (Human, Solmeryn)
- Aerendil dynasty: Elyria, Aelindra, Faelar (Elf/High Elf, Sylvaris)
- Valeris dynasty: Lyra, Niana, Garrick (Half-Catkin/Catkin/Lionkin, Valerest)
- Vermithor dynasty: Elara, Talia, Aelius, Maya (Dragonkin, Draconis)
- Ironfist dynasty: Thora, Kelda, Magni (Dwarf, Khazad Grim)
- Independen: Debi Marquetta, Vera Nightshade, Seraphina Duskryn, Gara Stonemaw, Zora Bloodtusk, Mira Vespera, Sereza Malvora, Rina Ashthorn, Valla Noctis, Elys Seraphelion, Hana Celestine, Nara Sylverroot, Yume Nozomikara, Lulu Faeheart, Kira Moonpetal

---

### Data Structure per NPC

```ts
interface NpcMemoryEntry {
    name: string;           // Full name (min 2 words ideal)
    roleTitle: string;      // Role/jabatan penting
    race: string;           // Race NPC
    physicalExtra: string;  // Fitur fisik tambahan

    currentMood: string;                // Multi-tag comma-separated: mood + temporary attitude scene sekarang
    lastInteractionTone?: string;       // Tone interaksi terakhir
    behaviorTowardUser: string[];       // Behavior stabil terhadap {{user}}
    behaviorScores: Record<string, number>; // Score evidence behavior (trait/opposite pairs)
    relationshipWithUser: string[];     // Status hubungan besar / social bond
    relationshipEvents: string[];       // Event besar penyebab relationship berubah

    onlyKnows: string[];    // Fakta yang hanya diketahui NPC ini
}
```

**Catatan:**
- `currentMood` sekarang multi-tag (comma-separated, maksimal 6 label). Bisa berisi mood AND temporary attitude, contoh: `"tense, defensive, suspicious"` atau `"embarrassed, possessive, jealous"`.
- `behaviorScores` menggunakan **trait/opposite score system**: jika trait naik, opposite trait turun dengan bobot tertentu. Tidak ada global decay.
- `behaviorTowardUser` hanya berisi trait dari `STABLE_BEHAVIOR_CANDIDATES`. Mood-only traits tidak masuk.
- Negation/contrast guard mencegah salah baca seperti `"not malice, but pride"`.
- Target/context check memastikan trait yang diarahkan ke objek/NPC lain tidak otomatis mempengaruhi behavior terhadap `{{user}}`.

### Update Memory (`updateNpcMemory`)
- Dipanggil setiap `afterResponse` dan `prepareAetherNovaStateForPrompt`.
- Parse NPC dari header line, cocokkan dengan memory yang ada.
- Untuk setiap NPC di header:
  - **Name**: Jika NPC ada di canon registry, pakai full canonical name. Jika hanya first name, cocokkan ke memory lama atau canon alias.
  - **Role/Title**: Jika NPC ada di canon registry, pakai canonical role. Jika tidak, infer dari konteks sekitar nama NPC (pattern title before/after name).
  - **Race**: Jika NPC ada di canon registry, pakai canonical race. Jika tidak, pertahankan dari state lama jika tidak ada data baru.
  - **Physical Extra**: Jika NPC ada di canon registry, pakai canonical physicalExtra (AI tidak bisa overwrite). Jika tidak, deteksi dari status/konteks: `nine tails`, `animal ears`, dll.
   - **Current Mood (Scene-Active)**: Boleh berisi beberapa tag sementara dalam satu string (comma-separated, maksimal 6 label). Contoh: `"tense, defensive, suspicious"`. Mood bisa mencatat mood (sad, happy, angry) dan temporary attitude (possessive, defensive, shy, jealous, suspicious, envious, proud, wise, teasing, watchful, cautious, authoritative, commanding, stern, controlled, composed). Deteksi menggunakan `extractTraitsFromText()` yang membaca seluruh konteks naratif + status header dengan negation guard, suppression guard, dan evidence gate.

     Aturan scene-active:
     - **Scene-active rebuild**: Jika latest response memiliki cukup mood evidence (≥ 2 label), Stage membangun ulang `currentMood` dari evidence terbaru. Mood lama tidak dipertahankan.
     - **Weak evidence**: Jika hanya 1 mood label baru, Stage menggabungkan dengan mood sebelumnya, tetapi tag yang dibantah oleh konteks terbaru tetap disaring.
     - **Fallback**: Jika tidak ada evidence mood baru, Stage mempertahankan mood sebelumnya.

     **Contradicted tag suppression**: Frasa berikut menekan mood tag tertentu:
     - `lost its teasing edge`, `no longer teasing` → `teasing` dan `playful` disupresi.
     - `not amused`, `amusement faded` → `amused` disupresi.
     - `not afraid`, `fearless` → `afraid`/`fearful` disupresi.
     - `not cold`, `without coldness` → `cold` disupresi.

     **Evidence gate — `afraid`/`fearful`**: Membutuhkan direct fear evidence: `afraid`, `frightened`, `terrified`, `scared`, `panic`, `dread`, dll. Tension/kewaspadaan tanpa fear langsung → `cautious`/`watchful`, bukan `afraid`.

     **Evidence gate — `cold`**: Membutuhkan direct coldness evidence: `coldly`, `icy`, `emotionless`, `chilling`, dll. Formal/stern/controlled/authoritative → `formal`/`stern`/`controlled`/`authoritative`, bukan `cold`.

     **`lastInteractionTone`**: Mengikuti tone interaksi terbaru yang paling dominan berdasarkan prioritas: `hostile` > `authoritative` > `protective` > `tense` > `serious` > `playful` > `warm` > `calm` > `curious` > `formal` > `controlled` > `watchful` > `soft` > `cold`.

     Mood **tidak** mengubah relationship atau behavior. `behaviorScores` dan `behaviorTowardUser` tetap stabil dan hysteresis-based.
   - **Behavior Scores** (`updateBehaviorScores`):
     - Tidak ada global decay untuk semua label, tetapi ada **targeted decay** untuk trait romantis/posesif yang volatil (`affectionate`, `possessive`, `jealous`) jika konteks scene bisnis/profesional dan tidak ada romance eksplisit.
     - Score naik jika ada evidence behavior sesuai evidence weight baru (weak +0.1, medium +0.5, strong +1).
     - Dalam satu response, hanya evidence terkuat per label yang dipakai (`mergeBehaviorEvidence` mengambil max weight, bukan menjumlah).
     - Max gain per label per response = +1 (strong cue).
     - Score turun jika ada evidence berlawanan (opposite behavior), social stress tanpa romance eksplisit, atau targeted decay bisnis/profesional untuk trait romantis/posesif.
     - Evidence weights baru:
       - Weight 1 (weak cue) → +0.1
       - Weight 2 (medium cue) → +0.5
       - Weight 3 (strong cue) → +1
     - Score maksimal 9, minimal 0. Score dibulatkan sampai 2 desimal agar tidak muncul angka floating panjang seperti `3.900000000000002`.
     - NPC yang tidak hadir di header tidak mengalami perubahan score.
     - Jika suspicious atau cautious score >= 4, weak affectionate cue (+0.1) diabaikan.
     - Dalam konteks bisnis/profesional tanpa romance eksplisit, evidence `affectionate`/`possessive`/`jealous` diredam ke bobot sangat kecil lalu mendapat decay, sehingga kerja sama bisnis yang intens tidak otomatis naik menjadi romansa.
   - **Trait/Opposite Score System**:
     - Stage menggunakan `OPPOSITE_TRAIT_PAIRS` (Record<string, string[]>) untuk pasangan trait yang saling menyeimbangkan.
     - Pasangan utama: `happy↔sad`, `calm↔angry/tense`, `trusting↔suspicious`, `affectionate↔cold/distant`, `playful/teasing↔serious/formal`, `formal→affectionate/possessive/jealous`, `protective↔hostile`, `respectful↔arrogant`, `loyal↔defiant/rebellious`, `obedient↔defiant`, `brave↔fearful`, `possessive↔detached`, `jealous↔secure`, `proud↔humble`, `wise↔reckless`, `defensive↔relaxed/open`.
     - Jika trait A naik, opposite trait B turun dengan bobot sesuai evidence weight: weak (+0.1) → opposite -0.2, medium (+0.5) → opposite -0.5, strong (+1) → opposite -1.
     - Clamp score: minimal 0, maksimal 9.
     - Score romantis/posesif juga bisa turun tanpa opposite eksplisit jika scene jelas dibingkai bisnis/profesional dan tidak ada romance eksplisit.
   - **Negation/Contrast Guard** (`detectNegation`):
     - Stage mendeteksi pola seperti `"not X, but Y"`, `"without X"`, `"no X"`, `"not out of X, but Y"`.
     - Jika pola negasi terdeteksi untuk suatu trait, trait tersebut tidak ditambahkan ke behaviorScores.
     - Contoh: `"not malice, but pride"` → hostile tidak naik, proud boleh naik kecil.
     - Contoh: `"not jealousy, but concern"` → jealous tidak naik.
   - **Target/Context Check** (`determineTraitTarget`):
     - Sebelum trait mempengaruhi behavior terhadap `{{user}}`, Stage mengecek target/context.
     - Target bisa: `{{user}}`, NPC lain, objek, situasi umum.
     - Trait yang jelas diarahkan ke `{{user}}` → boleh masuk behaviorScores.
     - Trait yang diarahkan ke NPC lain atau objek → tidak otomatis mempengaruhi behavior terhadap `{{user}}`.
     - Target tidak jelas → tidak otomatis masuk behaviorScores untuk label yang perlu target user.
     - `affectionate`, `possessive`, dan `jealous` wajib diarahkan ke `{{user}}` agar mempengaruhi behavior toward user.
     - Contoh: `"Yume's tails curl possessively around {{user}}"` → possessive naik.
     - Contoh: `"Yume looks possessive over the ancient relic"` → possessive hanya di mood, tidak ke behaviorScores.
   - **Behavior Toward {{user}}** (`stableBehaviorLabels`):
     - Label stabil menggunakan **hysteresis** dua threshold:
       - **Aktif** jika score >= 4.
       - **Tetap aktif** jika score >= 2 (label yang sebelumnya aktif dipertahankan).
       - **Hilang** jika score <= 1.
     - Tidak ada rebuild mentah dari score — label yang sudah aktif tidak flicker.
     - Hanya trait dari `STABLE_BEHAVIOR_CANDIDATES` yang bisa masuk behaviorTowardUser.
     - Mood-only traits (`sad`, `happy`, `angry`, `shy`, `proud`, `wise`, dll) tidak masuk behaviorTowardUser.
  - **Relationship With {{user}}**: Array label konservatif (`stranger`, `acquaintance`, `formal`, `ally`, `friend`, `enemy`, `rival`, `subordinate`, `lover`, `romantic tension`). Hanya berubah lewat event besar.
  - **Relationship Events**: Event penting saja, maksimal 10, misalnya confession accepted, alliance formed, betrayal, oath sworn, formal employment.
    - **OnlyKnows**: Extract fakta dari konteks sekitar nama NPC. Hanya fakta **high-value/private** yang disimpan. Fakta yang ditolak:
      - Obrolan biasa, rencana umum scene (`we need to`, `we should`, `let's go`, dll.)
      - Rencana pertemuan/route (`meet your mother`, `go to the palace`)
      - Kalimat user yang tidak rahasia (`don't worry`, `it's fine`)
      - Fakta yang rusak/malformed (diawali colon/koma, dangling quote, terlalu pendek)
      - Placeholder seperti `"name npc"`, `{{npc}}`, `undefined`, `null`
      - Fakta yang sudah ada di Thread
      - Fakta valid disanitasi: leading punctuation dihapus, dangling quote dihapus, whitespace dinormalisasi.
      - **OnlyKnows extraction is recipient-aware**: Fakta hanya masuk ke NPC yang menjadi penerima eksplisit (via cue seperti `I told Aveline`, `I whispered to Yume`, `I warned Debi`). NPC lain yang hadir tidak otomatis menerima fakta, kecuali ada evidence overhear (`Aveline overheard`, `Debi heard this`, `everyone present heard`).
      - **Auto-extract append**: Auto extractor hanya append valid new facts ke OnlyKnows, tidak replace seluruh list. Jika fact duplicate/similar dengan existing fact, tidak di-append.
      - **No hard history cap**: `OnlyKnows` tidak lagi dipotong ke 8 item dan teks fakta tidak lagi dipotong ke 24 kata. UI editor OnlyKnows juga full-width dengan textarea lebih tinggi untuk history panjang.
      - **Ordinary instruction ditolak**: `gather co-conspirators`, `meet your mother`, `tactical command` tidak masuk OnlyKnows.
    - **Field-Scoped Manual Edit (non-destructive)**: Debug UI save menggunakan patch/merge, bukan full replace:
      - Editing `OnlyKnows` hanya mengubah `onlyKnows`.
      - Editing `Relationship Events` hanya mengubah `relationshipEvents`.
      - Editing `Current Mood`, `Role/Title`, `Race`, `Physical Extra`, `Relationship` hanya mengubah field tersebut.
      - `behaviorScores` di-preserve kecuali diedit secara eksplisit.
      - `behaviorTowardUser` dan `behaviorScores` memiliki sinkronisasi terbatas: menambah manual behavior bisa set score minimum >= 3; menghapus behavior bisa menurunkan hanya label tersebut; score tidak terkait di-preserve.
      - Input behaviorScores invalid tidak wipe score lama (parse gagal → preserve previous).
      - Dirty-field tracking: hanya field yang berubah yang dikirim dalam command `npc memory set`, field lain fallback ke nilai sebelumnya.

Boundary penting:
- `currentMood` adalah **scene-active** — dibangun ulang dari evidence scene terbaru jika cukup bukti. Tidak membawa mood lama yang sudah dibantah narasi. Tapi **tidak otomatis mengubah behavior atau relationship**.
- `behaviorTowardUser` stabil dan tidak flicker karena hysteresis.
- `relationshipWithUser` hanya berubah lewat event besar (bukan mood, bukan sekali interaksi).
- NPC marah tidak otomatis menjadi `enemy`.
- NPC sopan/formal tidak otomatis menjadi `subordinate`.
- NPC flirting/blush tidak otomatis menjadi `lover`.
- Kata `friend` sekali tidak otomatis menjadi `friend` tanpa konteks trust/aksi pendukung.
- Kerja sama bisa menjadi `ally`, tapi `friend` butuh kedekatan personal.
- `relationshipWithUser` boleh punya lebih dari satu label, contoh `ally, suspicious`.
- NPC tidak hadir di header → behaviorScores dan behaviorTowardUser tidak berubah.

### NPC-Specific Mood Evidence

Stage menggunakan NPC-specific context untuk mood inference, bukan full narrative context. Setiap NPC hanya dipengaruhi oleh evidence yang relevan untuk NPC tersebut.

**Sumber evidence untuk NPC tertentu:**
- Header status milik NPC tersebut saja (bukan NPC lain).
- Kalimat/paragraf yang menyebut nama NPC atau alias.
- Dialogue lines dengan speaker NPC tersebut.
- Action beats yang jelas melekat ke NPC tersebut.

**Cara kerja:**
- `buildNpcSpecificEvidenceContext()` memfilter narasi untuk setiap NPC.
- Hanya sentences yang menyebut nama NPC atau alias yang masuk ke konteks mood NPC tersebut.
- Dialogue lines diekstrak per speaker, hanya milik NPC yang dianalisis.
- Header status dari NPC A tidak mempengaruhi mood NPC B.
- Dialogue speaker NPC A tidak mempengaruhi mood NPC B.

**Contoh:** Dalam scene throne hall dengan Halvair, Meridiane, Aveline:
- `Halvair's jaw tightened` hanya masuk evidence Halvair.
- `Queen Meridiane's eyebrow lifted` hanya masuk evidence Meridiane.
- `Aveline: "Father. I have brought him as agreed."` hanya masuk evidence Aveline.
- Mencegah seluruh NPC menerima mood tags yang identik.

### Generic/Group NPC Memory Ignore

NPC generic atau group tidak dipersist ke `npcMemory`.

**Rule:**
- Generic/group NPC boleh muncul di header, tapi tidak dibuat memory permanen.
- Hanya canon NPC atau NPC dengan nama personal jelas yang dipersist.
- Role-only NPC tanpa personal name diabaikan.
- `coerceNpcMemory()` membersihkan entry generic yang sudah ada.

**Contoh yang diabaikan (tidak masuk npcMemory):**
- `Palace Guards x6`, `Page Boy`, `Royal Guards`
- `Two Crown Guards`, `Crown Guards`, `3 Palace Guards`
- `City Guards x4`, `Handmaidens`, `Nobles`, `Servants`
- `A Palace Guard`, `The Herald`, `A Messenger`
- `Old Merchant`, `Aldric's Guard`

**Contoh yang tetap dipersist:**
- `Aveline Montreval`, `Halvair Montreval`, `Meridiane Montreval` (canon)
- `Captain Rowan Vale`, `Guard Rowan` (nama personal jelas)

**Helper:**
- `isPersistableNpcMemoryName(name)` mengecek apakah nama NPC layak dipersist.
- Filter diterapkan di `updateNpcMemory()` dan `coerceNpcMemory()`.
- Command manual `npc memory set` juga menolak nama generic/group jika bukan NPC canon, agar UI/command tidak menyimpan side NPC tanpa nama personal.

### Injection Rules (`buildNpcMemoryDirections`)
Hanya NPC memory context yang diinject ke prompt LLM. Header state (`Location`, `Time`, `You`, `NPC`, `Thread`, `Wallet`) tidak diinject — hanya disimpan internal stage untuk koreksi header respons LLM.

**Format compact:**
```text
[NPC Memory Context]
Present NPCs (full memory):
- Name: Aveline Montreval | Role/Title: Crown Princess of Solmeryn | Race: Human | Current Mood: relieved, suspicious | Last Interaction Tone: warm | Behavior toward {{user}}: None stable yet | Relationship with {{user}}: stranger | OnlyKnows: {{user}} told Aveline to gather co-conspirators
Mentioned-only NPCs (identity only):
- Name: Aldric Vance | Role/Title: Lord | Race: Human
```

1. **NPC di header aktif** → inject FULL memory dengan label lengkap:
   - Wajib: `Name`, `Role/Title`, `Race`, `Current Mood`, `Last Interaction Tone`, `Behavior toward {{user}}`, `Relationship with {{user}}`.
   - `Behavior toward {{user}}: None stable yet` tetap di-inject jika belum ada behavior stabil.
   - `Relationship with {{user}}: stranger` tetap di-inject untuk full memory.
   - `Physical Extra` hanya di-inject jika bukan `none`/kosong.
   - `OnlyKnows` hanya di-inject jika ada isi.
   - `Important Relationship Events` hanya di-inject jika ada isi.
2. **NPC hanya disebut di pesan user** → inject IDENTITY ONLY: `Name`, `Role/Title`, `Race`. `Physical Extra` hanya jika bukan `none`. Mood, Relationship, Behavior, OnlyKnows, dan Relationship Events TIDAK diinject (knowledge firewall).
3. **NPC tidak ada di header dan tidak disebut** → data tetap disimpan, tidak diinject. Injection dibatasi 4 NPC per kategori.
4. Jika role/title tidak diketahui, Stage menulis `Role/Title: unknown`.
5. Section kosong tidak di-inject (tidak ada `[NPC Memory Context]` jika semua section kosong).

**Field yang dihilangkan jika kosong/default:**
- `Physical Extra: none` → dihilangkan
- `OnlyKnows: None recorded` → dihilangkan
- `Important Relationship Events: None recorded` → dihilangkan
- `Behavior toward {{user}}: None stable yet` → **tetap ada** (wajib)
- `Relationship with {{user}}: stranger` → **tetap ada** (wajib)

### Commands Manual
Command dideteksi dengan regex `NPC_MEMORY_COMMAND_PATTERN` di mana pun dalam pesan user, lalu dihapus sebelum dikirim ke LLM.

- `npc memory delete: Name` → hapus seluruh data NPC.
- `npc memory clearfacts: Name` → kosongkan OnlyKnows.
- `npc memory add fact: Name | fact=fakta` → tambah fakta ke OnlyKnows.
- `npc memory mood: Name | mood=tense | tone=guarded` → set Current Mood dan tone.
- `npc memory behavior: Name | behavior=protective, suspicious` → set behavior stabil.
- `npc memory behavior score: Name | protective +1` → tambah/kurangi score behavior.
- `npc memory relationship: Name | relationship=ally, suspicious` → set relationship list.
- `npc memory relation event: Name | event=Yume accepted {{user}}'s confession and said she loved him too.` → tambah relationship event.
- `npc memory show: Name` → tampilkan data sebagai system message.
- `npc memory set: Name | role=... | race=... | physical=... | mood=... | behavior=... | behaviorScores=protective:5 | relationship=... | event=... | onlyKnows=... | fact=...` → set lengkap. Field `fact` append ke OnlyKnows; `onlyKnows` replace.

Command di-reapply setelah `afterResponse` agar efeknya persist meskipun AI mengubah header.

---

## 9. Narrative Format (`normalizeNarrativeFormat`)

Stage melakukan format narasi ringan:

### Aturan:
1. **Paragraf narasi** → dibungkus `*...*` (single italic).
2. **Dialog dengan speaker** → `Speaker: "..."` atau `**Speaker:** "..."`.
3. **Dialog tanpa speaker** → infer dari NPC header atau recent speaker.
4. **Action beat dalam dialog** → `*...*` bukan `'...'`.
5. **Inline emphasis** `*word*` dalam narasi/dialog → `'word'` (agar tidak tabrakan dengan wrapper italic).
6. **Action beat sebelum dialog tanpa wrapper** → dibungkus `*...*`.
7. **Misquoted action beat** (action beat dalam quote dialog pembuka) → dikeluarkan sebagai italic.
8. **Entire line salah italic** → diperbaiki: wrapper italic pindah ke action beat saja.
9. **Bare dialogue line** tanpa speaker → tambah speaker dari narasi sebelumnya jika bisa diinfer.

### Tidak melakukan:
- Tidak mengubah isi kalimat, pilihan kata, atau urutan narasi/dialog.
- Tidak rewrite kreatif.

---

## 10. Debug UI System

Debug UI (di `Stage.tsx` render) saat ini: **Aether Nova Stage UI V1.9**.

Debug UI menampilkan:
- Current state: Location, Time, You (compact), NPC, Thread, Wallet, Pending NPC Debug, Pending Memory Command.
- **Minimize UI**: Header UI memiliki tombol **Minimize**. Saat ditekan, panel berubah menjadi mini bar ringkas di bagian atas frame dengan status `Idle/Modified`, versi UI, dan tombol **Open** untuk membuka kembali. Preferensi minimize disimpan di `localStorage` key `aether-nova-stage.debugUiMinimized`, sehingga mobile user tidak selalu tertutup panel debug besar.
- **Edit Buttons**: Setiap field state utama (Location, You, NPC, Thread, Wallet, Status User) memiliki tombol **Edit**. Saat diklik, kartu edit melebar ke seluruh grid dan berubah menjadi form yang lebih nyaman. Field pendek memakai input, `timeOfDay` memakai select (`Morning/Midday/Afternoon/Evening/Night`), dan field panjang seperti `You`, `NPC`, dan `Thread` memakai textarea. User bisa mengubah value lalu **Save** (menerapkan edit ke state + mencatat di `manualEditOverrides`) atau **Cancel** (kembali ke tampilan baca).
- **Thread Mission List**: Thread ditampilkan sebagai daftar misi per item ` ; `. Setiap item punya tombol gembok untuk menambah/menghapus lock manual di `lockedThreadItems[]`. Item terminal tidak bisa dikunci.
- **Status User Editor**: Saat Edit Status User diklik, panel detail berubah menjadi form grid dengan input untuk Gender, Race, dan setiap slot pakaian (Upper, Lower, Footwear, Outerwear, Accessories). Weapons dan Important Items bisa diedit lewat textarea dengan format `name | location | status`; parser juga menerima pemisah `—` atau `-`.
- **Private Events**: Panel langsung di bawah Status User menampilkan private appointment/deadline/threat event. Tombol **Add From Thread** membuka dropdown item Thread yang belum tertaut dan membuat draft event yang otomatis linked ke `parentThreadKey` thread terkait. Thread yang sudah punya private event tidak ditawarkan lagi. Setiap event punya tombol **Edit**, **Mark Complete**, **Mark Failed**, dan **Delete** dengan confirm dialog untuk aksi terminal/destructive.
- **Confirm destructive actions**: Aksi yang menghapus/clear data UI meminta konfirmasi lebih dulu (`Clear Logs`, clear log per kategori, `Clear Facts`, dan `Delete` NPC memory) lewat dialog custom React di dalam Stage, bukan `window.confirm()`, agar tetap bekerja di webview/platform yang memblokir dialog browser native.
- Manual edits yang dilakukan melalui UI disimpan di `manualEditOverrides` dan dipertahankan saat swipe/jump serta melalui normalisasi.
- NPC Memory cards: semua NPC yang tersimpan dengan detail lengkap. Setiap kartu NPC punya tombol **Minimize/Expand** untuk menyembunyikan detail panjang; daftar kartu yang diminimize disimpan di `localStorage` key `aether-nova-stage.collapsedNpcCards`.
- Stage Prompt Directions: isi `stageDirections` terbaru yang diinject ke prompt, ditampilkan di atas Debug Logs.
- Debug Logs terpisah per kategori:
  - **Stage Prompt To LLM Log**: history prompt/stageDirections yang diberikan kepada LLM.
  - **NPC Memory Log**: perubahan nyata pada NPC memory, termasuk diff field konkret seperti `Aveline Montreval currentMood: neutral -> wary`.
  - **Private Event Log**: perubahan `privateEvents`, termasuk status, urgency, knownBy, timeAnchor, deadline, location, context, threat, consequence, dan keywords.
  - **Location Log**: perubahan location yang dilakukan stage, termasuk diff segment (`Location region/place/area: before -> after`).
  - **Time Log**: perubahan `timeOfDay` dan `clock` yang dilakukan stage, termasuk `Time of day: before -> after` dan `Clock: before -> after`.
  - **You Line Log**: perubahan line `You` dan detail `Status User`, termasuk diff field konkret seperti `You clothing: kemeja -> Naked` atau `You position: duduk di kursi -> duduk bersandar di kursi`.
  - **NPC Line Log**: perubahan line `NPC`, termasuk diff per NPC seperti `Kaelen clothing: travel cloak -> torn travel cloak` atau `Kaelen position: standing nearby -> sitting beside you`.
  - **Thread Line Log**: perubahan thread dan lock thread manual, termasuk item added/removed dan status mission (`Thread status Mission A: Ongoing -> Completed`).
  - **Wallet Line Log**: perubahan wallet, termasuk gold/silver/copper dan total delta.
  - **Narrative Log**: perubahan format narasi saat response dimodifikasi.
  - **Lifecycle Log**: `init`, `load`, `setState`, `beforePrompt`, `afterResponse`, dan edit UI.
- Last System Message: system message terakhir yang dikirim stage.
- Latest User Message: pesan user terbaru (setelah command dihapus).

Debug Logs berada di bagian paling bawah UI dan menyimpan maksimal 120 event terbaru. Tombol **Clear Logs** di header menghapus semua log sementara. Setiap box log juga punya tombol **Clear** untuk menghapus kategori itu saja, tanpa menghapus state utama atau NPC Memory. Stage tidak mencatat log field jika output LLM sudah benar dan tidak perlu dikoreksi untuk field itu.

Debug UI juga bisa mengatur NPC Memory:
- **Create NPC Memory**: membuat memory NPC baru dari form.
- **Edit**: mengubah Name, Role/Title, Race, Physical Extra, Current Mood, Last Tone, Relationship, Behavior, Behavior Scores, Relationship Events, dan OnlyKnows.
- **Clear Facts**: mengosongkan OnlyKnows NPC.
- **Delete**: menghapus seluruh memory NPC.

Setiap aksi UI memakai command internal `npc memory ...`, mengubah state internal langsung, dan mengisi `pendingNpcMemoryCommand` agar efeknya diterapkan ulang pada lifecycle berikutnya.

Debug diaktifkan dengan `position: ADJACENT` di `public/chub_meta.yaml`.
UI dipertahankan selama `debugUi` aktif; nonaktifkan lewat config jika stage perlu berjalan tanpa panel.

### NPC Debug Query
User bisa mengetik `[debug: npc Name]` dalam pesan → stage inject data NPC sebagai stageDirections, lalu tampilkan sebagai system message footer setelah response.

---

## 11. Scene Transition Detection

Stage menggunakan dua set cues untuk mendeteksi perpindahan scene:

**LOCATION_TRANSITION_CUES:** move, travel, arrive, enter, leave, combat, teleport, time skip, scene transition, meanwhile, later, afterward.

**LOCATION_SCENE_ANCHOR_CUES:** inside, within, room, chamber, doorway, counter, table, booth, bartender, patron, dll.

Location berubah jika:
1. Ada cue transisi eksplisit dalam konteks.
2. Atau kandidat location disebut + ada anchor cue (scene sudah pindah walau tanpa kata transisi eksplisit).
3. Perubahan hanya di detailed area (main & sub location sama).

---

## 12. State Persistence

### Message State (disimpan per message)
```ts
{
    location: string;
    timeOfDay: "Morning" | "Midday" | "Afternoon" | "Evening" | "Night";
    clock: string;
    you: string;
    npc: string;
    thread: string;
    wallet: string;
    walletInitialized: boolean;
    npcMemory: Record<string, NpcMemoryEntry>;
    pendingNpcDebugQuery: string | null;
    pendingNpcMemoryCommand: string | null;
    userStatus: UserStatusState;
    lockedWaitingThreads?: string[];       // Thread items with waiting/rendezvous status, persisted until resolved
    lockedThreadItems?: string[];          // User-selected thread items kept until terminal status appears
    terminalThreadGraceItems?: string[];   // Terminal items (Complete/Finished/Failed) shown once, then removed next response
    manualEditOverrides?: Record<string, string>;  // UI manual edit values, preserved across normalization
}
```

### State Flow
1. **constructor/load**: State di-restore dari messageState chat. Jika null, buat default.
2. **beforePrompt**: State dikirim + diupdate dengan NPC memory.
3. **afterResponse**: State diupdate dari hasil normalisasi.
4. **setState (swipe)**: State di-coerce dari messageState tujuan.

---

## 13. Thread System Updates — False Positive, Auto-Complete, dan Terminal Grace

Perubahan berikut ditambahkan untuk memperbaiki bug thread inference dan thread completion.

### Evidence-Bound Thread Baru

Stage hanya menerima thread candidate baru dari LLM jika aksi/objek dalam candidate didukung oleh evidence terbaru (user message + narrative). Fungsi `isCandidateGroundedInEvidence()` mengekstrak action tokens dari candidate dan memeriksa apakah minimal 25% di antaranya muncul di evidence.

Nama target (contoh: "Aldric") saja tidak cukup untuk validasi. Candidate harus memiliki aksi/objek yang benar-benar disebut dalam evidence.

### Ancaman, Conditional, dan Past Warning Bukan Mission

Kalimat yang mengandung pola berikut tidak digunakan untuk thread inference:
- **Conditional/ancaman**: `if not`, `might have to`, `otherwise`, `or else`, `would have to`, `threatened`
- **Past warning**: `already warned`, `had told`, `warned him before`

Pola ini dideteksi oleh `isThreatOrConditionalStatement()` dan `isPastWarningStatement()` di `src/aetherNova/thread/normalizeThreadLine.ts`, yang memfilter kalimat sebelum masuk ke inference pipeline.

### Meeting/Audience/Appointment Auto-Complete

Stage mendeteksi thread meeting-type dan mengubah statusnya menjadi `(Complete)` secara otomatis jika salah satu kondisi terpenuhi:
1. Target NPC sudah hadir di current NPC header
2. Ada thread lain yang sudah `(Active)` dan mencakup event yang sama (contoh: `Audience with the Royal Family (Active)` menyerap `Meeting King Halvair and Queen Meridiane (Imminent)`)

Fungsi `completeMeetingThreadItems()` mengekstrak nama NPC dari thread item (proper nouns) dan mencocokkan dengan NPC header line. Marker privasi seperti `(Secret, Only X knows)` tetap dipertahankan saat status berubah.

### Terminal Grace — Satu Response Lalu Hapus

Thread dengan status terminal seperti `Complete`, `Completed`, `Finished`, `Failed`, atau `Resolved` hanya tampil satu response, lalu dihapus pada response berikutnya. Mekanisme `terminalThreadGraceItems` di state melacak item terminal yang sudah ditampilkan.

- Response N: item terminal muncul di thread output, menggantikan versi aktif yang overlap, lalu ditambahkan ke `terminalThreadGraceItems`
- Response N+1: item sudah ada di grace -> versi terminal dan versi aktif yang overlap tidak ditambahkan lagi -> otomatis hilang
- Marker privasi seperti `(Secret)` atau `(Only X knows)` tidak mencegah penghapusan jika tag yang sama juga memuat status terminal, misalnya `(Completed, Secret)`.

Fungsi `applyTerminalGrace()` di `src/aetherNova/response/normalizeAetherNovaResponse.ts` menangani logika ini.

### Waiting Lock Release untuk Thread Selesai

`applyThreadWaitingLock()` di `src/aetherNova/thread/threadWaitingLock.ts` sekarang melepas locked items jika:
1. Item sudah terminal (Complete/Finished/Failed)
2. Target NPC dari meeting/waiting item sudah hadir di NPC header

Lock tidak akan mengembalikan thread yang sudah selesai. Thread rahasia (`Secret`, `Only X knows`) tetap dipertahankan sampai benar-benar selesai.

### Ringkasan File yang Diubah

| File | Perubahan |
|------|-----------|
| `src/aetherNova/types.ts` | Menambah `terminalThreadGraceItems?: string[]` dan `lockedThreadItems?: string[]` |
| `src/aetherNova/thread/normalizeThreadLine.ts` | Evidence grounding (`isCandidateGroundedInEvidence`), threat/conditional guard (`isThreatOrConditionalStatement`, `isPastWarningStatement`), meeting auto-complete (`completeMeetingThreadItems`, `isMeetingThreadItemComplete`), parameter `npcLine` |
| `src/aetherNova/thread/threadWaitingLock.ts` | Release lock untuk item terminal/meeting terselesaikan dan manual thread item lock dari UI |
| `src/aetherNova/response/normalizeAetherNovaResponse.ts` | Terminal grace (`applyTerminalGrace`), NPC line passing ke thread normalization, dan manual thread lock restore/release |
| `src/aetherNova/state/coerceHeaderState.ts` | Handle `terminalThreadGraceItems` dan `lockedThreadItems` |
| `src/aetherNova/state/stateMerge.ts` | Normalize `terminalThreadGraceItems` dan `lockedThreadItems` |
| `src/aetherNova/ui/DebugPanel.tsx` | Thread ditampilkan sebagai mission list dengan tombol gembok per item |

---

## 14. State Coercion (`coerceHeaderState`)
Saat restore state (swipe/jump), stage menormalkan semua field:
- Location: `normalizeLocation()` → 3-tier format.
- Clock: `normalizeClock()` → `HH:MM`.
- TimeOfDay: `timeOfDayForClock()` → koreksi otomatis.
- You: `normalizeYouLine()` dengan `trustRawStatus: true`.
- NPC: `normalizeNpcLine()`.
- Thread: `normalizeThreadLine()` — also validates candidate items against evidence and auto-completes meeting threads.
- Wallet: `coerceWalletState()` → parse amounts + format.
- NPC Memory: `coerceNpcMemory()` → normalisasi entries.
- Pending fields: dipertahankan/null sesuai kondisi.
