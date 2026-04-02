export default {
  'backend/**/*.{ts,tsx}': files => {
    const relFiles = files.map(f => f.replace(/^.*backend\//, '')).join(' ');
    return `cd backend && npx eslint --fix ${relFiles}`;
  },
  'frontend/**/*.{ts,tsx}': files => {
    const relFiles = files.map(f => f.replace(/^.*frontend\//, '')).join(' ');
    return `cd frontend && npx eslint --fix ${relFiles}`;
  },
};
