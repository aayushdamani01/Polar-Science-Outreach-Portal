import api from './client.js';

export async function fetchResearchStations() {
  const res = await api.get('/explorer/stations');
  return res.data.data || [];
}
