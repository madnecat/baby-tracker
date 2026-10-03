// Settings sections: baby profile, feeding preferences, AI assistant (API tokens).
export default {
  'profile.title': 'Baby profile',
  'profile.hint': 'Used for the WHO growth percentile charts (needs date of birth + sex).',
  'profile.name': 'Name',
  'profile.dob': 'Date of birth',
  'profile.sex.female': 'Girl',
  'profile.sex.male': 'Boy',
  'profile.saved': 'Saved.',
  'profile.save': 'Save profile',

  'profile.feeding.title': 'Feeding',
  'profile.feeding.askAfter': 'Ask how a breastfeed went after I stop it',
  'profile.feeding.hint': 'A quick optional question (e.g. "efficient feed", "seemed full") that can be skipped. Applies to everyone in your household. You can still add or edit notes from History.',

  'apiTokens.title': 'AI assistant access',
  'apiTokens.intro': 'Create a token to let Claude log events for you when you describe them in chat (e.g. "log a 15 minute breastfeed on the left side from 3pm"). Works with Claude\'s remote custom connectors (claude.ai, Claude Desktop, mobile). ChatGPT isn\'t supported yet — it requires a full OAuth server rather than a simple token.',
  'apiTokens.copyNow': "Copy this token now — it won't be shown again:",
  'apiTokens.inClaude': 'In Claude: {path}',
  'apiTokens.connectorPath': 'Settings → Connectors → Add custom connector',
  'apiTokens.url': 'URL: {url}',
  'apiTokens.header': 'Under the header settings, add: header name {name}, value {value} followed directly by the full token above (with a space, no line break).',
  'apiTokens.labelPlaceholder': "Label, e.g. Wife's Claude",
  'apiTokens.create': 'Create',
  'apiTokens.createdNever': 'Created {created} · never used',
  'apiTokens.createdUsed': 'Created {created} · last used {used}',
  'apiTokens.revoke': 'Revoke',
};
