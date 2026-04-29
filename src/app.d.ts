import type PocketBase from 'pocketbase';
import type { AppAuthState } from '$lib/server/auth';

declare global {
  namespace App {
    interface Locals {
      pb: PocketBase | null;
      auth: AppAuthState;
    }

    interface PageData {
      auth: AppAuthState;
    }
  }
}

export {};
