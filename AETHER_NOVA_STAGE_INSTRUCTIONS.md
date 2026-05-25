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
***

Narrative continues here...
```

Contoh:

```md
**Valerest Kingdom - Royal Palace - Guest Chamber | Night | 22:10**
**You: Male - Human (Standing near window; Regular shirt; arms crossed)**
**NPC: Yume Nozomikara - Kitsune (Standing before {{user}}; Kimono; tails still, ears forward, violet-gold eyes bright)**
**Thread: Prospective meeting with King Halvair (on pause) ; Yume and {{user}} at odds**
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
}
```

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
```

Reminder juga menekankan divider `***`, format status `Position; Clothes/disguise; optional body/racial detail`, dan pemisah thread ` ; `.
Tujuannya agar AI mencoba menjaga format header sejak awal, sebelum `afterResponse` perlu memperbaiki.

### afterResponse

Setelah AI membalas, stage:

1. Membaca isi response AI.
2. Mendeteksi header di beberapa baris awal response, termasuk jika ada teks pendek sebelum header.
3. Jika header hilang, membuat header dari state terakhir.
4. Jika header ada tetapi salah, mengoreksi formatnya.
5. Menormalisasi location, time, `You`, `NPC`, divider `***`, dan `Thread`.
6. Menyimpan state baru.
7. Mengembalikan `modifiedMessage` berisi response yang sudah dikoreksi.

Narasi setelah header tetap dipertahankan.
Jika AI menulis teks sebelum header, teks itu dipindahkan ke bawah header normal agar tidak menghasilkan dua header.

## Rules Normalisasi Saat Ini

### Location

Location ditargetkan menjadi 3 tier:

```text
Main Location - Sub Location - Detailed Area
```

Jika location kurang dari 3 tier, stage mengisi bagian yang hilang memakai state lama atau fallback aman.
Jika location berubah jauh dari state sebelumnya, stage hanya menerima perubahan saat konteks user atau narasi bot memuat cue perpindahan, seperti move, travel, arrive, enter, leave, combat, teleport, time skip, atau scene transition.
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
Perubahan pakaian didukung oleh cue seperti change/wear/remove, `lepas baju`, `tanpa pakaian`, `hanya menggunakan celana`, atau damage naratif seperti burned/torn/scorched, `terbakar`, `robek`, dan `rusak`.
Perubahan posisi didukung oleh cue seperti walk/stop/arrive/sit/stand, `berjalan`, `berhenti`, `sampai`, `tiba`, `duduk`, dan `berdiri`.
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
Detail race-specific tetap dijaga sebagai detail fisik/visible, seperti hands, wings, tail, ears, horns, eyes, claws, weapon, posture, atau anatomy relevan.

### Thread

`Thread` dijaga agar tidak berubah sembarangan dan output dipaksa memakai pemisah ` ; `.

Jika AI mengganti thread secara tiba-tiba tanpa dukungan narasi, stage mempertahankan thread sebelumnya.
Perubahan thread lebih mungkin diterima jika ada overlap kata penting atau narasi mengandung cue transisi seperti arrival, travel, resolved, mission, quest, objective, atau time skip.
Stage menghapus item thread yang completed, failed, abandoned, expired, irrelevant, atau minor seperti normal topic, casual question, temporary mood, small suspicion, minor jealousy, dan small talk.

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
- Do not track normal topics, casual questions, temporary mood, small suspicion, minor jealousy, or every tension.
- Use " ; " between items.
- Remove completed, failed, abandoned, expired, or irrelevant items.
- Optional status tags: (on pause), (Pending), (Ongoing), (Secret), (Known: NPC Name), (Known: Group).

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

Jika prompt header asli nanti diubah lagi:

1. Jangan hapus blok prompt asli di dokumen ini.
2. Bandingkan rules prompt asli dengan behavior `src/aetherNovaHeader.ts`.
3. Ubah parser dan normalizer agar searah dengan prompt asli.
4. Pertahankan prinsip utama: koreksi header saja, jangan rewrite narasi.
5. Build ulang dengan `npm run build`.

Catatan verifikasi terakhir:

- `npm run build` berhasil.
- `npm run lint` belum bisa dipakai karena dependency template `@typescript-eslint/eslint-plugin` belum terpasang.
