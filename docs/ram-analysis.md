# HideApp RAM araştırması — 12 Ekim 2026

Sonuç: tepsideki özel çalışma kümesinde %53 azalma prototipte ölçüldü (106,4 → 50,0 MiB). Bunun için doğrudan C# yardımcısı, tepside renderer kapatma ve yazılımsal çizim birlikte kullanıldı. Yazılımsal çizim olmadan ilk iki değişiklik %41 azalma sağladı (106,4 → 62,9 MiB). Pencere açıkken en düşük özel çalışma kümesi 107,2 → 67,9 MiB, yaklaşık %37 azalmadır. Toplam çalışma kümesi metriğinde en iyi tepsi kazancı yaklaşık %43’tür; %50 sonucu bütün bellek metrikleri veya kullanım durumları için geçerli değildir.

Windows üzerinde Electron 40.10.6 ile gerçek arayüzün izole kopyası ölçüldü. Üretim kaynakları ve kullanıcının çalışan HideApp süreci değiştirilmedi. Her varyant iki ayrı süreçte başlatıldı; her süreçte açık, tepsi ve yeniden açılmış durumlarının her birinden üç örnek alındı. Tablo değerleri altı örneğin ortalamasıdır. Birimler MiB.

| Varyant | Açık: özel çalışma kümesi | Tepsi: özel çalışma kümesi | Tepsi kazancı | Tepsi: ayrılmış özel bellek | Tepsi: toplam çalışma kümesi | Yeniden açılma (ms) |
|---|---:|---:|---:|---:|---:|---|
| Mevcut davranış | 107.2 | 106.4 | %0 | 270 | 396.3 | 4 / 9 |
| Doğrudan C# yardımcısı | 82 | 81.7 | %23.2 | 223.5 | 339.2 | 5 / 8 |
| C# + tepside arayüzü kapatma | 83.2 | 62.9 | %40.9 | 192.9 | 260.2 | 250 / 250 |
| C# + arayüzü kapatma + yazılımsal çizim | 67.9 | 50 | %53 | 126.8 | 226.5 | 451 / 252 |

Özel çalışma kümesi (WorkingSetPrivate), sürece özel fiziksel RAM sayfalarını ölçer. Ayrılmış özel bellek (PrivateMemorySize64/private bytes), fiziksel RAM kullanımına eşit değildir. Toplam çalışma kümelerini toplamak paylaşılan sayfaları birden çok kez sayabilir. Bu üç metrik birbirinin yerine kullanılmamalıdır.

## İşlevsel doğrulama

Doğrudan C# yürütülebilir dosyası, mevcut native testlerinin iki testini geçti: gizleme zamanının korunması; gerçek fixture penceresinin gizlenmesi, hedef sürecin çalışmaya devam etmesi, tekli/toplu geri getirme ve stdin bağlantısının kapanmasında otomatik geri getirme. Bellek denemelerinde yardımcı süreç tepside çalışmaya devam etti; tepside gönderilen enable komutu menüye ve yeniden açılan arayüze yansıdı. Her başarılı koşuda dil seçimi ve localStorage verisi yeniden açılışta korundu.

## Yorum ve sınırlar

Bu bir uygulanmış sürüm optimizasyonu değil, ölçülen prototiptir. Pencere kapatılınca renderer sonlanır fakat GPU/utility süreçlerinin tümü sonlanmaz. app.window-all-closed olayındaki çıkış davranışı değiştirilmeden pencereyi destroy etmek uygulamayı kapatır; prototip bunu ele alır. Arayüz tekrar açıldığında yeniden yüklenir; arama, scroll, pencere geometrisi ve odak gibi geçici durumlar üretim değişikliğinde ayrıca korunmalıdır.

Ölçümler kısa süreli ve gizli pencere listesi boşken alındı. Çok sayıda gizli pencere, uzun süreli kullanım, farklı GPU/sürücü/DPI ve paketlenmiş portable sürüm için aynı kazanç garanti edilmez. Yeniden açılma ölçümü pencerenin görünür ve preload API’nin erişilebilir olmasına kadardır; yardımcı durumunun ekrana boyanmasını kapsamayabilir. Zorunlu GC, çalışma kümesi budama ve güvenlik/sandbox kapatma kullanılmadı. Yazılımsal çizimin görsel ve CPU etkisi geniş kapsamlı doğrulanmadığından varsayılan öneri sayılmamalıdır.

Önerilen ilk uygulama: C# yardımcısını paketleme sırasında derlemek ve tepside renderer yaşam döngüsünü yönetmek. Donanım hızlandırmasını kapatma ancak ek performans/görsel doğrulamadan sonra değerlendirilmelidir.

## Kaynaklar ve tekrar üretme

- [Electron tray yaşam döngüsü](https://www.electronjs.org/docs/latest/tutorial/tray)
- [BrowserWindow.destroy](https://www.electronjs.org/docs/latest/api/browser-window/)
- [app.disableHardwareAcceleration](https://www.electronjs.org/docs/latest/api/app#appdisablehardwareacceleration)

Deney betikleri `.runtime/ram-research/prepare.js`, `probe.js` ve `summarize.js` altında tutuldu. `prepare.js` üretim dosyalarından bir kopya oluşturur. Framework64 v4.0.30319 csc.exe ile Entry.cs ve native/WindowHost.cs /target:exe /platform:x64 /main:RamProbeEntry ve System.Windows.Forms, System.Drawing, System.Web.Extensions referanslarıyla derlenir. Her RAM_MODE için RAM_RUN=1 ve 2 ile `node scripts/electron.js .runtime/ram-research/probe.js` çalıştırılır. Ham örnekler `ram-research-results.json` dosyasındadır. Portable başlatıcı bu karşılaştırmaya dahil değildir; bütün varyantlar aynı Electron çalıştırıcısını kullanır.
