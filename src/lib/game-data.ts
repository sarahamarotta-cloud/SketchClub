export const PROMPTS = [
  'A dragon trying to parallel park',
  'A cat applying for a mortgage',
  'The concept of Monday morning',
  'A wizard ordering at a fast food drive-through',
  'What anxiety looks like',
  'A robot having an existential crisis',
  'The last donut in the box',
  'A medieval knight stuck in traffic',
  'What procrastination looks like',
  'A vampire at a blood bank',
  'A ghost who is afraid of humans',
  'The internet as a physical place',
  'A penguin on a tropical vacation',
  'What 3am feels like',
  'A librarian at a concert',
  'The world\'s most passive-aggressive plant',
  'A time traveler who went too far forward',
  'What a Monday tastes like',
  'A philosophical fish',
  'The inside of someone\'s head during a Zoom call',
  'A sentient cloud having a bad day',
  'What "reply all" looks like as a natural disaster',
  'A competitive grandmother',
  'The sound of dial-up internet',
  'A cat reviewing its human\'s performance',
  'What déjà vu looks like',
  'A pirate at a shareholders meeting',
  'The concept of "almost there"',
  'A dog running for mayor',
  'What it feels like to send an email and immediately regret it',
  'A chef on a deserted island',
  'The world\'s worst superhero',
  'A haunted IKEA',
  'What overthinking looks like',
  'A dinosaur at a job interview',
  'The physical embodiment of autocorrect',
  'A cactus in the rain',
  'What impostor syndrome looks like',
  'A mermaid at the DMV',
  'The concept of holding music',
]

export const CRITERIA = [
  'artistic ambition vs. crushing reality',
  'use of negative space (the more confused, the better)',
  'narrative coherence on a scale of 1 to "what is this"',
  'commitment to the bit',
  'structural integrity of any humans depicted',
  'emotional truth conveyed through chaos',
  'most creative misinterpretation of the prompt',
  'best use of the color white (i.e., unpainted canvas)',
  'overall vibe — is this outsider art or an accident?',
  'the audacity of the composition',
  'hand confidence — did the artist hesitate?',
  'potential as a Rorschach test',
  'how many things are on fire (metaphorically or literally)',
  'inexplicable background elements',
  'ratio of effort to result',
]

export function getDailyPrompt(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  )
  return PROMPTS[dayOfYear % PROMPTS.length]
}

export function getDailyCriteria(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  )
  return CRITERIA[(dayOfYear + 3) % CRITERIA.length]
}

export function getRandomPrompt(): string {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)]
}

export function getRandomCriteria(): string {
  return CRITERIA[Math.floor(Math.random() * CRITERIA.length)]
}

export function generateGameCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
