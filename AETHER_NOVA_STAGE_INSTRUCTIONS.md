# Aether Nova Stage Reference

Dokumen ini adalah catatan kerja untuk stage Aether Nova yang sudah diterapkan di project ini dan sudah disesuaikan dengan prompt header asli character AI.
Gunakan dokumen ini sebagai pengingat saat mengubah stage berikutnya.

Stage ini bukan system prompt untuk Codex dan bukan system prompt character AI.
Stage ini adalah guard teknis Chub Stage yang memperbaiki header output setelah AI membalas, serta memberi reminder singkat sebelum prompt berikutnya.

## Status Implementasi

Stage sudah dibuat sebagai stage tanpa UI.

File utama:

- `src/Stage.tsx`: wrapper Chub Stage, hook `load`, `beforePrompt`, `afterResponse`, dan render kosong.
- `src/aetherNovaHeader.ts`: logic parsing, normalisasi, koreksi header, dan update state.
- `public/chub_meta.yaml`: metadata stage, `position: NONE`, dan schema state.

Stage berjalan dengan:

```yaml
position: NONE
```

Artinya stage tidak menampilkan panel, button, dashboard, atau visual tambahan.

## Tujuan Stage

Tujuan stage adalah menjaga output AI tetap memakai header Aether Nova secara konsisten.

Stage bekerja sebagai:

- Header corrector
- Output format validator
- You/NPC status normalizer
- Thread guard
- Light state tracker

Stage hanya mengoreksi bagian header dan menyimpan state terakhir.
Narasi utama setelah header harus tetap dipertahankan sebisa mungkin.

## Format Header Saat Ini

Output AI ditargetkan menjadi:

```md
**Main Location - Sub Location - Detailed Area | Time of Day | HH:MM**
**You: Gender - Apparent Race (Position; Clothes/disguise; body detail)**
**NPC: Full Name - Race (Position; Clothes; body/racial detail), Full Name - Race (Position; Clothes; body/racial detail)**
**Thread: Main mission/status ; Major obstacle/status**
**Wallet: XG ; XS ; XC**
***

Narrative continues here...
```

Contoh:

```md
**Valerest Kingdom - Royal Palace - Guest Chamber | Night | 22:10**
**You: Male - Human (Standing near window; Regular shirt; arms crossed)**
**NPC: Yume Nozomikara - Kitsune (Standing before {{user}}; Kimono; tails still, ears forward, violet-gold eyes bright)**
**Thread: Prospective meeting with King Halvair (on pause) ; Yume and {{user}} at odds**
**Wallet: 12G ; 35S ; 8C**
***
```

## State Yang Disimpan

