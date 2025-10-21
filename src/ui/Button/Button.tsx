import { Pressable, PressableProps } from 'react-native'

interface ButtonProps extends PressableProps {
  children: React.ReactNode
}

export default function Button({ children, ...props }: ButtonProps) {
  return <Pressable {...props}>{children}</Pressable>
}
