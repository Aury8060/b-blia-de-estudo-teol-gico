import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, get, update, remove, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCFO8ut8FhrTcXIaq4SVpIi5q_BHPEHVcg",
    authDomain: "biblia-estudo-a43c0.firebaseapp.com",
    projectId: "biblia-estudo-a43c0",
    storageBucket: "biblia-estudo-a43c0.firebasestorage.app",
    messagingSenderId: "699485458612",
    appId: "1:699485458612:web:f20add3b6a1801f67187e1",
    measurementId: "G-G5TW32CMP9",
    databaseURL: "https://biblia-estudo-a43c0-default-rtdb.firebaseio.com/"
};

// 🔑 COLOQUE SUA CHAVE DA GROQ AQUI 
const GROQ_API_KEY = "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"; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;
let isAdmin = false;
let studyTimer;
let secondsStudied = 0;
let currentAIText = ""; // Armazena o texto da IA para ser copiado

const bibleStructure = {
    "Gênesis": 50, "Êxodo": 40, "Levítico": 27, "Números": 36, "Deuteronômio": 34, "Josué": 24, "Juízes": 21, "Rute": 4, "1 Samuel": 31, "2 Samuel": 24, "1 Reis": 22, "2 Reis": 25, "1 Crônicas": 29, "2 Crônicas": 36, "Esdras": 10, "Neemias": 13, "Ester": 10, "Jó": 42, "Salmos": 150, "Provérbios": 31, "Eclesiastes": 12, "Cânticos": 8, "Isaías": 66, "Jeremias": 52, "Lamentações": 5, "Ezequiel": 48, "Daniel": 12, "Oséias": 14, "Joel": 3, "Amós": 9, "Obadias": 1, "Jonas": 4, "Miquéias": 7, "Naum": 3, "Habacuque": 3, "Sofonias": 3, "Ageu": 2, "Zacarias": 14, "Malaquias": 4,
    "Mateus": 28, "Marcos": 16, "Lucas": 24, "João": 21, "Atos": 28, "Romanos": 16, "1 Coríntios": 16, "2 Coríntios": 13, "Gálatas": 6, "Efésios": 6, "Filipenses": 4, "Colossenses": 4, "1 Tessalonicenses": 5, "2 Tessalonicenses": 3, "1 Timóteo": 6, "2 Timóteo": 4, "Tito": 3, "Filemom": 1, "Hebreus": 13, "Tiago": 5, "1 Pedro": 5, "2 Pedro": 3, "1 João": 5, "2 João": 1, "3 João": 1, "Judas": 1, "Apocalipse": 22
};

function initBibleNavigation() {
    const bookSelect = document.getElementById('bible-book');
    const chapterSelect = document.getElementById('bible-chapter');
    const adminDeleteSelect = document.getElementById('admin-delete-book');

    for (let book in bibleStructure) {
        let option = document.createElement('option');
        option.value = book;
        option.innerText = book;
        bookSelect.appendChild(option);

        let adminOption = document.createElement('option');
        adminOption.value = book;
        adminOption.innerText = book;
        adminDeleteSelect.appendChild(adminOption);
    }

    bookSelect.addEventListener('change', () => {
        let selectedBook = bookSelect.value;
        let chapters = bibleStructure[selectedBook];
        chapterSelect.innerHTML = '';
        for (let i = 1; i <= chapters; i++) {
            let option = document.createElement('option');
            option.value = i;
            option.innerText = `Capítulo ${i}`;
            chapterSelect.appendChild(option);
        }
    });

    bookSelect.dispatchEvent(new Event('change'));
}

window.openScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    if (screenId === 'study-screen') startStudySession();
};

document.getElementById('btn-login').addEventListener('click', async () => {
    const emailInput = document.getElementById('email').value;
    const passInput = document.getElementById('password').value;

    if (emailInput === 'au.costa' && passInput === '80605276') {
        currentUser = { uid: 'admin_au_costa', name: 'AU Costa' };
        isAdmin = true;
        loadDashboard();
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, emailInput, passInput);
        currentUser = userCredential.user;
        isAdmin = false;
        loadDashboard();
    } catch (error) {
        document.getElementById('auth-error').innerText = "Erro ao logar. Verifique os dados.";
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null;
    isAdmin = false;
    openScreen('login-screen');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
});

