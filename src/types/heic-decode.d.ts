declare module 'heic-decode' {
  export interface HeicDecodedImage {
    width: number
    height: number
    data: ArrayBufferLike | Uint8ClampedArray | Uint8Array
  }

  export default function decodeHeic(options: {
    buffer: Buffer | ArrayBuffer | Uint8Array
  }): Promise<HeicDecodedImage>
}
