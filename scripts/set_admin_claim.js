const admin = require('firebase-admin');
const path = require('path');

// Inicializa o admin SDK
// Se estiver rodando localmente e tiver o service account, aponte para ele.
// Caso contrário, assume que está em um ambiente autenticado pelo Firebase CLI.
admin.initializeApp();

const email = 'borisantunes@prefeitura.sp.gov.br';

async function setAdminClaim(userEmail) {
    try {
        const user = await admin.auth().getUserByEmail(userEmail);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        console.log(`✅ Sucesso! Privilégios de admin atribuídos ao usuário: ${userEmail}`);
        
        // Verifica se a claim foi aplicada
        const updatedUser = await admin.auth().getUser(user.uid);
        console.log('Claims atuais:', updatedUser.customClaims);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao atribuir privilégios:', error);
        process.exit(1);
    }
}

setAdminClaim(email);
