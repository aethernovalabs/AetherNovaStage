# Aether Nova Stage Plan
jangan mengubah dokumen ini
Dokumen ini adalah rencana pengembangan Stage untuk Aether Nova.

Stage ini bertugas sebagai **technical Aether Nova** untuk menjaga konsistensi output AI dalam chat RP panjang.
Stage tidak berperan sebagai creative writer, tetapi sebagai sistem koreksi, validasi, dan penyimpanan state.

---

## 1. Tujuan Utama Stage

Stage Aether Nova bertugas untuk:

1. Mengoreksi format header.
2. Menjaga konsistensi lokasi, waktu, You, NPC, Thread, dan Wallet.
3. Mengoreksi format narasi dan dialog.
4. Menyimpan perkembangan data NPC melalui `npcMemory`.
5. Mengatur data jangka panjang seperti Wallet dan NPC knowledge.
6. Mengembalikan data yang salah jika AI atau user mengubahnya secara tidak valid.
7. Memberi data relevan ke LLM hanya saat diperlukan agar hemat token.

Stage hanya boleh memperbaiki bagian teknis/format dan state.
Stage tidak boleh menulis ulang narasi utama secara kreatif kecuali untuk koreksi format.

---

## 2. Format Header Wajib

Setiap output AI harus dimulai dengan header berikut:

```md
**Main Location - Sub Location - Detailed Area | Time of Day | HH:MM**
**You: Gender - Apparent Race (Clothes; Position; body detail)**
**NPC: Full Name - Race (Clothes; Position; body/racial detail), Full Name - Race (Clothes; Position; body/racial detail)**
**Thread: Main mission/status ; Major obstacle/status**
**Wallet: XG ; XS ; XC**
***
```

Rules umum:

* Semua line header wajib dibungkus dengan `**...**`.
* Header wajib diakhiri dengan `***`.
* `***` harus berada tepat di bawah line `Wallet`.
* Stage harus mengoreksi separator lama seperti `___` menjadi `***`.
* Stage harus menjaga urutan line header tetap konsisten.

---

## 3. Location Header Rules

Format lokasi:

```text
Main Location - Sub Location - Detailed Area
```

### Main Location

`Main Location` mencatat wilayah besar seperti:

* kerajaan
* kota besar
* hutan besar
* realm/dimensi
* region utama

Stage harus mempertahankan `Main Location` kecuali narasi menjelaskan perpindahan besar secara logis.

Contoh alasan valid untuk mengubah `Main Location`:

* perjalanan jauh
* pindah kerajaan
* teleport
* pindah dimensi
* scene transition besar
* user memakai skill yang jelas memindahkan lokasi besar

### Sub Location

`Sub Location` mencatat area di dalam Main Location, seperti:

* istana
* rumah
* distrik
* nama jalan
* penginapan
* pasar
* landmark

Stage harus mempertahankan `Sub Location` kecuali narasi menjelaskan user/NPC keluar atau berpindah area.

Catatan:

* Jika scene berada di jalan atau perjalanan, Stage tidak perlu terlalu ketat karena scene bisa berubah cepat.

### Detailed Area

`Detailed Area` mencatat lokasi detail seperti:

* ruang makan
* kamar tidur
* koridor
* halaman
* dekat pintu
* meja makan
* kamar mandi
* sisi jalan

Stage boleh lebih fleksibel pada `Detailed Area` karena bagian ini sering berubah hanya dengan gerakan kecil.

---

## 4. Time Header Rules

Format waktu:

```text
Time of Day | HH:MM
```

Stage harus mengoreksi `Time of Day` agar sesuai dengan `HH:MM`.

Mapping waktu:

```text
Morning   = 05:00-11:59
Afternoon = 12:00-16:59
Evening   = 17:00-20:59
Night     = 21:00-04:59
```

Contoh:

```text
Evening | 23:10
```

Harus dikoreksi menjadi:

```text
Night | 23:10
```

---

## 5. You Header Rules

Format line `You`:

