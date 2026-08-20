import type { FileNode } from '../../types.js'
import type { IconName } from '../components/ui/Icon.js'
import { getFileType } from './fileType.js'

export function getFileIconName(name: string): IconName {
  switch (getFileType(name)) {
    case 'markdown': return 'file-text'
    case 'image':    return 'file-image'
    case 'video':    return 'file-video'
    case 'code':     return 'file-code'
    case 'text':     return 'file-text'
    default:         return 'file'
  }
}

export function getNodeIconName(node: FileNode): IconName {
  return node.type === 'folder' ? 'folder' : getFileIconName(node.name)
}