State message-level menyimpan header terakhir:

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
}
```

`walletInitialized` adalah flag internal stage untuk membedakan wallet yang benar-benar sudah tersimpan dari fallback kosong `0G ; 0S ; 0C`.
State ini dipakai ulang saat AI lupa menulis header, menulis field kosong, atau menulis field yang tidak bisa dipercaya.

## Cara Kerja

### Constructor dan Load

Saat stage dimulai:

1. Stage membaca `messageState` terakhir dari Chub.
2. Jika state belum ada, stage membuat fallback default.
3. Jika ada character aktif, stage mencoba memakai nama character sebagai NPC default.
4. `load()` mengembalikan `success: true` dan state saat ini.

### beforePrompt

Sebelum prompt dikirim ke AI, stage menyimpan pesan user terakhir secara internal dan mengirim `stageDirections` yang compact.

Reminder ini tidak muncul sebagai UI dan tidak mengganti pesan user.
Isi reminder membawa state terakhir:

```text
Location: ...
Time: ...
You: ...
NPC: ...
Thread: ...
Wallet: ...
```

Reminder juga menekankan divider `***`, format status `Position; Clothes/disguise; optional body/racial detail`, pemisah thread ` ; `, dan wallet yang hanya boleh berubah dengan evidence transaksi/reward/loss di narasi.
Tujuannya agar AI mencoba menjaga format header sejak awal, sebelum `afterResponse` perlu memperbaiki.

### afterResponse

Setelah AI membalas, stage:

1. Membaca isi response AI.
2. Mendeteksi header di beberapa baris awal response, termasuk jika ada teks pendek sebelum header atau jika field header terpisah blank line.
3. Jika header hilang, membuat header dari state terakhir.
4. Jika header ada tetapi salah, mengoreksi formatnya.
5. Menormalisasi location, time, `You`, `NPC`, divider `***`, `Thread`, dan `Wallet`.
6. Menyimpan state baru.
7. Mengembalikan `modifiedMessage` berisi response yang sudah dikoreksi.

Narasi setelah header tetap dipertahankan.
Jika AI menulis teks sebelum header, teks itu dipindahkan ke bawah header normal agar tidak menghasilkan dua header.
Jika AI menulis header dengan blank line di antara `Location`, `You`, `NPC`, `Thread`, dan `***`, stage tetap menganggapnya sebagai satu header lalu mengeluarkannya lagi dalam format compact tanpa blank line.
Setelah header selesai, stage juga menjalankan formatter narasi ringan: paragraf narasi dibungkus `*...*`, baris dialog speaker dijaga sebagai `Name: "..."` atau `**Name:** "..."`, dan inline emphasis kecil seperti `*word*` diganti menjadi `'word'`.

## Rules Normalisasi Saat Ini

### Location

Location ditargetkan menjadi 3 tier:

```text
Main Location - Sub Location - Detailed Area
```

Jika location kurang dari 3 tier, stage mengisi bagian yang hilang memakai state lama atau fallback aman.
Jika location berubah jauh dari state sebelumnya, stage hanya menerima perubahan saat konteks user atau narasi bot memuat cue perpindahan, seperti move, travel, arrive, enter, leave, combat, teleport, time skip, atau scene transition.
Stage juga menerima perubahan location tanpa kata arrival eksplisit jika narasi terbaru jelas sudah meng-anchor tempat baru, misalnya `inside`, `within`, `common room`, `counter`, `doorway`, atau detail interior lain yang cocok dengan kandidat location.
Perubahan exact area di main location dan sub location yang sama masih diterima.

### Time

Stage mengoreksi `Time of Day` berdasarkan `HH:MM`.

```text
Morning: 05:00-11:59
Afternoon: 12:00-16:59
Evening: 17:00-20:59
Night: 21:00-04:59
```

Contoh: `Evening | 23:10` dikoreksi menjadi `Night | 23:10`.

### You

`You` dibuat simple dan stabil.

Format target:

```md
**You: Gender - Apparent Race (Position; Clothes/disguise; body detail)**
```

Stage mencoba menghapus bahasa yang terlalu dramatis dan mempertahankan status fisik yang jelas.
Stage menolak `Anomaly` sebagai apparent race kecuali sudah revealed atau confirmed di konteks.
Stage juga menyaring thoughts, feelings, expression, dialogue, actions, movement, transformation, consent, dan choices dari line `You`.
Position, clothes/disguise, dan body detail memakai state lama kecuali konteks user atau narasi AI terbaru memberi bukti perubahan.
Perubahan pakaian didukung oleh evidence berbahasa Inggris seperti change/wear/remove, put on, dressed in, clad in, changes into, atau damage naratif seperti burned/torn/scorched/damaged.
Slot kedua dalam status selalu diperlakukan sebagai clothing/disguise slot. Nama pakaian unik seperti ceremonial mantle, moon-silk kimono, battle robe, academy uniform, haori, robe, armor, cloak, atau disguise bisa diterima sebagai pakaian, terutama saat state sebelumnya masih `Regular clothing` atau pakaian itu disebut lagi di narasi terbaru.
Clothing slot boleh berisi kondisi pakaian yang relevan, seperti naked, fully naked, loose shirt, baggy pants, pants only, shirt caught on a fence, left sleeve torn, cloak burned, atau armor cracked. Stage tidak memotong detail clothing hanya karena ada `and`, `with`, atau comma selama masih berada di slot pakaian.
Perubahan posisi didukung oleh cue seperti walk/stop/arrive/sit/stand/reach/collapse, dan juga bisa diterima saat location sudah terbukti berpindah scene.
Position slot boleh mencantumkan scene blocking dengan nama NPC atau `{{user}}`, arah, dan jarak, seperti `Standing left of Yume`, `Sitting to the right of {{user}}`, `Standing six steps before {{user}}`, atau `Standing beside Yume near the door`.
Kata generik seperti `scene` tidak boleh masuk position; `Standing in scene` dinormalisasi menjadi `Standing`, dan posisi lama seperti `Lying on futon` tetap dipertahankan jika narasi baru hanya menyebut detail kecil seperti closing eyes.
Body detail yang bersifat kontak sementara, seperti hand resting on a tail, holding, touching, leaning, atau pressing against something, tidak dipertahankan saat posisi atau scene berubah kecuali narasi terbaru masih memberi evidence kontak itu.
Body detail juga boleh mencatat interaksi tangan yang terlihat dan sementara, seperti `hand cleaning Yume's face`, `wiping Yume's cheek`, atau `brushing hair aside`, selama narasi terbaru memang menyebut aksi visible itu.
Kontak sementara lama seperti `stroking Yume's head` boleh diganti oleh detail baru yang aman seperti `hands visible` atau interaksi objek seperti `pulling cup` / `pulling blanket` jika narasi terbaru tidak lagi mendukung kontak lama, meskipun lokasi masih sama.
Interaksi objek sesaat seperti `hand releasing wine glass onto desk`, `placing cup on table`, atau `sliding coin across desk` boleh diganti oleh posture tangan yang sudah settled seperti `hands resting on thighs`, `hands on lap`, atau `hand beside waist` jika konteks terbaru tidak lagi mendukung aksi objek lama.
Kontak sementara lama seperti `hands on head` juga boleh diganti oleh posture pasif yang masuk akal saat bergerak, seperti `hands lowered`, `hands down`, atau `arms at sides`, jika narasi terbaru menunjukkan movement/position change.
Pose sementara lama seperti `head tilted` boleh diganti oleh detail posture baru seperti `facing him`, `body turned toward him`, atau `head level` jika narasi terbaru menyebut pull back, turn, face, atau straighten.
Jika format `You` kacau, stage mengambil bagian yang hilang dari state sebelumnya.

