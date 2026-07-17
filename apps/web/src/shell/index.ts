// Public surface of the AdoptaFácil app shell.
export { Shell } from './shell';
export { AppProviders, type AppProvidersProps } from './app-providers';
export { AppRoutes } from './router/routes';

// Sub-layers (also individually importable).
export * from './auth';
export * from './navigation';
export * from './transparency';
export * from './layout';
export * from './theme';
