// IMPORTAÇÕES ATUALIZADAS: Adicionado suporte para queries de banco de dados (query, orderByKey, startAt, endAt)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, child, push, query, orderByKey, startAt, endAt } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

// 🔑 CHAVE DA GROQ
const GROQ_API_KEY = "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"; 

const app = initializeApp(firebaseConfig);
const db = getDatabase(app); 

let currentUser = null;
let isAdmin = false;
let studyTimer;
let secondsStudied = 0;
let currentAIText = ""; 
let wakeLock = null; 

// Variáveis Globais do Quiz e do Menu de Ações
let quizQuestions = [];
let currentQuizIndex = 0;
let quizHits = 0;
let quizMisses = 0;
let quizTimerInterval;
let quizTimeLeft = 20;
let maxTimePerQuestion = 20;

let currentSelectedVerse = null; // Guarda os dados do versículo clicado

const bibleStructure = {
    "Gênesis": 50, "Êxodo": 40, "Levítico": 27, "Números": 36, "Deuteronômio": 34, "Josué": 24, "Juízes": 21, "Rute": 4, "1 Samuel": 31, "2 Samuel": 24, "1 Reis": 22, "2 Reis": 25, "1 Crônicas": 29, "2 Crônicas": 36, "Esdras": 10, "Neemias": 13, "Ester": 10, "Jó": 42, "Salmos": 150, "Provérbios": 31, "Eclesiastes": 12, "Cânticos": 8, "Isaías": 66, "Jeremias": 52, "Lamentações": 5, "Ezequiel": 48, "Daniel": 12, "Oséias": 14, "Joel": 3, "Amós": 9, "Obadias": 1, "Jonas": 4, "Miquéias": 7, "Naum": 3, "Habacuque": 3, "Sofonias": 3, "Ageu": 2, "Zacarias": 14, "Malaquias": 4,
    "Mateus": 28, "Marcos": 16, "Lucas": 24, "João": 21, "Atos": 28, "Romanos": 16, "1 Coríntios": 16, "2 Coríntios": 13, "Gálatas": 6, "Efésios": 6, "Filipenses": 4, "Colossenses": 4, "1 Tessalonicenses": 5, "2 Tessalonicenses": 3, "1 Timóteo": 6, "2 Timóteo": 4, "Tito": 3, "Filemom": 1, "Hebreus": 13, "Tiago": 5, "1 Pedro": 5, "2 Pedro": 3, "1 João": 5, "2 João": 1, "3 João": 1, "Judas": 1, "Apocalipse": 22
};

// ==========================================
// FUNÇÕES DE TELA (WAKE LOCK E AUTO-LOGIN)
// ==========================================
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
}

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
    }
});

window.onload = () => {
    const savedUser = localStorage.getItem('teologia_user_session');
    if (savedUser) {
        const parsed = JSON.parse(savedUser);
        currentUser = { uid: parsed.uid, email: parsed.email };
        isAdmin = parsed.isAdmin;
        loadDashboard();
    }
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
    
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    
    let targetNavBtn = Array.from(document.querySelectorAll('.nav-item')).find(btn => btn.getAttribute('onclick').includes(screenId));
    if(targetNavBtn) targetNavBtn.classList.add('active');

    if (screenId === 'study-screen') startStudySession();
    if (screenId === 'notes-screen') loadMyNotes();
};