async function loadDashboard() {
    openScreen('dashboard-screen');
    document.getElementById('user-name').innerText = isAdmin ? "AU Costa" : currentUser.email;
    document.getElementById('user-role').innerText = isAdmin ? "Criador / Admin" : "Teólogo em Formação";
    
    document.getElementById('admin-panel-btn').style.display = isAdmin ? 'block' : 'none';

    const dbRef = ref(db);
    try {
        const snapshot = await get(child(dbRef, `Biblia_Estudo/Users/${currentUser.uid}`));
        if (snapshot.exists()) {
            const data = snapshot.val();
            document.getElementById('total-time').innerText = Math.floor((data.tempoEstudo || 0) / 60) + " min";
            document.getElementById('quiz-score').innerText = (data.quizScore || 0) + " pts";
        } else {
            set(ref(db, `Biblia_Estudo/Users/${currentUser.uid}`), { tempoEstudo: 0, quizScore: 0 });
        }
    } catch (error) { console.error(error); }
}

function startStudySession() {
    secondsStudied = 0;
    document.getElementById('session-timer').innerText = "00:00";
    studyTimer = setInterval(() => {
        secondsStudied++;
        let min = String(Math.floor(secondsStudied / 60)).padStart(2, '0');
        let sec = String(secondsStudied % 60).padStart(2, '0');
        document.getElementById('session-timer').innerText = `${min}:${sec}`;
    }, 1000);
}

window.leaveStudy = async () => {
    clearInterval(studyTimer);
    if (currentUser) {
        const userRef = ref(db, `Biblia_Estudo/Users/${currentUser.uid}`);
        const snapshot = await get(userRef);
        let tempoAtual = snapshot.exists() ? snapshot.val().tempoEstudo || 0 : 0;
        update(userRef, { tempoEstudo: tempoAtual + secondsStudied });
    }
    openScreen('dashboard-screen');
    loadDashboard();
};

document.getElementById('btn-load-text').addEventListener('click', async () => {
    const book = document.getElementById('bible-book').value;
    const chapter = document.getElementById('bible-chapter').value;
    const version = document.getElementById('bible-version').value;
    const readerDiv = document.getElementById('bible-reader');
    
    readerDiv.innerHTML = '<p class="placeholder-text">Consultando as Escrituras no banco de dados...</p>';

    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, `Biblia_Estudo/Textos/${book}/${chapter}`));
        
        if (snapshot.exists()) {
            const verses = snapshot.val();
            let htmlContent = '';

            for (const [verseNum, verseData] of Object.entries(verses)) {
                if (version === 'original') {
                    let strongLinks = '';
                    if(verseData.strongs) {
                        verseData.strongs.forEach(strongId => {
                            strongLinks += `<span class="strong-link" onclick="event.stopPropagation(); openDictionary('${strongId}')">[${strongId}]</span> `;
                        });
                    }
                    let textoOriginal = verseData.original ? verseData.original : (verseData.ntlh || verseData.acf || '');
                    
                    htmlContent += `
                        <div class="verse-text" onclick="analyzeVerse('${book}', '${chapter}', '${verseNum}', this)">
                            <strong>${verseNum}</strong> <span class="v-text-content">${textoOriginal}</span> ${strongLinks}
                        </div>`;
                } else {
                    let textoVersao = verseData[version] ? verseData[version] : `<span style="color:#fc8181">Versículo indisponível nesta tradução.</span>`;
                    
                    htmlContent += `
                        <div class="verse-text" onclick="analyzeVerse('${book}', '${chapter}', '${verseNum}', this)">
                            <strong>${verseNum}</strong> <span class="v-text-content">${textoVersao}</span>
                        </div>`;
                }
            }
            readerDiv.innerHTML = htmlContent;
        } else {
            readerDiv.innerHTML = '<p class="placeholder-text error-msg">O texto deste capítulo ainda não foi importado para o banco de dados.</p>';
        }
    } catch (error) {
        console.error("Erro ao buscar:", error);
        readerDiv.innerHTML = '<p class="placeholder-text error-msg">Erro de conexão com o banco de dados.</p>';
    }
});

