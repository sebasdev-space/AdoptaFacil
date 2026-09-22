// Auth feature (M02) — public authentication screens.
export { LoginPage } from './pages/login-page';
export { RegisterPage } from './pages/register-page';
export { ForgotPasswordPage } from './pages/forgot-password-page';
export { ResetPasswordPage } from './pages/reset-password-page';

// Shared building blocks (also reusable by future auth screens).
export { AuthLayout, type AuthLayoutProps } from './components/auth-layout';
export { Field, type FieldProps } from './components/field';
export { FormAlert, type FormAlertProps } from './components/form-alert';
export {
  GoogleSignInButton,
  type GoogleSignInButtonProps,
} from './components/google-sign-in-button';
export { CompleteProfilePage } from './pages/complete-profile-page';
export * from './validation';
