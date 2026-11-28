#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.resolve(process.cwd(), 'data', 'questoes.json');
const REVISAR_FILE = path.resolve(process.cwd(), 'data', 'assuntos-a-revisar.json');

function ehGenerico(assunto) {
  if (assunto == null) return true;
  const t = assunto.trim();
  if (t === '') return true;
  const genericos = [
    'a definir',
    'não categorizado',
    'nao categorizado',
    'desconhecido',
    'outro',
  ];
  const lt = t.toLowerCase();
  return genericos.some(g => lt === g.toLowerCase() || lt.includes(g.toLowerCase()));
}

const TAXONOMIA = {
  'Língua Portuguesa': [
    { assunto: 'Figuras de linguagem', chaves: ['figura de linguagem', 'figuras de linguagem', 'figuras de linguagens', 'metáfora', 'metonímia', 'ironia', 'hipérbole', 'eufemismo', 'comparação', 'personificação', 'antítese', 'paradoxo', 'pleonasmo', 'catacrese', 'sinestesia', 'aliteração', 'onomatopeia', 'sinédoce', 'efeito sonoro'] },
    { assunto: 'Concordância verbal', chaves: ['concordância verbal', 'verbo', 'sujeito', 'concordância', 'singular', 'plural', 'pessoa', 'número', 'tempo verbal', 'modo verbal'] },
    { assunto: 'Concordância nominal', chaves: ['concordância nominal', 'adjetivo', 'substantivo', 'gênero', 'masculino', 'feminino', 'concordância entre substantivo e adjetivo'] },
    { assunto: 'Regência verbal', chaves: ['regência verbal', 'governo verbal', 'preposição', 'complemento verbal'] },
    { assunto: 'Regência nominal', chaves: ['regência nominal', 'regência do substantivo', 'regência do adjetivo'] },
    { assunto: 'Crase', chaves: ['crase', 'à ', 'àquele', 'àquela', 'àqueles', 'àquelas', 'antes de pronome demonstrativo'] },
    { assunto: 'Pontuação', chaves: ['pontuação', 'vírgula', 'ponto e vírgula', 'dois-pontos', 'travessão', 'parênteses', 'aspas', 'ponto final'] },
    { assunto: 'Ortografia', chaves: ['ortografia', 'grafia', 'acentuação', 'acentuação gráfica', 'hífen', 'maiúscula', 'minúscula'] },
    { assunto: 'Interpretação de texto', chaves: ['texto', 'autor', 'ideia principal', 'inferência', 'argumentação', 'leitura', 'texto expositivo', 'texto dissertativo', 'texto narrativo'] },
    { assunto: 'Coesão e coerência', chaves: ['coesão', 'coerência', 'conectivo', 'referência', 'substituição', 'adição'] },
    { assunto: 'Semântica', chaves: ['semântica', 'sinônimo', 'antônimo', 'polissemia', 'ambiguidade', 'significado', 'sentido', 'denotação', 'conotação'] },
    { assunto: 'Morfologia', chaves: ['morfologia', 'classe gramatical', 'substantivo', 'adjetivo', 'verbo', 'pronome', 'numeral', 'advérbio', 'preposição', 'conjunção', 'interjeição'] },
    { assunto: 'Sintaxe', chaves: ['sintaxe', 'oração', 'período', 'sujeito', 'predicado', 'objeto direto', 'objeto indireto', 'adjunto adnominal', 'adjunto adverbial'] },
    { assunto: 'Língua Portuguesa', chaves: [] },
  ],
  'Raciocínio Lógico': [
    { assunto: 'Raciocínio Lógico', chaves: ['raciocínio lógico', 'lógica', 'dedução', 'indução', 'proporcionalidade', 'razão', 'dados', 'gráfico'] },
  ],
  'Matemática': [
    { assunto: 'Aritmética', chaves: ['aritmética', 'número', 'operac', 'adição', 'subtração', 'multiplicação', 'divisão', 'porcentagem', 'porcento', 'regra de três', 'proporção'] },
    { assunto: 'Álgebra', chaves: ['álgebra', 'equação', 'função', 'variável', 'incógnita', 'expressão algébrica', 'binômio', 'fatoração'] },
    { assunto: 'Geometria', chaves: ['geometria', 'triângulo', 'quadrado', 'círculo', 'retângulo', 'área', 'perímetro', 'volume', 'ângulo', 'polígono'] },
    { assunto: 'Estatística e probabilidade', chaves: ['estatística', 'probabilidade', 'média', 'mediana', 'moda', 'desvio padrão', 'variância', 'gráfico', 'tabela'] },
    { assunto: 'Matemática', chaves: [] },
  ],
  'Conhecimentos Gerais': [
    { assunto: 'Conhecimentos Gerais', chaves: [] },
  ],
  'Conhecimentos Específicos': [
    { assunto: 'Conhecimentos Específicos', chaves: [] },
  ],
  'Atualidades': [
    { assunto: 'Atualidades', chaves: [] },
  ],
  'Geografia': [
    { assunto: 'Geografia do Brasil', chaves: ['brasil', 'região', 'estado', 'município', 'bioma', 'amazônia', 'caatinga', 'cerrado', 'mata atlântica', 'pampa', 'pantanal'] },
    { assunto: 'Geografia Geral', chaves: ['clima', 'relevo', 'hidrografia', 'vegetação', 'solo', 'continente', 'oceano', 'mapa', 'cartografia'] },
    { assunto: 'Geografia', chaves: [] },
  ],
  'Ciências': [
    { assunto: 'Biologia', chaves: ['biologia', 'célula', 'genética', 'evolução', 'ecologia', 'ser vivo', 'seres vivos', 'reino', 'filo', 'classe'] },
    { assunto: 'Física', chaves: ['física', 'energia', 'força', 'movimento', 'eletricidade', 'magnetismo', 'ondas', 'luz', 'som', 'mecânica'] },
    { assunto: 'Química', chaves: ['química', 'átomo', 'molécula', 'elemento', 'composto', 'reação química', 'ligação', 'ácido', 'base', 'tabela periódica'] },
    { assunto: 'Ciências', chaves: [] },
  ],
  'Informática': [
    { assunto: 'Informática', chaves: ['informática', 'computador', 'software', 'hardware', 'internet', 'rede', 'sistema operacional', 'algoritmo', 'programação'] },
  ],
  'Direito': [
    { assunto: 'Direito', chaves: ['direito', 'lei', 'constituição', 'código', 'artigo', 'jurídico', 'direito constitucional', 'direito administrativo', 'direito penal', 'direito civil'] },
  ],
  'Administração': [
    { assunto: 'Administração', chaves: ['administração', 'gestão', 'planejamento', 'organização', 'liderança', 'recursos humanos', 'administrativo'] },
  ],
  'Contabilidade': [
    { assunto: 'Contabilidade', chaves: ['contabilidade', 'patrimônio', 'balanço', 'demonstração contábil', 'ativo', 'passivo', 'patrimônio líquido'] },
  ],
  'Filosofia': [
    { assunto: 'Filosofia', chaves: ['filosofia', 'filósofo', 'ética', 'moral', 'lógica', 'metafísica', 'epistemologia', 'existencialismo'] },
  ],
  'Sociologia': [
    { assunto: 'Sociologia', chaves: ['sociologia', 'sociedade', 'cultura', 'grupo social', 'estratificação', 'mobilidade social', 'instituição'] },
  ],
  'Educação Física': [
    { assunto: 'Educação Física', chaves: ['educação física', 'esporte', 'atividade física', 'saúde', 'treinamento', 'gimnástica', 'jogo', 'brincadeira'] },
  ],
  'Saúde': [
    { assunto: 'Saúde', chaves: ['saúde', 'enfermagem', 'medicina', 'doença', 'tratamento', 'prevenção', 'vigilância sanitária', 'primeiros socorros'] },
  ],
};

