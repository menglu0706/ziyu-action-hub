import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ZIYU Action Hub',
    short_name: 'ZIYU',
    description: '打开即行动的梓渝粉丝行动工具',
    start_url: '/urgent',
    scope: '/',
    display: 'standalone',
    background_color: '#e8f5fc',
    theme_color: '#e8f5fc',
    icons: [
      {src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png'},
      {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png'},
    ],
  };
}
