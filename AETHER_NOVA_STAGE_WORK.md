# Aether Nova Stage Reference

Dokumen ini adalah catatan kerja untuk stage Aether Nova yang sudah diterapkan di project ini dan sudah disesuaikan dengan prompt header asli character AI.
Gunakan dokumen ini sebagai pengingat saat mengubah stage berikutnya.

Stage ini bukan system prompt untuk Codex dan bukan system prompt character AI.
Stage ini adalah System teknis Chub Stage untuk pelengkap Chararter Aether Nova

## Status Implementasi

Stage sedang memakai debug UI sementara untuk pengujian.

File utama:

- `src/Stage.tsx`: wrapper Chub Stage, hook `load`, `beforePrompt`, `afterResponse`, dan debug UI sementara.
- `src/aetherNovaHeader.ts`: logic parsing, normalisasi, koreksi header, dan update state.
- `public/chub_meta.yaml`: metadata stage, `position: ADJACENT` saat debug UI aktif, dan schema state.

Stage berjalan dengan:

```yaml
position: ADJACENT
```

Artinya stage menampilkan panel debug di samping chat selama pengujian. Setelah stage sampai tahap final, kembalikan ke `position: NONE` agar stage kembali berjalan tanpa UI

## Format Header Saat Ini

Output AI ditargetkan menjadi:

```md
**Main Location - Sub Location - Detailed Area | Time of Day | HH:MM**
**You: Gender - Apparent Race (Clothes/disguise; Position; body detail)**
**NPC: Full Name - Race (Clothes; Position; body/racial detail), Full Name - Race (Clothes; Position; body/racial detail)**
**Thread: Main mission/status ; Major obstacle/status**
**Wallet: XG ; XS ; XC**
***

Narrative continues here...
```

Contoh:

```md
**Valerest Kingdom - Royal Palace - Guest Chamber | Night | 22:10**
**You: Male - Human (Regular shirt; Standing near window; arms crossed)**
**NPC: Yume Nozomikara - Kitsune (Kimono; Standing before {{user}}; tails still, ears forward, violet-gold eyes bright)**
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

Reminder juga menekankan divider `***`, format status `Clothes/disguise; Position; optional body/racial detail`, pemisah thread ` ; `, dan wallet yang hanya boleh berubah dengan evidence transaksi/reward/loss di narasi.
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
**You: Gender - Apparent Race (Clothes/disguise; Position; body detail)**
```

