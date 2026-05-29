# Aether Nova Stage Reference — Cara Kerja

Dokumen ini menjelaskan cara kerja setiap sistem di Stage Aether Nova berdasarkan implementasi aktual di `src/Stage.tsx` dan `src/aetherNovaHeader.ts`.

Stage ini adalah **system teknis Chub Stage** untuk menjaga konsistensi output AI dalam chat RP panjang.

---

## Arsitektur Stage

Stage adalah React component (`Stage.tsx`) yang mengimplementasikan `StageBase` dari `@chub-ai/stages-ts`. Empat lifecycle hook utama:

### constructor()
- Menerima `InitialData` berisi characters, config, dan messageState dari chat.
- Memanggil `createInitialHeaderState()` yang meneruskan ke `coerceHeaderState()` untuk menormalkan state masuk atau membuat default.
- Jika ada character aktif, stage menginfer race dari `character.description/personality/scenario/first_message` dan memakainya sebagai NPC default.
- State default: `DEFAULT_STATE` — lokasi "Unknown Region", waktu "Morning | 09:00", You "Unknown - Human", NPC "None", Thread "None", Wallet "0G ; 0S ; 0C", walletInitialized false, npcMemory {}.

### load()
- Mengembalikan `success: true` dan `messageState` saat ini.
- Tidak membuat state baru.

### beforePrompt(userMessage)
1. Mendeteksi `[debug: npc Name]` dalam pesan user (disimpan ke localStorage).
2. `prepareAetherNovaStateForPrompt()`: update npcMemory dari header NPC terakhir.
3. `applyNpcMemoryCommands()`: parsing dan eksekusi command `npc memory ...`, membersihkan command dari pesan user.
4. `buildStageDirections()`: menyusun string stageDirections yang inject state terakhir + NPC memory context ke prompt.
5. Kembali: `stageDirections`, `messageState`, `modifiedMessage` (jika ada command memory), `systemMessage` (jika command `show`).

### afterResponse(botMessage)
1. `normalizeAetherNovaResponse()`: fungsi inti yang melakukan:
   - `extractHeader(content)`: mendeteksi header dalam response AI.
   - `normalizeLocationTimeLine()`: koreksi location & time.
   - `normalizeWalletLine()`: koreksi wallet.
   - `normalizeYouLine()`: koreksi line You.
   - `normalizeNpcLine()`: koreksi line NPC.
   - `normalizeThreadLine()`: koreksi Thread.
   - `updateNpcMemory()`: update memory NPC dari header.
   - `formatResponse()`: menggabungkan header terkoreksi + narasi yang diformat.
2. Re-apply NPC memory commands (untuk persist efek command).
3. Kembali: `modifiedMessage`, `messageState`, `systemMessage`.

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
- Jika tidak ada header terdeteksi, stage membuat header dari state sebelumnya.

---

## 2. Location System (`normalizeLocation`)

### Format: `Main Location - Sub Location - Detailed Area`

Cara kerja:
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
- Ekstrak `HH:MM` dari location line menggunakan regex `CLOCK_PATTERN`.
- **Time of Day dikoreksi OTOMATIS** berdasarkan jam:
  - `05:00-11:59` → Morning
  - `12:00-16:59` → Afternoon
  - `17:00-20:59` → Evening
  - `21:00-04:59` → Night
- Jika AI menulis `Evening | 23:10`, stage paksa jadi `Night | 23:10`.
- Jika tidak ada clock dalam response, stage pakai clock dari state sebelumnya.

---

## 4. You System (`normalizeYouLine`)

### Format: `Gender - Apparent Race (Clothes/disguise; Position; body detail)`

