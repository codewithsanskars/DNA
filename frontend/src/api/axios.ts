import axios from 'axios';

// No default Content-Type here — axios sets the right one per request on
// its own (application/json for a plain object body, multipart/form-data
// with a boundary for a FormData body). A blanket 'application/json'
// default here would make axios JSON-stringify FormData uploads (résumé,
// job description) instead of sending them as multipart, since it treats
// an explicit JSON content-type as instruction to serialize the body — see
// axios's defaults/index.js transformRequest.
const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('swfs_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('swfs_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
