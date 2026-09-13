import api from './client.js';

// Server returns { token, user: { id, name, role } } on success.
export async function loginRequest(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
}

// Server returns the created user object ({ id, name, email, role }), no
// token — registration and login are separate steps on the backend.
export async function registerRequest({ name, email, password, role }) {
  const { data } = await api.post('/auth/register', { name, email, password, role });
  return data;
}
