// Values produced before the first render.
//
// The OAuth callback has to be consumed before anything paints: the code and
// state must leave the URL and history immediately, and a token that arrives
// after the first federation fetch means the operator watches a 401 banner
// flash past for no reason. main.tsx runs that, then hands the outcome here
// for the root route to display.
import type { AuthHint } from './oauth'

let initialSignInError: string | null = null
let initialAuthHint: AuthHint | null = null

export function setBootstrap(hint: AuthHint | null, signInError: string | null) {
  initialAuthHint = hint
  initialSignInError = signInError
}

export const getInitialSignInError = () => initialSignInError
export const getInitialAuthHint = () => initialAuthHint

export const AUTH_HINT_KEY = ['auth-hint'] as const