Cara kerja:
1. **Identity**: Parse `Gender - Race` dari line, pakai fallback state sebelumnya jika placeholder.
2. **Race**: Tolak `Anomaly` kecuali sudah revealed/confirmed di konteks.
3. **Status** (`Clothes; Position; body detail`):
   - Parse status dengan `splitStatusByFormat()` → split by `;`.
   - Gunakan `orderStatusParts()` untuk memastikan urutan: **Clothes → Position → Detail**.
   - Clothing slot dideteksi dengan `CLOTHING_SLOT_PATTERN` (nama garment) dan `CLOTHING_DAMAGE_WORDS`.
   - Position slot dideteksi dengan `POSITION_CHANGE_CUES` dan `POSITION_SPATIAL_CUES`.

**Clothes change logic:**
- Perubahan pakaian hanya diterima jika ada EVIDENCE dari narasi NON-dialog:
  - `CLOTHING_CHANGE_CUES`: `change clothes`, `wear`, `put on`, `dressed in`, `clad in`, `dons`, dll.
  - `CLOTHING_REMOVAL_CUES`: `remove`, `take off`, `strip`, `undress`, `naked`, dll.
  - `CLOTHING_DAMAGE_CUES`: `burned`, `torn`, `ripped`, `shredded`, `scorched`, dll.
- Evidence dari dialog (dalam tanda kutip) diabaikan via `stripDoubleQuotedText()`.
- Jika tidak ada evidence, stage pakai clothing dari state sebelumnya.
- **Inferensi langsung dari konteks:** Stage bisa detect `"naked"`, `"shirtless"`, `"without armor"`, `"only pants"` langsung dari konteks non-dialog.

**Position change logic:**
- Perubahan posisi diterima jika ada cue `walk`, `stand`, `sit`, `kneel`, `lean`, `turn`, `step`, `approach`, dll.
- Posisi dengan spatial relation (`left of`, `beside`, `before`, `behind`, `facing`) butuh evidence di narasi.
- Posisi generik seperti `"scene"` di-strip (menjadi fallback).
- Bahasa dramatis di-strip dari posisi.

**Body detail logic:**
- `TRANSIENT_YOU_DETAIL_PATTERN`: detail sementara seperti `holding`, `touching`, `stroking`, `tilted`, `resting`.
- Detail transien diganti jika:
  - Scene berpindah.
  - Posisi berubah.
  - Tidak ada evidence lanjutan di narasi terbaru.
- Detail kontak objek (`holding cup`, `pulling blanket`) diganti ke detail settled (`hands on lap`, `hands lowered`) jika narasi tidak lagi mendukung kontak.
- Detail kontak fisik (`stroking head`) bisa diganti ke detail pasif saat movement terjadi.
- Detail interaksi visible (`cleaning`, `wiping`, `brushing`) dipertahankan selama narasi terbaru mendukung.

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
4. **Thread cleanup otomatis:**
   - Item dengan status `resolved`, `completed`, `done`, `finished`, `concluded`, `refused`, `failed`, `abandoned`, `expired`, `cancelled` → dihapus.
   - Minor thread pattern: `normal topic`, `casual question`, `temporary mood`, `small suspicion`, `minor jealousy`, `small talk` → dihapus.
5. **Thread inference merge:**
   - Jika AI mengulang thread lama yang generik, stage merge dengan hasil inferensi dari narasi.
   - Item lama ditandai `(Pending)` jika ada subgoal baru yang `(Ongoing)`.

---

## 7. Wallet System (`normalizeWalletLine`)

### Format: `XG ; XS ; XC` (Gold; Silver; Copper)

Konversi: `1G = 100S`, `1S = 100C`.

Cara kerja:
- `parseWalletAmounts()`: extract angka + unit (G/gold, S/silver, C/copper) dari string.
- `normalizeWalletValue()`: format ulang ke `XG ; XS ; XC`.

**Initialisasi:**
- Wallet pertama yang valid dari header AI dipakai sebagai nilai awal (tidak dipaksa 0).
- Flag `walletInitialized` membedakan wallet yang sudah tersimpan dari fallback kosong.

