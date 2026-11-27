import { getCollection, type CollectionEntry } from 'astro:content';
import { url } from '@/lib/url';

export type Project = CollectionEntry<'projects'>;

export interface Category {
  id: 'rendering-shaders' | 'real-time-vfx' | 'technical-art-tools';
  label: string;
  shortLabel: string;
  description: string;
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'rendering-shaders',
    label: 'Rendering & Shaders',
    shortLabel: 'Languages',
    description:
      'Lighting models, screen-space effects, custom shaders, and rendering pipeline work.',
  },
  {
    id: 'real-time-vfx',
    label: 'Real-Time VFX',
    shortLabel: 'VFX',
    description:
      'Particle systems, materials, decals, and effects built to hold up in motion.',
  },
  {
    id: 'technical-art-tools',
    label: 'Technical Art & Tools',
    shortLabel: 'Technical Art',
    description:
      'Editor tooling, stylized pipelines, optimization, and workflow-focused technical work.',
  },
] as const;

export type CategoryId = Category['id'];

export function primaryCategory(project: Project): CategoryId {
  return project.data.primaryCategory ?? project.data.categories[0] ?? 'rendering-shaders';
}

export async function getProjects(): Promise<Project[]> {
  const entries = await getCollection('projects');
  return entries
    .filter((project) => !project.data.draft)
    .sort((a, b) => {
      if (a.data.order !== b.data.order) return a.data.order - b.data.order;
      return a.data.title.localeCompare(b.data.title);
    });
}

export function projectUrl(project: Project): string {
  return url(`/projects/${project.id}/`);
}