### NPC

`NPC` boleh lebih detail daripada `You`.

Format target:

```md
**NPC: Full Name - Race (Position; Clothes; body/racial detail)**
```

Stage mendukung lebih dari satu NPC dengan pemisah koma di level atas.
Stage juga menerima `NPC: None` saat tidak ada NPC di sekitar `{{user}}`.
Position dan clothes NPC memakai state lama kecuali ada cue visible move, follow, scene change, clothing change, atau armor removal.
Position NPC juga boleh memakai scene blocking relatif ke nama character atau `{{user}}`, termasuk left/right/front/behind, beside, facing, dan jarak beberapa steps/paces.
NPC lama dicocokkan berdasarkan nama, bukan urutan. NPC baru tidak boleh mewarisi pakaian NPC lama; jika clothing slot NPC baru memuat item pakaian jelas seperti kimono/robe/under-robe/over-robe/uniform/armor atau kondisi pakaian seperti sleeve torn / clothes caught / cloak burned, stage boleh menerimanya, kalau tidak gunakan fallback aman seperti `Regular clothing` atau inferensi sederhana seperti `Simple clothing`.
Untuk NPC yang sudah ada, clothing boleh berubah dari state lama saat narasi terbaru jelas menunjukkan pakaian sedang diperbaiki, disesuaikan, di-fastened, atau layer pakaian dirapikan, misalnya dari `white under-robe slipped off one shoulder` menjadi `violet silk over-robe` setelah narasi menyebut fixing clothes, smoothing double layer, atau outer robe being put back in place.
Detail race-specific tetap dijaga sebagai detail fisik/visible, seperti hands, wings, tail, ears, horns, eyes, claws, weapon, posture, atau anatomy relevan.

### Thread

`Thread` dijaga agar tidak berubah sembarangan dan output dipaksa memakai pemisah ` ; `.

Jika AI mengganti thread secara tiba-tiba tanpa dukungan narasi, stage mempertahankan thread sebelumnya.
Perubahan thread lebih mungkin diterima jika ada overlap kata penting atau narasi mengandung cue transisi seperti arrival, travel, resolved, mission, quest, objective, atau time skip.
Jika header `Thread` kosong, `None`, placeholder, atau masih mengulang thread lama, stage boleh membaca narasi terbaru untuk menangkap thread penting yang eksplisit seperti mission, quest, objective, task, appointment, promise, hunt/quest, deadline, order, contract, travel goal, major obstacle, atau major unresolved conflict.
Deteksi dari narasi harus konservatif: stage hanya mengambil frasa yang benar-benar tertulis di narasi, memberi status sederhana seperti `(Ongoing)` atau `(Pending)`, dan tidak membuat tujuan baru secara kreatif.
Stage juga boleh membuat sub-goal yang terhubung dengan thread lama jika konteks terbaru menyebut rencana jelas untuk bertemu/berbicara/bertanya kepada NPC tertentu tentang target yang sudah ada di thread lama, misalnya `meet Kaelen first to ask her about Debi`. Dalam kasus seperti ini, misi utama boleh ditandai `(Pending)` dan sub-goal baru ditandai `(Ongoing)` jika user sudah mulai bergerak atau menyuruh NPC memimpin jalan.
Stage menghapus item thread yang resolved, complete/completed, done, finished, concluded, refused, declined, rejected, failed, abandoned, expired, irrelevant, canceled/cancelled, atau minor/placeholder seperti current scene, current topic, normal topic, casual question, temporary mood, small suspicion, minor jealousy, dan small talk.

