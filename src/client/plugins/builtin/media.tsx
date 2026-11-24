import ImageViewer from '../../components/ImageViewer.js'
import VideoViewer from '../../components/VideoViewer.js'
import { getFileType } from '../../utils/fileType.js'
import type { VmdPlugin } from '../types.js'

export const imagePlugin: VmdPlugin<null> = {
  id: 'builtin.image',
  name: '图片预览',
  priority: 40,
  target: 'file',
  icon: 'file-image',
  requiresContent: false,

  matchPath: ({ name }) => getFileType(name) === 'image',

  renderMain({ filePath, mediaPlaylist, onMediaNavigate }) {
    return (
      <ImageViewer
        filePath={filePath}
        playlist={mediaPlaylist}
        onNavigate={onMediaNavigate}
      />
    )
  },
}

export const videoPlugin: VmdPlugin<null> = {
  id: 'builtin.video',
  name: '视频播放',
  priority: 40,
  target: 'file',
  icon: 'file-video',
  requiresContent: false,

  matchPath: ({ name }) => getFileType(name) === 'video',

  renderMain({ filePath, mediaPlaylist, onMediaNavigate }) {
    return (
      <VideoViewer
        filePath={filePath}
        playlist={mediaPlaylist}
        onNavigate={onMediaNavigate}
      />
    )
  },
}