// ==========================================
// SISTEMA DE AUTENTICAÇÃO CUSTOMIZADO
// ==========================================
function sanitizeKey(email) {
    return email.replace(/[.#$[\]/]/g, '_');
}

document.getElementById('btn-login').addEventListener('click', async () => {
    const emailInput = document.getElementById('email').value.trim();
    const passInput = document.getElementById('password').value;
    const errorMsg = document.getElementById('auth-error');

    if (!emailInput || !passInput) {
        errorMsg.style.color = "#e53e3e";
        errorMsg.innerText = "Preencha o usuário e a senha.";
        return;
    }

    if (emailInput === 'au.costa' && passInput === '80605276') {
        currentUser = { uid: 'admin_au_costa', email: 'au.costa' };
        isAdmin = true;
        errorMsg.innerText = "";
        localStorage.setItem('teologia_user_session', JSON.stringify({ uid: currentUser.uid, email: currentUser.email, isAdmin: isAdmin }));
        loadDashboard();
        return;
    }

    try {
        errorMsg.style.color = "#777";
        errorMsg.innerText = "Verificando dados...";
        
        const userKey = sanitizeKey(emailInput);
        const snapshot = await get(child(ref(db), `Biblia_Estudo/Users/${userKey}`));
        
        if (snapshot.exists()) {
            const userData = snapshot.val();
            if (userData.password === passInput) {
                currentUser = { uid: userKey, email: emailInput };
                isAdmin = false;
                errorMsg.innerText = "";
                localStorage.setItem('teologia_user_session', JSON.stringify({ uid: currentUser.uid, email: currentUser.email, isAdmin: isAdmin }));
                loadDashboard();
            } else {
                errorMsg.style.color = "#e53e3e";
                errorMsg.innerText = "Senha incorreta.";
            }
        } else {
            errorMsg.style.color = "#e53e3e";
            errorMsg.innerText = "Usuário não encontrado. Crie uma conta.";
        }
    } catch (error) {
        errorMsg.style.color = "#e53e3e";
        errorMsg.innerText = "Erro ao conectar ao banco de dados.";
    }
});

document.getElementById('btn-register').addEventListener('click', async () => {
    const emailInput = document.getElementById('email').value.trim();
    const passInput = document.getElementById('password').value;
    const errorMsg = document.getElementById('auth-error');

    if (!emailInput || !passInput) {
        errorMsg.style.color = "#e53e3e";
        errorMsg.innerText = "Preencha um nome de usuário/e-mail e senha para criar a conta.";
        return;
    }

    if (passInput.length < 6) {
        errorMsg.style.color = "#e53e3e";
        errorMsg.innerText = "A senha deve ter no mínimo 6 caracteres.";
        return;
    }

    try {
        errorMsg.style.color = "#777";
        errorMsg.innerText = "Criando conta no banco de dados, aguarde...";
        
        const userKey = sanitizeKey(emailInput);
        const snapshot = await get(child(ref(db), `Biblia_Estudo/Users/${userKey}`));
        
        if (snapshot.exists()) {
            errorMsg.style.color = "#e53e3e";
            errorMsg.innerText = "Este usuário já existe. Tente fazer o login.";
        } else {
            await set(ref(db, `Biblia_Estudo/Users/${userKey}`), {
                email: emailInput,
                password: passInput,
                tempoEstudo: 0,
                quizScore: 0
            });
            
            currentUser = { uid: userKey, email: emailInput };
            isAdmin = false;
            errorMsg.innerText = "";
            localStorage.setItem('teologia_user_session', JSON.stringify({ uid: currentUser.uid, email: currentUser.email, isAdmin: isAdmin }));
            loadDashboard(); 
        }
    } catch (error) {
        errorMsg.style.color = "#e53e3e";
        errorMsg.innerText = "Erro ao criar conta. Verifique sua conexão.";
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null;
    isAdmin = false;
    localStorage.removeItem('teologia_user_session'); 
    
    document.getElementById('bottom-nav').style.display = 'none';

    openScreen('login-screen');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    document.getElementById('auth-error').innerText = '';
});

async function loadDashboard() {
    openScreen('dashboard-screen');
    
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('user-name').innerText = isAdmin ? "AU Costa" : currentUser.email;
    document.getElementById('user-role').innerText = isAdmin ? "Criador / Admin" : "Teólogo em Formação";
    document.getElementById('nav-admin').style.display = isAdmin ? 'flex' : 'none';

    const dbRef = ref(db);
    try {
        const snapshot = await get(child(dbRef, `Biblia_Estudo/Users/${currentUser.uid}`));
        if (snapshot.exists()) {
            const data = snapshot.val();
            document.getElementById('total-time').innerText = Math.floor((data.tempoEstudo || 0) / 60) + " min";
            document.getElementById('quiz-score').innerText = (data.quizScore || 0) + " pts";
        }
    } catch (error) { console.error(error); }
}

// ==========================================
// MÓDULO: ESTUDO, ANOTAÇÕES E MENU DE AÇÕES
// ==========================================
function startStudySession() {
    requestWakeLock(); 
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
    
    if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
    }

    if (currentUser) {
        const userRef = ref(db, `Biblia_Estudo/Users/${currentUser.uid}`);
        const snapshot = await get(userRef);
        let tempoAtual = snapshot.exists() ? snapshot.val().tempoEstudo || 0 : 0;
        update(userRef, { tempoEstudo: tempoAtual + secondsStudied });
    }
    
    document.getElementById('controls-wrapper').style.display = 'flex';
    document.getElementById('header-book-btn').innerText = `Selecionar Livro`;
    document.getElementById('notes-area-wrapper').style.display = 'none';
    
    openScreen('dashboard-screen');
    loadDashboard();
};

document.getElementById('header-book-btn').addEventListener('click', () => {
    const controls = document.getElementById('controls-wrapper');
    controls.style.display = (controls.style.display === 'none' || controls.style.display === '') ? 'flex' : 'none';
});

// A MÁGICA ACONTECE AQUI NO CARREGAMENTO
document.getElementById('btn-load-text').addEventListener('click', async () => {
    const book = document.getElementById('bible-book').value;
    const chapter = document.getElementById('bible-chapter').value;
    const version = document.getElementById('bible-version').value;
    const readerDiv = document.getElementById('bible-reader');
    
    readerDiv.innerHTML = '<p class="placeholder-text">Consultando as Escrituras no banco de dados...</p>';

    try {
        const dbRef = ref(db);
        
        // 1. Busca os textos da Bíblia
        const snapshot = await get(child(dbRef, `Biblia_Estudo/Textos/${book}/${chapter}`));
        
        if (snapshot.exists()) {
            const verses = snapshot.val();
            
            // 2. Busca as marcações de texto (Highlights) salvas pelo usuário
            const highlightsSnapshot = await get(child(dbRef, `Biblia_Estudo/Users/${currentUser.uid}/Highlights/${book}/${chapter}`));
            const highlights = highlightsSnapshot.exists() ? highlightsSnapshot.val() : {};

            // 3. Verifica no Cache IA quais versículos deste capítulo já possuem estudo gerado
            // A query isola a pesquisa apenas para o capítulo atual, poupando a memória do app!
            const baseKey = sanitizeKey(`${book.replace(/\s+/g, '_')}_${chapter}_`);
            const cacheQuery = query(ref(db, 'Biblia_Estudo/AI_Cache_Exaustivo'), orderByKey(), startAt(baseKey), endAt(baseKey + "\uf8ff"));
            const cacheSnapshot = await get(cacheQuery);
            const cachedVerses = cacheSnapshot.exists() ? Object.keys(cacheSnapshot.val()) : [];

            let htmlContent = '';

            for (const [verseNum, verseData] of Object.entries(verses)) {
                
                // Aplica a cor de fundo salva, se houver
                let bgColor = highlights[verseNum] ? `background-color: ${highlights[verseNum]};` : '';
                
                // Insere o ícone ✍︎ apenas se a chave exata existir no cache retornado
                const currentVerseKey = sanitizeKey(`${book.replace(/\s+/g, '_')}_${chapter}_${verseNum}`);
                let cacheIcon = cachedVerses.includes(currentVerseKey) ? `<span class="study-icon" title="Estudo Profundo Disponível" onclick="event.stopPropagation(); analyzeVerse('${book}', '${chapter}', '${verseNum}', this.parentElement)">✍︎</span>` : '';

                if (version === 'original') {
                    let strongLinks = '';
                    if(verseData.strongs) {
                        verseData.strongs.forEach(strongId => {
                            strongLinks += `<span class="strong-link" onclick="event.stopPropagation(); openDictionary('${strongId}')">[${strongId}]</span> `;
                        });
                    }
                    let textoOriginal = verseData.original ? verseData.original : (verseData.ntlh || verseData.acf || '');
                    
                    htmlContent += `
                        <div class="verse-text" style="${bgColor}" onclick="openVerseActionMenu('${book}', '${chapter}', '${verseNum}', this)">
                            <strong>${verseNum}</strong> <span class="v-text-content">${textoOriginal}</span> ${strongLinks} ${cacheIcon}
                        </div>`;
                } else {
                    let textoVersao = verseData[version] ? verseData[version] : `<span style="color:#e53e3e">Indisponível nesta tradução.</span>`;
                    htmlContent += `
                        <div class="verse-text" style="${bgColor}" onclick="openVerseActionMenu('${book}', '${chapter}', '${verseNum}', this)">
                            <strong>${verseNum}</strong> <span class="v-text-content">${textoVersao}</span> ${cacheIcon}
                        </div>`;
                }
            }
            readerDiv.innerHTML = htmlContent;
            
            document.getElementById('controls-wrapper').style.display = 'none';
            document.getElementById('notes-area-wrapper').style.display = 'block';
            document.getElementById('header-book-btn').innerText = `${book} ${chapter}`;

        } else {
            readerDiv.innerHTML = '<p class="placeholder-text error-msg">O texto deste capítulo ainda não foi importado.</p>';
        }
    } catch (error) {
        console.error("Erro ao buscar:", error);
    }
});

// ==========================================
// FUNÇÕES DO MENU DE AÇÕES FLUTUANTE
// ==========================================
window.openVerseActionMenu = (book, chapter, verseNum, element) => {
    currentSelectedVerse = { book, chapter, verseNum, element };
    const verseText = element.querySelector('.v-text-content').innerText;
    currentSelectedVerse.text = verseText;
    
    document.getElementById('action-verse-ref').innerText = `${book} ${chapter}:${verseNum}`;
    document.getElementById('color-palette-container').style.display = 'none';
    document.getElementById('verse-action-menu').style.display = 'flex';
};

window.closeVerseActionMenu = () => {
    document.getElementById('verse-action-menu').style.display = 'none';
};

// Fechar menu se clicar fora dele (fundo escuro)
document.getElementById('verse-action-menu').addEventListener('click', (e) => {
    if (e.target.id === 'verse-action-menu') closeVerseActionMenu();
});

// Ação: Copiar
document.getElementById('btn-action-copy').addEventListener('click', () => {
    if(!currentSelectedVerse) return;
    const { book, chapter, verseNum, text } = currentSelectedVerse;
    const fullText = `"${text}"\n(${book} ${chapter}:${verseNum})`;
    navigator.clipboard.writeText(fullText).then(() => {
        alert("Versículo copiado!");
        closeVerseActionMenu();
    });
});

// Ação: Compartilhar
document.getElementById('btn-action-share').addEventListener('click', async () => {
    if(!currentSelectedVerse) return;
    const { book, chapter, verseNum, text } = currentSelectedVerse;
    const fullText = `"${text}"\n(${book} ${chapter}:${verseNum})`;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: `${book} ${chapter}:${verseNum}`,
                text: fullText,
            });
        } catch (e) { console.error("Erro ao compartilhar", e); }
    } else {
        navigator.clipboard.writeText(fullText);
        alert("Versículo copiado para compartilhamento!");
    }
    closeVerseActionMenu();
});

