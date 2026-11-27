/**
 * Single source of truth for personal details.
 *
 * Values here are owner-supplied and used by the final Paper Hybrid layout.
 * Do not add unverified professional claims. See PROJECT_BRIEF.md.
 */
export interface SocialLink {
  label: string;
  href: string;
}

export const site = {
  name: 'Gaston Zabala',
  initials: 'GZ',
  role: 'Technical Artist',
  tagline: 'Rendering · Shaders · Real-Time VFX',
  description:
    'Portfolio of a Technical Artist working across rendering, shaders, and real-time visual effects.',
  intro:
    'Technical Artist with 5+ years of experience in game development, focused on ' +
    'real-time rendering, shader development, and computer graphics. Driven by a ' +
    'passion for graphics programming, technical experimentation, and exploring ' +
    'new rendering techniques.',
  email: 'gastonzabala.job@gmail.com',
  socials: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/gastonzabala/' },
    { label: 'GitHub', href: 'https://github.com/zagandev' },
  ] satisfies SocialLink[],
  keywords: [
    'Technical Artist',
    'Real-Time VFX',
    'Shader Development',
    'Rendering',
    'Graphics Programming',
    'Unity',
    'HLSL',
  ],
} as const;

export type Site = typeof site;
