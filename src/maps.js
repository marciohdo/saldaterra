require('./load-env');

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Geocodifica um endereço e retorna { lat, lon }
async function geocode(endereco, bairro, cidade) {
  if (!endereco || !cidade) return { lat: null, lon: null };

  const texto = encodeURIComponent(`${endereco}, ${bairro || ''}, ${cidade}, Brasil`);
  const url   = `https://maps.googleapis.com/maps/api/geocode/json?address=${texto}&key=${API_KEY}`;

  const res  = await fetch(url);
  const data = await res.json();

  if (data.status === 'OK' && data.results?.length) {
    const loc = data.results[0].geometry.location;
    return { lat: loc.lat, lon: loc.lng };
  }
  return { lat: null, lon: null };
}

// Calcula distância real em km via Google Directions entre dois pontos
async function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some(v => v == null || isNaN(v))) return null;

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat1},${lon1}&destination=${lat2},${lon2}&key=${API_KEY}`;

  const res  = await fetch(url);
  const data = await res.json();

  if (data.status === 'OK' && data.routes?.length) {
    return data.routes[0].legs[0].distance.value / 1000;
  }
  return null;
}

// Retorna a distância em km entre o endereço do visitante e o endereço de um PG
async function distanciaVisitantePG(visitanteEndereco, visitanteBairro, visitanteCidade, pgEndereco, pgBairro, pgCidade) {
  const [origem, destino] = await Promise.all([
    geocode(visitanteEndereco, visitanteBairro, visitanteCidade),
    geocode(pgEndereco,        pgBairro,        pgCidade),
  ]);

  return calcularDistanciaKm(origem.lat, origem.lon, destino.lat, destino.lon);
}

module.exports = { geocode, calcularDistanciaKm, distanciaVisitantePG };
