import type { MetadataRoute } from 'next';
import { SITIO } from '@/lib/sitio';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITIO}/`, changeFrequency: 'monthly', priority: 1 }];
}
