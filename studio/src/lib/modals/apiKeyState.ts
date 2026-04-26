import { writable } from "svelte/store";

export const apiKeyOk = writable<boolean | null>(null);
export const showApiKeyModal = writable<boolean>(false);
