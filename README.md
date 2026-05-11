# Xebex AI - Chytrý trenér pro veslařské trenažéry

Tento projekt je maturitní prací, jejímž cílem bylo vytvořit moderní webovou aplikaci (PWA) pro veslařské trenažéry Xebex a Concept2. Aplikace nahrazuje zastaralé a nepřehledné displeje trenažérů, komunikuje se strojem napřímo přes Bluetooth a obohacuje trénink o expertní analýzu pomocí umělé inteligence.

## Živá ukázka a Demo mód

Aplikace je nasazena a plně funkční na této adrese: https://rower-20172.web.app

Aplikaci je možné si plně vyzkoušet i bez fyzické přítomnosti veslařského trenažéru. Pro účely testování a hodnocení jsem do kódu implementoval plnohodnotný Demo mód, který simuluje reálný trénink včetně odesílání Bluetooth dat.

Jak spustit Demo mód:
Po otevření odkazu v prohlížeči najeďte v pravém horním rohu na tlačítko Připojit a podržte jej stisknuté po dobu přibližně 3 sekund. Tlačítko změní svůj stav a aplikace začne interně generovat simulovaná data, jako by byla reálně připojena ke stroji.

Co přesně Demo mód umožňuje otestovat:
- Plně simuluje realistické hodnoty výkonu ve Wattech, tempo, ujeté metry a spálené kalorie.
- Umožňuje otestovat plynulost uživatelského rozhraní a okamžitou odezvu při střídání tréninkových fází.
- V manuálním režimu simuluje automatické střídání vyšší a nižší zátěže v závislosti na tom, zda zrovna probíhá interval práce, nebo interval odpočinku.
- Po dokončení tréninku aplikace vyhodnotí data a standardní cestou je odešle do cloudové databáze Firebase.
- Umožňuje otestovat reálnou komunikaci s backendem. Na vygenerovaná data se zavolá Cloud Funkce, spojí se s AI modelem a vrátí skutečné slovní hodnocení tréninku, které se následně uloží do uživatelské historie.

Díky tomuto režimu si lze projít kompletní životní cyklus aplikace od úvodního nastavení profilu, přes samotný trénink, až po databázové uložení a AI analýzu.

## Hlavní funkce aplikace

- Bluetooth Low Energy: Přímé čtení surových dat ze stroje v reálném čase přes standardizovaný protokol FTMS.
- Auto-Detect Fází: Běžné trenažéry trpí setrvačností. Tato aplikace díky vlastnímu algoritmu pozná podle okamžitého poklesu mechanického tempa, kdy uživatel přestal veslovat, a okamžitě přepíná mezi prací a pauzou. To řeší zásadní problém s nepřesným měřením intervalů u běžných displejů.
- AI Analýza tréninku: Po dokončení tréninku jsou očištěná data (bez pauz) odeslána na zabezpečený cloud. Tam je zanalyzuje umělá inteligence a vrátí uživateli shrnutí s konkrétním tipem na zlepšení, zohledňující zadaný věk, váhu a pohlaví uživatele.
- PWA a Offline podpora: Aplikace nevyžaduje složitou instalaci z obchodů s aplikacemi. Díky Service Workeru funguje bez problému i offline a v projektu je vygenerován nativní instalační balíček pro Android.

## Architektura a Technologie

Projekt je logicky rozdělen na klientskou část běžící na zařízení uživatele a serverovou část v cloudu.

Klientská část (Frontend):
- Je tvořena jedním silně optimalizovaným HTML souborem pro maximální přenositelnost a bleskovou rychlost načítání.
- Uživatelské rozhraní využívá Tailwind CSS pro moderní a responzivní vzhled, optimalizovaný na zobrazení bez překryvu systémovými lištami.
- Vykreslování grafů a vizualizace výkonu je řešena pomocí knihovny Chart.js.
- Komunikace se strojem probíhá přes nativní Web Bluetooth API, které naslouchá a dekóduje charakteristiky Fitness Machine.

Serverová část (Backend):
- Využívá platformu Firebase Cloud Functions. Zajišťuje bezpečné skrytí API klíčů a brání tak jejich odcizení z klientského prohlížeče.
- Systém obsahuje robustní kaskádový fallback pro modely umělé inteligence. Primárně využívá nejvýkonnější model Gemini 2.5 Flash. V případě jeho výpadku či přetížení automaticky přechází na Gemini 2.0 Flash. Pokud selžou oba systémy od Googlu, je systém připraven jako poslední instanci zavolat záložní model od OpenAI.
- Data se ukládají do NoSQL databáze Firebase Firestore. Databáze uchovává historii tréninků a systémové záznamy pro ochranu před vyčerpáním limitů.

## Bezpečnost a oddělení uživatelů

Pro dosažení co nejlepšího uživatelského zážitku se aplikace vyhýbá zdlouhavému ověřování přes e-mail a heslo. Místo toho si aplikace při svém prvním spuštění bezpečně vygeneruje v mezipaměti unikátní identifikátor zařízení.

Cloudová databáze přijímá data z jakéhokoliv telefonu, ale při načítání historie aplikace stahuje a zobrazuje striktně pouze dokumenty odpovídající danému konkrétnímu zařízení. Uživatelé tak mají svá osobní data oddělená. Bezpečnostní pravidla Firestore jsou nastavena tak, že nová data lze pouze přidávat či aktualizovat vlastními, avšak stará data nelze neautorizovaně mazat.