**Perubahan wallet hanya diterima jika:**
1. Ada EVIDENCE transaksi dari narasi NON-dialog (dialog dalam kutip diabaikan).
2. `WALLET_TRANSACTION_CUES`: pay, spend, buy, purchase, cost, fee, reward, earn, loot, sell, receive, gift, bounty, refund, lost, stolen, robbed, confiscated.
3. Evidence harus berupa aksi visible (`*{{user}} places 10 Gold on the counter.*`), bukan ucapan.
4. **Price discussion diabaikan:** `worth`, `valued at`, `asking price`, `trade information for information` tidak cukup.

**Inferensi wallet (`inferWalletFromContext`):**
- Stage bisa menghitung perubahan wallet dari narasi jika ada angka yang jelas.
- Contoh: `"{{user}} hands over fifty silver"` → wallet berkurang 50S.
- Contoh: `"{{user}} receives 10 gold reward"` → wallet bertambah 10G.
- Number words juga diparse: `fifty` → 50.

**Pelarangan:**
- Diskusi harga/valuasi/penawaran yang belum selesai tidak mengubah wallet.
- Ucapan dalam dialog (`"I paid fifty silver"`) tidak dianggap transaksi.
- Stage mengembalikan wallet ke state sebelumnya jika AI mengubah tanpa evidence.

---

## 8. NPC Memory System (`npcMemory`)

### Data Structure per NPC

```ts
interface NpcMemoryEntry {
    name: string;           // Full name (min 2 words ideal)
    roleTitle: string;      // Role/jabatan penting
    race: string;           // Race NPC
    relationship: string;   // Relationship with {{user}}
    behavior: string;       // Behavior toward {{user}}
    physicalExtra: string;  // Fitur fisik tambahan
    onlyKnows: string[];    // Fakta yang hanya diketahui NPC ini
}
```

### Update Memory (`updateNpcMemory`)
- Dipanggil setiap `afterResponse` dan `prepareAetherNovaStateForPrompt`.
- Parse NPC dari header line, cocokkan dengan memory yang ada.
- Untuk setiap NPC di header:
  - **Name**: Jika hanya first name, cocokkan ke memory lama (pakai full name tersimpan).
   - **Role/Title**: Infer dari konteks sekitar nama NPC (pattern title before/after name).
   - **Race**: Pertahankan dari state lama jika tidak ada data baru.
   - **Physical Extra**: Deteksi dari status/konteks: `nine tails`, `animal ears`, dll.
   - **Relationship**: Infer dari kata kunci konteks long-term relationship:
     - **Romantic**: `husband`/`wife`/`spouse` → Husband/Wife/Spouse, `lover`/`beloved` → Lover, `fiancé` → Fiancé
     - **Family** (hanya jika possessive ke `{{user}}`, contoh: `{{user}}'s mother`, `ibumu`; **tidak** match jika "become" pattern seperti `jadikan aku seorang ibu`): Parent / Child / Sibling
     - **Close bonds**: Friend, Best Friend, Ally
     - **Adversarial**: Sworn Enemy, Enemy, Rival
     - **Hierarchical**: Master, Servant, Mentor, Student, Guardian
     - **Distant**: Acquaintance, Stranger
     - **Professional**: Associate
     Bersifat jangka panjang dan persisten (fallback ke nilai sebelumnya jika tidak ada data baru).
   - **Behavior**: Infer dari kata kunci konteks: `arrogant`, `protective`, `possessive`, `playful`, `loyal`, `loving`, `friendly`, `hostile`, `intimate`, dll. Attitude/behavior saat ini (temporal, berubah sesuai scene).
  - **OnlyKnows**: Extract fakta dari konteks sekitar nama NPC (mention `{{user}} told`, `{{user}} gave`, `{{user}} threatened`, dll).

