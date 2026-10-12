# Səyyah — Azərbaycanı kəşf et

Azərbaycanın rayon və şəhərləri arasında qonşuluq üzrə yol tapma oyunu ([Travle](https://travle.earth/) üslubunda).

Sənə iki rayon verilir, məsələn **Bakı → İsmayıllı**. Aradakı rayonları bir-bir yazırsan. Başlanğıcdan təyinata qədər sərhədləri toxunan rayonlardan zəncir yarananda qalib gəlirsən.

| Rəng | Mənası |
|---|---|
| 🟩 | Ən qısa yollardan birinin üzərindədir |
| 🟧 | Yola yaxındır (1 addım artıq) |
| 🟥 | Uzaqdır |

## İmkanlar

- **Rejimlər:** Təsadüfi, Günün oyunu (hamı üçün eyni marşrut), Sürət (90 saniyədə mümkün qədər çox marşrut).
- **Çətinlik:** Asan / Orta / Çətin.
- **İpucu:** əvvəlcə ilk hərf, sonra rayonun xəritədəki yeri; hər ipucu 1 cəhd aparır.
- **Səyahət jurnalı:** statistika, kəşf edilmiş rayonlar kolleksiyası və 12 nişan.
- **Paylaşma:** nəticəni mətn və ya şəkil (PNG) kimi paylaşmaq.
- **Səs və titrəmə**, işıqlı və qaranlıq tema.
- **PWA:** telefona tətbiq kimi quraşdırılır və internetsiz işləyir.

## İşə salmaq

Quraşdırma və ya build lazım deyil, layihə statik HTML/CSS/JS-dən ibarətdir.

- Ən sadə yol: `index.html` faylını brauzerdə açmaq.
- PWA (quraşdırma, oflayn) yalnız `http(s)` üzərindən işləyir. Məsələn, VS Code Live Server və ya:

  ```sh
  npx serve .
  ```

## Layihənin quruluşu

| Fayl | Təyinatı |
|---|---|
| `index.html`, `style.css` | İnterfeys |
| `game.js` | Oyun məntiqi, xəritə, rejimlər, statistika |
| `share.js` | Nəticə şəklinin (1080×1350 PNG) yaradılması |
| `data.js` | Rayonların sərhədləri və qonşuluğu (generasiya olunur) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA |
| `audio/` | Səs effektləri |
| `tools/build-data.js` | `data.js`-i sərhəd xəritəsindən yaradır |
| `tools/make-icons.js` | İkonları və favicon-u `logo.svg`-dən yaradır |

Xəritə datasını yenidən yaratmaq üçün: `node tools/build-data.js`.

## Mənbələr

Rayon sərhədləri: [geoBoundaries](https://www.geoboundaries.org/) (CC BY 4.0). Qonşuluq sərhədlərdən avtomatik hesablanır, kiçik anklav şəhərlər əl ilə əhatə edən rayona bağlanıb.

---

[Əmrah Əliyev](https://github.com/Emrah2121) tərəfindən yaradılıb.