```md
**You: Gender - Apparent Race (Clothes; Position; body detail)**
```

### Gender dan Apparent Race

Stage harus mempertahankan `Gender` dan `Apparent Race` kecuali ada perubahan logis dalam narasi.

Perubahan valid:

* user memakai skill Shapeshift
* user memakai disguise
* user mengalami transformasi yang jelas
* user sendiri menyatakan perubahan bentuk

`Apparent Race` adalah bentuk yang terlihat, bukan identitas asli rahasia.

### Status Order

Status dalam parentheses wajib mengikuti urutan:

```text
Clothes; Position; body detail
```

Stage harus memperbaiki jika AI salah urutan.

Rules:

* `Clothes` wajib ada.
* `Position` wajib ada.
* `body detail` opsional.
* Setiap bagian dipisahkan dengan tanda `;`.

---

### You Clothes Rules

`Clothes` berubah hanya jika ada alasan naratif jelas.

Contoh alasan valid:

* user mengganti pakaian
* user melepas pakaian
* pakaian terbakar
* pakaian robek
* NPC menarik pakaian user
* baju tersangkut
* user sendiri menyatakan perubahan pakaian

State seperti Naked, towel, blanket, cloak, disguise, armor, atau keadaan pakaian lain boleh masuk ke bagian `Clothes`.

Jika AI menghapus `Clothes`, Stage harus mengambil `Clothes` terakhir dari state sebelumnya.

---

### You Position Rules

`Position` adalah posisi fisik user di scene.

Contoh:

```text
Standing near door
Sitting on chair
Leaning against wall
Lying on NPC's lap
Standing before Yume
Seated at table
```

Stage harus mempertahankan posisi terakhir kecuali narasi menjelaskan perubahan posisi.

Perubahan valid:

* user bergerak
* NPC menarik user
* NPC membawa user
* user duduk/berdiri/berbaring
* scene berpindah
* combat movement

---

### You Body Detail Rules

`body detail` adalah detail tubuh atau bahasa tubuh yang terlihat.

Contoh:

```text
arms crossed
hand on chin
holding cup
left hand raised
hair damp
eyes narrowed
blood on sleeve
```

Bagian ini harus fleksibel karena cepat berubah.

Stage tidak boleh terlalu ketat terhadap body detail, tetapi tetap harus mencegah anatomy yang tidak sesuai race.

Contoh:

* Human tidak boleh tiba-tiba punya wings/tail/horns kecuali ada transformasi yang jelas.
* Race dengan fitur khusus boleh memakai body/racial detail yang sesuai.

---

## 6. NPC Header Rules

Format line `NPC`:

```md
**NPC: Full Name - Race (Clothes; Position; body/racial detail), Full Name - Race (Clothes; Position; body/racial detail)**
```

Rules utama:

* Stage harus hati-hati karena NPC bisa lebih dari satu.
* Prioritas NPC adalah karakter yang punya `Full Name`, biasanya minimal dua kata.
* Stage harus menjaga `Full Name` dan `Race` setiap NPC agar konsisten.
* Multiple NPC dipisahkan dengan koma di level atas.
* Status NPC mengikuti urutan:

```text
Clothes; Position; body/racial detail
```

Rules status NPC:

* `Clothes` wajib ada.
* `Position` wajib ada.
* `body/racial detail` opsional.
* Status dipisahkan dengan `;`.
* Position dan body detail NPC harus lebih fleksibel karena NPC sering bergerak.

---

### NPC Clothes Rules

Stage harus mempertahankan clothes terakhir NPC kecuali ada alasan jelas.

Perubahan valid:

* NPC mengganti pakaian
* NPC melepas armor
* pakaian rusak
* scene berubah
* NPC memakai disguise
* NPC dijelaskan memakai outfit baru

---

### NPC Position Rules

Position NPC mencatat blocking di scene.

Contoh:

```text
Standing before {{user}}
Seated beside throne
Standing by door
Behind {{user}}
At table head
Leaning near window
```

