const eslintFor = project => files => {
  const relFiles = files.map(f => f.replace(new RegExp(`^.*${project}/`), '')).join(' ');
  return `cd ${project} && npx eslint --fix ${relFiles}`;
};

export default {
  'backend/**/*.{ts,tsx}': eslintFor('backend'),
  'frontend/**/*.{ts,tsx}': eslintFor('frontend'),
  '*.{ts,tsx,js,jsx,json,md,css}': 'prettier --write',
};
