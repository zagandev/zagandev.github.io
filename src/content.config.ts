import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const categoryIds = ['rendering-shaders', 'real-time-vfx', 'technical-art-tools'] as const;

/**
 * Media blocks for project detail pages. `image` and `gif` accept owner-supplied
 * paths under `/src/assets/projects/` or external URLs; `youtube` and `vimeo`
 * accept a full URL or just the video id; `mp4` accepts an asset path or
 * external URL. Omit `caption` or use `caption: ''` — a blank `caption:` is
 * invalid YAML.
 */
const projectMedia = z.object({
  type: z.enum(['image', 'gif', 'youtube', 'vimeo', 'mp4']),
  src: z.string().min(1),
  alt: z.string().default(''),
  caption: z.string().optional(),
});

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1).max(100),
      summary: z.string().min(1).max(220),
      categories: z.array(z.enum(categoryIds)).min(1),
      primaryCategory: z.enum(categoryIds).optional(),
      technologies: z.array(z.string()).default([]),
      role: z.string().optional(),
      engine: z.string().optional(),
      timeline: z.string().optional(),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      media: z.array(projectMedia).default([]),
      featured: z.boolean().default(false),
      order: z.number().default(100),
      date: z.coerce.date().optional(),
      draft: z.boolean().default(false),
      related: z.array(reference('projects')).default([]),
      ogImage: z.string().optional(),
    }),
});

export const collections = { projects };
