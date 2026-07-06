import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 60000,
});

export default client;
