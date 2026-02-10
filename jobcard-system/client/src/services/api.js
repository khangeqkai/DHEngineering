const API_URL = 'http://localhost:3000/api';

class ApiService {
  constructor() {
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Auth endpoints
  login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  getMe() {
    return this.request('/auth/me');
  }

  // User management
  getUsers(includeInactive = false) {
    return this.request(`/auth/users${includeInactive ? '?includeInactive=true' : ''}`);
  }

  getUser(id) {
    return this.request(`/auth/users/${id}`);
  }

  createUser(userData) {
    return this.request('/auth/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }

  updateUser(id, userData) {
    return this.request(`/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
  }

  deactivateUser(id) {
    return this.request(`/auth/users/${id}/deactivate`, {
      method: 'POST'
    });
  }

  activateUser(id) {
    return this.request(`/auth/users/${id}/activate`, {
      method: 'POST'
    });
  }

  deleteUser(id) {
    return this.request(`/auth/users/${id}`, {
      method: 'DELETE'
    });
  }

  // Jobcard endpoints
  getJobcards() {
    return this.request('/jobcards');
  }

  getJobcard(id) {
    return this.request(`/jobcards/${id}`);
  }

  getJobcardHistory(id) {
    return this.request(`/jobcards/${id}/history`);
  }

  // Activity history (admin only)
  getActivityHistory(limit = 50) {
    return this.request(`/history?limit=${limit}`);
  }

  getUserActivity(userId, limit = 50) {
    return this.request(`/history/user/${userId}?limit=${limit}`);
  }

  // Hardware endpoints
  getPrinters() {
    return this.request('/hardware/printers');
  }

  getScanners() {
    return this.request('/hardware/scanners');
  }

  getHardwareStatus() {
    return this.request('/hardware/status');
  }
}

export const api = new ApiService();
