const fs = require('fs');

const file = 'src/locales/i18n.ts';
let code = fs.readFileSync(file, 'utf8');

const tDocs = {
  English: {
    take_quiz: "Take Quiz", history: "History", start_ai_quiz: "Start AI Quiz", start_exam: "Start Exam", topic: "Topic", questions: "Questions", time_limit: "Time Limit", review_answers: "Review your answers", add_subject: "Add Subject", add_topic: "Add Topic", generate_schedule: "Generate Schedule", study_schedule: "Study Schedule", add_block: "Add Block", day: "Day", week: "Week", month: "Month", my_pets: "My Pets", quests: "Quests", store: "Store", claim: "Claim", focus_time: "Focus Time"
  },
  Malay: {
    take_quiz: "Ambil Kuiz", history: "Sejarah", start_ai_quiz: "Mula Kuiz AI", start_exam: "Mula Peperiksaan", topic: "Topik", questions: "Soalan", time_limit: "Had Masa", review_answers: "Semak jawapan anda", add_subject: "Tambah Subjek", add_topic: "Tambah Topik", generate_schedule: "Jana Jadual", study_schedule: "Jadual Belajar", add_block: "Tambah Blok", day: "Hari", week: "Minggu", month: "Bulan", my_pets: "Haiwan Peliharaan", quests: "Pencarian", store: "Kedai", claim: "Tuntut", focus_time: "Masa Tumpuan"
  },
  Chinese: {
    take_quiz: "参加测验", history: "历史", start_ai_quiz: "开始AI测验", start_exam: "开始考试", topic: "主题", questions: "问题", time_limit: "时间限制", review_answers: "检查你的答案", add_subject: "添加科目", add_topic: "添加主题", generate_schedule: "生成时间表", study_schedule: "学习时间表", add_block: "添加区块", day: "日", week: "周", month: "月", my_pets: "我的宠物", quests: "任务", store: "商店", claim: "领取", focus_time: "专注时间"
  },
  "Simplified Chinese": {
    take_quiz: "参加测验", history: "历史", start_ai_quiz: "开始AI测验", start_exam: "开始考试", topic: "主题", questions: "问题", time_limit: "时间限制", review_answers: "检查你的答案", add_subject: "添加科目", add_topic: "添加主题", generate_schedule: "生成时间表", study_schedule: "学习时间表", add_block: "添加区块", day: "日", week: "周", month: "月", my_pets: "我的宠物", quests: "任务", store: "商店", claim: "领取", focus_time: "专注时间"
  },
  "Traditional Chinese": {
    take_quiz: "參加測驗", history: "歷史", start_ai_quiz: "開始AI測驗", start_exam: "開始考試", topic: "主題", questions: "問題", time_limit: "時間限制", review_answers: "檢查你的答案", add_subject: "添加科目", add_topic: "添加主題", generate_schedule: "生成時間表", study_schedule: "學習時間表", add_block: "添加區塊", day: "日", week: "週", month: "月", my_pets: "我的寵物", quests: "任務", store: "商店", claim: "領取", focus_time: "專注時間"
  },
  Spanish: {
    take_quiz: "Tomar Prueba", history: "Historia", start_ai_quiz: "Iniciar Quiz AI", start_exam: "Iniciar Examen", topic: "Tema", questions: "Preguntas", time_limit: "Límite de Tiempo", review_answers: "Revisar respuestas", add_subject: "Añadir Sujeto", add_topic: "Añadir Tema", generate_schedule: "Generar Horario", study_schedule: "Horario de Estudio", add_block: "Añadir Bloque", day: "Día", week: "Semana", month: "Mes", my_pets: "Mis Mascotas", quests: "Misiones", store: "Tienda", claim: "Reclamar", focus_time: "Enfoque"
  },
  French: {
    take_quiz: "Passer Quiz", history: "Historique", start_ai_quiz: "Démarrer AI Quiz", start_exam: "Démarrer Examen", topic: "Sujet", questions: "Questions", time_limit: "Limite de temps", review_answers: "Vérifier réponses", add_subject: "Ajouter Sujet", add_topic: "Ajouter Sujet", generate_schedule: "Générer Calendrier", study_schedule: "Calendrier d'Étude", add_block: "Ajouter Bloc", day: "Jour", week: "Semaine", month: "Mois", my_pets: "Mes Animaux", quests: "Quêtes", store: "Boutique", claim: "Réclamer", focus_time: "Concentration"
  },
  German: {
    take_quiz: "Quiz Starten", history: "Verlauf", start_ai_quiz: "KI-Quiz Starten", start_exam: "Examen Starten", topic: "Thema", questions: "Fragen", time_limit: "Zeitlimit", review_answers: "Antworten prüfen", add_subject: "Fach Hinzufügen", add_topic: "Thema Hinzufügen", generate_schedule: "Zeitplan Generieren", study_schedule: "Lernplan", add_block: "Block Hinzufügen", day: "Tag", week: "Woche", month: "Monat", my_pets: "Meine Haustiere", quests: "Quests", store: "Shop", claim: "Beanspruchen", focus_time: "Fokuszeit"
  },
  Japanese: {
    take_quiz: "クイズに答える", history: "履歴", start_ai_quiz: "AIクイズ開始", start_exam: "試験開始", topic: "トピック", questions: "質問", time_limit: "制限時間", review_answers: "答えを確認する", add_subject: "科目を追加", add_topic: "トピックを追加", generate_schedule: "スケジュール作成", study_schedule: "学習計画", add_block: "ブロック追加", day: "日", week: "週", month: "月", my_pets: "ペット", quests: "クエスト", store: "ストア", claim: "受け取る", focus_time: "集中時間"
  },
  Korean: {
    take_quiz: "퀴즈 풀기", history: "기록", start_ai_quiz: "AI 퀴즈 시작", start_exam: "시험 시작", topic: "주제", questions: "질문", time_limit: "시간 제한", review_answers: "답안 확인", add_subject: "과목 추가", add_topic: "주제 추가", generate_schedule: "일정 생성", study_schedule: "학습 일정", add_block: "블록 추가", day: "일", week: "주", month: "월", my_pets: "내 펫", quests: "퀘스트", store: "상점", claim: "청구", focus_time: "집중 시간"
  },
  Italian: {
    take_quiz: "Inizia Quiz", history: "Storia", start_ai_quiz: "Inizia Quiz AI", start_exam: "Inizia Esame", topic: "Argomento", questions: "Domande", time_limit: "Limite tempo", review_answers: "Controlla risposte", add_subject: "Aggiungi Materia", add_topic: "Aggiungi Argomento", generate_schedule: "Genera Orario", study_schedule: "Orario Studio", add_block: "Aggiungi Blocco", day: "Giorno", week: "Settimana", month: "Mese", my_pets: "I Miei Animali", quests: "Missioni", store: "Negozio", claim: "Reclama", focus_time: "Tempo Concentrazione"
  },
  Portuguese: {
    take_quiz: "Fazer Quiz", history: "Histórico", start_ai_quiz: "Iniciar Quiz AI", start_exam: "Iniciar Exame", topic: "Tópico", questions: "Perguntas", time_limit: "Limite de Tempo", review_answers: "Revisar respostas", add_subject: "Adicionar Matéria", add_topic: "Adicionar Tópico", generate_schedule: "Gerar Horário", study_schedule: "Horário de Estudo", add_block: "Adicionar Bloco", day: "Dia", week: "Semana", month: "Mês", my_pets: "Meus Pets", quests: "Missões", store: "Loja", claim: "Reivindicar", focus_time: "Tempo de Foco"
  },
  Russian: {
    take_quiz: "Начать викторину", history: "История", start_ai_quiz: "Начать ИИ викторину", start_exam: "Начать экзамен", topic: "Тема", questions: "Вопросы", time_limit: "Лимит времени", review_answers: "Проверить ответы", add_subject: "Добавить предмет", add_topic: "Добавить тему", generate_schedule: "Создать расписание", study_schedule: "Расписание", add_block: "Добавить блок", day: "День", week: "Неделя", month: "Месяц", my_pets: "Мои питомцы", quests: "Квесты", store: "Магазин", claim: "Получить", focus_time: "Время концентрации"
  },
  Arabic: {
    take_quiz: "ابدأ الاختبار", history: "السجل", start_ai_quiz: "اختبار الذكاء الاصطناعي", start_exam: "ابدأ الامتحان", topic: "الموضوع", questions: "الأسئلة", time_limit: "الحد الزمني", review_answers: "راجع إجاباتك", add_subject: "إضافة مادة", add_topic: "إضافة موضوع", generate_schedule: "إنشاء جدول", study_schedule: "جدول الدراسة", add_block: "إضافة كتلة", day: "يوم", week: "أسبوع", month: "شهر", my_pets: "حيواناتي", quests: "المهام", store: "المتجر", claim: "المطالبة", focus_time: "وقت التركيز"
  }
};

for (const lang in tDocs) {
  const match = new RegExp(`${lang}: \\{[\\s\\S]*?\\}(?=,|\\n\\s*"|\\n\\s*\\w+:|\\n\\s*})`, 'g');
  code = code.replace(match, (m) => {
     let inner = m.trim();
     if (inner.endsWith('}')) inner = inner.substring(0, inner.length - 1);
     const toAdd = Object.entries(tDocs[lang]).map(([k,v]) => `    ${k}: "${v}"`).join(',\n');
     return inner + ',\n' + toAdd + '\n  }';
  });
}

fs.writeFileSync(file, code);