// ==========================================
// LÓGICA DO SUPER PROFESSOR (GROQ API)
// ==========================================
window.analyzeVerse = async (book, chapter, verseNum, element) => {
    const verseText = element.querySelector('.v-text-content').innerText;
    
    const modal = document.getElementById('ai-professor-modal');
    const title = document.getElementById('ai-verse-title');
    const content = document.getElementById('ai-verse-content');
    const copyBtn = document.getElementById('btn-copy-ai-notes');

    title.innerText = `${book} ${chapter}:${verseNum}`;
    copyBtn.style.display = 'none';
    content.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <p style="color: #63b3ed; font-weight: bold; font-size: 1.2em;">O Super Professor está analisando a Palavra...</p>
            <p class="dict-sub">Buscando conexões, contexto histórico e gerando exegese profunda. Aguarde ⏳</p>
        </div>`;
    modal.style.display = 'block';

    if (GROQ_API_KEY === "SUA_CHAVE_GROQ_AQUI" || GROQ_API_KEY === "") {
        content.innerHTML = '<p class="error-msg">⚠️ Erro: Para acessar o Professor Teológico, insira sua chave da API da Groq no arquivo app.js.</p>';
        return;
    }

    try {
        const systemPrompt = `Você é um Doutor em Teologia, mestre em exegese bíblica, hebraico, grego e hermenêutica. 
        Sua missão é dar um "up" nos detalhes, abrir a visão do aluno e motivá-lo a aprender cada vez mais a Bíblia.
        Você deve fornecer uma análise rica, profunda e extremamente bem conectada.
        Responda ESTRITAMENTE em código HTML puro para ser injetado no site. Use apenas as tags: <div>, <p>, <h3>, <ul>, <li>, <strong>, <em>, <br>. 
        PROIBIDO o uso de marcação markdown como \`\`\`html. O texto deve fluir de maneira impactante, professoral e inspiradora.`;

        const userPrompt = `Faça uma exegese teológica de altíssimo nível do versículo: ${book} ${chapter}:${verseNum} - "${verseText}".
        
        Siga OBRIGATORIAMENTE esta estrutura HTML:
        <h3>🔗 Referências Cruzadas</h3>
        <p>[Liste referências diretas de outros livros, como Gênesis, Apocalipse, Salmos, etc. Explique a conexão teológica entre eles, mostrando que a Bíblia é um livro unificado.]</p>
        
        <h3>📜 Contexto Histórico e Cultural</h3>
        <p>[Explique detalhes como: o que estava acontecendo na época, costumes, geografia, política do momento, para que o aluno entenda o cenário original.]</p>
        
        <h3>🧠 Exegese Profunda (Hebraico/Grego)</h3>
        <p>[Desvende o significado teológico. Se houver palavras cruciais no texto original, explique seu peso e o que a tradução pode não ter captado totalmente.]</p>
        
        <h3>🔥 Aplicação e Reflexão</h3>
        <p>[Encerre com uma reflexão poderosa e encorajadora baseada no texto, visando despertar a paixão do aluno pelo estudo da Palavra.]</p>`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // <-- O MODELO FOI ATUALIZADO AQUI
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        const data = await response.json();
        
        if (data.error) {
            content.innerHTML = `<p class="error-msg">Erro na API da Groq: ${data.error.message}</p>`;
            return;
        }

        let aiHTML = data.choices[0].message.content;
        
        // Limpeza de segurança caso a IA ainda retorne com formato markdown
        aiHTML = aiHTML.replace(/```html/g, '').replace(/```/g, ''); 
        
        content.innerHTML = aiHTML;
        
        // Salva o texto processado globalmente (removendo tags HTML para caber limpo no textarea)
        currentAIText = `ESTUDO TEOLÓGICO: ${book} ${chapter}:${verseNum}\n\n` + aiHTML.replace(/<[^>]*>?/gm, ''); 
        copyBtn.style.display = 'block';
        
    } catch (error) {
        console.error("Erro no Super Professor (Groq):", error);
        content.innerHTML = '<p class="error-msg">Erro de conexão ao gerar o estudo teológico. Verifique a internet e tente novamente.</p>';
    }
};

// Adiciona anotação do Super Professor no textarea
document.getElementById('btn-copy-ai-notes').addEventListener('click', () => {
    const studyNotes = document.getElementById('study-notes');
    if(studyNotes.value !== "") studyNotes.value += "\n\n----------------------\n\n";
    studyNotes.value += currentAIText;
    
    // Feedback visual
    const copyBtn = document.getElementById('btn-copy-ai-notes');
    copyBtn.innerText = "✅ Salvo nas suas anotações!";
    copyBtn.style.background = "#48bb78";
    setTimeout(() => {
        copyBtn.innerText = "📥 Copiar para minhas anotações";
        copyBtn.style.background = "#3182ce";
        closeAIModal();
    }, 2000);
});

