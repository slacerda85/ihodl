import axios from 'axios'

const baseURL = process.env.EXPO_PUBLIC_API_URL as string
/* process.env.NODE_ENV === 'development'
    ? process.env.EXPO_PUBLIC_API_URL_LOCAL
    : (process.env.EXPO_PUBLIC_API_URL as string) */

const api = axios.create({
  baseURL,
  timeout: 30000,
})

export default api
