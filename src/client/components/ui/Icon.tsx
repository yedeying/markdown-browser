import type { FunctionalComponent } from 'preact'
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileImage,
  FileVideoCamera,
  Sun,
  Moon,
  Home,
  Settings,
  Menu,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Image,
  Book,
  Check,
  Ellipsis,
  TriangleAlert,
  Pencil,
  Copy,
  Scissors,
  ClipboardPaste,
  Link,
  Trash2,
  FolderPlus,
  FilePlus,
  List,
  LayoutGrid,
  Columns3,
  Ban,
  Inbox,
  RotateCw,
  Share2,
  SlidersHorizontal,
  X,
} from 'lucide-preact'

export type IconName =
  | 'folder'
  | 'folder-open'
  | 'file'
  | 'file-text'
  | 'file-code'
  | 'file-image'
  | 'file-video'
  | 'sun'
  | 'moon'
  | 'home'
  | 'settings'
  | 'menu'
  | 'chevron-right'
  | 'chevron-down'
  | 'eye'
  | 'eye-off'
  | 'image'
  | 'book'
  | 'check'
  | 'more'
  | 'alert'
  | 'pencil'
  | 'copy'
  | 'scissors'
  | 'paste'
  | 'link'
  | 'trash'
  | 'folder-plus'
  | 'file-plus'
  | 'list'
  | 'grid'
  | 'columns'
  | 'ban'
  | 'inbox'
  | 'refresh'
  | 'share'
  | 'sliders'
  | 'x'

const ICONS = {
  folder: Folder,
  'folder-open': FolderOpen,
  file: File,
  'file-text': FileText,
  'file-code': FileCode,
  'file-image': FileImage,
  'file-video': FileVideoCamera,
  sun: Sun,
  moon: Moon,
  home: Home,
  settings: Settings,
  menu: Menu,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  eye: Eye,
  'eye-off': EyeOff,
  image: Image,
  book: Book,
  check: Check,
  more: Ellipsis,
  alert: TriangleAlert,
  pencil: Pencil,
  copy: Copy,
  scissors: Scissors,
  paste: ClipboardPaste,
  link: Link,
  trash: Trash2,
  'folder-plus': FolderPlus,
  'file-plus': FilePlus,
  list: List,
  grid: LayoutGrid,
  columns: Columns3,
  ban: Ban,
  inbox: Inbox,
  refresh: RotateCw,
  share: Share2,
  sliders: SlidersHorizontal,
  x: X,
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
