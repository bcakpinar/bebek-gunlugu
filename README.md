# Bebek Günlüğü

Yeni doğan bebeğin uyku, beslenme, kilo/boy, ilaç ve ateş kayıtlarını iki ebeveynin telefonundan ortak tutan küçük bir web uygulaması.

- **Kod:** GitHub'da durur, GitHub Pages ile ücretsiz yayınlanır.
- **Kayıtlar:** Firebase'de (Google) durur. Firebase'in ücretsiz planı iki kişinin kullanımı için fazlasıyla yeterli.
- **Telefona kurulum:** Uygulama mağazası gerekmez, ana ekrana eklenir ve uygulama gibi açılır.
- **İnternetsiz kullanım:** İnternet kesikken girilen kayıtlar, bağlantı gelince kendiliğinden gönderilir.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Sayfanın iskeleti ve görünümü (renkler, düzen) |
| `app.js` | Uygulamanın asıl kodu: kayıt ekleme, listeleme, özet |
| `firebase-config.js` | **Senin dolduracağın** ayarlar |
| `firestore.rules` | Kayıtlara sadece ikinizin erişebilmesini sağlayan kurallar |
| `manifest.webmanifest`, `sw.js`, `icons/` | Telefona uygulama gibi kurulabilmesi için |

---

## Kurulum (bir kerelik, yaklaşık 30 dakika)

Bilgisayardan yapman daha kolay olur.

### 1. Firebase projesi oluştur

1. https://console.firebase.google.com adresine Google hesabınla gir.
2. **Proje oluştur** (Create a project) → ad olarak `bebek-gunlugu` yaz → Google Analytics'i **kapat** → Oluştur.
3. Proje açılınca ana sayfada **`</>`** (Web) simgesine tıkla.
   - Uygulama takma adı: `bebek-gunlugu`
   - "Firebase Hosting" kutusunu **işaretleme**.
   - **Uygulamayı kaydet**'e bas.
4. Ekranda `const firebaseConfig = { apiKey: "...", ... }` şeklinde bir kod çıkacak. Buradaki değerleri `firebase-config.js` dosyasındaki `BURAYA_YAPISTIR` yazan yerlere kopyala.

### 2. Giriş hesaplarını aç

1. Soldaki menüden **Build → Authentication** → **Başlayın** (Get started).
2. **Sign-in method** sekmesi → **E-posta/Şifre** (Email/Password) → ilk anahtarı aç → Kaydet.
3. **Users** sekmesi → **Kullanıcı ekle** (Add user):
   - Senin e-postan + bir şifre
   - Eşinin e-postası + bir şifre
4. Bu iki e-postayı `firebase-config.js` içindeki `KISILER` kısmına da yaz. Kayıtlarda "Anne ekledi / Baba ekledi" diye görünmesi için.

> Uygulamada "kaydol" düğmesi yok. Sadece burada eklediğin hesaplar giriş yapabilir.

### 3. Veritabanını aç

1. Soldaki menüden **Build → Firestore Database** → **Veritabanı oluştur** (Create database).
2. Konum olarak `eur3 (europe)` ya da `europe-west` ile başlayan birini seç. Bu ayar sonradan değiştirilemez.
3. **Üretim modunda başlat** (Start in production mode) → Oluştur.
4. Üstteki **Rules** (Kurallar) sekmesine geç. Oradaki her şeyi sil ve `firestore.rules` dosyasının içeriğini yapıştır.
5. İki e-posta adresini kendi adreslerinizle değiştir (küçük harfle) → **Yayınla** (Publish).

### 4. GitHub'a yükle

1. GitHub'da sağ üstteki **+** → **New repository**.
   - Repository name: `bebek-gunlugu`
   - **Public** seç. GitHub Pages ücretsiz hesapta açık depolarda çalışır. Kodun görünmesi sorun değil, çünkü kayıtlar Firebase kurallarıyla korunuyor.
   - **Create repository**.
2. Açılan sayfada **"uploading an existing file"** bağlantısına tıkla.
3. Bu klasördeki **tüm dosyaları ve `icons` klasörünü** sürükleyip bırak → aşağıda **Commit changes**.
4. Deponun **Settings** → soldan **Pages**:
   - Source: **Deploy from a branch**
   - Branch: **main** ve **/ (root)** → **Save**
5. 1–2 dakika bekle. Sayfanın üstünde adres çıkar:
   `https://KULLANICI-ADIN.github.io/bebek-gunlugu/`

### 5. Telefona kur

Adresi ikiniz de telefonda açıp e-posta ve şifrenizle giriş yapın, sonra:

- **iPhone:** Safari'de aç → alttaki **Paylaş** simgesi → **Ana Ekrana Ekle**
- **Android:** Chrome'da aç → sağ üstteki **⋮** → **Ana ekrana ekle** ya da **Uygulamayı yükle**

Artık ana ekrandaki ay simgesine dokununca uygulama açılır.

---

## Güncelleme nasıl yapılır?

1. GitHub'da depona gir ve değiştirmek istediğin dosyaya tıkla.
2. Sağ üstteki **kalem** simgesiyle düzenle. Ya da **Add file → Upload files** ile yeni halini yükle; aynı adlı dosyanın üzerine yazar.
3. **Commit changes**'e bas.
4. 1–2 dakika içinde telefonlara yeni hali gelir. Gelmezse uygulamayı tamamen kapatıp yeniden aç.

Kod değişiklikleri **kayıtları silmez**. Kayıtlar Firebase'de ayrı durur.

### Kolay değişiklik örnekleri

- **Renkler:** `index.html` içinde en üstteki `--accent:#2f7d78` gibi satırlar.
- **"Anne/Baba" adları:** `firebase-config.js` içindeki `KISILER`.
- **Yeni kayıt türü** (örneğin bez değişimi): `app.js` içindeki `TYPES` listesine eklenir ve formu yazılır. Bunu Claude'a "bez değişimi ekle" diye söylemen yeterli.

## Sorun giderme

| Ne oluyor | Ne yapmalı |
|---|---|
| "Kurulum tamamlanmadı" yazıyor | `firebase-config.js` doldurulmamış ya da GitHub'a eski hali yüklenmiş. |
| "E-posta ya da şifre yanlış" | Firebase → Authentication → Users'ta hesabın olduğunu kontrol et. |
| "Bu hesabın izni yok" | `firestore.rules` içindeki e-postayı kontrol et (küçük harf, yazım hatası). Değiştirince Firestore → Rules'ta tekrar **Publish** et. |
| Sayfa hiç açılmıyor (404) | GitHub → Settings → Pages ayarını kontrol et, 2 dakika bekle. |