### Wallet

`Wallet` menyimpan uang milik `{{user}}`.

Format target:

```md
**Wallet: 12G ; 35S ; 8C**
```

Stage menormalisasi format menjadi `XG ; XS ; XC`.
Wallet memakai state lama kecuali narasi terbaru memuat evidence ekonomi yang jelas seperti payment, buy, cost, fee, reward, earn, loot, bounty, gift, refund, lost, stolen, robbed, atau confiscated.
Jika AI mengubah angka wallet tanpa transaksi/reward/loss yang dijelaskan dalam cerita, stage mengembalikan wallet ke state sebelumnya.
Jika AI lupa mengubah wallet tetapi konteks terbaru memuat pembayaran/reward yang eksplisit dan nominal uang jelas, stage boleh menghitung perubahan dari state lama, termasuk angka tertulis seperti `fifty silver`.
Diskusi harga, valuasi, appraisal, atau penawaran yang belum selesai tidak mengubah wallet. Contoh seperti `worth a hundred gold to the right buyer`, `price is fifty silver`, `costs fifty silver`, atau `trade information for information` hanya dianggap pembahasan nilai sampai ada aksi pembayaran/penerimaan/loss yang eksplisit.
Untuk penghitungan lintas pecahan, stage memakai konversi internal `1G = 100S` dan `1S = 100C`.
Jika belum ada wallet yang pernah tersimpan, wallet valid pertama dari header dipakai sebagai nilai awal, termasuk first message atau alternate first message; stage tidak memaksa angka awal menjadi `0G ; 0S ; 0C`.
Stage tidak mengizinkan NPC atau narasi membaca wallet sebagai info in-character kecuali uang itu memang diketahui lewat cerita.

### Narrative Format

Stage menjaga format narasi tanpa rewrite besar.
Paragraf narasi biasa dibungkus single italic:

```md
*Narrative text.*
```

Dialog speaker dijaga sebagai:

```md
Yume: "Dialogue text."
**Yume:** "Dialogue text."
```

Inline emphasis kecil di dalam narasi/dialog seperti `*want*` diganti menjadi `'want'` agar tidak bertabrakan dengan wrapper narasi.
Jika baris dialog mencampur dialog dan action beat dalam single quote, stage mengubah action beat itu menjadi italic tanpa memecah dialog, misalnya `Yume: "Good." 'Her lips curve.' "And..."` menjadi `Yume: "Good." *Her lips curve.* "And..."`.
Jika action beat keliru ditaruh di dalam quote dialog pembuka, stage mengeluarkannya sebagai italic lalu mempertahankan sisa dialog dalam quote, misalnya `Borin: "'catching the coin.' Safe travels."` menjadi `Borin: *catching the coin.* "Safe travels."`.
Jika action beat memakai `*...*` di dalam quote dialog pembuka dan dialog asli sudah punya quote sendiri, stage tidak menambah quote kedua, misalnya `Kaelen: "*Leans forward.* "Information.""` menjadi `Kaelen: *Leans forward.* "Information."`.
Jika action beat polos berada di antara dua dialog dalam satu speaker line, stage membungkus action beat itu dengan italic, misalnya `Yume: "Good." She lowers her voice. "Listen."` menjadi `Yume: "Good." *She lowers her voice.* "Listen."`.
Jika baris dialog tidak punya speaker tetapi narasi tepat sebelumnya atau action beat dialog cukup jelas menunjuk NPC tertentu, stage boleh menambahkan speaker dari header NPC, misalnya narasi menyebut `Yume hums` lalu baris `"The smooth ones," *she says...*` menjadi `Yume: "The smooth ones," *she says...*`.
Stage tidak mengubah isi kalimat, pilihan kata, atau urutan narasi/dialog.

