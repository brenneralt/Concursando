#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.resolve(process.cwd(), 'data', 'questoes.json');

try {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const questoes = JSON.parse(raw);

  // Define generic values
  const GENERIC_ASUNTO = [
    '',
    ' ',
    'A definir',
    'Não categorizado',
    'não categorizado',
    'A Definir',
    'não categorizado',
  ];

  // Map of keywords to subject names (case-insensitive)
  const KEYWORD_TO_SUBJECT = {
    'redação': 'Redação',
    'linguagem': 'Linguagem',
    'português': 'Linguagem',
    'portuguesa': 'Linguagem',
    'portugues': 'Linguagem',
    'matemática': 'Matemática',
    'matemática': 'Matemática',
    'história': 'História',
    'geografia': 'Geografia',
    'biologia': 'Biologia',
    'científica': 'Ciências',
    'física': 'Física',
    'química': 'Química',
    'informática': 'Informática',
    'arte': 'Arte',
    'filosofia': 'Filosofia',
    'sociologia': 'Sociologia',
    'psicologia': 'Psicologia',
    'economia': 'Economia',
    'direito': 'Direito',
    'contabilidade': 'Contabilidade',
    'atividades físicas': 'Atividades Físicas',
    'saúde': 'Saúde',
    'educação física': 'Educação Física',
    'turma': 'Turma',
    'linguagens': 'Outra',
    'outra': 'Outra',
    'outra disciplina': 'Outra',
    'outra': 'Outra',
  };

  // Helper: find keyword in text
  const findKeyword = (text) => {
    const lower = text.toLowerCase();
    for (const [keyword, subject] of Object.entries(KEYWORD_TO_SUBJECT)) {
      if (text.toLowerCase().includes(keyword)) {
        return subject;
      }
    }
    return null;
  };

  // Enrich each question
  const updated = questoes.map((questao) => {
    const currentAssunto = questao.assunto?.trim();

    // Check if assunto is generic or empty
    const isGeneric = GENERIC_ASUNTO.some(g => questao.assunto?.toLowerCase().includes(g.toLowerCase())) ||
                      !questao.assunto ||
                      questao.assunto.trim() === '';

    if (!isGeneric) {
      // Already has a meaningful assunto, keep it
      return questao;
    }

    // Determine new assunto
    let novoAssunto = questao.disciplina?.toUpperCase() || 'OUTRA DISCIPLINA';

    // If disciplina is not sufficient, search keywords in enunciado
    if (!questao.assunto || questao.assunto.trim() === '') {
      const match = findKeyword(questao.enunciado || '');
      if (match) {
        novoAssunto = match;
      }
    }

    // Update the question
    return {
      ...questao,
      assunto: novoAssunto.trim(),
    };
  });

  // Write back
  fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`✅ Enriquecimento concluído! ${questoes.length} questões processadas.`);
} catch (err) {
  console.error('❌ Erro ao enriquecer assunto:', err.message);
  process.exit(1);
}