Stage mencoba menghapus bahasa yang terlalu dramatis dan mempertahankan status fisik yang jelas.
Stage menolak `Anomaly` sebagai apparent race kecuali sudah revealed atau confirmed di konteks.
Stage juga menyaring thoughts, feelings, expression, dialogue, actions, movement, transformation, consent, dan choices dari line `You`.
Clothes/disguise, position, dan body detail memakai state lama kecuali konteks user atau narasi AI terbaru memberi bukti perubahan.
Perubahan pakaian didukung oleh evidence berbahasa Inggris seperti change/wear/remove, put on, dressed in, clad in, changes into, atau damage naratif seperti burned/torn/scorched/damaged. Untuk line `You`, evidence pakaian harus datang dari narasi/aksi visible; kata seperti `naked`, `remove clothes`, atau `undress` yang hanya muncul di dialog bertanda kutip tidak boleh mengubah clothing slot.
Slot pertama dalam status selalu diperlakukan sebagai clothing/disguise slot. Nama pakaian unik seperti ceremonial mantle, moon-silk kimono, battle robe, academy uniform, haori, robe, armor, cloak, atau disguise bisa diterima sebagai pakaian, terutama saat state sebelumnya masih `Regular clothing` atau pakaian itu disebut lagi di narasi terbaru.
Jika AI menulis urutan status salah, stage mendeteksi isi slot lalu mengembalikannya ke urutan `Clothes/disguise; Position; body/racial detail`. Contoh `standing beside Yume; eyes lowered; kimono` menjadi `kimono; standing beside Yume; eyes lowered`. Jika tidak ada slot yang mengacu pada pakaian/naked, stage mempertahankan pakaian dari state sebelumnya.
Clothing slot boleh berisi kondisi pakaian yang relevan, seperti naked, fully naked, loose shirt, baggy pants, pants only, shirt caught on a fence, left sleeve torn, cloak burned, atau armor cracked. Stage tidak memotong detail clothing hanya karena ada `and`, `with`, atau comma selama masih berada di slot pakaian.
Perubahan posisi didukung oleh cue seperti walk/stop/arrive/sit/stand/reach/collapse, dan juga bisa diterima saat location sudah terbukti berpindah scene.
Position slot boleh mencantumkan scene blocking dengan nama NPC atau `{{user}}`, arah, dan jarak, seperti `Standing left of Yume`, `Sitting to the right of {{user}}`, `Standing six steps before {{user}}`, atau `Standing beside Yume near the door`.
Detail seperti eyes/gaze/tail/ears/wings/horns/hands/posture tidak boleh tinggal di slot position jika bisa dipisahkan; stage memindahkannya ke body/racial detail.
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
**NPC: Full Name - Race (Clothes; Position; body/racial detail)**
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
Wallet memakai state lama kecuali narasi terbaru memuat evidence ekonomi yang jelas seperti payment, buy, cost, fee, reward, earn, loot, bounty, gift, refund, lost, stolen, robbed, atau confiscated. Evidence wallet harus berupa transaksi/aksi visible di luar dialog; ucapan di dalam tanda kutip seperti `"I paid fifty silver"` hanya dianggap cerita/percakapan dan tidak boleh mengubah wallet.
Jika AI mengubah angka wallet tanpa transaksi/reward/loss yang dijelaskan dalam cerita, stage mengembalikan wallet ke state sebelumnya.
Jika AI lupa mengubah wallet tetapi konteks terbaru memuat pembayaran/reward yang eksplisit dan nominal uang jelas, stage boleh menghitung perubahan dari state lama, termasuk angka tertulis seperti `fifty silver`. Jika header AI mengubah wallet dengan arah yang salah tetapi inferensi transaksi jelas, stage memilih hasil hitungan inferensi dari narasi/aksi non-dialog.
Diskusi harga, valuasi, appraisal, atau penawaran yang belum selesai tidak mengubah wallet. Contoh seperti `worth a hundred gold to the right buyer`, `price is fifty silver`, `costs fifty silver`, atau `trade information for information` hanya dianggap pembahasan nilai sampai ada aksi pembayaran/penerimaan/loss yang eksplisit.
Untuk penghitungan lintas pecahan, stage memakai konversi internal `1G = 100S` dan `1S = 100C`.
Jika belum ada wallet yang pernah tersimpan, wallet valid pertama dari header dipakai sebagai nilai awal, termasuk first message atau alternate first message; stage tidak memaksa angka awal menjadi `0G ; 0S ; 0C`.
Stage tidak mengizinkan NPC atau narasi membaca wallet sebagai info in-character kecuali uang itu memang diketahui lewat cerita.

### NPC Memory

Stage menyimpan perkembangan NPC yang pernah muncul di header ke state internal `npcMemory`.

Data yang disimpan:

```md
Name: Full NPC Name
Role/Title: role/title penting
Race: race NPC
Physical Extra: fitur fisik tambahan (contoh: nine tails, animal ears)
Relationship with {{user}}: relasi/sikap terbaru
Behavior toward {{user}}: sifat/kebiasaan NPC terhadap user
OnlyKnows: fakta yang hanya diketahui NPC itu
```

Name sebaiknya memakai nama lengkap minimal dua kata jika sudah pernah diketahui, misalnya `Halvair Montreval`. Jika header berikutnya hanya memakai first name seperti `Halvair`, stage mencocokkan ke memory lama dan tetap memakai nama lengkap yang tersimpan.
Role/Title dan Race dipakai untuk mencegah AI melupakan identitas penting NPC saat data lengkap tidak selalu muncul di header.
Physical Extra mencatat fitur fisik tambahan dari race tertentu, seperti `nine tails`, `dragon wings`, `horns`, atau `none` jika tidak ada.
Relationship boleh berubah mengikuti perkembangan cerita, misalnya dari suspicious/formal menjadi friendly/trusted atau hostile.
Behavior mencatat kebiasaan/sikap NPC terhadap user, seperti arrogant, suspicious, protective, possessive, playful, formal, cold, loyal, fearful, respectful, atau loving.
OnlyKnows berisi fakta yang hanya diketahui NPC itu, seperti `{{user}} told Halvair their name`, `{{user}} told Yume about memory loss`, atau `{{user}} threatened Halvair`. Setiap NPC memiliki knowledge firewall terpisah — OnlyKnows NPC A tidak otomatis diketahui NPC B.
Pengambilan role/title harus dekat dengan nama NPC itu atau berasal dari command manual. Jangan mengambil role/title dari topik obrolan yang membahas NPC lain. Contoh: saat Debi hadir tetapi narasi membahas King Solmeryn, Debi tidak boleh menjadi `King of Solmeryn`.

Injection ke prompt bersifat selektif:

- Jika NPC tertulis di header aktif, stage menginject full memory: Name, Role/Title, Race, Physical Extra, Relationship, Behavior, dan OnlyKnows.
- Jika NPC hanya disebut oleh user dalam pesan, stage hanya menginject identitas dasar: Name, Role/Title, Race, dan Physical Extra. Relationship, Behavior, dan OnlyKnows tidak ikut diinject sampai NPC itu masuk header/scene (knowledge firewall).
- Jika NPC tidak ada di header dan tidak disebut user, data tetap disimpan tetapi tidak diinject.

Debug UI sementara:

Saat `position: ADJACENT` dan config `debugUi` aktif, stage menampilkan panel debug yang hanya terlihat oleh user. Panel ini memperlihatkan header state terakhir, jumlah dan isi `npcMemory`, command guide, pending memory command, activity log dari `load`, `setState`, `beforePrompt`, dan `afterResponse`, `stageDirections` terakhir, `systemMessage` debug terakhir, serta pesan user terakhir yang sedang diproses. Data panel tidak dikirim ke LLM kecuali bagian `stageDirections` yang memang dikirim oleh `beforePrompt`. Versi debug UI saat ini: `V1.3`.

Command memory manual:

Command ditulis langsung dalam teks tanpa delimiter khusus dan dihapus dari pesan sebelum dikirim ke LLM. Command juga diterapkan ulang setelah `afterResponse`, agar `delete`, `clearfacts`, `set`, `add fact`, `relation`, atau `show` tidak langsung tertimpa lagi saat NPC masih muncul di header response berikutnya.

```text
npc memory delete: Debi
npc memory clearfacts: Debi
npc memory add fact: Debi | fact={{user}} paid Kaelen to find Debi
npc memory relation: Debi | relationship=friendly
npc memory show: Debi
npc memory set: Debi | role=Market broker | race=Human | physical=none | relationship=guarded | behavior=guarded | onlyKnows={{user}} paid Kaelen to find Debi
```

`set` boleh memakai field `name`, `role`, `race`, `physical`, `relationship`, `behavior`, `fact`, atau `onlyKnows`. Field `fact` menambah fakta ke OnlyKnows lama; `onlyKnows` mengganti daftar OnlyKnows dengan isi baru yang dipisahkan `;`.
`add fact` menambah satu atau lebih fakta ke OnlyKnows NPC yang sudah ada.
`relation` hanya mengubah relationship NPC tanpa mengubah field lain.
`show` menampilkan data NPC memory sebagai system message.

Command dikenali di mana pun dalam teks pesan {{user}} dan akan dihapus dari pesan sebelum dikirim ke LLM. Batas akhir command adalah tanda baca kalimat (`.`, `!`, `?`), baris baru, atau akhir string.

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
Jika seluruh speaker line keliru dibungkus italic sebagai narasi, stage tetap harus mengenali speaker dan memindahkan wrapper italic ke action beat saja, misalnya `*Debi Marquetta: 'softly, her voice close' "Fifty silver..."*` menjadi `Debi Marquetta: *softly, her voice close* "Fifty silver..."`.
Jika action beat polos berada di antara dua dialog dalam satu speaker line, stage membungkus action beat itu dengan italic, misalnya `Yume: "Good." She lowers her voice. "Listen."` menjadi `Yume: "Good." *She lowers her voice.* "Listen."`.
Jika baris dialog tidak punya speaker tetapi narasi tepat sebelumnya atau action beat dialog cukup jelas menunjuk NPC tertentu, stage boleh menambahkan speaker dari header NPC, misalnya narasi menyebut `Yume hums` lalu baris `"The smooth ones," *she says...*` menjadi `Yume: "The smooth ones," *she says...*`.
Stage tidak mengubah isi kalimat, pilihan kata, atau urutan narasi/dialog.


## Catatan Penyesuaian Stage

Stage sudah disesuaikan dengan rencana di Aether_Nova_Stage_Plan.md.

Penyesuaian yang sudah diterapkan:

1. npcMemory field structure diubah agar sesuai plan: `Racial` → `Race`, `KnownFacts` → `OnlyKnows`, ditambah field `PhysicalExtra` dan `Behavior`.
2. Injection untuk mentioned-only NPC dibatasi ke identitas dasar saja (Name, Role/Title, Race, PhysicalExtra) — Relationship, Behavior, dan OnlyKnows tidak ikut diinject sampai NPC masuk header/scene.
3. Command npcMemory ditambah: `add fact`, `relation`, `show`.
4. Debug UI diperbarui menampilkan field baru (Race, Physical Extra, Behavior, OnlyKnows).

Jika prompt header asli nanti diubah lagi:

1. Baca file Guide.Consepts.stage.md dan Guide.State.md untuk refensi
2. Build ulang dengan `npm run build`.

Catatan verifikasi terakhir:

- `npm run build` berhasil.