### Injection Rules (`buildNpcMemoryDirections`)
1. **NPC di header aktif** → inject FULL memory: Name, Role/Title, Race, Physical Extra, Relationship, Behavior, OnlyKnows.
2. **NPC hanya disebut di pesan user** → inject IDENTITY ONLY: Name, Role/Title, Race, Physical Extra. Relationship, Behavior, OnlyKnows TIDAK diinject (knowledge firewall).
3. **NPC tidak ada di header dan tidak disebut** → data tetap disimpan, tidak diinject. Injection dibatasi 4 NPC per kategori.

### Commands Manual
Command dideteksi dengan regex `NPC_MEMORY_COMMAND_PATTERN` di mana pun dalam pesan user, lalu dihapus sebelum dikirim ke LLM.

- `npc memory delete: Name` → hapus seluruh data NPC.
- `npc memory clearfacts: Name` → kosongkan OnlyKnows.
- `npc memory add fact: Name | fact=fakta` → tambah fakta ke OnlyKnows.
- `npc memory relation: Name | relationship=...` → update relationship saja.
- `npc memory show: Name` → tampilkan data sebagai system message.
- `npc memory set: Name | role=... | race=... | physical=... | relationship=... | behavior=... | onlyKnows=... | fact=...` → set lengkap. Field `fact` append ke OnlyKnows; `onlyKnows` replace.

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

Debug UI (di `Stage.tsx` render) saat ini: **Debug UI V1.5**.

Debug UI menampilkan:
- Current state: Location, Time, You, NPC, Thread, Wallet, Pending NPC Debug, Pending Memory Command.
- NPC Memory cards: semua NPC yang tersimpan dengan detail lengkap.
- Stage Activity log: 30 event terakhir dengan timestamp.
- Stage Directions: isi `stageDirections` yang diinject ke prompt.
- System Debug Message: system message terakhir.
- Latest User Message: pesan user terbaru (setelah command dihapus).

Debug UI juga bisa mengatur NPC Memory:
- **Create NPC Memory**: membuat memory NPC baru dari form.
- **Edit**: mengubah Name, Role/Title, Race, Physical Extra, Relationship, Behavior, dan OnlyKnows.
- **Clear Facts**: mengosongkan OnlyKnows NPC.
- **Delete**: menghapus seluruh memory NPC.

Setiap aksi UI memakai command internal `npc memory ...`, mengubah state internal langsung, dan mengisi `pendingNpcMemoryCommand` agar efeknya diterapkan ulang pada lifecycle berikutnya.

Debug diaktifkan dengan `position: ADJACENT` di `chub_meta.yaml`.
Untuk production, ubah ke `position: NONE`.

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
    timeOfDay: "Morning" | "Afternoon" | "Evening" | "Night";
    clock: string;
    you: string;
    npc: string;
    thread: string;
    wallet: string;
    walletInitialized: boolean;
    npcMemory: Record<string, NpcMemoryEntry>;
    pendingNpcDebugQuery: string | null;
    pendingNpcMemoryCommand: string | null;
}
```

### State Flow
1. **constructor/load**: State di-restore dari messageState chat. Jika null, buat default.
2. **beforePrompt**: State dikirim + diupdate dengan NPC memory.
3. **afterResponse**: State diupdate dari hasil normalisasi.
4. **setState (swipe)**: State di-coerce dari messageState tujuan.

### State Coercion (`coerceHeaderState`)
Saat restore state (swipe/jump), stage menormalkan semua field:
- Location: `normalizeLocation()` → 3-tier format.
- Clock: `normalizeClock()` → `HH:MM`.
- TimeOfDay: `timeOfDayForClock()` → koreksi otomatis.
- You: `normalizeYouLine()` dengan `trustRawStatus: true`.
- NPC: `normalizeNpcLine()`.
- Thread: `normalizeThreadLine()`.
- Wallet: `coerceWalletState()` → parse amounts + format.
- NPC Memory: `coerceNpcMemory()` → normalisasi entries.
- Pending fields: dipertahankan/null sesuai kondisi.
