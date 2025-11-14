// Type definitions based on JSON-RPC specification
export interface JsonRpcRequest {
  jsonrpc: string
  id: string | number | null
  method: string
  params?: any[] | Record<string, any>
}

export interface JsonRpcError {
  code: number
  message: string
  data?: any
}

export interface JsonRpcResponse {
  jsonrpc: string
  id: string | number | null
  result?: any
  error?: JsonRpcError
}

export interface RpcConfig {
  host: string
  port: number
  username: string
  password: string
}
