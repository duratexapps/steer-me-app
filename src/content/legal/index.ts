import { TERMS_OF_SERVICE } from './termsOfService';
import { PRIVACY_POLICY } from './privacyPolicy';
import { COMMUNITY_GUIDELINES } from './communityGuidelines';
import { PRODUCER_GUIDELINES } from './producerGuidelines';

// NEW, added 2026-07-28 - the four documents shown on the in-app Legal
// screen. Deliberately excludes DOCS/pricing-and-fees.md - that's an
// internal reference doc for keeping pricing consistent across the app,
// ToS, and store listings, not itself a user-facing legal document (its
// actual terms are already incorporated into TERMS_OF_SERVICE's Sections
// 4/4.5/5).
export const LEGAL_DOCUMENTS = [
  { id: 'terms', title: 'Terms of Service', content: TERMS_OF_SERVICE },
  { id: 'privacy', title: 'Privacy Policy', content: PRIVACY_POLICY },
  { id: 'community', title: 'Community Guidelines', content: COMMUNITY_GUIDELINES },
  { id: 'producer', title: 'Producer Guidelines', content: PRODUCER_GUIDELINES },
] as const;

export type LegalDocumentId = (typeof LEGAL_DOCUMENTS)[number]['id'];