## Batas Stage

Stage ini tidak boleh:

- Membuat UI.
- Menulis ulang seluruh response.
- Mengubah gaya narasi utama.
- Mengubah dialog character.
- Membuat lokasi baru secara kreatif.
- Mengubah thread secara kreatif.
- Menambahkan NPC baru tanpa dasar.
- Menambahkan dependency besar tanpa kebutuhan jelas.

Stage ini adalah format guard, bukan creative writer.

## Ruang System Prompt Header Asli

Bagian ini disiapkan untuk prompt asli milik character AI yang mengatur header.
Prompt di bawah nanti adalah contoh/reference untuk stage, bukan instruksi untuk Codex.

Tempel system prompt header asli di sini:

```text
[HEADER FORMAT]
{{char}} MUST begin every narrative reply with this exact header:

**Main Location - Sub Location - Detailed Area | Time of Day | HH:MM**
**You: Gender - Apparent Race (Position; Clothes/disguise; body detail)**
**NPC: Full Name - Race (Position; Clothes; body/racial detail), Full Name - Race (Position; Clothes; body/racial detail)**
**Thread: Main mission/status ; Major obstacle/status**
**Wallet: XG ; XS ; XC**
***

Rules:
- All 4 header lines MUST use ** at the start and end.
- Use exactly *** before narration.
- NPCs cannot read, know, or react to You/NPC/Thread data unless learned in-story.
- Status format is fixed: Position; Clothes; Opsional body/racial detail.
- Do not replace position or clothes with mood, emotion, role, or vague status.
- Only add Body/Racial details when needed, such as fighting, intimacy or sudden movements.

[Header LOCATION & TIME Rules]
- Location uses 3 tiers separated by " - ": main region/kingdom - place/district - exact area.
- Change location only by clear cause: {{user}} moves, NPC leads, travel, combat shift, time skip, or scene transition.
- Time of Day must match HH:MM: Morning 05:00-11:59, Afternoon 12:00-16:59, Evening 17:00-20:59, Night 21:00-04:59.
- Normal talk advances 5-15 minutes. Quick reactions may keep the same minute. Travel, waiting, sleep, rituals, missions, or recovery may skip hours.

[Header YOU LINE Rules]
- Format: Gender - Apparent Race (Position; Clothes/disguise; body detail)
- Position and clothes/disguise must always stay in Status.
- Keep last known position and clothes unless {{user}} changes them or the scene clearly moves.
- Apparent Race is visible form, not true identity.
- Never write "Anomaly" unless revealed or confirmed in-story.
- Body detail should stay simple: arms crossed, hood up, left hand on hip, hand on chin, holding cup.
- Do not add thoughts, feelings, expression, mood, actions, movement, transformation, dialogue, or choices.

[Header NPC LINE Rules]
- Include all NPCs currently around {{user}}.
- Format: Full Name - Race (Position; Clothes; body/racial detail)
- Race uses dash. Status uses parentheses.
- Separate multiple NPCs with commas only.
- {{user}} is not an NPC.
- Minor unnamed NPCs may be grouped by role.
- Position and clothes must always stay in Status.
- Keep last known position and clothes unless the NPC visibly moves, leaves, follows, changes clothes, removes armor, or the scene changes.
- Position must show scene blocking: Standing before {{user}}, Seated beside throne, Standing by door, Behind {{user}}, At table head.
- Body/racial detail may include hands, wings, tail, ears, horns, eyes, claws, weapon, posture, or relevant visible anatomy.

[Header THREAD LINE Rules]
- Track only important RP direction: mission, appointment, promise, hunt/quest, deadline, order, contract, travel goal, major obstacle, or major unresolved conflict.
- Thread may show a mission paused by the current obstacle.
- Do not track current scene/current topic placeholders, normal topics, casual questions, temporary mood, small suspicion, minor jealousy, or every tension.
- Use " ; " between items.
- Remove resolved, completed/complete, done, finished, refused, declined, rejected, failed, abandoned, expired, cancelled/canceled, or irrelevant items.
- Optional status tags: (on pause), (Pending), (Ongoing), (Secret), (Known: NPC Name), (Known: Group).

[Header WALLET Rule]
- Format example: "Wallet: 12G ; 35S ; 8C"
- G=Gold; S=Silver; C=Copper
- Wallet is the money that {{user}} owns.
- Wallet changes only through clear in-story transactions

[IMPORTANT]
- If you make a mistake such as wrong NPC canon info, race, location, status, header format, Thread item, NPC presence, or header data, correct it in the next reply and never preserve the mistake.
- If a previous reply invented non-canon NPC data, treat it as non-canon and return to official lore.
- If no NPCs are present, describe only environment, atmosphere, objects, danger, clues, weather, room condition, road condition, or ambient activity.
- DO NOT DESCRIBE {{user}}'s THOUGHTS, FEELINGS, DIALOGUE, ACTUONS, MOVEMENT, ATTACKS, CONSENT, TRANSFORMATION, or CHOICES.
```