window.closeAIModal = () => { document.getElementById('ai-professor-modal').style.display = 'none'; };

// ==========================================
// LÓGICA DO DICIONÁRIO E MODAIS
// ==========================================
window.openDictionary = async (strongId) => {
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, `Biblia_Estudo/Dicionario_Strongs/${strongId}`));
        
        const modal = document.getElementById('dict-modal');
        const title = document.getElementById('dict-title');
        const pron = document.getElementById('dict-pronunciation');
        const def = document.getElementById('dict-def');

        if (snapshot.exists()) {
            const data = snapshot.val();
            title.innerText = `${data.palavra} (${data.idioma})`;
            pron.innerText = `Pronúncia: ${data.pronuncia}`;
            def.innerText = data.definicao;
        } else {
            title.innerText = "Código " + strongId;
            pron.innerText = "";
            def.innerText = "Definição ainda não importada no banco de dados.";
        }
        
        modal.style.display = 'block';
    } catch (error) { console.error(error); }
};

window.closeDictionary = () => { document.getElementById('dict-modal').style.display = 'none'; };

// Fecha modais ao clicar fora ou no X
window.onclick = (event) => { 
    if (event.target === document.getElementById('dict-modal')) closeDictionary(); 
    if (event.target === document.getElementById('ai-professor-modal')) closeAIModal(); 
};


// ==========================================
// LÓGICA DO PAINEL DO ADMINISTRADOR
// ==========================================
document.getElementById('btn-import-json').addEventListener('click', async () => {
    const fileInput = document.getElementById('json-file-input');
    const versionSelect = document.getElementById('admin-import-version').value;
    const statusText = document.getElementById('import-status');
    
    if (fileInput.files.length === 0) {
        statusText.innerText = "❌ Selecione pelo menos um arquivo JSON.";
        statusText.style.color = "#fc8181";
        return;
    }

    statusText.style.color = "#a0aec0";
    statusText.innerText = "Lendo e processando a matriz do arquivo... Aguarde.";

    for (let file of fileInput.files) {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                statusText.innerText = `Montando estrutura de nós para: ${file.name}...`;
                const jsonData = JSON.parse(e.target.result);
                
                let updates = {};
                
                jsonData.forEach(livro => {
                    const nomeLivro = livro.name; 
                    
                    livro.chapters.forEach((capitulo, capIndex) => {
                        const numCapitulo = capIndex + 1;
                        
                        capitulo.forEach((textoVersiculo, verIndex) => {
                            const numVersiculo = verIndex + 1;
                            const caminhoFirebase = `Biblia_Estudo/Textos/${nomeLivro}/${numCapitulo}/${numVersiculo}/${versionSelect}`;
                            updates[caminhoFirebase] = textoVersiculo;
                        });
                    });
                });
                
                await update(ref(db), updates);
                
                statusText.style.color = "#48bb78";
                statusText.innerText = `✅ Arquivo importado com sucesso na versão [${versionSelect.toUpperCase()}]! As versões foram atualizadas em tempo real.`;
            } catch (error) {
                console.error("Erro na conversão do JSON:", error);
                statusText.style.color = "#fc8181";
                statusText.innerText = `❌ Erro no processamento de ${file.name}. Verifique se é o JSON correto.`;
            }
        };
        
        reader.readAsText(file);
    }
});

document.getElementById('btn-delete-book').addEventListener('click', async () => {
    const bookToDelete = document.getElementById('admin-delete-book').value;
    const statusText = document.getElementById('delete-status');

    const confirmar = confirm(`ATENÇÃO ADMINISTRADOR!\nTem certeza que deseja APAGAR todas as traduções do livro de ${bookToDelete} do banco de dados?`);
    
    if (confirmar) {
        try {
            await remove(ref(db, `Biblia_Estudo/Textos/${bookToDelete}`));
            statusText.style.color = "#48bb78";
            statusText.innerText = `✅ Livro de ${bookToDelete} apagado com sucesso.`;
        } catch (error) {
            statusText.style.color = "#fc8181";
            statusText.innerText = "❌ Erro ao apagar o livro.";
            console.error(error);
        }
    }
});

initBibleNavigation();