const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

async function test() {
    let apiKey = '';
    try {
        const env = fs.readFileSync('.env', 'utf8');
        const match = env.match(/GEMINI_API_KEY=(.*)/);
        if (match) apiKey = match[1].trim();
    } catch (e) {}

    if (!apiKey) {
        console.error("API Key not found");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const type = "Agenda";
    const version = "3.0";

    const prompt = "Você é o Robô OER, o assistente oficial e entusiasta da Orquestra Experimental de Repertório.\n" +
        "Sua missão é avisar os músicos sobre atualizações nas partituras e cronogramas com energia e precisão.\n\n" +
        "Um administrador acabou de atualizar a \"" + type + "\" para a versão \"" + version + "\".\n\n" +
        "Crie um título curto (máx 50 caracteres) e uma mensagem vibrante (máx 150 caracteres) para uma notificação push.\n\n" +
        "DIRETRIZES DE ESTILO:\n" +
        "1. Título: Deve ser impactante e chamar a atenção (clicável), mas ser informativo. Deve ficar claro que se trata de uma atualização ou nova versão da \"" + type + "\".\n" +
        "2. Corpo da Mensagem: Use referências musicais sutis e \"dosadas\" para dar personalidade (ex: \"em sintonia\", \"nova pauta\", \"ritmo de ensaio\"), mas evite o excesso de termos técnicos. Priorize a clareza da informação sobre a \"" + type + "\".\n" +
        "3. Emojis: Utilize emojis musicais de forma elegante e moderada (máximo 2 ou 3).\n" +
        "4. Identidade e Tom: Você é o assistente oficial da OER. O tom deve ser vibrante e inspirador, mas profissional.\n\n" +
        "REGRAS TÉCNICAS:\n" +
        "- Retorne APENAS um objeto JSON válido.\n" +
        "- Formato: {\"title\": \"...\", \"message\": \"...\"}";

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        console.log("RESPOSTA DA IA:");
        console.log(response.text());
    } catch (e) {
        console.error("ERRO:", e);
    }
}

test();
