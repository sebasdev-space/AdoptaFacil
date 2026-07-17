// Shared layout-level feature building blocks and shell pages.
// Module owners build their Ola 1 screens on top of the page primitives here.
export { PageContainer, PageHeader, type PageContainerProps, type PageHeaderProps } from './page';
export { PlaceholderPage, type PlaceholderPageProps } from './placeholder-page';
export { HomePage } from './pages/home-page';
export { NotFoundPage } from './pages/not-found-page';
// The login screen moved to features/auth (T-023).
