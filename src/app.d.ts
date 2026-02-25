// See https://kit.svelte.dev/docs/types#app
declare global {
	namespace App {
		interface Locals {
			user: import('$lib/server/auth').SessionUser | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
