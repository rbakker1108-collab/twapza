import "@testing-library/jest-dom/vitest";

// Download settings are remembered in localStorage; start every test from the defaults.
afterEach(() => localStorage.clear());