Position NPC boleh berubah lebih cepat daripada `You`, terutama saat:

* NPC bergerak
* NPC mengikuti user
* NPC meninggalkan scene
* combat
* interaksi fisik
* scene transition

---

### NPC Body/Racial Detail Rules

NPC boleh memiliki body/racial detail sesuai race.

Contoh racial detail:

```text
Kitsune: tails, ears, eyes
Catkin: ears, tail, claws
Dragonkin: wings, tail, horns, claws, scales
Demon: horns, tail, wings, aura, eyes
Angel: wings, halo, posture
Vampire: fangs, eyes, posture
Pixie/Fey: wings, glow, ears
Human: hands, posture, arms, clothing condition, weapon
```

Stage harus mencegah body/racial detail yang tidak cocok dengan race.

Contoh salah:

```md
**NPC: Halvair Montreval - Human (Royal robe; Standing before throne; nine tails swaying)**
```

Jika Halvair adalah Human, `nine tails` harus dihapus atau dikoreksi.

Jika Halvair adalah Kitsune, maka racial detail tersebut valid.

---

## 7. Thread Header Rules

Format line `Thread`:

```md
**Thread: Main mission/status ; Major obstacle/status**
```

Thread hanya boleh mencatat hal penting seperti:

* misi utama
* janji temu penting
* rencana final
* tujuan perjalanan
* kontrak
* deadline
* major obstacle
* konflik besar yang belum selesai
* NPC penting yang sedang menunggu
* event pending

Stage tidak boleh terlalu agresif menambahkan thread baru.

---

### Thread Status

Stage boleh menambahkan status jika diperlukan.

Contoh:

```text
Meeting with King Halvair (Pending)
Travel to Mistywood (Active)
Deliver Debi's locket (Completed)
Yume waiting outside the inn (Only Knows: Yume)
```

Status yang bisa digunakan:

```text
(Pending)
(Active)
(Ongoing)
(on pause)
(Completed)
(Failed)
(Only Knows: NPC Name)
(Secret)
(Known: NPC Name)
(Known: Group)
```

---

### Thread Cleanup

Jika misi berstatus:

```text
Completed
Failed
Abandoned
Expired
Irrelevant
```

Stage harus menghapus misi tersebut pada pesan berikutnya, kecuali masih relevan secara naratif.

Jika AI menghapus misi penting yang masih pending atau belum selesai, Stage harus mengembalikannya.

---

### Secret / Only Knows Logic

Jika ada NPC yang mengetahui rencana atau rahasia tertentu, tetapi NPC itu tidak hadir di line `NPC`, gunakan status:

```text
(Only Knows: NPC Name)
```

Contoh:

```md
**Thread: Yume waiting outside the inn (Only Knows: Yume)**
```

Tujuannya untuk menjaga knowledge firewall dan mencegah NPC lain mengetahui informasi yang tidak mereka ketahui.

---

## 8. Wallet Header Rules

Format line `Wallet`:

```md
**Wallet: XG ; XS ; XC**
```

Contoh output:

```md
**Wallet: 12G ; 35S ; 8C**
```

Currency:

```text
G = Gold
S = Silver
C = Copper
```

Conversion:

```text
100 Copper = 1 Silver
100 Silver = 1 Gold
```

---

### Wallet State Rules

Wallet disimpan dan dikontrol oleh Stage.

Stage harus:

* menyimpan jumlah Gold, Silver, dan Copper.
* mempertahankan nilai wallet yang benar.
* mengoreksi nilai wallet jika AI mengubahnya secara tidak valid.
* mengabaikan perubahan wallet hasil edit manual user pada message lama.
* hanya mengubah wallet jika ada transaksi yang jelas dan logis dalam narasi.

---

### Valid Wallet Transactions

Wallet boleh berubah melalui transaksi seperti:

```text
selling items
buying items
paying inn
paying food
receiving reward
receiving gift
stealing
being robbed
looting
tax
fine
contract payment
debt
loss
```