function classificarAssunto(disciplina, enunciado) {
  const assuntosDisciplina = TAXONOMIA[disciplina];
  if (!assuntosDisciplina) {
    return disciplina || 'Outra Disciplina';
  }

  const texto = (enunciado || '').toLowerCase();

  // Primeiro, palavras-chave específicas
  for (const { assunto, chaves } of assuntosDisciplina) {
    if (chaves.length > 0) {
      if (chaves.some(c => texto.includes(c.toLowerCase()))) {
        return assunto;
      }
    }
  }

  // Fallback da disciplina
  const fallback = assuntosDisciplina.find(a => a.chaves.length === 0);
  return fallback ? fallback.assunto : disciplina;
}

try {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const questoes = JSON.parse(raw);

  let corrigidas = 0;
  let mantidas = 0;
  const revisar = [];

  const atualizadas = questoes.map((questao) => {
    const assuntoAtual = questao.assunto;

    if (!ehGenerico(assuntoAtual)) {
      mantidas += 1;
      return questao;
    }

    const novoAssunto = classificarAssunto(questao.disciplina, questao.enunciado);
    if (novoAssunto) {
      corrigidas += 1;
      return {
        ...questao,
        assunto: novoAssunto,
      };
    }

    revisar.push({
      id: questao.id,
      disciplina: questao.disciplina,
      assuntoAntigo: assuntoAtual,
      assuntoNovo: 'A revisar',
      enunciado: (questao.enunciado || '').slice(0, 120),
    });
    corrigidas += 1;
    return questao;
  });

  fs.writeFileSync(DATA_FILE, JSON.stringify(atualizadas, null, 2), 'utf8');

  if (revisar.length > 0) {
    fs.writeFileSync(REVISAR_FILE, JSON.stringify(revisar, null, 2), 'utf8');
  }

  console.log(`✅ Enriquecimento concluído!`);
  console.log(`   Questões mantidas (assunto válido): ${mantidas}`);
  console.log(`   Questões corrigidas: ${corrigidas}`);
  console.log(`   Questões para revisão manual: ${revisar.length}`);
} catch (err) {
  console.error('❌ Erro ao enriquecer assunto:', err.message);
  process.exit(1);
}