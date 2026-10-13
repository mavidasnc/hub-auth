/**
 * Setup dei test: il BroadcastChannel reale di Node farebbe parlare fra loro i
 * client creati in test diversi (stessa storageKey) e terrebbe aperti i canali.
 * Lo si toglie: i test che lo riguardano ne installano uno finto (vedi tabs.test.ts).
 */
delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