Stage harus bisa membedakan:

### Wallet berkurang jika:

```text
{{user}} pays
{{user}} buys
{{user}} gives coins
{{user}} is robbed
{{user}} loses coins
{{user}} pays tax/fine/debt
```

### Wallet bertambah jika:

```text
{{user}} receives coins
{{user}} sells items
{{user}} steals successfully
{{user}} loots successfully
{{user}} receives reward
{{user}} receives gift
{{user}} receives contract payment
```

---

### Important Wallet Rule

Perubahan wallet hanya valid jika didukung oleh action/narasi yang jelas.

Valid source:

```text
narrative action
action wrapped in *...*
clear event description
```

Tidak cukup valid jika hanya muncul dalam dialog.

Contoh tidak cukup valid:

```md
Yume: "You should pay 10 Gold."
```

Wallet tidak berubah hanya karena ada dialog.

Contoh valid:

```md
*{{user}} places 10 Gold on the counter.*
```

Wallet berkurang 10 Gold.

---

## 9. Narrative and Dialogue Format Rules

Stage harus mengoreksi format narasi dan dialog.

### Action / Narration

Narasi, action, room description, atmosphere, dan scene description harus dibungkus dengan:

```md
*...*
```

Contoh:

```md
*The candlelight trembles across the marble floor.*
```

---

### Dialogue

Dialog/voice NPC harus dibungkus dengan:

```md
"..."
```

Contoh:

```md
Yume Nozomikara: *her tails lower slightly* "You came back late."
```

---

### NPC Name Before Dialogue

Jika AI menulis dialog tanpa nama NPC, Stage harus menambahkan nama NPC yang relevan jika bisa dideteksi.

Format salah:

```md
*her voice comes out quieter than she likely intended* "Mistywood. You walked out of Mistywood with a woman's warmth and empty hands, and you chose to build instead of destroy."
```

Format benar:

```md
Debi Marquetta: *her voice comes out quieter than she likely intended* "Mistywood. You walked out of Mistywood with a woman's warmth and empty hands, and you chose to build instead of destroy."
```

Jika NPC tidak bisa ditentukan dengan aman, Stage tidak boleh menebak terlalu agresif.

---

### Nested Italic Rule

Jika ada tanda `*...*` di dalam narasi atau dialog yang sudah memakai italic, Stage harus mengganti bagian dalam dengan `'...'`.

Format salah:

```md
Debi Marquetta: *her voice comes out *quieter* than she likely intended* "Mistywood. You walked out of Mistywood with a woman's warmth and empty hands, and *you chose to build instead of destroy*."
```

Format benar:

```md
Debi Marquetta: *her voice comes out 'quieter' than she likely intended* "Mistywood. You walked out of Mistywood with a woman's warmth and empty hands, and 'you chose to build instead of destroy'."
```

---

## 10. npcMemory Feature

`npcMemory` adalah fitur Stage untuk menyimpan perkembangan data NPC yang pernah ditemui user.

Tujuan utama:

* menjaga konsistensi identitas NPC.
* mencegah AI lupa nama, role, race, atau detail fisik penting.
* menjaga relationship development.
* menjaga knowledge firewall per NPC.
* hanya inject data NPC yang relevan agar hemat token.

---

### npcMemory Data Structure

Setiap NPC menyimpan data berikut:

```text
Name:
Role/Title:
Race:
Physical Extra:
Relationship with {{user}}:
Behavior toward {{user}}:
Only Knows:
```

Contoh:

```text
Name: Yume Nozomikara
Role/Title: Nine-Tail Fate Broker
Race: Kitsune
Physical Extra: nine tails
Relationship with {{user}}: Friend
Behavior toward {{user}}: aggressive, playful, possessive
Only Knows:
- {{user}} told Yume about {{user}}'s amnesia.
- Yume saw {{user}} kill monsters with Hellfire.
```

---

### npcMemory Field Rules

#### Name