## Catatan Penyesuaian Stage

Stage sudah disesuaikan dengan prompt header asli di atas.

Penyesuaian yang sudah diterapkan:

1. Divider output memakai `***`, bukan `___`.
2. `beforePrompt` mengingat pesan user terakhir sebagai konteks perubahan location/thread.
3. Location change dijaga agar tidak berubah jauh tanpa cue perpindahan.
4. `You` menjaga apparent race, menolak `Anomaly` jika belum revealed/confirmed, menjaga position/clothes/body detail dari state lama tanpa evidence, dan menyaring thoughts/actions/dialogue.
5. `NPC: None` diterima saat tidak ada NPC.
6. `Thread` dinormalisasi dengan pemisah ` ; ` dan item minor/selesai dibersihkan.
7. Header yang muncul setelah teks pembuka tetap dideteksi, lalu dipindahkan menjadi satu header normal di paling atas.
8. Multi-NPC dicocokkan berdasarkan nama agar NPC baru tidak mewarisi pakaian/status NPC lama hanya karena urutan header.
9. Header yang terpisah blank line tetap dideteksi sebagai satu header agar tidak muncul double header.
10. `Wallet` ditambahkan sebagai line header dan state; perubahan angka wallet ditolak kecuali narasi memuat evidence transaksi/reward/loss.
11. `walletInitialized` ditambahkan agar wallet awal dari first message/alternate first message bisa diterima tanpa dipaksa menjadi default `0G ; 0S ; 0C`.
12. Wallet inference ditambahkan agar pembayaran/reward eksplisit dengan nominal seperti `fifty silver` bisa dihitung dari state lama saat AI lupa mengubah line `Wallet`.
13. Formatter narasi ringan ditambahkan untuk italic narrative paragraphs, dialog speaker lines, inline emphasis menjadi single quote, action beat single-quoted di dalam dialog menjadi italic, dan action beat yang keliru masuk quote dialog pembuka dikeluarkan menjadi italic.
14. NPC clothing adjustment ditambahkan agar pakaian lama seperti slipped under-robe tidak dipertahankan saat narasi terbaru merapikan/menambahkan layered garment baru seperti over-robe.
15. Thread inference dari narasi ditambahkan agar mission/quest/contract/promise/appointment/travel goal/major obstacle yang eksplisit tetap masuk ke line `Thread` saat header kosong, `None`, placeholder, atau stale.
16. Thread linked sub-goal ditambahkan agar rencana seperti `meet Kaelen to ask about Debi` bisa ditambahkan dari konteks user/narasi tanpa mengganti misi utama.
17. Speaker inference ringan ditambahkan agar dialog tanpa `Name:` bisa diberi speaker jika narasi/action beat dekat jelas menunjuk NPC tertentu.
18. Thread terminal status diperluas agar item seperti `Job Offer Refused (resolved)` atau item dengan status complete/done/finished/refused/declined/rejected otomatis dibersihkan pada pesan berikutnya.

Jika prompt header asli nanti diubah lagi:

1. Jangan hapus blok prompt asli di dokumen ini.
2. Bandingkan rules prompt asli dengan behavior `src/aetherNovaHeader.ts`.
3. Ubah parser dan normalizer agar searah dengan prompt asli.
4. Pertahankan prinsip utama: koreksi header saja, jangan rewrite narasi.
5. Build ulang dengan `npm run build`.

Catatan verifikasi terakhir:

- `npm run build` berhasil.
- `npm run lint` belum bisa dipakai karena dependency template `@typescript-eslint/eslint-plugin` belum terpasang.
