import { inject, Injector, runInInjectionContext } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { AuthentificationService } from '../services/authentification.service';

/**
 * Protects routes that require a signed-in Firebase user.
 *
 * Important: We do NOT rely on `authService.currentUid` alone, because that
 * in-memory flag is reset on a full page reload. Instead we wait for the
 * Firebase SDK to restore its persisted session (from IndexedDB) via
 * `authState(...)`, which emits exactly once on app start.
 *
 * As a side effect we rehydrate `currentUid` so the rest of the app keeps
 * working after a reload.
 */
export const authGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const auth = inject(Auth);
  const authService = inject(AuthentificationService);
  const router = inject(Router);
  const injector = inject(Injector);

  const user = await runInInjectionContext(injector, () =>
    firstValueFrom(authState(auth))
  );

  if (user) {
    if (!authService.currentUid) {
      authService.currentUid = user.uid;
    }
    return true;
  }

  return router.parseUrl('/access');
};

/**
 * Inverse guard: keep already signed-in users away from the login/access
 * screens and bounce them straight into the app.
 */
export const publicOnlyGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const auth = inject(Auth);
  const router = inject(Router);
  const injector = inject(Injector);

  const user = await runInInjectionContext(injector, () =>
    firstValueFrom(authState(auth))
  );
  return user ? router.parseUrl(`/home/${user.uid}`) : true;
};
