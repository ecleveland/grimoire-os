export default {
  'backend/**/*.{ts,tsx}': files => {
    const relFiles = files.map(f => f.replace(/^.*backend\//, '')).join(' ');
    return `cd backend && npx eslint --fix ${relFiles}`;
  },
};
