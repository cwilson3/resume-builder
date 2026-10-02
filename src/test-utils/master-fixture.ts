/**
 * The sample master as test data. The page no longer bundles the master (it is
 * shipped beside the page and fetched), so tests that exercise the pure modules
 * on real content import it here, through Vite's ?raw loader.
 */
export { default as masterMarkdown } from '../../resume/Bilbo-Baggins-Resume.md?raw';