* Nama NPC harus disimpan sebagai full name.
* Idealnya minimal dua kata.
* Alias boleh disimpan, tetapi injected data harus memakai full name.

#### Role/Title

* `Role/Title` adalah gelar asli NPC.
* Contoh:

```text
King of Solmeryn
Nine-Tail Fate Broker
Queen of Valerest
Royal Guard Captain
```

#### Race

* Race harus konsisten.
* Stage tidak boleh mengubah race kecuali data lama terbukti salah dan ada data baru yang lebih akurat.

#### Physical Extra

Physical Extra adalah fitur fisik tambahan dari race tertentu.

Contoh:

```text
nine tails
dragon wings
horns
cat ears
none
```

Jika tidak ada fitur tambahan, tulis:

```text
none
```

#### Relationship with {{user}}

Mencatat hubungan berdasarkan perkembangan cerita.

Contoh:

```text
stranger
enemy
suspicious
formal
friend
ally
lover
rival
protector
dependent
```

Relationship boleh berubah mengikuti perkembangan RP.

#### Behavior toward {{user}}

Mencatat kebiasaan/sifat NPC terhadap user saat ini.

Contoh:

```text
arrogant
suspicious
protective
possessive
playful
formal
cold
loyal
fearful
respectful
```

Behavior boleh berubah mengikuti perkembangan cerita.

#### Only Knows

`Only Knows` adalah fakta penting yang hanya diketahui NPC tersebut.

Contoh:

```text
{{user}} told Yume about his amnesia.
{{user}} threatened Halvair.
Yume saw {{user}} use Hellfire.
Halvair knows {{user}}'s name.
```

Rules:

* Known facts tidak boleh otomatis dibagikan ke NPC lain.
* Setiap NPC memiliki knowledge firewall sendiri.
* NPC hanya tahu fakta yang mereka lihat, dengar, atau diberitahu dalam cerita.

---

## 11. npcMemory Injection Rules

Stage harus inject data NPC secara selektif.

### Case 1: NPC muncul di header line `NPC`

Jika NPC ada di header, Stage harus inject full npcMemory.

Inject:

```text
Name
Role/Title
Race
Physical Extra
Relationship with {{user}}
Behavior toward {{user}}
Only Knows
```

Contoh:

Header:

```md
**NPC: Halvair Montreval - Kitsune (...), Yume Nozomikara - Kitsune (...)**
```

Stage inject:

```text
NPC Memory Active:
- Halvair Montreval | King of Solmeryn | Kitsune | Physical Extra: nine tails | Relationship: suspicious/formal | Behavior: arrogant, cautious | Only Knows: {{user}} told Halvair his name; {{user}} once threatened Halvair.
- Yume Nozomikara | Nine-Tail Fate Broker | Kitsune | Physical Extra: nine tails | Relationship: friend | Behavior: aggressive, playful, possessive | Only Knows: {{user}} told Yume about his amnesia; Yume saw {{user}} use Hellfire.
```

---

### Case 2: NPC hanya disebut dalam pesan user

Jika user menyebut nama NPC, tetapi NPC tidak ada di header line `NPC`, Stage hanya inject identity data.

Inject:

```text
Name
Role/Title
Race
Physical Extra
```

Jangan inject:

```text
Relationship with {{user}}
Behavior toward {{user}}
Only Knows
```

Tujuan:

* NPC yang tidak hadir tidak membawa knowledge aktif ke scene.
* AI tetap tahu identitas dasar NPC yang sedang dibicarakan.
* Token tetap hemat.

Contoh:

User:

```text
Aku bertanya pada Yume, "Menurutmu Halvair akan percaya padaku?"
```

Jika Halvair tidak ada di header:

```text
Mentioned NPC Reference:
- Halvair Montreval | King of Solmeryn | Kitsune | Physical Extra: nine tails.
```

---

### Case 3: NPC tidak hadir dan tidak disebut

Jika NPC tidak ada di header dan tidak disebut user:

* jangan inject data NPC tersebut.
* tetap simpan npcMemory secara internal.

---

