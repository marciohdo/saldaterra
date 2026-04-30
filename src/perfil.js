// Determina o perfil do visitante — replica a lógica do n8n (node "Encontrar perfil")
function determinarPerfil(estadoCivil, temCriancas, idade) {
  const civil    = (estadoCivil  || '').toLowerCase().trim();
  const criancas = (temCriancas  || '').toLowerCase().trim();
  const age      = parseInt(idade) || 0;

  if (age >= 5  && age < 12)  return 'Kids';
  if (age >= 12 && age <= 15) return 'Teens';
  if (age > 15  && age <= 18) return 'Adolescente';
  if (age >= 60)              return 'Melhor Idade';
  if (criancas === 'sim')     return 'Familia';
  if (civil === 'casado' || civil === 'casada') return 'Familia';
  if (age >= 18 && age <= 59 && (civil === 'solteiro' || civil === 'solteira')) return 'Familia';

  return 'Familia'; // fallback padrão
}

module.exports = { determinarPerfil };
