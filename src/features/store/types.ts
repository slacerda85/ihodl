// Base types for reducer pattern
export type Action<T = any> = {
  type: string
  payload?: T
}

export type Reducer<S, A> = (state: S, action: A) => S

// Generic store context type
export type StoreContextValue<S, A> = {
  state: S
  dispatch: React.Dispatch<A>
}