## 12. npcMemory Update Rules

Stage harus mencatat perkembangan NPC jika ada data baru yang jelas.

Data yang bisa diperbarui:

```text
Relationship with {{user}}
Behavior toward {{user}}
Only Knows
last known presence/location
```

Data fixed yang tidak boleh diubah sembarangan:

```text
Name
Role/Title
Race
Physical Extra
```

Data fixed hanya boleh berubah jika:

* data lama tidak akurat.
* ada data baru yang lebih resmi/lebih akurat.
* user menggunakan command manual untuk memperbaiki data.

---

## 13. npcMemory Commands

Stage harus mendukung command manual agar user bisa memperbaiki atau menghapus data NPC.

### Delete NPC Memory

```text
npc memory delete: NPC Name
```

Fungsi:

* menghapus seluruh data npcMemory untuk NPC tersebut.

Contoh:

```text
npc memory delete: Halvair Montreval
```

---

### Set NPC Memory

```text
npc memory set: NPC Name | role=... | race=... | physical=... | relationship=... | behavior=... | onlyKnows=...
```

Fungsi:

* membuat atau mengubah data NPC tertentu.

Contoh:

```text
npc memory set: Halvair Montreval | role=King of Solmeryn | race=Kitsune | physical=nine tails | relationship=suspicious/formal | behavior=arrogant, cautious | onlyKnows={{user}} told Halvair his name
```

---

### Append NPC Known Fact

```text
npc memory add fact: NPC Name | fact=...
```

Contoh:

```text
npc memory add fact: Yume Nozomikara | fact={{user}} told Yume about his amnesia
```

---

### Update Relationship

```text
npc memory relation: NPC Name | relationship=...
```

Contoh:

```text
npc memory relation: Yume Nozomikara | relationship=friend/protective companion
```

---

### Show NPC Memory

```text
npc memory show: NPC Name
```

Fungsi:

* menampilkan data npcMemory NPC tertentu dalam system info.

Contoh output:

```md
[system: npcMemory]
Name: Yume Nozomikara
Role/Title: Nine-Tail Fate Broker
Race: Kitsune
Physical Extra: nine tails
Relationship with {{user}}: Friend
Behavior toward {{user}}: aggressive, playful, possessive
Only Knows:
- {{user}} told Yume about his amnesia.
- Yume saw {{user}} use Hellfire.
```

---

## 14. Stage Workflow

### beforePrompt

Sebelum prompt dikirim ke LLM, Stage harus:

1. Membaca state terakhir.
2. Membaca NPC yang ada di header terakhir.
3. Membaca nama NPC yang disebut dalam pesan user.
4. Menentukan data NPC yang perlu di-inject.
5. Inject full npcMemory untuk NPC yang hadir di header.
6. Inject identity-only untuk NPC yang hanya disebut user.
7. Inject wallet/current state jika diperlukan.
8. Menambahkan reminder compact untuk format header.

---

### afterResponse

Setelah LLM membalas, Stage harus:

1. Membaca output AI.
2. Mengoreksi header.
3. Mengoreksi lokasi, waktu, You, NPC, Thread, dan Wallet.
4. Mengoreksi format narasi/dialog jika aman.
5. Memproses transaksi wallet jika valid.
6. Memperbarui npcMemory jika ada data jelas.
7. Menyimpan state baru.
8. Mengembalikan response yang sudah dikoreksi.

---

## 15. Stage Boundaries

Stage tidak boleh:

* membuat UI tanpa permintaan.
* mengubah gaya narasi utama secara kreatif.
* mengubah dialog karakter secara bebas.
* menambahkan NPC baru tanpa dasar.
* membuat lokasi baru secara kreatif.
* mengubah relationship NPC tanpa dasar naratif.
* menyebarkan `Only Knows` ke NPC lain.
* mengubah fixed NPC data tanpa alasan kuat.
* menambah atau mengurangi wallet tanpa transaksi valid.
* menghapus misi penting yang masih aktif.
* menulis ulang seluruh response jika hanya header yang salah.

