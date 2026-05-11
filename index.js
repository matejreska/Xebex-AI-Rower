const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

// Pomocná funkce pro Gemini
async function callGeminiAPI(apiKey, modelName, promptText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: promptText }] }] };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const resultData = await response.json();
    if (!response.ok) throw new Error(resultData.error?.message || response.statusText);

    const summaryText = resultData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!summaryText) throw new Error('Prázdná odpověď od modelu.');
    return summaryText;
}

// Pomocná funkce pro OpenAI (Třetí záloha)
async function callOpenAIAPI(apiKey, promptText) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const payload = {
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "Jsi elitní trenér veslování. Zhodnoť data ve 3 větách (2 věcné, 1 specifický tip). POUZE prostý text (žádný markdown, odrážky, tučné)." },
            { role: "user", content: promptText }
        ],
        temperature: 0.7
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    const resultData = await response.json();
    if (!response.ok) throw new Error(resultData.error?.message || response.statusText);

    const summaryText = resultData.choices?.[0]?.message?.content;
    if (!summaryText) throw new Error('Prázdná odpověď od OpenAI.');
    return summaryText;
}

exports.analyzeWorkout = onCall(async (request) => {
    const stats = request.data.stats;
    const deviceId = request.data.deviceId;

    if (!stats) {
        throw new HttpsError('invalid-argument', 'Data tréninku chybí.');
    }

    if (deviceId) {
        const db = admin.firestore();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        try {
            const snapshot = await db.collection("ai_usage")
                .where("deviceId", "==", deviceId)
                .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(today))
                .count()
                .get();

            if (snapshot.data().count >= 30) {
                logger.warn(`Zařízení ${deviceId} vyčerpalo denní limit.`);
                throw new HttpsError('resource-exhausted', 'Vyčerpán denní limit 30 analýz na zařízení.');
            }
        } catch (err) {
            if (err.code === 'resource-exhausted') throw err;
            logger.error("Chyba při kontrole rate limitu (ignoruji):", err);
        }
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    if (!geminiKey && !openAiKey) {
        throw new HttpsError('failed-precondition', 'Chybí API klíče na serveru.');
    }

    const profil = stats.profil;
    let profilText = "";
    if (profil && profil.vuzrast !== 'neuvedeno') {
        profilText = `Uživatel je ${profil.pol} (věk: ${profil.vuzrast} let, váha: ${profil.teglo} kg).`;
    }

    // ROBUSTNÍ FILTR PODLE CLAUDA:
    // Vytvoříme absolutně čistý objekt nezávisle na tom, z jaké verze appky data přijdou
    const statsForAI = {
        cas_sekundy: stats.cas || stats.durationSeconds,
        vzdalenost_metry: stats.vzdalenost || stats.totalDistance,
        prum_watty: stats.prum_watty || stats.avgWatts,
        prum_spm: stats.prum_spm || stats.avgSpm,
        // Bezpečný filtr: Pokud přijde 'intervaly' z naší appky, vezmeme je. Pokud by přišly syrové 'intervals', vyfiltrujeme 'work'.
        pracovni_intervaly: stats.intervaly || (stats.intervals || []).filter(i => i.type === 'work').map(i => `${i.duration}s ${i.avgWatts}W`),
        profil: stats.profil
        // historyLog zcela schválně ignorujeme
    };
    
    // OPRAVENÝ PROMPT OD CLAUDA
    const promptText = `Působíš jako elitní trenér veslování. ${profilText}
KONTEXT: Data obsahují POUZE pracovní intervaly (pauzy byly odstraněny). Hodnoť konzistenci a výkon výhradně z těchto dat.
Úkol: Napiš text o přesně 3 větách. Věta 1 a 2: Věcné zhodnocení výkonu s odkazem na metriky. Věta 3: Vysoce specifický tip pro techniku nebo fyziologii.
Pravidla: POUZE prostý text. Žádný Markdown, hvězdičky, odrážky, tučné písmo, zalomení řádků. Tón: Odborný a povzbudivý.
Data: ${JSON.stringify(statsForAI)}`;

    let summary = null;

    try {
        logger.info("Zkouším hlavní model gemini-2.5-flash...");
        if (!geminiKey) throw new Error("Chybí GEMINI_API_KEY");
        summary = await callGeminiAPI(geminiKey, 'gemini-2.5-flash', promptText);

    } catch (error1) {
        logger.warn(`Gemini 2.5 Flash selhal (${error1.message}). Zkouším záložní Gemini 2.0...`);
        
        try {
            if (!geminiKey) throw new Error("Chybí GEMINI_API_KEY");
            summary = await callGeminiAPI(geminiKey, 'gemini-2.0-flash', promptText);
            
        } catch (error2) {
            logger.warn(`Záložní Gemini selhalo (${error2.message}). Zkouším OpenAI GPT...`);
            
            try {
                if (!openAiKey) throw new Error("Chybí OPENAI_API_KEY");
                summary = await callOpenAIAPI(openAiKey, promptText);

            } catch (error3) {
                logger.error("Selhaly všechny 3 AI modely.", { err1: error1.message, err2: error2.message, err3: error3.message });
                throw new HttpsError('unavailable', `Odmítnuto všemi AI modely.`);
            }
        }
    }

    if (deviceId) {
        try {
            const db = admin.firestore();
            await db.collection("ai_usage").add({
                deviceId: deviceId,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            logger.error("Nepodařilo se zapsat využití:", e);
        }
    }

    return { summary: summary };
});