// Ação: Anotação
document.getElementById('btn-action-note').addEventListener('click', () => {
    if(!currentSelectedVerse) return;
    const { book, chapter, verseNum, text } = currentSelectedVerse;
    document.getElementById('notes-area-wrapper').style.display = 'block';
    
    const notesBox = document.getElementById('study-notes');
    if(notesBox.value !== "") notesBox.value += `\n\n`;
    notesBox.value += `[${book} ${chapter}:${verseNum}] "${text}"\n- `;
    
    notesBox.focus();
    // Rola a tela até o final para o usuário ver a caixa de texto
    document.getElementById('study-screen').scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    
    closeVerseActionMenu();
});

// Ação: Estudo IA
document.getElementById('btn-action-study').addEventListener('click', () => {
    if(!currentSelectedVerse) return;
    const { book, chapter, verseNum, element } = currentSelectedVerse;
    analyzeVerse(book, chapter, verseNum, element);
    closeVerseActionMenu();
});

// Ação: Mostrar Paleta de Cores (Marcar)
document.getElementById('btn-action-highlight').addEventListener('click', () => {
    document.getElementById('color-palette-container').style.display = 'block';
});

// Salvar/Remover Marcação de Texto
window.applyHighlight = async (color) => {
    if(!currentSelectedVerse || !currentUser) return;
    const { book, chapter, verseNum, element } = currentSelectedVerse;
    
    // Atualiza imediatamente na tela
    element.style.backgroundColor = color; 
    
    // Salva ou remove no Firebase
    const highlightRef = ref(db, `Biblia_Estudo/Users/${currentUser.uid}/Highlights/${book}/${chapter}/${verseNum}`);
    if (color === '') {
        await remove(highlightRef);
    } else {
        await set(highlightRef, color);
    }
    
    closeVerseActionMenu();
};

