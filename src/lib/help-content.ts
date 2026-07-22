// Content for the contextual "?" help button shown on every screen's
// header. Mirrors the prototype's HELP_CONTENT map, but scoped to what's
// actually built in this app - no Feed, Groups, or in-app Notifications,
// since those stay out of v1. Keys match the `topic` prop passed to
// <HelpModal> from each screen.
export type HelpTopic = {
  title: string;
  body: string;
};

export const HELP_CONTENT: Record<string, HelpTopic> = {
  'role-select': {
    title: 'Getting started',
    body: "Choose Athlete if you're here to find a roping partner, Producer if you're only listing events, or Both. You can always add the other role later from Profile or your Producer dashboard.",
  },
  'create-account': {
    title: 'Create your account',
    body: 'Set up the email and password you\'ll use to sign in. This is separate from your athlete profile - you\'ll fill that out next.',
  },
  'sign-in': {
    title: 'Sign in',
    body: 'Already have an account? Sign in here to pick up where you left off.',
  },
  'sign-up': {
    title: 'Athlete verification',
    body: "Upload a screenshot of your Global Handicap card so we can confirm your classification number - this is what makes every match on the app actually eligible. Pick Header, Heeler, or Switch Ender for your position; Switch Enders are shown as a potential match for both. If you're under 18, a parent or guardian will need to complete a consent step too. Your card is only ever shown to someone you've actually matched with, never the whole platform.",
  },
  home: {
    title: 'Home',
    body: "Your home base. Browse events, browse eligible ropers, post that you need a partner, check your requests, or jump into your Producer dashboard - all from here.",
  },
  browse: {
    title: 'Browse partners',
    body: "See ropers you're eligible to partner with, based on your position and classification. Use the toggle to filter by your current location. Tap the star to favorite someone for quick access later, or Request to send a partner request.",
  },
  post: {
    title: 'Post a need',
    body: "Browse posted needs from other athletes you're eligible to fill, or post your own with the event's date, name, producer, and an optional flier. When you post, you can also choose who sees it: everyone, only your favorites, or a hand-picked few.",
  },
  'create-need-post': {
    title: 'Posting your need',
    body: "Pick your classification cap (or Goat Roping, which isn't bound by the number system), fill in the event details, and optionally attach a flier or Facebook link. At the bottom, choose who can see the post - Everyone, My Favorites, or Select Favorites lets you narrow it to specific people.",
  },
  'my-requests': {
    title: 'My requests',
    body: "Track every partner request you've sent or received. Once a request is accepted, the other person's contact info appears here with one-tap Call and Text - and you can star them as a favorite right from the card.",
  },
  profile: {
    title: 'Profile',
    body: 'Manage your name, contact info, position, classification, profile photo, favorites, subscription, and blocked users from here.',
  },
  'edit-profile': {
    title: 'Edit profile',
    body: "Update your name, email, phone, home area, or profile photo any time - handy if you move or your contact info changes. To change your position (Header, Heeler, or Switch Ender) or classification number, use Update my classification instead.",
  },
  'update-classification': {
    title: 'Update your classification',
    body: 'Upload a new Global Handicap screenshot to update your classification number or position. Your previous screenshot is deleted once the new one is verified.',
  },
  'blocked-users': {
    title: 'Blocked users',
    body: "Manage everyone you've blocked. They can't contact you or appear in your matches. Unblock anyone here at any time.",
  },
  'my-favorites': {
    title: 'Favorites',
    body: "Ropers you've starred for quick access - handy for partners you like teaming up with again, and for choosing who sees a posted need. Favoriting someone is private; they're never notified. Remove anyone from here at any time.",
  },
  events: {
    title: 'Events',
    body: 'Browse real events posted by producers. Mark yourself attending a division to see other eligible partners going to that same event, and rate an event once it has passed.',
  },
  producer: {
    title: 'Producer dashboard',
    body: 'Set up verification once, then create and manage your event listings. Producer accounts are separate from your athlete profile, and you can hold both.',
  },
  'create-event': {
    title: 'Create an event',
    body: "List a new event - name, date, location, entry fee, and the classification divisions you're running, plus an optional flier. It'll appear in Events for athletes to browse and mark attending.",
  },
  subscription: {
    title: 'Subscription',
    body: 'See your plan and pricing details. Cancel anytime - your access continues through the end of your current billing period.',
  },
};

export const HELP_TOPIC_ORDER = [
  'home',
  'browse',
  'post',
  'create-need-post',
  'my-requests',
  'my-favorites',
  'events',
  'profile',
  'edit-profile',
  'update-classification',
  'blocked-users',
  'producer',
  'create-event',
  'subscription',
  'sign-up',
  'create-account',
  'sign-in',
  'role-select',
];