---

## 16. Development Priority

Urutan pengembangan yang disarankan:

1. Header format correction.
2. `***` separator enforcement.
3. Location and time correction.
4. You line correction.
5. NPC line correction.
6. Race/body detail validation.
7. Thread guard.
8. Wallet state and transaction logic.
9. Narrative/dialogue format correction.
10. npcMemory storage.
11. npcMemory selective injection.
12. npcMemory commands.
13. Future systems: storage, skill info, quick slots, combat assist.

---

## 17. Final Goal

Stage dianggap berhasil jika:

* Header selalu rapi dan konsisten.
* Lokasi tidak berubah sembarangan.
* Waktu selalu sesuai Time of Day.
* You/NPC status selalu berurutan: `Clothes; Position; body detail`.
* Race dan body/racial detail tidak bertabrakan.
* Thread menjaga misi penting tanpa terlalu agresif.
* Wallet selalu akurat dan tidak bisa dimanipulasi lewat edit manual.
* Narasi dan dialog mengikuti format Aether Nova.
* NPC punya memory terpisah.
* NPC tidak otomatis tahu fakta milik NPC lain.
* Stage hanya inject data NPC yang relevan.
* RP panjang terasa lebih konsisten seperti game RPG/world sim.

## Ruang System Prompt Header Asli
Bagian ini disiapkan untuk prompt asli milik character AI yang mengatur header.
Prompt di bawah nanti adalah contoh/reference untuk stage, bukan instruksi untuk Codex.

Tempel system prompt header asli di sini:

```text
[HEADER FORMAT]
{{char}} MUST begin every narrative reply with this exact header:

**Main Location - Sub Location - Detailed Area | Time of Day | HH:MM**
**You: Gender - Apparent Race (Clothes/disguise; Position; body detail)**
**NPC: Full Name - Race (Clothes; Position; body/racial detail), Full Name - Race (Clothes; Position; body/racial detail)**
**Thread: Main mission/status ; Major obstacle/status**
**Wallet: XG ; XS ; XC**
***

Rules:
- All 4 header lines MUST use ** at the start and end.
- Use exactly *** before narration.
- NPCs cannot read, know, or react to You/NPC/Thread data unless learned in-story.
- Status format is fixed: Clothes; Position; Opsional body/racial detail.
- Do not replace position or clothes with mood, emotion, role, or vague status.
- Only add Body/Racial details when needed, such as fighting, intimacy or sudden movements.

[Header LOCATION & TIME Rules]
- Location uses 3 tiers separated by " - ": main region/kingdom - place/district - exact area.
- Change location only by clear cause: {{user}} moves, NPC leads, travel, combat shift, time skip, or scene transition.
- Time of Day must match HH:MM: Morning 05:00-11:59, Afternoon 12:00-16:59, Evening 17:00-20:59, Night 21:00-04:59.
- Normal talk advances 5-15 minutes. Quick reactions may keep the same minute. Travel, waiting, sleep, rituals, missions, or recovery may skip hours.

[Header YOU LINE Rules]
- Format: Gender - Apparent Race (Clothes/disguise; Position; body detail)
- Clothes/disguise and position must always stay in Status.
- Keep last known position and clothes unless {{user}} changes them or the scene clearly moves.
- Apparent Race is visible form, not true identity.
- Never write "Anomaly" unless revealed or confirmed in-story.
- Body detail should stay simple: arms crossed, hood up, left hand on hip, hand on chin, holding cup.
- Do not add thoughts, feelings, expression, mood, actions, movement, transformation, dialogue, or choices.

[Header NPC LINE Rules]
- Include all NPCs currently around {{user}}.
- Format: Full Name - Race (Clothes; Position; body/racial detail)
- Race uses dash. Status uses parentheses.
- Separate multiple NPCs with commas only.
- {{user}} is not an NPC.
- Minor unnamed NPCs may be grouped by role.
- Clothes and position must always stay in Status.
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
```