// ==========================================
// PAGINAÇÃO E SALVAMENTO DE ANOTAÇÕES
// ==========================================
document.getElementById('btn-next-chapter').addEventListener('click', () => {
    const bookSelect = document.getElementById('bible-book');
    const chapterSelect = document.getElementById('bible-chapter');

    if (chapterSelect.selectedIndex < chapterSelect.options.length - 1) {
        chapterSelect.selectedIndex++;
        document.getElementById('btn-load-text').click();
    } else if (bookSelect.selectedIndex < bookSelect.options.length - 1) {
        bookSelect.selectedIndex++;
        setTimeout(() => {
            chapterSelect.selectedIndex = 0;
            document.getElementById('btn-load-text').click();
        }, 100);
    }
});

document.getElementById('btn-prev-chapter').addEventListener('click', () => {
    const bookSelect = document.getElementById('bible-book');
    const chapterSelect = document.getElementById('bible-chapter');

    if (chapterSelect.selectedIndex > 0) {
        chapterSelect.selectedIndex--;
        document.getElementById('btn-load-text').click();
    } else if (bookSelect.selectedIndex > 0) {
        bookSelect.selectedIndex--;
        setTimeout(() => {
            chapterSelect.selectedIndex = chapterSelect.options.length - 1;
            document.getElementById('btn-load-text').click();
        }, 100);
    }
});

