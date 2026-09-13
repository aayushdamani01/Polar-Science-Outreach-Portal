export async function fetchResearchStations() {
  const res = await fetch('/api/explorer/stations');
  const json = await res.json();
  return json.data || [];
}
