import type { FunctionalComponent } from 'preact'
import {
  Folder,
  File,
  Sun,
  Moon,
  Home,
  Settings,
  Menu,
  ChevronRight,
  Eye,
  EyeOff,
  Image,
  Book,
} from 'lucide-preact'

export type IconName =
  | 'folder'
  | 'file'
  | 'sun'
  | 'moon'
  | 'home'
  | 'settings'
  | 'menu'
  | 'chevron-right'
  | 'eye'
  | 'eye-off'
  | 'image'
  | 'book'

const ICONS = {
  folder: Folder,
  file: File,
  sun: Sun,
  moon: Moon,
  home: Home,
  settings: Settings,
  menu: Menu,
  'chevron-right': ChevronRight,
  eye: Eye,
  'eye-off': EyeOff,
  image: Image,
  book: Book,
} as const

interface Props {
  name: IconName
  size?: number
  class?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

const Icon: FunctionalComponent<Props> = ({ name, size = 16, class: className, 'aria-hidden': ariaHidden }) => {
  const LucideIcon = ICONS[name]
  return <LucideIcon size={size} class={className} aria-hidden={ariaHidden} />
}

export default Icon
