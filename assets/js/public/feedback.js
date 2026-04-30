document.addEventListener('DOMContentLoaded', () => {
    const feedbackBtn = document.getElementById('btn-feedback');

    if (feedbackBtn) {
        feedbackBtn.addEventListener('click', (e) => {
            e.preventDefault();

            // 1. Coleta de Informações do Dispositivo
            const ua = navigator.userAgent;
            let os = "Desconhecido";
            if (ua.indexOf("Win") !== -1) os = "Windows";
            if (ua.indexOf("Mac") !== -1) os = "MacOS";
            if (ua.indexOf("Linux") !== -1) os = "Linux";
            if (ua.indexOf("Android") !== -1) os = "Android";
            if (ua.indexOf("like Mac") !== -1) os = "iOS";
            
            // Verificação básica se é mobile ou não
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
            const deviceType = isMobile ? "Dispositivo Móvel" : "Desktop/Computador";

            const screenWidth = window.screen.width || "N/A";
            const screenHeight = window.screen.height || "N/A";
            const resolution = `${screenWidth}x${screenHeight}`;

            // Obtendo a data e hora local
            const currentDateTime = new Date().toLocaleString('pt-BR');

            // 2. Construção do corpo do e-mail
            const email = "borisantunes@prefeitura.sp.gov.br";
            const subject = "Feedback - Agenda da OER";
            
            // Montando o texto com os espaçamentos solicitados
            const bodyText = "Olá meu nome é : \n" +
                             "estou tendo essa dificuldade :\n\n\n" +
                             "--- INFORMAÇÕES DE DIAGNÓSTICO ---\n" +
                             `Data e Hora: ${currentDateTime}\n` +
                             `Sistema: ${os}\n` +
                             `Dispositivo: ${deviceType}\n` +
                             `Navegador (App): ${ua}\n` +
                             `Resolução da Tela: ${resolution}\n` +
                             "----------------------------------";

            // 3. Formatação da URL mailto e redirecionamento para o app de e-mail
            const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
            
            window.location.href = mailtoUrl;
        });
    }
});