document.getElementById('btn-save-notes').addEventListener('click', async () => {
    const notesText = document.getElementById('study-notes').value;
    const book = document.getElementById('bible-book').value;
    const chapter = document.getElementById('bible-chapter').value;
    const statusText = document.getElementById('save-note-status');

    if (!notesText.trim()) {
        statusText.innerText = "❌ Escreva algo antes de salvar.";
        statusText.style.color = "#e53e3e";
        return;
    }

    try {
        const notesRef = ref(db, `Biblia_Estudo/Users/${currentUser.uid}/Notes`);
        const newNoteRef = push(notesRef); 
        await set(newNoteRef, {
            livro: book,
            capitulo: chapter,
            texto: notesText,
            data: new Date().toLocaleDateString('pt-BR')
        });

        statusText.innerText = "✅ Estudo salvo com sucesso!";
        statusText.style.color = "#48bb78";
        document.getElementById('study-notes').value = ""; 
        setTimeout(() => statusText.innerText = "", 3000);
    } catch (error) {
        console.error(error);
        statusText.innerText = "❌ Erro ao salvar.";
    }
});

async function loadMyNotes() {
    const container = document.getElementById('my-notes-container');
    container.innerHTML = '<p class="placeholder-text">Buscando seus estudos...</p>';

    if (!currentUser) return;

    try {
        const snapshot = await get(child(ref(db), `Biblia_Estudo/Users/${currentUser.uid}/Notes`));
        if (snapshot.exists()) {
            const notes = snapshot.val();
            let html = '';
            
            const notesArray = Object.values(notes).reverse(); 

            notesArray.forEach(note => {
                html += `
                <div class="card" style="text-align: left; margin-bottom: 15px;">
                    <h3 style="color: #b07d3b;">✍︎ ${note.livro} ${note.capitulo} <span style="float: right; font-size: 0.8em; color: #777;">${note.data}</span></h3>
                    <p style="white-space: pre-wrap; font-size: 1.05em; color: #333; margin-top: 10px;">${note.texto}</p>
                </div>`;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p class="placeholder-text">Você ainda não salvou nenhum estudo.</p>';
        }
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p class="placeholder-text error-msg">Erro ao carregar estudos.</p>';
    }
}

// ==========================================
// MÓDULO: SUPER PROFESSOR EXAUSTIVO (GROQ API + CACHE INTELIGENTE)
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
            <p style="color: #b07d3b; font-weight: bold; font-size: 1.2em;">Construindo Rota de Estudo Exaustiva...</p>
            <p class="dict-sub">Analisando contexto, raízes linguísticas e buscando dezenas de referências cruzadas. Aguarde ⏳</p>
        </div>`;
    modal.style.display = 'block';

    const cacheKey = sanitizeKey(`${book.replace(/\s+/g, '_')}_${chapter}_${verseNum}`);

    try {
        const cacheSnapshot = await get(child(ref(db), `Biblia_Estudo/AI_Cache_Exaustivo/${cacheKey}`));
        
        if (cacheSnapshot.exists()) {
            let cachedHTML = cacheSnapshot.val().html;
            content.innerHTML = `<span style="font-size: 0.8em; color: #48bb78; border: 1px solid #48bb78; padding: 2px 6px; border-radius: 12px; margin-bottom: 15px; display: inline-block;">⚡ Carregamento Rápido (Cache)</span><br>` + cachedHTML;
            currentAIText = `[ESTUDO EXAUSTIVO] ${book} ${chapter}:${verseNum}\n\n` + cachedHTML.replace(/<[^>]*>?/gm, ''); 
            copyBtn.style.display = 'block';
            return; 
        }

        if (GROQ_API_KEY === "SUA_CHAVE_GROQ_AQUI" || GROQ_API_KEY === "") {
            content.innerHTML = '<p class="error-msg">⚠️ Estudo ainda não importado no banco e API da IA desativada.</p>'; return;
        }

        const systemPrompt = `Você é o maior Doutor em Teologia e Exegese Bíblica do mundo, mestre em hebraico, aramaico e grego. Sua missão é fornecer o estudo mais completo, exaustivo e profundo possível para cada versículo. Responda ESTRITAMENTE em código HTML puro. SEM marcações markdown.`;
        const userPrompt = `Faça uma exegese teológica EXAUSTIVA de: ${book} ${chapter}:${verseNum} - "${verseText}".`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({ 
                model: "llama-3.3-70b-versatile", 
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], 
                temperature: 0.7,
                max_tokens: 6000 
            })
        });

        const data = await response.json();
        if(data.error) { content.innerHTML = `<p class="error-msg">Erro na API: ${data.error.message}</p>`; return; }

        let aiHTML = data.choices[0].message.content.replace(/```html/g, '').replace(/```/g, ''); 
        content.innerHTML = aiHTML;
        currentAIText = `[ESTUDO EXAUSTIVO] ${book} ${chapter}:${verseNum}\n\n` + aiHTML.replace(/<[^>]*>?/gm, ''); 
        copyBtn.style.display = 'block';

        await set(ref(db, `Biblia_Estudo/AI_Cache_Exaustivo/${cacheKey}`), { html: aiHTML });
        
        // NOVO: Atualiza a interface instantaneamente colocando o ícone após gerar o estudo
        element.innerHTML += ` <span class="study-icon" title="Estudo Profundo Disponível" onclick="event.stopPropagation(); analyzeVerse('${book}', '${chapter}', '${verseNum}', this.parentElement)">✍︎</span>`;
        
    } catch (error) {
        content.innerHTML = '<p class="error-msg">Erro ao conectar ao servidor.</p>';
    }
};

document.getElementById('btn-copy-ai-notes').addEventListener('click', () => {
    const studyNotes = document.getElementById('study-notes');
    if(studyNotes.value !== "") studyNotes.value += "\n\n----------------------\n\n";
    studyNotes.value += currentAIText;
    
    const copyBtn = document.getElementById('btn-copy-ai-notes');
    copyBtn.innerText = "✅ Salvo nas suas anotações!";
    copyBtn.style.background = "#48bb78";
    setTimeout(() => {
        copyBtn.innerText = "📥 Copiar para minhas anotações";
        copyBtn.style.background = "#b07d3b";
        closeAIModal();
    }, 2000);
});

window.closeAIModal = () => { document.getElementById('ai-professor-modal').style.display = 'none'; };

// ==========================================
// MÓDULO: AGENDA IA (AGORA VIA BANCO DE DADOS OFFLINE)
// ==========================================
document.getElementById('btn-generate-plan').addEventListener('click', async () => {
    const days = document.getElementById('study-days-input').value;
    const planDiv = document.getElementById('ai-plan-content');
    
    if(!days || days < 1 || days > 7) {
        alert("Por favor, insira um número válido de dias (1 a 7).");
        return;
    }

    planDiv.style.display = 'block';
    planDiv.innerHTML = '<p class="placeholder-text" style="color:#b07d3b;">Buscando cronograma no banco de dados... ⏳</p>';

    try {
        const planKey = `Plano_${days}`;
        const snapshot = await get(child(ref(db), `Biblia_Estudo/Planos_Estudo/${planKey}`));
        
        if (snapshot.exists()) {
            planDiv.innerHTML = snapshot.val().html;
        } else {
            planDiv.innerHTML = `<p class="error-msg">⚠️ O administrador ainda não importou o plano de estudo para ${days} dias.</p>`;
        }
    } catch (error) {
        planDiv.innerHTML = '<p class="error-msg">Erro ao buscar o plano. Verifique sua conexão.</p>';
    }
});

// ==========================================
// MÓDULO: QUIZ (JOGO E ADMINISTRAÇÃO)
// ==========================================
document.getElementById('btn-start-quiz').addEventListener('click', async () => {
    maxTimePerQuestion = parseInt(document.getElementById('quiz-time-range').value);
    
    const btn = document.getElementById('btn-start-quiz');
    btn.innerText = "Buscando perguntas no banco...";
    btn.disabled = true;

    try {
        const snapshot = await get(child(ref(db), `Biblia_Estudo/QuizBank`));
        if (snapshot.exists()) {
            const allQuestions = Object.values(snapshot.val());
            quizQuestions = allQuestions.sort(() => 0.5 - Math.random());
            
            currentQuizIndex = 0;
            quizHits = 0;
            quizMisses = 0;
            
            document.getElementById('quiz-setup').style.display = 'none';
            document.getElementById('quiz-active').style.display = 'block';
            
            loadQuizQuestion();
        } else {
            alert("Nenhuma pergunta encontrada no banco de dados. Fale com o Administrador.");
        }
    } catch (error) {
        console.error(error);
        alert("Erro ao buscar o quiz.");
    } finally {
        btn.innerText = "Iniciar Partida Aleatória";
        btn.disabled = false;
    }
});

function loadQuizQuestion() {
    if (currentQuizIndex >= quizQuestions.length) {
        endQuiz();
        return;
    }

    const q = quizQuestions[currentQuizIndex];
    document.getElementById('question-text').innerText = `${currentQuizIndex + 1}. ${q.pergunta}`;
    document.getElementById('quiz-hits').innerText = quizHits;
    document.getElementById('quiz-misses').innerText = quizMisses;
    
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    
    for (const [letra, texto] of Object.entries(q.opcoes)) {
        const btn = document.createElement('button');
        btn.className = 'quiz-opt-btn';
        btn.innerText = `${letra}) ${texto}`;
        btn.style.background = "#f0f0f0";
        btn.style.color = "#333";
        btn.style.textAlign = "left";
        btn.onclick = () => handleQuizAnswer(letra, q.resposta_correta, btn);
        container.appendChild(btn);
    }

    quizTimeLeft = maxTimePerQuestion;
    document.getElementById('quiz-timer-text').innerText = `${quizTimeLeft}s`;
    
    clearInterval(quizTimerInterval);
    quizTimerInterval = setInterval(() => {
        quizTimeLeft--;
        document.getElementById('quiz-timer-text').innerText = `${quizTimeLeft}s`;
        
        if (quizTimeLeft <= 0) {
            clearInterval(quizTimerInterval);
            handleQuizAnswer(null, q.resposta_correta, null); 
        }
    }, 1000);
}

function handleQuizAnswer(selectedLetter, correctLetter, btnElement) {
    clearInterval(quizTimerInterval);
    
    const buttons = document.querySelectorAll('.quiz-opt-btn');
    buttons.forEach(b => {
        b.disabled = true;
        b.style.opacity = "0.7";
    }); 

    if (selectedLetter === correctLetter) {
        if(btnElement) {
            btnElement.style.background = "#48bb78"; 
            btnElement.style.color = "white";
        }
        quizHits++;
    } else {
        if(btnElement) {
            btnElement.style.background = "#e53e3e"; 
            btnElement.style.color = "white";
        }
        quizMisses++;
        buttons.forEach(b => {
            if(b.innerText.startsWith(correctLetter)) {
                b.style.background = "#48bb78";
                b.style.color = "white";
            }
        });
    }

    document.getElementById('quiz-hits').innerText = quizHits;
    document.getElementById('quiz-misses').innerText = quizMisses;

    setTimeout(() => {
        currentQuizIndex++;
        loadQuizQuestion();
    }, 2000);
}

document.getElementById('btn-stop-quiz').addEventListener('click', () => {
    endQuiz();
});

async function endQuiz() {
    clearInterval(quizTimerInterval);
    
    const totalPontosPartida = quizHits * 10; 
    if (currentUser && quizHits > 0) {
        const userRef = ref(db, `Biblia_Estudo/Users/${currentUser.uid}`);
        const snapshot = await get(userRef);
        let pontosAtuais = snapshot.exists() ? snapshot.val().quizScore || 0 : 0;
        update(userRef, { quizScore: pontosAtuais + totalPontosPartida });
    }

    alert(`Partida Encerrada!\nVocê acertou: ${quizHits}\nVocê errou: ${quizMisses}\nPontos ganhos: ${totalPontosPartida}`);
    leaveQuiz();
}

window.leaveQuiz = () => {
    clearInterval(quizTimerInterval);
    document.getElementById('quiz-setup').style.display = 'block';
    document.getElementById('quiz-active').style.display = 'none';
    openScreen('dashboard-screen');
    loadDashboard();
};

// ==========================================
// LÓGICA DO ADMINISTRADOR (TXT E JSON)
// ==========================================
document.getElementById('btn-import-quiz').addEventListener('click', async () => {
    const fileInput = document.getElementById('quiz-txt-input');
    const statusText = document.getElementById('quiz-import-status');
    
    if (fileInput.files.length === 0) {
        statusText.innerText = "❌ Selecione um arquivo .txt";
        statusText.style.color = "#e53e3e"; return;
    }

    statusText.style.color = "#777";
    statusText.innerText = "Lendo arquivo de quiz... Aguarde.";

    for (let file of fileInput.files) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const blocos = text.split(/Pergunta \d+:/).filter(b => b.trim() !== "");
                let qtdImportada = 0;

                for (let bloco of blocos) {
                    const linhas = bloco.split('\n').map(l => l.trim()).filter(l => l !== "");
                    if (linhas.length < 3) continue;

                    const perguntaText = linhas[0];
                    let opcoes = {};
                    let resposta = "";

                    for (let i = 1; i < linhas.length; i++) {
                        const linha = linhas[i];
                        if (linha.match(/^[a-e]\)/)) {
                            const letra = linha.substring(0, 1);
                            const textoOpcao = linha.substring(2).trim();
                            opcoes[letra] = textoOpcao;
                        } else if (linha.startsWith("Resposta:")) {
                            const match = linha.match(/Resposta:\s*([a-e])\)/i);
                            if (match) resposta = match[1].toLowerCase();
                        }
                    }

                    if (perguntaText && Object.keys(opcoes).length > 0 && resposta) {
                        const newQRef = push(ref(db, `Biblia_Estudo/QuizBank`));
                        await set(newQRef, {
                            pergunta: perguntaText,
                            opcoes: opcoes,
                            resposta_correta: resposta
                        });
                        qtdImportada++;
                    }
                }
                statusText.style.color = "#48bb78";
                statusText.innerText = `✅ Arquivo ${file.name} processado! ${qtdImportada} perguntas injetadas no banco de forma aleatória.`;
            } catch (error) {
                console.error(error);
                statusText.style.color = "#e53e3e";
                statusText.innerText = "❌ Erro ao ler o arquivo TXT.";
            }
        };
        reader.readAsText(file);
    }
});

document.getElementById('btn-import-json').addEventListener('click', async () => {
    const fileInput = document.getElementById('json-file-input');
    const versionSelect = document.getElementById('admin-import-version').value;
    const statusText = document.getElementById('import-status');
    
    if (fileInput.files.length === 0) return;
    statusText.innerText = "Processando matriz... Aguarde.";

    for (let file of fileInput.files) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                let updates = {};
                jsonData.forEach(livro => {
                    livro.chapters.forEach((capitulo, capIndex) => {
                        capitulo.forEach((textoVersiculo, verIndex) => {
                            updates[`Biblia_Estudo/Textos/${livro.name}/${capIndex + 1}/${verIndex + 1}/${versionSelect}`] = textoVersiculo;
                        });
                    });
                });
                await update(ref(db), updates);
                statusText.innerText = `✅ Importado com sucesso na versão [${versionSelect.toUpperCase()}]!`;
            } catch (error) {
                statusText.innerText = `❌ Erro no processamento.`;
            }
        };
        reader.readAsText(file);
    }
});

document.getElementById('btn-import-ai-cache').addEventListener('click', async () => {
    const fileInput = document.getElementById('ai-cache-json-input');
    const statusText = document.getElementById('import-ai-cache-status');
    
    if (fileInput.files.length === 0) {
        statusText.innerText = "❌ Selecione um arquivo .json com os estudos.";
        statusText.style.color = "#e53e3e"; 
        return;
    }

    statusText.style.color = "#777";
    statusText.innerText = "Lendo e injetando no Cache da IA... Aguarde.";

    for (let file of fileInput.files) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                let updates = {};
                
                for (const [key, value] of Object.entries(jsonData)) {
                    updates[`Biblia_Estudo/AI_Cache_Exaustivo/${key}`] = value;
                }

                await update(ref(db), updates);
                
                statusText.style.color = "#48bb78";
                statusText.innerText = `✅ Cache importado com sucesso!`;
            } catch (error) {
                console.error("Erro na importação do Cache:", error);
                statusText.style.color = "#e53e3e";
                statusText.innerText = `❌ Erro no processamento. Verifique se o formato do JSON está correto.`;
            }
        };
        reader.readAsText(file);
    }
});

document.getElementById('btn-import-plans').addEventListener('click', async () => {
    const fileInput = document.getElementById('plans-json-input');
    const statusText = document.getElementById('import-plans-status');
    
    if (fileInput.files.length === 0) {
        statusText.innerText = "❌ Selecione um arquivo .json com os planos.";
        statusText.style.color = "#e53e3e"; 
        return;
    }

    statusText.style.color = "#777";
    statusText.innerText = "Importando Planos de Estudo... Aguarde.";

    for (let file of fileInput.files) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                let updates = {};
                
                for (const [key, value] of Object.entries(jsonData)) {
                    updates[`Biblia_Estudo/Planos_Estudo/${key}`] = value;
                }

                await update(ref(db), updates);
                
                statusText.style.color = "#48bb78";
                statusText.innerText = `✅ Planos de estudo importados com sucesso no banco!`;
            } catch (error) {
                console.error("Erro:", error);
                statusText.style.color = "#e53e3e";
                statusText.innerText = `❌ Erro no processamento. Verifique o JSON.`;
            }
        };
        reader.readAsText(file);
    }
});

// ==========================================
// LÓGICA DO DICIONÁRIO E MODAIS GERAIS
// ==========================================
window.openDictionary = async (strongId) => {
    try {
        const snapshot = await get(child(ref(db), `Biblia_Estudo/Dicionario_Strongs/${strongId}`));
        const modal = document.getElementById('dict-modal');
        if (snapshot.exists()) {
            const data = snapshot.val();
            document.getElementById('dict-title').innerText = `${data.palavra} (${data.idioma})`;
            document.getElementById('dict-pronunciation').innerText = `Pronúncia: ${data.pronuncia}`;
            document.getElementById('dict-def').innerText = data.definicao;
        }
        modal.style.display = 'block';
    } catch (error) { console.error(error); }
};

window.closeDictionary = () => { document.getElementById('dict-modal').style.display = 'none'; };

window.onclick = (event) => { 
    if (event.target === document.getElementById('dict-modal')) closeDictionary(); 
    if (event.target === document.getElementById('ai-professor-modal')) closeAIModal(); 
};

initBibleNavigation();