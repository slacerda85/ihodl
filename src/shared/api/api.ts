import axios from 'axios'

const baseURL =
  process.env.NODE_ENV === 'development'
    ? process.env.EXPO_PUBLIC_API_URL_LOCAL
    : (process.env.EXPO_PUBLIC_API_URL as string)

const api = axios.create({
  baseURL,
})

export default api
